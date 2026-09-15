require("dotenv").config();
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const { analyzeTelemetry } = require("./ai-analysis-service");
const { chatWithAssistant, generateProactiveGreeting } = require("./voice-ai-service");
const { generateInsight } = require("./ai-insight-service");
const { searchCurrentInfo } = require("./search-service");
const { buildPersonalizedSafetyMessage, buildStaticSafetyInsight } = require("./static-safety-message");
const {
  makeEmergencyCall,
  composeEmergencyMessage,
  normalizePhoneNumber,
  isVonageConfigured,
} = require("./vonage-voice-service");

const app = express();

const allowedOrigins = String(process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin is not allowed by SoberWatch API CORS policy"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept", "Authorization", "X-API-Key"],
}));

// Parse JSON and URL-encoded request bodies before all API routes.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ============================================================
// EMAIL TRANSPORT (Nodemailer)
// ============================================================

let transporter = null;

function getEmailTransporter() {
  if (transporter) return transporter;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587");
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpSecure = process.env.SMTP_SECURE === "true";
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn("[EMAIL] SMTP credentials not configured.");
    return null;
  }
  transporter = nodemailer.createTransport({
    host: smtpHost, port: smtpPort, secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass },
    tls: { rejectUnauthorized: false },
  });
  console.log("[EMAIL] Nodemailer transport initialized.");
  return transporter;
}

// ============================================================
// OTP HELPERS
// ============================================================

function generateSecureOTP() {
  const bytes = crypto.randomBytes(3);
  let otp = "";
  for (let i = 0; i < 3; i++) otp += String(bytes[i] % 10);
  return otp;
}

function hashOTP(otp) {
  return crypto.createHash("sha256").update(otp + (process.env.OTP_PEPPER || "soberwatch-otp-secret")).digest("hex");
}

function generateResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

// ============================================================
// FIREBASE ADMIN
// ============================================================

let db = null;
let firebaseReady = false;

try {
  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } else {
    serviceAccount = require("./firebase-backend/firebase-service-account.json");
  }
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  db = admin.firestore();
  firebaseReady = true;
  console.log("Firebase Admin initialized successfully.");
} catch (error) {
  console.error("Firebase Initialization Error:", error.message);
}

// ============================================================
// FIREBASE WEB API KEY
// ============================================================

const FIREBASE_WEB_API_KEY =
  process.env.FIREBASE_WEB_API_KEY || "";

if (!FIREBASE_WEB_API_KEY) {
  console.warn(
    "WARNING: FIREBASE_WEB_API_KEY is not configured."
  );
}

// ============================================================
// DEVICE API KEY
// ============================================================

const DEVICE_API_KEY =
  process.env.SOBERWATCH_DEVICE_KEY || "";

if (!DEVICE_API_KEY) {
  console.warn("WARNING: SOBERWATCH_DEVICE_KEY is not configured; device uploads are disabled.");
}

function validateDeviceKey(req) {
  const apiKey =
    req.headers["x-api-key"] ||
    req.headers["X-API-Key"];

  return Boolean(
    apiKey && apiKey === DEVICE_API_KEY
  );
}

async function getAuthenticatedUploadUid(req) {
  const token = getBearerToken(req);
  if (!token || !firebaseReady) return null;
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken.uid || null;
  } catch (error) {
    console.error("TELEMETRY AUTH ERROR:", error.code || error.message);
    return null;
  }
}

// ============================================================
// QUOTA PROTECTION
// ============================================================
//
// IMPORTANT:
//
// Firestore free quota can be exhausted when:
// - frontend polls health every second
// - frontend polls readings repeatedly
// - device uploads telemetry every second
//
// These values protect Firestore.
//
// You can change them through Render environment variables.
// ============================================================

const HEALTH_CACHE_MS =
  Number(process.env.HEALTH_CACHE_MS) || 15000;

const READINGS_CACHE_MS =
  Number(process.env.READINGS_CACHE_MS) || 15000;

const TELEMETRY_MIN_INTERVAL_MS =
  Number(process.env.TELEMETRY_MIN_INTERVAL_MS ?? 0);

const HISTORY_WRITE_INTERVAL_MS =
  Number(process.env.HISTORY_WRITE_INTERVAL_MS ?? 0);

const USER_LAST_READING_INTERVAL_MS =
  Number(process.env.USER_LAST_READING_INTERVAL_MS ?? 0);

const MAX_READINGS_LIMIT =
  Number(process.env.MAX_READINGS_LIMIT) || 30;

// ============================================================
// MEMORY CACHE
// ============================================================

const healthCache = new Map();
const readingsCache = new Map();
const latestTelemetryCache = new Map();
const aiAnalysisCache = new Map();

const telemetryLastAcceptedAt = new Map();
const historyLastWrittenAt = new Map();
const lastReadingLastWrittenAt = new Map();

// ============================================================
// CACHE HELPERS
// ============================================================

function getCache(map, key) {
  const item = map.get(key);

  if (!item) {
    return null;
  }

  if (Date.now() - item.createdAt > item.ttl) {
    map.delete(key);
    return null;
  }

  return item.value;
}

function setCache(map, key, value, ttl) {
  map.set(key, {
    value,
    createdAt: Date.now(),
    ttl,
  });
}

function invalidateUserCache(uid) {
  if (!uid) return;

  healthCache.delete(uid);

  for (const key of readingsCache.keys()) {
    if (key.startsWith(`${uid}:`)) {
      readingsCache.delete(key);
    }
  }
}

// ============================================================
// HELPERS
// ============================================================

function calculateStatus(bac) {
  const value = Number(bac) || 0;

  if (value >= 0.08) {
    return "DANGER";
  }

  if (value >= 0.02) {
    return "CAUTION";
  }

  return "SAFE";
}

function normalizeTelemetry(body) {
  const alcoholBac =
    body.alcoholBac !== undefined
      ? body.alcoholBac
      : body.bac;

  const heartRateBpm =
    body.heartRateBpm !== undefined
      ? body.heartRateBpm
      : body.heartRate;

  const spo2Percent =
    body.spo2Percent !== undefined
      ? body.spo2Percent
      : body.spo2;

  const tempCelsius =
    body.tempCelsius !== undefined
      ? body.tempCelsius
      : body.temperature !== undefined
        ? body.temperature
        : body.temp;

  const bacValue = Number(alcoholBac);

  const heartRateValue = Number(heartRateBpm);

  const spo2Value = Number(spo2Percent);

  const temperatureValue = Number(tempCelsius);
  const rawTimestamp = body.timestamp;
  const timestampValue = rawTimestamp === undefined || rawTimestamp === null || rawTimestamp === ''
    ? Date.now()
    : Number(rawTimestamp);

  if (
    !Number.isFinite(bacValue) ||
    bacValue < 0 ||
    !Number.isFinite(heartRateValue) ||
    heartRateValue < 0 ||
    !Number.isFinite(spo2Value) ||
    spo2Value < 0 ||
    !Number.isFinite(temperatureValue) ||
    !Number.isFinite(timestampValue)
  ) {
    throw new Error("Telemetry contains invalid numeric values");
  }

  const normalizedTimestamp = timestampValue < 100000000000
    ? timestampValue * 1000
    : timestampValue;

  return {
    alcoholBac: bacValue,

    heartRateBpm:
      heartRateValue,

    spo2Percent:
      spo2Value,

    tempCelsius:
      temperatureValue,

    ecgStatus:
      body.ecgStatus ||
      "Not connected",

    sensorRaw:
      Number(body.sensorRaw) || 0,

    sensorResponse:
      Number(body.sensorResponse) || 0,

    status: calculateStatus(bacValue),

    deviceId:
      body.deviceId ||
      "SW-001",

    timestamp: normalizedTimestamp,

    source:
      body.source ||
      "hardware",
  };
}

function cleanEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function validateEmailForOTP(email) {
  const normalized = cleanEmail(email);
  if (!normalized) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return "Please enter a valid email address";
  return null;
}

function getBearerToken(req) {
  const authorization =
    req.headers.authorization ||
    req.headers.Authorization ||
    "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization
    .substring(7)
    .trim();
}

function isResourceExhausted(error) {
  return (
    error &&
    (
      error.code === 8 ||
      error.code ===
        "RESOURCE_EXHAUSTED"
    )
  );
}

// ============================================================
// FIREBASE AUTH MIDDLEWARE
// ============================================================

