const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";

const SCHEMA_INSTRUCTION =
  'Return ONLY a JSON object. Schema: {"status":"SAFE|CAUTION|DANGER","summary":"string","riskLevel":"LOW|MODERATE|HIGH|CRITICAL","findings":["string"],"recommendation":"string","dataUsed":["string"],"confidence":"HIGH|MEDIUM|LOW"}';

function buildPrompt(telemetry, history = []) {
  const telemetryStr = JSON.stringify(telemetry, null, 2);
  const historyStr = JSON.stringify(history, null, 2);
  return [
    "Analyze ONLY the real SoberWatch telemetry supplied below. This telemetry is authoritative and comes from actual device sensors.",
    "",
    "STRICT RULES:",
    "1. Never invent a measurement.",
    "2. Never claim a sensor measured something that is not present.",
    "3. Never fabricate trends, percentages, improvements, diagnoses, ECG findings, or physiological conditions.",
    "4. If a field is missing or null, say Not available.",
    "5. Use historical readings only to identify trends actually supported by the data.",
    "6. Distinguish OBSERVED DATA from INTERPRETATION and RECOMMENDATION.",
    "7. Recommendations must be practical and based on supplied data.",
    "8. Do not diagnose disease.",
    "9. Confidence must reflect data completeness.",
    "",
    SCHEMA_INSTRUCTION,
    "",
    "TELEMETRY:",
    telemetryStr,
    "",
    "HISTORY:",
    historyStr,
  ].join("\n");
}

async function analyzeTelemetry(telemetry, history = []) {
  if (!OPENROUTER_API_KEY) {
    return {
      success: false,
      available: false,
      message: "OpenRouter API key is not configured",
    };
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are SoberWatch AI. Return ONLY valid JSON. Never fabricate telemetry values. Be evidence-based.",
          },
          {
            role: "user",
            content: buildPrompt(telemetry, history),
          },
        ],
        temperature: 0.2,
        max_tokens: 1400,
      }),
    });

    const responseText = await response.text();

    let data;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      return {
        success: false,
        available: true,
        message: "OpenRouter returned an invalid response",
      };
    }

    if (!response.ok) {
      const errorText =
        data?.error?.message || data?.message || responseText;
      return {
        success: false,
        available: true,
        message: errorText || "OpenRouter AI temporarily unavailable",
      };
    }

    const message = data?.choices?.[0]?.message || {};
    const content =
      typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? message.content
              .filter((part) => part?.type === "text")
              .map((part) => part.text)
              .join(" ")
          : "";

    const text = String(content || "").trim();

    if (!text) {
      return {
        success: false,
        available: true,
        message: "OpenRouter returned an empty response",
      };
    }

    let structuredAnalysis = null;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        structuredAnalysis = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fall through to return raw text analysis
    }

    if (structuredAnalysis) {
      return {
        success: true,
        available: true,
        model: OPENROUTER_MODEL,
        analysis: text,
        structuredAnalysis,
        generatedAt: Date.now(),
      };
    }

    return {
      success: true,
      available: true,
      model: OPENROUTER_MODEL,
      analysis: text,
      generatedAt: Date.now(),
    };
  } catch (error) {
    console.error("OPENROUTER ANALYSIS ERROR:", error?.message || error);
    return {
      success: false,
      available: true,
      message: "OpenRouter AI temporarily unavailable",
      error:
        process.env.NODE_ENV === "production"
          ? undefined
          : error?.message,
    };
  }
}

module.exports = {
  analyzeTelemetry,
  OPENROUTER_MODEL,
};
