const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";
const OPENROUTER_FALLBACK_MODELS = String(process.env.OPENROUTER_FALLBACK_MODELS || "")
  .split(",").map((model) => model.trim()).filter(Boolean).slice(0, 3);
const OPENROUTER_SITE_URL = process.env.OPENROUTER_SITE_URL || "https://soberwatch.app";
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || "SoberWatch";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 45000;

/**
 * SoberWatch AI Insight generator (server-side, OpenRouter).
 *
 * Generates a real, evidence-based insight from actual SoberWatch data. The
 * model is strictly forbidden from inventing readings: every statement must be
 * traceable to a field supplied by the app. When AI is unavailable the
 * frontend falls back to its own rule-based engine.
 */

const INSIGHT_SCHEMA_HINT = `Return ONLY a JSON object with this exact shape:
{
  "type": "safety" | "health" | "device" | "alcohol" | "driving" | "general",
  "priority": "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "title": "short title in the user's language",
  "message": "1-3 sentence insight in the user's language",
  "reason": "brief reason derived strictly from supplied data",
  "recommendedAction": "practical action or null",
  "relatedData": ["alcoholBac", "drivingReadiness"]
}
Priorities: CRITICAL for BAC >= 0.08 or health values outside emergency-safe ranges; HIGH for BAC >= 0.02 or device disconnect with danger status; MEDIUM for caution-level changes; LOW/INFO for healthy normal states.`;

function buildInsightPrompt({ language, currentReading, recentReadings, deviceStatus, alerts, page }) {
  const safe = (value) => (value === null || value === undefined ? null : value);

  const current = currentReading || {};
  const currentSummary = {
    alcoholBac: safe(current.alcoholBac),
    heartRateBpm: safe(current.heartRateBpm),
    spo2Percent: safe(current.spo2Percent),
    tempCelsius: safe(current.tempCelsius),
    status: current.status || "SAFE",
    timestamp: current.timestamp || null,
    deviceId: current.deviceId || null,
  };

  const recent = Array.isArray(recentReadings)
    ? recentReadings.slice(0, 30).map((r) => ({
        alcoholBac: safe(r.alcoholBac),
        heartRateBpm: safe(r.heartRateBpm),
        spo2Percent: safe(r.spo2Percent),
        tempCelsius: safe(r.tempCelsius),
        status: r.status || "SAFE",
        timestamp: r.timestamp || null,
      }))
    : [];

  return [
    "You are the SoberWatch Safety Insights engine.",
    "STRICT RULES:",
    "1. Use ONLY the real data below. Never invent a measurement, trend, or alert that is not present.",
    "2. If a field is missing or null, do not comment on it and do not fabricate a value.",
    "3. A driving recommendation must be based only on the provided alcoholBac/status.",
    "4. Do not diagnose medical conditions.",
    "5. Respond in the user's language: " + (language === "rw" ? "natural fluent Kinyarwanda" : language === "fr" ? "French" : language === "sw" ? "Swahili" : "English") + ".",
    "",
    INSIGHT_SCHEMA_HINT,
    "",
    "Current reading: " + JSON.stringify(currentSummary),
    "Recent readings (most recent first): " + JSON.stringify(recent),
    "Device status: " + JSON.stringify(deviceStatus || {}),
    "Recent alerts: " + JSON.stringify(Array.isArray(alerts) ? alerts.slice(0, 8) : []),
    "Page the user is on: " + String(page || "dashboard"),
  ].join("\n");
async function generateInsight({
  language = "rw",
  currentReading = null,
  recentReadings = [],
  deviceStatus = null,
  alerts = [],
  page = "dashboard",
} = {}) {
  if (!OPENROUTER_API_KEY) {
    return {
      success: false,
      available: false,
      message: "OpenRouter API key is not configured",
    };
  }

  try {
    const systemPrompt = "You are the SoberWatch AI Safety Insights engine. Return ONLY valid JSON. Never fabricate sensor data. Be evidence-based and concise.";
    const userPrompt = buildInsightPrompt({ language, currentReading, recentReadings, deviceStatus, alerts, page });

    const response = await fetch(OPENROUTER_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": OPENROUTER_SITE_URL,
        "X-Title": OPENROUTER_APP_NAME,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        models: OPENROUTER_FALLBACK_MODELS.length
          ? [OPENROUTER_MODEL, ...OPENROUTER_FALLBACK_MODELS]
          : undefined,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 700,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const responseText = await response.text();
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      return { success: false, available: true, message: "OpenRouter returned an invalid response" };
    }

    if (!response.ok) {
      return {
        success: false,
        available: true,
        errorCode: `OPENROUTER_${response.status}`,
        message: data?.error?.message || data?.message || "OpenRouter AI temporarily unavailable",
      };
    }

    const message = data?.choices?.[0]?.message || {};
    const content =
      typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? message.content.filter((part) => part?.type === "text").map((part) => part.text).join(" ")
          : "";

    const text = String(content || "").trim();
    if (!text) {
      return { success: false, available: true, message: "OpenRouter returned an empty insight" };
    }

    // Extract and validate the JSON object (tolerate markdown fences / extra prose).
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let insight = null;
    if (jsonMatch) {
      try {
        insight = JSON.parse(jsonMatch[0]);
      } catch {
        insight = null;
      }
    }

    const priority = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(insight?.priority)
      ? insight.priority
      : "MEDIUM";
    const type = ["safety", "health", "device", "alcohol", "driving", "general"].includes(insight?.type)
      ? insight.type
      : "general";

    return {
      success: true,
      available: true,
      model: data?.model || OPENROUTER_MODEL,
      insight: {
        type,
        priority,
        title: String(insight?.title || "SoberWatch Insight"),
        message: String(insight?.message || (insight?.summary || "")),
        reason: String(insight?.reason || ""),
        recommendedAction: insight?.recommendedAction ? String(insight.recommendedAction) : null,
        relatedData: Array.isArray(insight?.relatedData) ? insight.relatedData : [],
        timestamp: Date.now(),
      },
      generatedAt: Date.now(),
    };
  } catch (error) {
    console.error("OPENROUTER INSIGHT ERROR:", error?.message || error);
    return {
      success: false,
      available: true,
      message: "OpenRouter AI temporarily unavailable",
      error: process.env.NODE_ENV === "production" ? undefined : error?.message,
    };
  }
}

function getInsightStatus() {
  return {
    configured: Boolean(OPENROUTER_API_KEY),
    provider: "openrouter",
    model: OPENROUTER_MODEL,
  };
}

module.exports = {
  generateInsight,
  getInsightStatus,
  OPENROUTER_MODEL,
};
}