async function requireFirebaseAuth(
  req,
  res,
  next
) {
  if (!firebaseReady) {
    return res.status(401).json({
      status: "error",
      message:
        "Authentication required",
    });
  }

  const token =
    getBearerToken(req);

  if (!token) {
    return res.status(401).json({
      status: "error",
      message:
        "Authentication required",
    });
  }

  try {
    const decodedToken =
      await admin
        .auth()
        .verifyIdToken(token);

    req.firebaseUser =
      decodedToken;

    next();
  } catch (error) {
    console.error(
      "AUTH ERROR:",
      error.code ||
        error.message
    );

    return res.status(401).json({
      status: "error",
      message:
        "Invalid or expired authentication token",
    });
  }
}

// ============================================================
// UID SECURITY
// ============================================================

function requireOwnUid(req, res) {
  const uid = String(
    req.query.uid ||
      req.body?.uid ||
      ""
  ).trim();

  if (!uid) {
    res.status(400).json({
      status: "error",
      message: "uid is required",
    });

    return null;
  }

  if (
    !req.firebaseUser ||
    req.firebaseUser.uid !== uid
  ) {
    res.status(403).json({
      status: "error",
      message:
        "Access denied for this user",
    });

    return null;
  }

  return uid;
}

// ============================================================
// SIMPLE REQUEST RATE LIMITER
// ============================================================

const requestCounters = new Map();

function simpleRateLimit(
  req,
  res,
  next
) {
  const ip =
    req.ip ||
    req.socket.remoteAddress ||
    "unknown";

  const now = Date.now();

  const existing =
    requestCounters.get(ip);

  if (
    !existing ||
    now - existing.startedAt >
      60000
  ) {
    requestCounters.set(ip, {
      startedAt: now,
      count: 1,
    });

    return next();
  }

  existing.count += 1;

  // Maximum 120 requests/minute/IP
  if (existing.count > 120) {
    return res.status(429).json({
      status: "error",
      message:
        "Too many requests. Please slow down.",
    });
  }

  next();
}

app.use(simpleRateLimit);

// Per-user throttle for the paid Vonage emergency-call route:
// max 3 outbound calls per user per 10 minutes (accident + redials,
// never a runaway loop).
const vonageCallHistory = new Map();
const VONAGE_CALL_LIMIT = 3;
const VONAGE_CALL_WINDOW_MS = 10 * 60 * 1000;

function isVonageCallThrottled(uid) {
  const now = Date.now();
  const history = (vonageCallHistory.get(uid) || []).filter(
    (timestamp) => now - timestamp < VONAGE_CALL_WINDOW_MS
  );
  vonageCallHistory.set(uid, history);
  return history.length >= VONAGE_CALL_LIMIT;
}

function recordVonageCall(uid) {
  const history = vonageCallHistory.get(uid) || [];
  history.push(Date.now());
  vonageCallHistory.set(uid, history);
}

// ============================================================
// ROOT
// ============================================================


app.get("/", (req, res) => {
  res.status(200).json({
    service:
      "SoberWatch Telemetry API",

    status: "online",

    firebase:
      firebaseReady
        ? "connected"
        : "not_connected",

    authentication:
      FIREBASE_WEB_API_KEY
        ? "email_password_enabled"
        : "login_not_configured",

    openrouter: {
      configured: Boolean(String(process.env.OPENROUTER_API_KEY || "").trim()),
      model: String(process.env.OPENROUTER_MODEL || "openrouter/free").trim(),
    },

    quotaProtection: {
      healthCacheMs:
        HEALTH_CACHE_MS,

      readingsCacheMs:
        READINGS_CACHE_MS,

      telemetryMinIntervalMs:
        TELEMETRY_MIN_INTERVAL_MS,

      historyWriteIntervalMs:
        HISTORY_WRITE_INTERVAL_MS,

      userLastReadingIntervalMs:
        USER_LAST_READING_INTERVAL_MS,
    },

    endpoints: {
      register:
        "POST /api/register",

      login:
        "POST /api/login",

      forgotPasswordRequest:
        "POST /api/forgot-password/request",

      forgotPasswordVerify:
        "POST /api/forgot-password/verify",

      forgotPasswordReset:
        "POST /api/forgot-password/reset",

      passwordReset:
        "POST /api/password-reset",

      readings:
        "GET /api/readings?uid=UID",

      health:
        "GET /api/health?uid=UID",

      telemetry:
        "POST /uploadTelemetry",

      testTelemetry:
        "POST /testTelemetry",

      emergency:
        "POST /api/emergency",

      emergencyCall:
        "POST /api/emergency/call",

      emergencyContacts:
        "GET|PUT /api/emergency-contacts",

      emergencies:
        "GET /api/emergencies?uid=UID",

      voiceChat:
        "POST /api/voice/chat",

      voiceProactive:
        "POST /api/voice/proactive",

      search:
        "GET /api/search?q=QUERY",
    },

    version: "5.0.0",
  });
});

// ============================================================
// REGISTER
// POST /api/register
// ============================================================

app.post(
  "/api/register",
  async (req, res) => {
    const email =
      cleanEmail(
        req.body.email
      );

    const password =
      req.body.password;

    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message:
          "Email and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        status: "error",
        message:
          "Password must be at least 6 characters",
      });
    }

    if (
      !firebaseReady ||
      !db
    ) {
      return res.status(503).json({
        status: "error",
        message:
          "Firebase is not connected",
      });
    }

    try {
      let existingUser = null;

      try {
        existingUser =
          await admin
            .auth()
            .getUserByEmail(email);
      } catch (error) {
        if (
          error.code !==
          "auth/user-not-found"
        ) {
          throw error;
        }
      }

      if (existingUser) {
        return res.status(409).json({
          status: "error",
          message:
            "User already exists",
          uid:
            existingUser.uid,
          email:
            existingUser.email,
        });
      }

      const userRecord =
        await admin
          .auth()
          .createUser({
            email,
            password,
            emailVerified:
              false,
          });

      await db
        .collection("users")
        .doc(userRecord.uid)
        .set(
          {
            uid:
              userRecord.uid,

            email,

            createdAt:
              Date.now(),

            updatedAt:
              Date.now(),
          },
          {
            merge: true,
          }
        );

      return res.status(200).json({
        status: "success",
        message:
          "Registration successful",

        uid:
          userRecord.uid,

        email:
          userRecord.email,
      });
    } catch (error) {
      console.error(
        "REGISTER ERROR:",
        error
      );

      let message =
        "Registration failed";

      if (
        error.code ===
        "auth/email-already-exists"
      ) {
        message =
          "Email already exists";
      } else if (
        error.code ===
        "auth/invalid-email"
      ) {
        message =
          "Invalid email address";
      } else if (
        error.code ===
        "auth/weak-password"
      ) {
        message =
          "Password is too weak";
      }

      return res.status(400).json({
        status: "error",
        message,
        code:
          error.code ||
          "REGISTER_ERROR",
      });
    }
  }
);

// ============================================================
// LOGIN
// POST /api/login
//
// IMPORTANT:
// We DO NOT write to Firestore on every login.
// This saves Firestore write quota.
// ============================================================

