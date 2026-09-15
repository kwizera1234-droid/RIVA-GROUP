import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Lazy Google GenAI Client
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    genAIClient = new GoogleGenAI({
      apiKey: apiKey || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAIClient;
}

// 1. Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// 2. Semantic Intent Classification API (Gemini 3.7 Flash)
app.post('/api/voice/intent', async (req, res) => {
  try {
    const { transcript, language = 'rw', contacts = [], currentReading = null } = req.body;

    if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
      return res.status(400).json({
        error: 'EMPTY_TRANSCRIPT',
        message: 'Transcript is required for semantic classification',
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
- Current Biometrics: ${JSON.stringify(currentReading || { alcoholBac: 0.0, heartRateBpm: 72, status: 'SAFE' })}
- Preferred language: ${language}

Rules:
1. Understand meaning, dialect variations, acoustic misspellings, and mixed Kinyarwanda/English (e.g. "Reba heartbeat yanjye hanyuma umbwire uko meze").
2. For Kinyarwanda responses: use pure, fluent, natural, respectful, and crystal-clear Kinyarwanda. NEVER sound robotic.
3. If intent is CALL_CONTACT, extract target contactName and check if it matches one of configured contacts.
4. If intent is EMERGENCY_REQUEST or CALL_CONTACT, provide clear notice and remind them they can say 'Hagarika' (Cancel) to abort.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: `Spoken input: "${cleanTranscript}"`,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intent: {
              type: Type.STRING,
              description: 'Classified intent name',
            },
            confidence: {
              type: Type.NUMBER,
              description: 'Confidence score from 0.0 to 1.0',
            },
            detectedLanguage: {
              type: Type.STRING,
              description: "Language code: 'rw', 'en', 'fr', or 'sw'",
            },
            extractedContactName: {
              type: Type.STRING,
              description: 'Name of the contact to call if applicable',
            },
            extractedAction: {
              type: Type.STRING,
              description: 'Specific tool or action name',
            },
            speechResponse: {
              type: Type.STRING,
              description: 'Natural spoken response in the target language',
            },
          },
          required: ['intent', 'confidence', 'detectedLanguage', 'speechResponse'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({
      intent: parsed.intent || 'UNKNOWN_COMMAND',
      confidence: parsed.confidence ?? 0.9,
      detectedLanguage: parsed.detectedLanguage || language,
      extractedEntity: {
        contactName: parsed.extractedContactName || undefined,
        action: parsed.extractedAction || undefined,
      },
      speechResponse: parsed.speechResponse || 'Nabyumvise.',
      rawText: cleanTranscript,
    });
  } catch (err: any) {
    console.error('[VOICE SERVER] Semantic intent reasoning error:', err);
    return res.status(500).json({
      error: 'AI_ERROR',
      message: err?.message || 'AI Reasoning service temporarily unavailable',
    });
  }
});

// 3. Audio Speech-to-Text Transcription API (Gemini Multimodal STT)
app.post('/api/voice/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/webm', language = 'rw' } = req.body;

    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({
        error: 'EMPTY_AUDIO',
        message: 'No audio data received for transcription',
      });
    }

    const ai = getGenAI();
    const cleanMime = (mimeType || 'audio/webm').split(';')[0].trim();

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            mimeType: cleanMime,
            data: audioBase64,
          },
        },
        `You are an expert multilingual speech-to-text transcription engine specializing in Kinyarwanda, English, French, and Swahili.
Primary expected language: ${language === 'rw' ? 'Kinyarwanda' : language === 'fr' ? 'French' : language === 'sw' ? 'Swahili' : 'English'}.

Task:
Transcribe the speech in this audio with extreme accuracy.
- If the user speaks Kinyarwanda (e.g. "Reba uko meze", "Hamagara John", "Ubutabazi", "Ntabara", "Hagarika", "Mbwira BAC yanjye"), transcribe in correct Kinyarwanda spelling.
- If code-switching between Kinyarwanda and English (e.g. "Reba heartbeat yanjye"), preserve both naturally.
- If the audio is empty, background noise, or no spoken words, output EMPTY STRING.
- Output ONLY the verbatim transcribed words. Do not add quotes, markdown, or commentary.`,
      ],
    });

    const transcript = (response.text || '').trim().replace(/^["'`]|["'`]$/g, '');

    return res.json({
      transcript,
      detectedLanguage: language,
      length: transcript.length,
    });
  } catch (err: any) {
    console.error('[VOICE SERVER] Audio transcription error:', err);
    return res.status(500).json({
      error: 'STT_ERROR',
      message: err?.message || 'Audio transcription failed',
    });
  }
});

// 4. High Quality TTS Synthesis API (Gemini Flash TTS Preview)
app.post('/api/voice/tts', async (req, res) => {
  try {
    const { text, language = 'rw' } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'EMPTY_TEXT', message: 'Text is required for TTS' });
    }

    const ai = getGenAI();
    const promptText = `Speak clearly and naturally with appropriate pauses in ${language === 'rw' ? 'Kinyarwanda' : language === 'fr' ? 'French' : language === 'sw' ? 'Swahili' : 'English'}: ${text}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-tts-preview',
      contents: [{ parts: [{ text: promptText }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (audioData) {
      return res.json({
        audioBase64: audioData,
        mimeType: 'audio/mp3',
        sampleRate: 24000,
      });
    }

    return res.status(200).json({ audioBase64: null, fallback: true });
  } catch (err: any) {
    console.warn('[VOICE SERVER] TTS Generation notice (falling back to client synthesis):', err?.message);
    return res.json({ audioBase64: null, fallback: true });
  }
});

// Vite middleware & Static SPA Serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // CRITICAL: Never serve HTML for API routes. Frontend API must use the real backend
    // at https://soberwatch-backend.onrender.com — this prevents masking a misconfigured Render.
    app.all('/api/*', (_req, res) => {
      res.status(404).json({
        status: 'error',
        message: 'API endpoint not found on frontend server. SoberWatch telemetry API must be served by backend/index.js at https://soberwatch-backend.onrender.com',
        code: 'FRONTEND_API_MISCONFIG',
      });
    });
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SOBERWATCH-FRONTEND] Server running on http://0.0.0.0:${PORT} (frontend SPA only; telemetry API is at https://soberwatch-backend.onrender.com)`);
  });
}

startServer();
