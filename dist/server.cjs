var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = parseInt(process.env.PORT || "3000", 10);
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ extended: true, limit: "50mb" }));
var genAIClient = null;
function getGenAI() {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    genAIClient = new import_genai.GoogleGenAI({
      apiKey: apiKey || "",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return genAIClient;
}
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});
app.post("/api/voice/intent", async (req, res) => {
  try {
    const { transcript, language = "rw", contacts = [], currentReading = null } = req.body;
    if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
      return res.status(400).json({
        error: "EMPTY_TRANSCRIPT",
        message: "Transcript is required for semantic classification"
      });
    }
    const cleanTranscript = transcript.trim();
    const ai = getGenAI();
    const systemPrompt = `You are SoberWatch AI Voice Reasoning Engine for a biometric sobriety and emergency safety assistant in Rwanda.
The user speaks in Kinyarwanda, English, French, Swahili, or code-switched language.

Given the spoken transcript, determine the user's semantic intent, confidence (0.0 - 1.0), detected language ('rw', 'en', 'fr', 'sw'), extracted entities, tool/action to execute, and the natural conversational spoken response.

Available Intents:
- EMERGENCY_REQUEST: User is in danger, injured, in an accident, crying for help, severe distress (e.g., "Ndababaye cyane", "Nkeneye ubufasha bw'ubutabazi", "I had a car crash", "Help me 112").
- CANCEL_EMERGENCY: User says stop, cancel, false alarm, they are okay, abort countdown (e.g., "Hagarika", "Reka", "Oya nta kibazo", "Cancel emergency", "Stop calling").
- CALL_CONTACT: User wants to call someone by name or relationship (e.g., "Hamagara John", "John muhagare", "Call mom", "Ndashaka kuvugana na Mama", "Mpamarire umugore wanjye").
- CHECK_HEALTH: User wants to check biometrics, heart rate, vitals, overall physical condition (e.g., "Reba uko meze", "Mbwira uko meze uyu munsi", "Heartbeat yanjye imeze ite?", "Ubuzima bwanjye bumeze gute?", "Check my vitals").
- CHECK_ALCOHOL_STATUS: User wants to know their BAC or alcohol level (e.g., "Reba BAC yanjye", "Igipimo cy'inzoga ni ikihe?", "What is my alcohol level?").
- CHECK_DRIVING_READINESS: User asks if they can drive safely (e.g., "Nshobora gutwara imodoka?", "Am I safe to drive?", "Puis-je conduire?").
- CHECK_LOCATION: User asks where they are or GPS position (e.g., "Fata location yanjye", "Aho ndi ni he?", "Where am I?").
- GET_DAILY_REPORT: User asks for daily summary or status (e.g., "Show my daily report", "Mbwira raporo y'uyu munsi").
- HELP: User asks what assistant can do or commands (e.g., "Ubufasha", "What can you do?", "Amabwiriza").
- NORMAL_CONVERSATION: Greetings, thanks, polite conversational remarks (e.g., "Muraho", "Bite", "Good morning", "Urakoze").
- UNKNOWN_COMMAND: Completely unintelligible or unhandled query.

Current user context:
- Configured contacts: ${JSON.stringify(contacts)}
- Current Biometrics: ${JSON.stringify(currentReading || { alcoholBac: 0, heartRateBpm: 72, status: "SAFE" })}
- Preferred language: ${language}

Rules:
1. Understand meaning, dialect variations, acoustic misspellings, and mixed Kinyarwanda/English (e.g. "Reba heartbeat yanjye hanyuma umbwire uko meze").
2. For Kinyarwanda responses: use pure, fluent, natural, respectful, and crystal-clear Kinyarwanda. NEVER sound robotic.
3. If intent is CALL_CONTACT, extract target contactName and check if it matches one of configured contacts.
4. If intent is EMERGENCY_REQUEST or CALL_CONTACT, provide clear notice and remind them they can say 'Hagarika' (Cancel) to abort.`;
    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: `Spoken input: "${cleanTranscript}"`,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: import_genai.Type.OBJECT,
          properties: {
            intent: {
              type: import_genai.Type.STRING,
              description: "Classified intent name"
            },
            confidence: {
              type: import_genai.Type.NUMBER,
              description: "Confidence score from 0.0 to 1.0"
            },
            detectedLanguage: {
              type: import_genai.Type.STRING,
              description: "Language code: 'rw', 'en', 'fr', or 'sw'"
            },
            extractedContactName: {
              type: import_genai.Type.STRING,
              description: "Name of the contact to call if applicable"
            },
            extractedAction: {
              type: import_genai.Type.STRING,
              description: "Specific tool or action name"
            },
            speechResponse: {
              type: import_genai.Type.STRING,
              description: "Natural spoken response in the target language"
            }
          },
          required: ["intent", "confidence", "detectedLanguage", "speechResponse"]
        }
      }
    });
    const parsed = JSON.parse(response.text || "{}");
    return res.json({
      intent: parsed.intent || "UNKNOWN_COMMAND",
      confidence: parsed.confidence ?? 0.9,
      detectedLanguage: parsed.detectedLanguage || language,
      extractedEntity: {
        contactName: parsed.extractedContactName || void 0,
        action: parsed.extractedAction || void 0
      },
      speechResponse: parsed.speechResponse || "Nabyumvise.",
      rawText: cleanTranscript
    });
  } catch (err) {
    console.error("[VOICE SERVER] Semantic intent reasoning error:", err);
    return res.status(500).json({
      error: "AI_ERROR",
      message: err?.message || "AI Reasoning service temporarily unavailable"
    });
  }
});
app.post("/api/voice/transcribe", async (req, res) => {
  try {
    const { audioBase64, mimeType = "audio/webm", language = "rw" } = req.body;
    if (!audioBase64 || typeof audioBase64 !== "string") {
      return res.status(400).json({
        error: "EMPTY_AUDIO",
        message: "No audio data received for transcription"
      });
    }
    const ai = getGenAI();
    const cleanMime = (mimeType || "audio/webm").split(";")[0].trim();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: cleanMime,
            data: audioBase64
          }
        },
        `You are an expert multilingual speech-to-text transcription engine specializing in Kinyarwanda, English, French, and Swahili.
Primary expected language: ${language === "rw" ? "Kinyarwanda" : language === "fr" ? "French" : language === "sw" ? "Swahili" : "English"}.

Task:
Transcribe the speech in this audio with extreme accuracy.
- If the user speaks Kinyarwanda (e.g. "Reba uko meze", "Hamagara John", "Ubutabazi", "Ntabara", "Hagarika", "Mbwira BAC yanjye"), transcribe in correct Kinyarwanda spelling.
- If code-switching between Kinyarwanda and English (e.g. "Reba heartbeat yanjye"), preserve both naturally.
- If the audio is empty, background noise, or no spoken words, output EMPTY STRING.
- Output ONLY the verbatim transcribed words. Do not add quotes, markdown, or commentary.`
      ]
    });
    const transcript = (response.text || "").trim().replace(/^["'`]|["'`]$/g, "");
    return res.json({
      transcript,
      detectedLanguage: language,
      length: transcript.length
    });
  } catch (err) {
    console.error("[VOICE SERVER] Audio transcription error:", err);
    return res.status(500).json({
      error: "STT_ERROR",
      message: err?.message || "Audio transcription failed"
    });
  }
});
app.post("/api/voice/tts", async (req, res) => {
  try {
    const { text, language = "rw" } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "EMPTY_TEXT", message: "Text is required for TTS" });
    }
    const ai = getGenAI();
    const promptText = `Speak clearly and naturally with appropriate pauses in ${language === "rw" ? "Kinyarwanda" : language === "fr" ? "French" : language === "sw" ? "Swahili" : "English"}: ${text}`;
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: promptText }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" }
          }
        }
      }
    });
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (audioData) {
      return res.json({
        audioBase64: audioData,
        mimeType: "audio/mp3",
        sampleRate: 24e3
      });
    }
    return res.status(200).json({ audioBase64: null, fallback: true });
  } catch (err) {
    console.warn("[VOICE SERVER] TTS Generation notice (falling back to client synthesis):", err?.message);
    return res.json({ audioBase64: null, fallback: true });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SOBERWATCH] Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