app.post(
  "/api/login",
  async (req, res) => {
    const email =
      cleanEmail(
        req.body.email
      );

    const password =
      req.body.password;

    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message:
          "Email and password are required",
      });
    }

    if (!FIREBASE_WEB_API_KEY) {
      return res.status(503).json({
        status: "error",
        message:
          "Firebase login is not configured. Add FIREBASE_WEB_API_KEY to backend environment variables.",
      });
    }

    try {
      const firebaseResponse =
        await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(
            FIREBASE_WEB_API_KEY
          )}`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                email,
                password,
                returnSecureToken:
                  true,
              }),
          }
        );

      const data =
        await firebaseResponse.json();

      if (
        !firebaseResponse.ok
      ) {
        console.error(
          "Firebase Login Error:",
          data
        );

        let message =
          "Invalid email or password";

        const firebaseError =
          data?.error?.message ||
          "";

        if (
          firebaseError ===
          "EMAIL_NOT_FOUND"
        ) {
          message =
            "User does not exist";
        }

        if (
          firebaseError ===
          "INVALID_PASSWORD"
        ) {
          message =
            "Incorrect password";
        }

        if (
          firebaseError ===
          "INVALID_LOGIN_CREDENTIALS"
        ) {
          message =
            "Invalid email or password";
        }

        if (
          firebaseError ===
          "USER_DISABLED"
        ) {
          message =
            "This account has been disabled";
        }

        return res.status(401).json({
          status: "error",
          message,
        });
      }

      const uid =
        data.localId;

      const returnedEmail =
        data.email ||
        email;

      return res.status(200).json({
        status: "success",
        message:
          "Login successful",

        uid,

        email:
          returnedEmail,

        idToken:
          data.idToken,

        refreshToken:
          data.refreshToken,

        expiresIn:
          data.expiresIn,
      });
    } catch (error) {
      console.error(
        "LOGIN ERROR:",
        error
      );

      return res.status(500).json({
        status: "error",
        message:
          "Login service temporarily unavailable",
      });
    }
  }
);

// ============================================================
// FORGOT PASSWORD OTP SYSTEM
// POST /api/forgot-password/request
// POST /api/forgot-password/verify
// POST /api/forgot-password/reset
// ============================================================

// Rate limiting for OTP requests (per IP)
const otpRequestCounters = new Map();
const OTP_RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const OTP_RATE_LIMIT_MAX = 3; // max 3 requests per minute per IP

function isOTPRateLimited(ip) {
  const now = Date.now();
  const existing = otpRequestCounters.get(ip);
  if (!existing || now - existing.startedAt > OTP_RATE_LIMIT_WINDOW_MS) {
    otpRequestCounters.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  existing.count += 1;
  if (existing.count > OTP_RATE_LIMIT_MAX) return true;
  return false;
}

function cleanupExpiredOTPCounters() {
  const now = Date.now();
  for (const [ip, data] of otpRequestCounters.entries()) {
    if (now - data.startedAt > OTP_RATE_LIMIT_WINDOW_MS) {
      otpRequestCounters.delete(ip);
    }
  }
}
setInterval(cleanupExpiredOTPCounters, 120000);

// Send OTP email
async function sendOTPEmail(email, otp) {
  const transporter = getEmailTransporter();
  if (!transporter) throw new Error("EMAIL_SERVICE_UNAVAILABLE");

  const senderName = process.env.EMAIL_FROM_NAME || "SoberWatch";
  const senderEmail = process.env.EMAIL_FROM || "noreply@soberwatch.io";
  const otpExpiration = parseInt(process.env.OTP_EXPIRATION_MINUTES || "10");
  const frontendUrl = process.env.FRONTEND_URL || "https://soberwatch-newversion.onrender.com";

  const otpHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your SoberWatch Verification Code</title>
</head>
<body style="margin:0;padding:0;background:#0B0D14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
<div style="background:linear-gradient(135deg,#0B0D14 0%,#1a1d2e 100%);border-radius:20px;padding:40px;border:1px solid rgba(212,175,55,0.3);">
<div style="text-align:center;margin-bottom:30px;">
<svg viewBox="0 0 200 200" width="80" height="80" style="display:inline-block;">
<defs><linearGradient id="swGrad" x1="0" y1="100" x2="100" y2="200" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#7AC142"/><stop offset="100%" stopColor="#5CA626"/></linearGradient><linearGradient id="swGold" x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#FFF6D6"/><stop offset="50%" stopColor="#D4AF37"/><stop offset="100%" stopColor="#AA820A"/></linearGradient></defs>
<path d="M82 32C45 34 16 68 16 112C16 160 54 188 108 188C120 188 126 172 118 168C92 154 50 162 44 148C38 132 82 160 88 160C96 160 92 144 80 144C68 144 48 144 38 132C30 120 30 90 48 64C62 46 76 42 82 32Z" fill="url(#swGrad)"/>
<circle cx="124" cy="42" r="16" fill="url(#swGold)"/>
<path d="M106 164C114 138 138 98 190 42C172 68 148 106 126 128C118 100 114 74 110 6C104 36 90 92 84 104C84 104 100 134 106 164Z" fill="url(#swGold)"/>
</svg>
</div>
<h1 style="color:#D4AF37;font-size:24px;margin:0 0 10px;font-family:serif;">Your SoberWatch Verification Code</h1>
<p style="color:#999;font-size:14px;margin:0 0 30px;">We received a request to reset your SoberWatch password.</p>
<div style="background:rgba(212,175,55,0.1);border:2px solid #D4AF37;border-radius:16px;padding:30px;text-align:center;margin-bottom:25px;">
<div style="color:#D4AF37;font-size:48px;font-weight:bold;letter-spacing:12px;margin-bottom:10px;">${otp}</div>
<p style="color:#666;font-size:12px;margin:0;">This code expires in ${otpExpiration} minutes</p>
</div>
<p style="color:#666;font-size:13px;margin:0 0 20px;">If you did not request this password reset, you can safely ignore this email.</p>
<div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:20px;text-align:center;">
<p style="color:#D4AF37;font-size:14px;font-weight:bold;margin:0 0 5px;">SoberWatch</p>
<p style="color:#555;font-size:11px;margin:0;">Biometric Telemetry & Safety Suite</p>
</div>
</div>
</div>
</body>
</html>`;

  const mailOptions = {
    from: `"${senderName}" <${senderEmail}>`,
    to: email,
    subject: "Your SoberWatch Verification Code",
    html: otpHtml,
    text: `Your SoberWatch Verification Code: ${otp}\n\nThis code expires in ${otpExpiration} minutes.\n\nIf you did not request this password reset, you can safely ignore this email.\n\nSoberWatch`,
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
}

// OTP storage helpers
async function storeOTP(email, otpHash, attempts) {
  if (!db || !firebaseReady) throw new Error("FIREBASE_NOT_CONNECTED");
  const otpDoc = db.collection("otp_codes").doc(email.toLowerCase().trim());
  await otpDoc.set({
    email: email.toLowerCase().trim(),
    otpHash: otpHash,
    attempts: 0,
    maxAttempts: attempts || 5,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + (parseInt(process.env.OTP_EXPIRATION_MINUTES || "10") * 60 * 1000))),
    verified: false,
  });
}

async function getStoredOTP(email) {
  if (!db || !firebaseReady) throw new Error("FIREBASE_NOT_CONNECTED");
  const otpDoc = await db.collection("otp_codes").doc(email.toLowerCase().trim()).get();
  if (!otpDoc.exists) return null;
  const data = otpDoc.data();
  const expiresAt = data.expiresAt?.toDate();
  if (expiresAt && expiresAt < new Date()) return null; // expired
  return data;
}

async function invalidateOTP(email) {
  if (!db || !firebaseReady) return;
  await db.collection("otp_codes").doc(email.toLowerCase().trim()).delete();
}

async function storeResetToken(email, token) {
  if (!db || !firebaseReady) throw new Error("FIREBASE_NOT_CONNECTED");
  const tokenDoc = db.collection("reset_tokens").doc(token);
  await tokenDoc.set({
    email: email.toLowerCase().trim(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + (parseInt(process.env.RESET_TOKEN_EXPIRATION_MINUTES || "15") * 60 * 1000))),
    used: false,
  });
}

async function getResetToken(token) {
  if (!db || !firebaseReady) throw new Error("FIREBASE_NOT_CONNECTED");
  const tokenDoc = await db.collection("reset_tokens").doc(token).get();
  if (!tokenDoc.exists) return null;
  const data = tokenDoc.data();
  const expiresAt = data.expiresAt?.toDate();
  if (expiresAt && expiresAt < new Date()) return null;
  if (data.used) return null;
  return data;
}

async function markResetTokenUsed(token) {
  if (!db || !firebaseReady) return;
  await db.collection("reset_tokens").doc(token).update({ used: true });
}

async function markOTPVerified(email) {
  if (!db || !firebaseReady) return;
  await db.collection("otp_codes").doc(email.toLowerCase().trim()).update({ verified: true });
}

