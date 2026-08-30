const { GoogleGenAI } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn('[Gemini] GEMINI_API_KEY environment variable is not configured. AI analysis will be unavailable.');
}

let client = null;
try {
  client = new GoogleGenAI({ apiKey });
} catch (err) {
  console.error('[Gemini] Failed to initialize GoogleGenAI client:', err);
}

const MODEL = 'gemini-2.0-flash';

/**
 * Analyze SoberWatch telemetry data using Gemini AI.
 * Returns structured analysis results or null if unavailable.
 */
async function analyzeTelemetry({ bac, heartRate, spo2, temperature, drivingReady, recentReadings }) {
  if (!client) return null;

  try {
    const systemPrompt = `
You are SoberWatch AI, a personal alcohol-safety and health-monitoring assistant.

Analyze the following SoberWatch telemetry data and provide a JSON response with these exact fields:
- summary: A brief 1-2 sentence summary of the user's current state
- riskLevel: One of "LOW", "MEDIUM", "HIGH", or "CRITICAL"
- drivingRecommendation: Recommendation about driving ("safe", "caution", "do not drive", "medical attention needed")
- keyFindings: Array of short, factual observations from the data
- recommendations: Array of practical safety recommendations
- confidence: Number 0-100 indicating how confident the analysis is

RULES:
- Never invent sensor values. If data is missing, say so explicitly.
- Do not diagnose medical conditions.
- Clearly distinguish measured sensor data from AI interpretation.
- For high-risk alcohol/driving conditions, prioritize safety and recommend not driving.
- Keep responses concise and practical.
- Return ONLY valid JSON - no prose, no markdown formatting, no extra text.
`.trim();

    const userPrompt = `
Please analyze this SoberWatch telemetry data:

- BAC (blood alcohol concentration): ${bac !== undefined ? bac : 'NOT_PROVIDED'} g/L
- Heart rate: ${heartRate !== undefined ? heartRate : 'NOT_PROVIDED'} bpm
- SpO2: ${spo2 !== undefined ? spo2 : 'NOT_PROVIDED'} %
- Temperature: ${temperature !== undefined ? temperature : 'NOT_PROVIDED'} °C
- Driving readiness: ${drivingReady !== undefined ? (drivingReady ? 'ready' : 'not ready') : 'NOT_PROVIDED'}
- Recent telemetry count: ${recentReadings !== undefined ? recentReadings.length : 'NOT_PROVIDED'} readings

Provide the JSON response as specified in the system prompt above.`.trim();

    const response = await client.models.generateContent({
      model: MODEL,
      contents: userPrompt,
      systemInstruction: systemPrompt,
      config: {
        temperature: 0.3,
      },
    });

    const text = response.text?.trim();
    if (!text) return { summary: 'No analysis returned.', riskLevel: 'LOW', drivingRecommendation: 'unknown', keyFindings: [], recommendations: [], confidence: 0 };

    // Parse the JSON response from Gemini
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      // If Gemini didn't return proper JSON, return a default safe response
      return { summary: 'Unable to parse AI analysis.', riskLevel: 'LOW', drivingRecommendation: 'unknown', keyFindings: [], recommendations: [], confidence: 0 };
    }

    // Validate required fields
    if (result && typeof result === 'object') {
      return {
        summary: result.summary || 'No summary provided.',
        riskLevel: result.riskLevel || 'LOW',
        drivingRecommendation: result.drivingRecommendation || 'unknown',
        keyFindings: Array.isArray(result.keyFindings) ? result.keyFindings : [],
        recommendations: Array.isArray(result.recommendations) ? result.recommendations : [],
        confidence: typeof result.confidence === 'number' ? result.confidence : 0,
      };
    }

    return { summary: 'Invalid analysis format.', riskLevel: 'LOW', drivingRecommendation: 'unknown', keyFindings: [], recommendations: [], confidence: 0 };
  } catch (err) {
    console.error('[Gemini] AI analysis error:', err);
    return null;
  }
}

module.exports = {
  analyzeTelemetry,
  isConfigured: () => Boolean(apiKey),
  model: MODEL,
};