const fs = require("fs");
const path = require("path");
const { Vonage } = require("@vonage/server-sdk");
const { Auth } = require("@vonage/auth");

// ============================================================
// VONAGE VOICE SERVICE — zero-touch emergency calling
//
// The mobile app NEVER dials with an Intent. On verified crisis
// it POSTs to /api/emergency/call and Vonage places a real PSTN
// voice call speaking a dynamic TTS announcement to the contact.
//
// Required env:
//   VONAGE_APPLICATION_ID  - Vonage Voice application id
//   VONAGE_FROM_NUMBER     - Vonage-owned, voice-enabled caller id (E.164)
// Private key resolution order:
//   1. VONAGE_PRIVATE_KEY (inline PEM, supports \n escapes)
//   2. VONAGE_PRIVATE_KEY_PATH (absolute or relative path)
//   3. ./private.key next to this file
// ============================================================

let cachedVonage = null;
let cachedKeyFingerprint = "";

function resolvePrivateKey() {
  const inline = String(process.env.VONAGE_PRIVATE_KEY || "").trim();
  if (inline) {
    return inline.replace(/\\n/g, "\n");
  }

  const customPath = String(process.env.VONAGE_PRIVATE_KEY_PATH || "").trim();
  const keyPath = customPath
    ? path.isAbsolute(customPath)
      ? customPath
      : path.join(process.cwd(), customPath)
    : path.join(__dirname, "private.key");

  return fs.readFileSync(keyPath, "utf8");
}

function getConfigError() {
  if (!String(process.env.VONAGE_APPLICATION_ID || "").trim()) {
    return "VONAGE_APPLICATION_ID is not configured";
  }
  if (!String(process.env.VONAGE_FROM_NUMBER || "").trim()) {
    return "VONAGE_FROM_NUMBER is not configured";
  }
  try {
    resolvePrivateKey();
  } catch (error) {
    return `Vonage private key unavailable: ${error.message}`;
  }
  return null;
}

function isVonageConfigured() {
  return getConfigError() === null;
}

function getVonageClient() {
  const configError = getConfigError();
  if (configError) {
    const error = new Error(configError);
    error.code = "VONAGE_NOT_CONFIGURED";
    throw error;
  }

  const fingerprint = String(process.env.VONAGE_APPLICATION_ID || "").trim();
  if (!cachedVonage || cachedKeyFingerprint !== fingerprint) {
    const auth = new Auth({
      applicationId: fingerprint,
      privateKey: resolvePrivateKey(),
    });
    cachedVonage = new Vonage(auth);
    cachedKeyFingerprint = fingerprint;
  }
  return cachedVonage;
}

/**
 * Normalize to E.164-ish digits. Returns null when unusable.
 * Accepts "+15559113829", "5559113829", short codes like "911".
 */
function normalizePhoneNumber(raw) {
  const input = String(raw || "").trim();
  if (!input) return null;
  if (/^\d{3,6}$/.test(input)) return input; // short code / emergency number
  const hasPlus = input.startsWith("+");
  const digits = input.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return (hasPlus ? "+" : "+") + digits;
}

function clampText(value, maxLength) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 1).trimEnd() + ".";
}

/**
 * Dynamic TTS announcement per spec:
 * "Emergency detected for [User Name]. Impact force: X. High-accuracy live
 *  location tracking link has been sent via SMS."
 */
function composeEmergencyMessage(options = {}) {
  if (options.message) {
    return clampText(options.message, 1000);
  }

  const userName = clampText(options.userName || "the user", 80);
  const parts = [`Emergency detected for ${userName}. This is an automated SoberWatch distress call.`];

  if (options.triggerType) {
    parts.push(`Cause: ${clampText(options.triggerType, 120)}.`);
  }
  if (options.impactGforce !== undefined && options.impactGforce !== null) {
    const g = Number(options.impactGforce);
    if (Number.isFinite(g) && g > 0) {
      parts.push(`Impact force: ${g.toFixed(1)} G.`);
    }
  }
  if (options.speedKmh !== undefined && options.speedKmh !== null) {
    const speed = Number(options.speedKmh);
    if (Number.isFinite(speed) && speed >= 0) {
      parts.push(`Speed at event: ${Math.round(speed)} kilometers per hour.`);
    }
  }
  parts.push("High-accuracy live location tracking link has been sent via SMS.");
  if (options.mapsUrl) {
    parts.push("Open the text message for the live satellite map.");
  }
  parts.push("Please respond immediately or dispatch help.");

  return clampText(parts.join(" "), 1000);
}

async function makeEmergencyCall(toNumber, messageOrOptions) {
  const to = normalizePhoneNumber(toNumber);
  if (!to) {
    const error = new Error("Invalid destination phone number");
    error.code = "INVALID_TO_NUMBER";
    throw error;
  }

  const options =
    messageOrOptions && typeof messageOrOptions === "object"
      ? messageOrOptions
      : { message: messageOrOptions };

  const text = composeEmergencyMessage({ ...options });
  const vonage = getVonageClient();

  return vonage.voice.createOutboundCall({
    from: {
      type: "phone",
      number: String(process.env.VONAGE_FROM_NUMBER).trim(),
    },
    to: [{ type: "phone", number: to }],
    ncco: [
      {
        action: "talk",
        text,
        language: options.language || "en-US",
        style: 0,
      },
    ],
  });
}

module.exports = {
  makeEmergencyCall,
  composeEmergencyMessage,
  normalizePhoneNumber,
  isVonageConfigured,
  getConfigError,
};