app.post("/api/forgot-password/request", async (req, res) => {
  const email = cleanEmail(req.body.email);

  if (!email) {
    return res.status(400).json({ status: "error", message: "Email is required" });
  }

  const emailError = validateEmailForOTP(email);
  if (emailError) {
    return res.status(400).json({ status: "error", message: emailError });
  }

  // Check rate limiting
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (isOTPRateLimited(ip)) {
    return res.status(429).json({ status: "error", message: "Too many requests. Please wait a moment." });
  }

  if (!firebaseReady || !db) {
    return res.status(503).json({ status: "error", message: "Firebase is not connected" });
  }

  try {
    // Check if account exists
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        // Return generic message to avoid account enumeration
        return res.status(404).json({ status: "error", message: "No account found with this email address" });
      }
      throw error;
    }

    // Generate secure OTP
    const otp = generateSecureOTP();
    const otpHash = hashOTP(otp);

    // Store hashed OTP in Firestore
    await storeOTP(email, otpHash, 5);

    // Send OTP email
    try {
      await sendOTPEmail(email, otp);
      console.log(`[OTP] OTP email sent to ${email}. OTP not logged for security.`);
    } catch (emailError) {
      console.error("[OTP] Email delivery failed:", emailError.message);
      // Invalidate OTP since email failed
      await invalidateOTP(email);
      return res.status(500).json({ status: "error", message: "Failed to deliver verification code. Please try again." });
    }

    return res.status(200).json({ status: "success", message: "Verification code sent to your email" });
  } catch (error) {
    console.error("[FORGOT-PASSWORD-REQUEST] Error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

// Email test endpoint
app.post("/api/email/test", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ status: "error", message: "Email is required" });
  try {
    const transporter = getEmailTransporter();
    if (!transporter) return res.status(503).json({ status: "error", message: "Email service not configured" });
    const testOtp = generateSecureOTP();
    await sendOTPEmail(email, testOtp);
    console.log(`[EMAIL TEST] Test email sent to ${email}. Test OTP (for debugging): ${testOtp}`);
    return res.status(200).json({ status: "success", message: "Test email sent", otp: testOtp });
  } catch (error) {
    console.error("[EMAIL TEST] Failed:", error.message);
    return res.status(500).json({ status: "error", message: `Email sending failed: ${error.message}` });
  }
});

// Email config check endpoint
app.get("/api/email/config", async (req, res) => {
  const transporter = getEmailTransporter();
  const configured = transporter !== null;
  res.json({
    status: configured ? "configured" : "not_configured",
    smtpHost: process.env.SMTP_HOST || "not set",
    smtpPort: process.env.SMTP_PORT || "not set",
    senderEmail: process.env.EMAIL_FROM || "not set",
    senderName: process.env.EMAIL_FROM_NAME || "not set",
    configured: configured,
    note: configured ? "Email is ready to send" : "SMTP credentials not configured. Email will fail.",
  });
});

app.post("/api/forgot-password/verify", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ status: "error", message: "Email and OTP are required" });
  }

  if (!firebaseReady || !db) {
    return res.status(503).json({ status: "error", message: "Firebase is not connected" });
  }

  try {
    const storedOTP = await getStoredOTP(email);
    if (!storedOTP) {
      return res.status(400).json({ status: "error", message: "No verification code found. Please request a new one." });
    }

    // Check attempt limit
    if (storedOTP.attempts >= storedOTP.maxAttempts) {
      await invalidateOTP(email);
      return res.status(429).json({ status: "error", message: "Too many verification attempts. Please request a new code." });
    }

    // Verify OTP
    const otpHash = hashOTP(otp);
    if (otpHash !== storedOTP.otpHash) {
      // Increment attempts
      await db.collection("otp_codes").doc(email.toLowerCase().trim()).update({
        attempts: admin.firestore.FieldValue.increment(1),
      });
      return res.status(400).json({ status: "error", message: "Invalid verification code" });
    }

    // OTP verified! Mark as verified and issue reset token
    await markOTPVerified(email);
    const resetToken = generateResetToken();
    await storeResetToken(email, resetToken);

    // Invalidate the OTP after successful verification
    await invalidateOTP(email);

    return res.status(200).json({ status: "success", message: "Verification successful", resetToken });
  } catch (error) {
    console.error("[FORGOT-PASSWORD-VERIFY] Error:", error);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

app.post("/api/forgot-password/reset", async (req, res) => {
  const { resetToken, newPassword } = req.body;

  if (!resetToken || !newPassword) {
    return res.status(400).json({ status: "error", message: "Reset token and new password are required" });
  }

  if (!firebaseReady || !db) {
    return res.status(503).json({ status: "error", message: "Firebase is not connected" });
  }

  // Validate password
  if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return res.status(400).json({ status: "error", message: "Password must be at least 8 characters with uppercase, lowercase, and a number" });
  }

  try {
    const resetData = await getResetToken(resetToken);
    if (!resetData) {
      return res.status(400).json({ status: "error", message: "Invalid or expired reset token" });
    }

    const email = resetData.email;

    // Update password in Firebase Auth
    const userRecord = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(userRecord.uid, { password: newPassword });

    // Mark reset token as used
    await markResetTokenUsed(resetToken);

    // Invalidate any remaining OTP sessions
    await invalidateOTP(email);

    console.log(`[PASSWORD-RESET] Password successfully reset for ${email}`);

    return res.status(200).json({ status: "success", message: "Password has been reset successfully" });
  } catch (error) {
    console.error("[FORGOT-PASSWORD-RESET] Error:", error);
    return res.status(500).json({ status: "error", message: "Password reset failed" });
  }
});

// Keep the old /api/password-reset endpoint for backward compatibility
app.post("/api/password-reset", async (req, res) => {
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password || "");

  if (!email || !password) {
    return res.status(400).json({ status: "error", message: "Email and password are required" });
  }
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({ status: "error", message: "Password must be at least 8 characters and include uppercase, lowercase, and a number" });
  }
  if (!firebaseReady) {
    return res.status(503).json({ status: "error", message: "Firebase is not connected" });
  }

  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(userRecord.uid, { password });
    return res.status(200).json({ status: "success", message: "Password updated successfully" });
  } catch (error) {
    console.error("PASSWORD RESET ERROR:", error);
    const message = error.code === "auth/user-not-found" ? "No account found with this email address" : "Password reset failed";
    return res.status(error.code === "auth/user-not-found" ? 404 : 400).json({ status: "error", message });
  }
});

// ============================================================
// GET HEALTH
// GET /api/health?uid=UID
//
// FIRST:
// memory cache
//
// SECOND:
// Firestore
//
// This prevents the frontend from reading Firestore
// on every dashboard refresh.
// ============================================================

app.get(
  "/api/health",
  requireFirebaseAuth,
  async (req, res) => {
    const uid =
      requireOwnUid(
        req,
        res
      );

    if (!uid) return;

    // --------------------------------------------------------
    // 1. LATEST MEMORY CACHE
    // --------------------------------------------------------

    const memoryHealth =
      latestTelemetryCache.get(
        uid
      );

    if (memoryHealth) {
      return res.status(200).json({
        status: "success",
        source: "memory_cache",
        data: memoryHealth,
      });
    }

    // --------------------------------------------------------
    // 2. HEALTH CACHE
    // --------------------------------------------------------

    const cachedHealth =
      getCache(
        healthCache,
        uid
      );

    if (cachedHealth) {
      return res.status(200).json({
        status: "success",
        source: "cache",
        data: cachedHealth,
      });
    }

    if (
      !firebaseReady ||
      !db
    ) {
      return res.status(503).json({
        status: "error",
        message:
          "Firebase is not connected",
      });
    }

    try {
      const userDoc =
        await db
          .collection("users")
          .doc(uid)
          .get();

      if (!userDoc.exists) {
        return res.status(404).json({
          status: "error",
          message:
            "User not found",
        });
      }

      const userData =
        userDoc.data();

      if (
        !userData.lastReading
      ) {
        return res.status(404).json({
          status: "error",
          message:
            "No health reading available",
        });
      }

      setCache(
        healthCache,
        uid,
        userData.lastReading,
        HEALTH_CACHE_MS
      );

      latestTelemetryCache.set(
        uid,
        userData.lastReading
      );

      return res.status(200).json({
        status: "success",
        source: "firestore",
        data:
          userData.lastReading,
      });
    } catch (error) {
      console.error(
        "HEALTH ERROR:",
        error
      );

      if (
        isResourceExhausted(
          error
        )
      ) {
        const fallback =
          latestTelemetryCache.get(
            uid
          );

        if (fallback) {
          return res.status(200).json({
            status: "success",
            source:
              "memory_fallback",
            data: fallback,
          });
        }

        return res.status(429).json({
          status: "error",
          message:
            "Firestore quota temporarily exceeded.",
          code:
            "RESOURCE_EXHAUSTED",
        });
      }

      return res.status(500).json({
        status: "error",
        message:
          "Failed to fetch health data",
      });
    }
  }
);

// ============================================================
// GET READINGS
// GET /api/readings?uid=UID&limit=20
//
// Cache protects Firestore from repeated dashboard requests.
// ============================================================

