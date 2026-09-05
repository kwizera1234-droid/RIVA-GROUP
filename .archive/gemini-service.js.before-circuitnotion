const OPENROUTER_API_KEY = process.env.SOBERWATCH_API_KEY1 || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";

function buildPrompt(telemetry) {
  return `
You are SoberWatch AI, an advanced driver-safety and telemetry analysis assistant.

Your job is to analyze vehicle-driver telemetry carefully and provide a detailed, practical, evidence-based safety assessment.

IMPORTANT RULES:
1. Use ONLY the measurements provided.
2. Never invent sensor readings.
3. Clearly distinguish measured data from interpretation.
4. Do not diagnose medical conditions.
5. Do not claim that a physiological measurement proves alcohol impairment.
6. BAC/alcohol measurements should be treated as sensor/device readings.
7. If a value is missing, explicitly say "Not available".
8. Explain WHY you reached each conclusion.
9. Give practical step-by-step recommendations.
10. Prioritize immediate safety when risk is high.
11. Do not make unsupported legal claims. Legal limits depend on jurisdiction and driver category.
12. Confidence must reflect the completeness and consistency of the available telemetry.

TELEMETRY:

${JSON.stringify(telemetry, null, 2)}

Return a detailed SoberWatch AI report using EXACTLY this structure:

OVERALL ASSESSMENT
- Give a clear summary of the current situation.
- State whether the driver appears SAFE, CAUTION, or DANGER based on the provided SoberWatch status and measurements.
- Explain the main reason.

RISK LEVEL
- LOW, MODERATE, HIGH, or CRITICAL.
- Explain why.

DRIVER READINESS
- Assess readiness to drive based only on the available telemetry.
- Explain what supports the assessment.
- Explain what information is still missing.

DETAILED SIGNAL ANALYSIS

BAC / ALCOHOL
- Measured value
- What the reading indicates
- Safety interpretation
- Important limitations

HEART RATE
- Measured value
- Interpretation
- Relationship to the overall safety picture
- Important limitations

SpO2
- Measured value
- Interpretation
- Important limitations

BODY TEMPERATURE
- Measured value
- Interpretation
- Important limitations

OTHER TELEMETRY
- Analyze any additional fields provided.
- If none are available, say so.

CORRELATION OF SIGNALS
- Explain how the available measurements relate to each other.
- Identify whether the signals reinforce or contradict each other.
- Do not invent correlations that cannot be supported by the data.

WHAT COULD BE HAPPENING
- Give the most reasonable interpretation of the telemetry.
- Separate facts from possibilities.
- Mention uncertainty where appropriate.

IMMEDIATE ACTIONS
Give a numbered list of concrete actions the driver should take NOW.

PREVENTIVE ADVICE
Give practical advice for reducing future driving risk.

MONITORING PLAN
Explain:
- What SoberWatch should continue monitoring
- Which values should trigger attention
- What changes would make the risk assessment worse
- What changes would make it better

AI EXPLANATION
Explain the reasoning behind the final assessment in simple language that a driver can understand.

CONFIDENCE
- HIGH, MEDIUM, or LOW
- Explain why.

FINAL DECISION
End with exactly one of:
SAFE TO CONTINUE MONITORING
CAUTION - ADDITIONAL ATTENTION REQUIRED
DANGER - DO NOT CONTINUE DRIVING

Keep the report detailed but practical.
Do not use unnecessary medical jargon.
`;
}

async function analyzeTelemetry(telemetry) {
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
        messages: [{ role: "user", content: buildPrompt(telemetry) }],
        temperature: 0.2,
        max_tokens: 600,
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
      const errorText = data?.error?.message || data?.message || responseText;
      return {
        success: false,
        available: true,
        message: errorText || "OpenRouter AI temporarily unavailable",
      };
    }

    const message = data?.choices?.[0]?.message || {};
    const content = typeof message.content === "string"
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
      error: process.env.NODE_ENV === "production" ? undefined : error?.message,
    };
  }
}

module.exports = {
  analyzeTelemetry,
  OPENROUTER_MODEL,
};