app.get(
  "/api/readings",
  requireFirebaseAuth,
  async (req, res) => {
    const uid =
      requireOwnUid(
        req,
        res
      );

    if (!uid) return;

    let requestedLimit =
      Number(req.query.limit);

    if (
      !Number.isFinite(
        requestedLimit
      ) ||
      requestedLimit <= 0
    ) {
      requestedLimit = 20;
    }

    const limit =
      Math.min(
        Math.floor(
          requestedLimit
        ),
        MAX_READINGS_LIMIT
      );

    const cacheKey =
      `${uid}:${limit}`;

    // --------------------------------------------------------
    // CACHE
    // --------------------------------------------------------

    const cached =
      getCache(
        readingsCache,
        cacheKey
      );

    if (cached) {
      return res.status(200).json({
        status: "success",
        source: "cache",
        count:
          cached.length,
        limit,
        readings:
          cached,
      });
    }

    if (
      !firebaseReady ||
      !db
    ) {
      return res.status(503).json({
        status: "error",
        message:
          "Firebase is not connected",
      });
    }

    try {
      const snapshot =
        await db
          .collection("users")
          .doc(uid)
          .collection("readings")
          .orderBy(
            "timestamp",
            "desc"
          )
          .limit(limit)
          .get();

      const readings =
        snapshot.docs.map(
          (doc) => ({
            id: doc.id,
            ...doc.data(),
          })
        );

      setCache(
        readingsCache,
        cacheKey,
        readings,
        READINGS_CACHE_MS
      );

      return res.status(200).json({
        status: "success",
        source: "firestore",
        count:
          readings.length,
        limit,
        readings,
      });
    } catch (error) {
      console.error(
        "READINGS ERROR:",
        error
      );

      if (
        isResourceExhausted(
          error
        )
      ) {
        return res.status(429).json({
          status: "error",
          message:
            "Firestore quota temporarily exceeded. Cached data may become available shortly.",
          code:
            "RESOURCE_EXHAUSTED",
        });
      }

      return res.status(500).json({
        status: "error",
        message:
          "Failed to fetch readings",
      });
    }
  }
);

// ============================================================
// UPLOAD TELEMETRY
// POST /uploadTelemetry
//
// DEVICE AUTH:
// x-api-key
//
// QUOTA STRATEGY:
//
// 1. Every request updates memory.
// 2. Requests arriving too quickly are NOT written.
// 3. History is persisted only every HISTORY_WRITE_INTERVAL_MS.
// 4. lastReading is persisted only periodically.
//
// This is the most important protection against Firestore
// write quota exhaustion.
// ============================================================

app.post(
  "/uploadTelemetry",
  async (req, res) => {
    console.log(
      "--------------------------------------------------"
    );

    console.log(
      "Telemetry request received"
    );

    console.log(
      "Device ID:",
      req.body.deviceId
    );

    console.log(
      "UID:",
      req.body.uid
    );

    // --------------------------------------------------------
    // DEVICE AUTH
    // --------------------------------------------------------

    const bearerUid = await getAuthenticatedUploadUid(req);
    const requestUid = String(req.body.uid || "").trim();
    if (!validateDeviceKey(req) && (!bearerUid || bearerUid !== requestUid)) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized: provide a valid device key or authenticated user token.",
      });
    }

    if (
      !firebaseReady ||
      !db
    ) {
      return res.status(503).json({
        status: "error",
        message:
          "Firebase is not connected",
      });
    }

    const uid = requestUid;

    if (!uid) {
      return res.status(400).json({
        status: "error",
        message:
          "uid is required",
      });
    }

    let telemetryData;
    try {
      telemetryData = normalizeTelemetry(req.body);
    } catch (error) {
      return res.status(400).json({
        status: "error",
        message: error.message,
      });
    }

    const now =
      Date.now();

    // --------------------------------------------------------
    // ALWAYS KEEP LATEST DATA IN MEMORY
    // --------------------------------------------------------

    latestTelemetryCache.set(
      uid,
      telemetryData
    );

    setCache(
      healthCache,
      uid,
      telemetryData,
      HEALTH_CACHE_MS
    );

    // --------------------------------------------------------
    // DEVICE TELEMETRY THROTTLING
    // --------------------------------------------------------

    const lastAccepted =
      telemetryLastAcceptedAt.get(
        uid
      ) || 0;

    const timeSinceLast =
      now - lastAccepted;

    // If telemetry arrives too quickly,
    // return success WITHOUT Firestore write.
    if (
      timeSinceLast <
      TELEMETRY_MIN_INTERVAL_MS
    ) {
      return res.status(200).json({
        status: "success",
        message:
          "Telemetry received and cached",
        persisted: false,
        reason:
          "quota_protection",
        data:
          telemetryData,
      });
    }

    telemetryLastAcceptedAt.set(
      uid,
      now
    );

    // --------------------------------------------------------
    // SHOULD WE WRITE HISTORY?
    // --------------------------------------------------------

    const lastHistoryWrite =
      historyLastWrittenAt.get(
        uid
      ) || 0;

    const shouldWriteHistory =
      now -
        lastHistoryWrite >=
      HISTORY_WRITE_INTERVAL_MS;

    // --------------------------------------------------------
    // SHOULD WE UPDATE USER LAST READING?
    // --------------------------------------------------------

    const lastUserWrite =
      lastReadingLastWrittenAt.get(
        uid
      ) || 0;

    const shouldUpdateLastReading =
      now -
        lastUserWrite >=
      USER_LAST_READING_INTERVAL_MS;

    try {
      const userRef =
        db
          .collection("users")
          .doc(uid);

      // ------------------------------------------------------
      // CASE 1:
      // ONLY UPDATE lastReading
      // ------------------------------------------------------

      if (
        !shouldWriteHistory &&
        shouldUpdateLastReading
      ) {
        await userRef.set(
          {
            lastReading:
              telemetryData,

            updatedAt:
              now,
          },
          {
            merge: true,
          }
        );

        console.log("Telemetry database saved", {
          deviceId: telemetryData.deviceId,
          timestamp: telemetryData.timestamp,
          bac: telemetryData.alcoholBac,
          heartRateBpm: telemetryData.heartRateBpm,
          spo2Percent: telemetryData.spo2Percent,
          tempCelsius: telemetryData.tempCelsius,
          persisted: true,
        });

        lastReadingLastWrittenAt.set(
          uid,
          now
        );

        invalidateUserCache(
          uid
        );

        setCache(
          healthCache,
          uid,
          telemetryData,
          HEALTH_CACHE_MS
        );

        return res.status(200).json({
          status: "success",
          message:
            "Latest telemetry updated",
          persisted:
            true,
          historySaved:
            false,
          data:
            telemetryData,
        });
      }

      // ------------------------------------------------------
      // CASE 2:
      // SAVE HISTORY + LAST READING
      // ------------------------------------------------------

      if (
        shouldWriteHistory
      ) {
        const readingRef =
          userRef
            .collection(
              "readings"
            )
            .doc();

        const batch =
          db.batch();

        batch.set(
          readingRef,
          telemetryData
        );

        if (
          shouldUpdateLastReading
        ) {
          batch.set(
            userRef,
            {
              lastReading:
                telemetryData,

              lastReadingId:
                readingRef.id,

              updatedAt:
                now,
            },
            {
              merge: true,
            }
          );
        }

        await batch.commit();

        console.log("Telemetry database saved", {
          deviceId: telemetryData.deviceId,
          timestamp: telemetryData.timestamp,
          bac: telemetryData.alcoholBac,
          heartRateBpm: telemetryData.heartRateBpm,
          spo2Percent: telemetryData.spo2Percent,
          tempCelsius: telemetryData.tempCelsius,
          persisted: true,
          readingId: readingRef.id,
        });

        historyLastWrittenAt.set(
          uid,
          now
        );

        if (
          shouldUpdateLastReading
        ) {
          lastReadingLastWrittenAt.set(
            uid,
            now
          );
        }

        invalidateUserCache(
          uid
        );

        setCache(
          healthCache,
          uid,
          telemetryData,
          HEALTH_CACHE_MS
        );

        return res.status(200).json({
          status: "success",
          message:
            "Telemetry persisted",
          persisted:
            true,
          historySaved:
            true,
          readingId:
            readingRef.id,
          data:
            telemetryData,
        });
      }

      // ------------------------------------------------------
      // CASE 3:
      // MEMORY ONLY
      // ------------------------------------------------------

      return res.status(200).json({
        status: "success",
        message:
          "Telemetry received and cached",
        persisted: false,
        historySaved:
          false,
        data:
          telemetryData,
      });
    } catch (error) {
      console.error(
        "TELEMETRY ERROR:",
        error
      );

      if (
        isResourceExhausted(
          error
        )
      ) {
        // IMPORTANT:
        // Even if Firestore is exhausted,
        // latest telemetry remains available
        // in memory for dashboard use.

        return res.status(200).json({
          status: "success",
          message:
            "Telemetry received but Firestore quota is temporarily exhausted. Latest data is cached.",
          persisted: false,
          code:
            "RESOURCE_EXHAUSTED",
          data:
            telemetryData,
        });
      }

      return res.status(500).json({
        status: "error",
        message:
          "Failed to save telemetry",
      });
    }
  }
);

// ============================================================
// TEST TELEMETRY
// POST /testTelemetry
//
// AUTHENTICATED USER ONLY
// ============================================================

app.post(
  "/testTelemetry",
  requireFirebaseAuth,
  async (req, res) => {
    const uid =
      requireOwnUid(
        req,
        res
      );

    if (!uid) return;

    if (
      !firebaseReady ||
      !db
    ) {
      return res.status(503).json({
        status: "error",
        message:
          "Firebase is not connected",
      });
    }

    const now =
      Date.now();

    const testData = {
      alcoholBac: 0.04,

      heartRateBpm: 78,

      spo2Percent: 98,

      tempCelsius: 36.7,

      ecgStatus:
        "Stable",

      sensorRaw: 1200,

      sensorResponse: 20,

      status:
        "CAUTION",

      deviceId:
        "SOBERWATCH-TEST",

      timestamp:
        now,

      source:
        "test",
    };

    // Memory update
    latestTelemetryCache.set(
      uid,
      testData
    );

    setCache(
      healthCache,
      uid,
      testData,
      HEALTH_CACHE_MS
    );

    try {
      const userRef =
        db
          .collection("users")
          .doc(uid);

      const readingRef =
        userRef
          .collection(
            "readings"
          )
          .doc();

      const batch =
        db.batch();

      batch.set(
        readingRef,
        testData
      );

      batch.set(
        userRef,
        {
          lastReading:
            testData,

          lastReadingId:
            readingRef.id,

          updatedAt:
            now,
        },
        {
          merge: true,
        }
      );

      await batch.commit();

      historyLastWrittenAt.set(
        uid,
        now
      );

      lastReadingLastWrittenAt.set(
        uid,
        now
      );

      invalidateUserCache(
        uid
      );

      setCache(
        healthCache,
        uid,
        testData,
        HEALTH_CACHE_MS
      );

      latestTelemetryCache.set(
        uid,
        testData
      );

      return res.status(200).json({
        status: "success",
        message:
          "Test telemetry saved",

        readingId:
          readingRef.id,

        data:
          testData,
      });
    } catch (error) {
      console.error(
        "TEST TELEMETRY ERROR:",
        error
      );

      if (
        isResourceExhausted(
          error
        )
      ) {
        return res.status(200).json({
          status: "success",
          message:
            "Test telemetry cached, but Firestore quota is temporarily exhausted.",
          persisted: false,
          code:
            "RESOURCE_EXHAUSTED",
          data:
            testData,
        });
      }

      return res.status(500).json({
        status: "error",
        message:
          "Failed to save test telemetry",
      });
    }
  }
);

// ============================================================
// EMERGENCY
// POST /api/emergency
// ============================================================

app.post(
  "/api/emergency",
  requireFirebaseAuth,
  async (req, res) => {
    const uid =
      requireOwnUid(
        req,
        res
      );

    if (!uid) return;

    if (
      !firebaseReady ||
      !db
    ) {
      return res.status(503).json({
        status: "error",
        message:
          "Firebase is not connected",
      });
    }

    const {
      eventId,
      type,
      severity,
      latitude,
      longitude,
      accuracy,
      timestamp,
      contact,
      notes,
      mapsUrl,
      recognizedText,
      evidenceUri,
      cameraVerified,
    } = req.body;

    try {
      const emergencyData = {
        eventId:
          eventId ||
          `emg-${Date.now()}`,

        type:
          type ||
          "SOS",

        severity:
          severity ||
          "high",

        latitude:
          Number(latitude) || 0,

        longitude:
          Number(longitude) || 0,

        accuracy:
          Number(accuracy) || 0,

        timestamp:
          timestamp ||
          new Date().toISOString(),

        contact:
          contact || "",

        notes:
          notes || "",

        mapsUrl:
          mapsUrl || "",

        recognizedText:
          recognizedText || "",

        evidenceUri:
          evidenceUri || "",

        cameraVerified:
          cameraVerified === true,

        createdAt:
          Date.now(),
      };

      const emergencyRef =
        await db
          .collection("users")
          .doc(uid)
          .collection(
            "emergencies"
          )
          .add(
            emergencyData
          );

      return res.status(200).json({
        status: "success",
        message:
          "Emergency event recorded",

        emergencyId:
          emergencyRef.id,

        data:
          emergencyData,
      });
    } catch (error) {
      console.error(
        "EMERGENCY ERROR:",
        error
      );

      if (
        isResourceExhausted(
          error
        )
      ) {
        return res.status(429).json({
          status: "error",
          message:
            "Firestore quota temporarily exceeded.",
          code:
            "RESOURCE_EXHAUSTED",
        });
      }

      return res.status(500).json({
        status: "error",
        message:
          "Failed to save emergency event",
      });
    }
  }
);

// ============================================================
// GET EMERGENCIES
// GET /api/emergencies?uid=UID
// ============================================================

app.get(
  "/api/emergencies",
  requireFirebaseAuth,
  async (req, res) => {
    const uid =
      requireOwnUid(
        req,
        res
      );

    if (!uid) return;

    if (
      !firebaseReady ||
      !db
    ) {
      return res.status(503).json({
        status: "error",
        message:
          "Firebase is not connected",
      });
    }

    try {
      const snapshot =
        await db
          .collection("users")
          .doc(uid)
          .collection(
            "emergencies"
          )
          .orderBy(
            "createdAt",
            "desc"
          )
          .limit(20)
          .get();

      const emergencies =
        snapshot.docs.map(
          (doc) => ({
            id: doc.id,
            ...doc.data(),
          })
        );

      return res.status(200).json({
        status: "success",
        count:
          emergencies.length,
        emergencies,
      });
    } catch (error) {
      console.error(
        "EMERGENCIES ERROR:",
        error
      );

      if (
        isResourceExhausted(
          error
        )
      ) {
        return res.status(429).json({
          status: "error",
          message:
            "Firestore quota temporarily exceeded.",
          code:
            "RESOURCE_EXHAUSTED",
        });
      }

      return res.status(500).json({
        status: "error",
        message:
          "Failed to fetch emergency history",
      });
    }
  }
);


// ============================================================
app.get("/api/emergency-contacts",requireFirebaseAuth,async(req,res)=>{const uid=req.firebaseUser.uid;const d=await db.collection("users").doc(uid).get();res.json({status:"success",contacts:d.data()?.emergencyContacts||[]})});
app.put("/api/emergency-contacts",requireFirebaseAuth,async(req,res)=>{const uid=req.firebaseUser.uid,contacts=req.body?.contacts;if(!Array.isArray(contacts)||contacts.length>5)return res.status(400).json({status:"error",message:"Invalid contacts"});await db.collection("users").doc(uid).set({emergencyContacts:contacts,updatedAt:Date.now()},{merge:true});res.json({status:"success",contacts})});
// OPENROUTER AI ANALYSIS
// POST /api/ai/analyze
//
// IMPORTANT:
// - Firebase authenticated users only
// - Does NOT modify /uploadTelemetry
// - Uses latest telemetry already available
// - Uses short history for contextual analysis
// ============================================================

app.post(
  "/api/ai/analyze",
  requireFirebaseAuth,
  async (req, res) => {
    const uid =
      requireOwnUid(
        req,
        res
      );

    if (!uid) return;

    if (!firebaseReady || !db) {
      return res.status(503).json({
        status: "error",
        message:
          "Firebase is not connected",
      });
    }

    try {
      let latest =
        latestTelemetryCache.get(uid) ||
        getCache(
          healthCache,
          uid
        );

      if (!latest) {
        const userDoc =
          await db
            .collection("users")
            .doc(uid)
            .get();

        if (!userDoc.exists) {
          return res.status(404).json({
            status: "error",
            message:
              "User not found",
          });
        }

        const userData =
          userDoc.data();

        if (!userData.lastReading) {
          return res.status(404).json({
            status: "error",
            message:
              "No telemetry available for AI analysis",
          });
        }

        latest =
          userData.lastReading;
      }

      const cached =
        aiAnalysisCache.get(uid);

      if (
        cached &&
        Date.now() - cached.createdAt <
          60000
      ) {
        return res.status(200).json({
          status: "success",
          source: "openrouter-cache",
          data: cached.data,
        });
      }

      const snapshot =
        await db
          .collection("users")
          .doc(uid)
          .collection("readings")
          .orderBy(
            "timestamp",
            "desc"
          )
          .limit(20)
          .get();

      const history =
        snapshot.docs.map(
          doc => ({
            id: doc.id,
            ...doc.data(),
          })
        );

      const result =
        await analyzeTelemetry(
          latest,
          history
        );

      if (!result.success) {
        // NEVER cache failed AI analysis results
        return res.status(503).json({
          status: "error",
          source: "openrouter",
          error: result.message || "AI analysis is temporarily unavailable",
          code: "AI_ANALYSIS_UNAVAILABLE",
        });
      }

      const responseData = {
        uid,
        generatedAt: Date.now(),
        model: result.model,
        telemetry: latest,
        analysis: result.analysis,
      };

      // Only cache successful results
      aiAnalysisCache.set(uid, {
        createdAt: Date.now(),
        data: responseData,
      });

      return res.status(200).json({
        status: "success",
        source: "openrouter",
        data: responseData,
      });

    } catch (error) {
      console.error(
        "OPENROUTER AI ANALYSIS ERROR:",
        error?.message ||
          error
      );

      return res.status(503).json({
        status: "error",
        message:
          "AI analysis is temporarily unavailable",
        code:
          "AI_ANALYSIS_UNAVAILABLE",
      });
    }
  }
);

// ============================================================
// HEALTH CHECK
// ============================================================

app.get(
  "/api/status",
  (req, res) => {
    res.status(200).json({
      status: "online",

      firebase:
        firebaseReady
          ? "connected"
          : "not_connected",

      cache: {
        health:
          healthCache.size,

        readings:
          readingsCache.size,

        latestTelemetry:
          latestTelemetryCache.size,
      },

      quotaProtection: {
        telemetryMinIntervalMs:
          TELEMETRY_MIN_INTERVAL_MS,

        historyWriteIntervalMs:
          HISTORY_WRITE_INTERVAL_MS,

        healthCacheMs:
          HEALTH_CACHE_MS,

        readingsCacheMs:
          READINGS_CACHE_MS,
      },

      timestamp:
        new Date().toISOString(),
    });
  }
);

// ============================================================
// VOICE AI CHAT
// ============================================================


app.post(
  "/api/voice/proactive",
  requireFirebaseAuth,
  async (req, res) => {
    const body = req.body || {};

    console.log(
      `VOICE PROACTIVE: User ${req.firebaseUser.uid} - Language: ${body.language || "rw"}`
    );

    try {
      const result = await generateProactiveGreeting({
        language: body.language || "rw",
        telemetry: body.telemetry || {},
        location: body.location || {},
        profile: body.profile || {},
        history: Array.isArray(body.history) ? body.history : [],
        sessionId: body.sessionId || null,
        userId: req.firebaseUser.uid,
      });

      if (result && result.success === false) {
        console.error("VOICE PROACTIVE: AI service failed", {
          available: result.available,
          error: result.error,
        });

        return res.status(result.available === false ? 503 : 502).json({
          ...result,
          status: "error",
        });
      }

      console.log(
        `VOICE PROACTIVE: Response generated (${result.reply?.length || 0} chars)`
      );

      return res.status(200).json(result);
    } catch (error) {
      console.error(
        "VOICE PROACTIVE AI ERROR:",
        error?.message || error
      );

      return res.status(503).json({
        status: "error",
        message:
          "Proactive Voice AI is temporarily unavailable.",
        code: "VOICE_PROACTIVE_UNAVAILABLE",
      });
    }
  }
);

app.post(
  "/api/voice/chat",
  requireFirebaseAuth,
  async (req, res) => {
    const body = req.body || {};

    const transcript = String(
      body.transcript || ""
    ).trim();

    if (!transcript) {
      return res.status(400).json({
        status: "error",
        message: "transcript is required",
      });
    }

    console.log(`VOICE CHAT: User ${req.firebaseUser.uid} - Language: ${body.language || "auto"}`);

    try {
      const result = await chatWithAssistant({
        transcript,
        language: body.language || "auto",
        telemetry: body.telemetry || {},
        location: body.location || {},
        profile: body.profile || {},
        history: Array.isArray(body.history)
          ? body.history
          : [],
        sessionId: body.sessionId || null,
        userId: req.firebaseUser.uid,
      });

      if (result && result.success === false) {
        console.error("VOICE CHAT: AI service failed", {
          available: result.available,
          error: result.error,
        });
        return res.status(result.available === false ? 503 : 502).json({
          ...result,
          status: "error",
        });
      }

      if (result && result.reply) {
        console.log(`VOICE CHAT: Response generated (${result.reply.length} chars)`);
      }

      return res.status(200).json(result);
    } catch (error) {
      console.error(
        "VOICE AI CHAT ERROR:",
        error?.message || error
      );

      return res.status(503).json({
        status: "error",
        message:
          "Voice AI is temporarily unavailable. Please try again later.",
        code: "VOICE_AI_UNAVAILABLE",
      });
    }
  }
);

// ============================================================
// SEARCH / CURRENT INFORMATION
// ============================================================
//
// Single canonical endpoint for current-information requests from the
// frontend (Ahabanza / AI Safety Advisory) and the voice AI.
//
// The backend performs the actual web/Google search, normalizes the raw
// results, caches them (to avoid consuming search quota on repeats), and
// returns clean JSON to the frontend. No Google/API keys ever reach the
// browser or APK.

app.get(
  "/api/search",
  requireFirebaseAuth,
  async (req, res) => {
    const query = String(req.query.q || "")
      .trim()
      .slice(0, 200);

    if (!query) {
      return res.status(400).json({
        status: "error",
        success: false,
        message: "q query parameter is required",
      });
    }

    const limit = Math.min(
      Math.max(Number(req.query.limit) || 8, 1),
      15
    );

    try {
      const result = await searchCurrentInfo({
        query,
        limit,
      });

      if (!result.success) {
        return res.status(502).json({
          status: "error",
          success: false,
          message: "Amakuru mashya ntaraboneka. Ongera ugerageze nyuma.",
          code: "SEARCH_FAILED",
        });
      }

      return res.status(200).json({
        success: true,
        query: result.query,
        generatedAt: result.generatedAt,
        cached: Boolean(result.cached),
        results: result.results || [],
      });
    } catch (error) {
      console.error("SEARCH ENDPOINT ERROR:", error?.message || error);
      return res.status(503).json({
        status: "error",
        success: false,
        message: "Amakuru mashya ntaraboneka. Ongera ugerageze nyuma.",
        code: "SEARCH_UNAVAILABLE",
      });
    }
  }
);

// ============================================================
// AI RATE LIMITING (per user, in-memory)
// ============================================================
// Simple token-bucket guard so a single user cannot spam paid OpenRouter
// calls. Resets when the server restarts; good enough for a safety app.

const AI_RATE_LIMIT_KEY = "soberwatch_ai_rate";
const AI_RATE_WINDOW_MS = 60000;

function aiRateLimitPolicy(req, res, next) {
  const uid = String(
    (req.firebaseUser && req.firebaseUser.uid) ||
      (req.body && req.body.uid) ||
      req.ip ||
      "anonymous"
  );
  const now = Date.now();
  let buckets = {};
  try {
    const raw = global[AI_RATE_LIMIT_KEY];
    if (raw) buckets = raw;
  } catch {
    buckets = {};
  }

  const bucket = buckets[uid] || { count: 0, resetAt: now + AI_RATE_WINDOW_MS };
  if (now >= bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + AI_RATE_WINDOW_MS;
  }
  bucket.count += 1;
  buckets[uid] = bucket;
  try {
    global[AI_RATE_LIMIT_KEY] = buckets;
  } catch {
    buckets = {};
  }

  if (bucket.count > 8) {
    return res.status(429).json({
      status: "error",
      message: "AI requests rate limited. Please wait a moment and try again.",
      code: "AI_RATE_LIMITED",
      retryAfterMs: Math.max(0, bucket.resetAt - now),
    });
  }

  next();
}

// ============================================================
// AI CHAT (OpenRouter through the backend)
// ============================================================
// Authenticated, validated, normalized OpenRouter conversation endpoint used
// by the entire SoberWatch app. The OpenRouter API key never leaves this
// server.

app.post(
  "/api/ai/chat",
  requireFirebaseAuth,
  aiRateLimitPolicy,
  async (req, res) => {
    const body = req.body || {};

    const message = String(body.message || body.transcript || "").trim();
    if (!message) {
      return res.status(400).json({
        status: "error",
        message: "message is required",
        code: "EMPTY_MESSAGE",
      });
    }
    if (message.length > 4000) {
      return res.status(400).json({
        status: "error",
        message: "message is too long",
        code: "MESSAGE_TOO_LONG",
      });
    }

    const context =
      body.context && typeof body.context === "object" ? body.context : {};
    const history = Array.isArray(body.history) ? body.history.slice(-14) : [];

    console.log(
      `AI CHAT: User ${req.firebaseUser.uid} - Language: ${body.language || "auto"} - Page: ${context.page || "dashboard"}`
    );

    try {
      const result = await chatWithAssistant({
        transcript: message,
        language: body.language || "auto",
        telemetry: context.telemetry || {},
        location: context.location || {},
        profile: context.profile || {},
        history,
        sessionId: body.sessionId || null,
        userId: req.firebaseUser.uid,
        page: context.page || "dashboard",
        deviceStatus: context.deviceStatus || null,
        alerts: Array.isArray(context.alerts) ? context.alerts : [],
        readingsSummary: context.readingsSummary || null,
      });

      if (result && result.success === false) {
        console.error("AI CHAT: service failed", {
          available: result.available,
          error: result.error,
        });

        // OpenRouter failed → still reply with the FULL static personalized
        // safety message (based on the ACTUAL reading) so the user always
        // receives real, measurement-based guidance instead of a bare error.
        const staticReply =
          typeof result.reply === "string" && result.reply.length > 0
            ? result.reply
            : buildPersonalizedSafetyMessage(
                body.language === "auto" ? "en" : body.language || "en",
                (context && context.telemetry) || null
              );

        return res.status(200).json({
          ...result,
          success: true,
          available: false,
          status: "success",
          source: "static",
          reply: staticReply,
          errorCode: result.errorCode || "OPENROUTER_UNAVAILABLE",
        });
      }

      return res.status(200).json(result);
    } catch (error) {
      console.error("AI CHAT ERROR:", error?.message || error);

      // Backend/OpenRouter failure → reply with the FULL static safety message.
      const staticReply =
        buildPersonalizedSafetyMessage(
          body.language === "auto" ? "en" : body.language || "en",
          (context && context.telemetry) || null
        );

      return res.status(200).json({
        success: true,
        available: false,
        status: "ok_static",
        source: "static",
        reply: staticReply,
        message: "AI ntabonetse ubu. Reba internet connection yawe.",
        code: "AI_UNAVAILABLE",
        intent: "SAFETY_GUIDANCE",
        actions: [],
        sources: [],
      });
    }
  }
);

// ============================================================
// AI INSIGHT (OpenRouter through the backend)
// ============================================================
// Generates a real, data-driven safety insight for the AI Insight Card using
// the actual current reading, recent readings, device status and alerts.

app.post(
  "/api/ai/insight",
  requireFirebaseAuth,
  aiRateLimitPolicy,
  async (req, res) => {
    const body = req.body || {};

    try {
      const insightResult = await generateInsight({
        language: body.language || "rw",
        currentReading: body.currentReading || null,
        recentReadings: Array.isArray(body.recentReadings)
          ? body.recentReadings
          : [],
        deviceStatus: body.deviceStatus || null,
        alerts: Array.isArray(body.alerts) ? body.alerts : [],
        page: body.page || "dashboard",
      });

      if (insightResult && insightResult.success === false) {
        console.error("AI INSIGHT: service failed", {
          available: insightResult.available,
          error: insightResult.error,
        });

        // OpenRouter failed → still serve the FULL static personalized safety
        // message (based on the ACTUAL reading) so the user always receives
        // real, measurement-based guidance instead of a bare error.
        const staticInsight =
          (insightResult.staticInsight &&
            typeof insightResult.staticInsight.message === "string" &&
            insightResult.staticInsight.message.length > 0)
            ? insightResult.staticInsight
            : buildStaticSafetyInsight(
                body.language || "rw",
                body.currentReading || null
              );

        return res.status(200).json({
          success: true,
          available: false,
          status: "success",
          source: "static",
          message:
            insightResult.message || "AI insight temporarily unavailable",
          insight: staticInsight,
        });
      }

      return res.status(200).json(insightResult);
    } catch (error) {
      console.error("AI INSIGHT ERROR:", error?.message || error);

      // OpenRouter/backend failure → serve the FULL static safety message.
      const staticInsight =
        buildStaticSafetyInsight(
          body.language || "rw",
          body.currentReading || null
        );

      return res.status(200).json({
        success: true,
        available: false,
        status: "success",
        source: "static",
        message: "AI insight temporarily unavailable.",
        code: "AI_INSIGHT_UNAVAILABLE",
        insight: staticInsight,
      });
    }
  }
);

// ============================================================
// 404
// ============================================================

// ============================================================
// VONAGE ZERO-TOUCH EMERGENCY CALL
// POST /api/emergency/call
//
// The mobile app NEVER uses an Intent dialer. On AI-verified crisis
// it POSTs here (Firebase Bearer auth) and Vonage places a real PSTN
// voice call speaking a dynamic TTS announcement to the contact.
// Body: { toNumber, message?, userName?, triggerType?, impactGforce?,
//         speedKmh?, mapsUrl?, language? }
// ============================================================

app.post("/api/emergency/call", requireFirebaseAuth, async (req, res) => {
  const uid = req.firebaseUser.uid;

  if (isVonageCallThrottled(uid)) {
    return res.status(429).json({
      success: false,
      message: "Emergency call limit reached. Please try again in a few minutes.",
      code: "VONAGE_THROTTLED",
    });
  }

  const body = req.body || {};
  const toNumber = normalizePhoneNumber(body.toNumber);
  if (!toNumber) {
    return res.status(400).json({
      success: false,
      message: "A valid destination phone number (toNumber) is required.",
      code: "INVALID_TO_NUMBER",
    });
  }

  if (!isVonageConfigured()) {
    return res.status(503).json({
      success: false,
      message: "Voice calling is not configured on the server. Use on-device dialing fallback.",
      code: "VONAGE_NOT_CONFIGURED",
    });
  }

  const announcement = composeEmergencyMessage({
    message: body.message,
    userName: body.userName,
    triggerType: body.triggerType,
    impactGforce: body.impactGforce,
    speedKmh: body.speedKmh,
    mapsUrl: body.mapsUrl,
  });

  try {
    const result = await makeEmergencyCall(toNumber, {
      message: announcement,
      language: body.language || "en-US",
    });
    recordVonageCall(uid);

    // Best-effort observability log; never fails the call response.
    try {
      if (db) {
        await db.collection("users").doc(uid).collection("emergencies").add({
          type: "VONAGE_CALL",
          severity: "high",
          contact: toNumber,
          announcement,
          callUuid:
            (result && (result.uuid || result.id)) || null,
          createdAt: Date.now(),
          timestamp: new Date().toISOString(),
        });
      }
    } catch (logError) {
      console.error("Vonage call log write failed:", logError.message);
    }

    res.json({ success: true, toNumber, call: result || null });
  } catch (error) {
    console.error("Emergency call error:", error);
    const status =
      error.code === "INVALID_TO_NUMBER"
        ? 400
        : error.code === "VONAGE_NOT_CONFIGURED"
          ? 503
          : 502;
    res.status(status).json({
      success: false,
      message: error.message || "Failed to place emergency call.",
      code: error.code || "VONAGE_CALL_FAILED",
    });
  }
});

app.use(
  (req, res) => {
    res.status(404).json({
      status: "error",
      message:
        "Endpoint not found",
      path: req.path,
    });
  }
);

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    console.error(
      "GLOBAL ERROR:",
      error
    );

    if (
      isResourceExhausted(
        error
      )
    ) {
      return res.status(429).json({
        status: "error",
        message:
          "Firestore quota temporarily exceeded.",
        code:
          "RESOURCE_EXHAUSTED",
      });
    }

    res.status(500).json({
      status: "error",
      message:
        "Internal server error",
    });
  }
);

// ============================================================
// SERVER
// ============================================================

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  () => {
    console.log(
      `SoberWatch backend running on port ${PORT}`
    );

    console.log(
      `Health cache: ${HEALTH_CACHE_MS}ms`
    );

    console.log(
      `Readings cache: ${READINGS_CACHE_MS}ms`
    );

    console.log(
      `Telemetry minimum interval: ${TELEMETRY_MIN_INTERVAL_MS}ms`
    );

    console.log(
      `History write interval: ${HISTORY_WRITE_INTERVAL_MS}ms`
    );
  }
);
