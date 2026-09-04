const { GoogleGenAI } = require("@google/genai");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const GEMINI_MODEL =
  process.env.GEMINI_VOICE_MODEL ||
  "gemini-3.1-flash-lite";

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

const tools = [
  {
    functionDeclarations: [
      {
        name: "get_latest_health",
        description: "Get the user's latest SoberWatch health and alcohol telemetry.",
        parameters: { type: "object", properties: {} }
      },
      {
        name: "get_recent_readings",
        description: "Get recent SoberWatch sensor readings and trends.",
        parameters: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Number of readings requested, maximum 30."
            }
          }
        }
      },
      {
        name: "get_location",
        description: "Request the user's current device location.",
        parameters: { type: "object", properties: {} }
      },
      {
        name: "find_contact",
        description: "Find one of the user's saved contacts.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Contact name." }
          },
          required: ["name"]
        }
      },
      {
        name: "call_contact",
        description: "Request a real phone call to a saved contact.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Contact name." },
            phone: { type: "string", description: "Phone number if known." },
            reason: { type: "string", description: "Reason for the call." }
          },
          required: ["name"]
        }
      },
      {
        name: "share_location",
        description: "Request sharing the user's current location with a contact.",
        parameters: {
          type: "object",
          properties: {
            contactName: { type: "string", description: "Recipient name." },
            reason: { type: "string", description: "Reason for sharing." }
          },
          required: ["contactName"]
        }
      },
      {
        name: "emergency_alert",
        description: "Request a SoberWatch emergency alert.",
        parameters: {
          type: "object",
          properties: {
            reason: { type: "string", description: "Emergency reason." },
            severity: {
              type: "string",
              enum: ["low", "medium", "high", "critical"]
            }
          },
          required: ["reason", "severity"]
        }
      },
      {
        name: "create_report",
        description: "Request a SoberWatch report.",
        parameters: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["health", "driving", "alcohol", "weekly", "general"]
            }
          },
          required: ["type"]
        }
      }
    ]
  }
];

function buildSystemInstruction({ language, telemetry, location, profile }) {
  return `
You are SoberWatch AI, a general-purpose AI assistant integrated into an Android application.

You are NOT limited to health.

You can help with:
- normal conversation
- general knowledge
- technology
- school and work
- translation
- current information
- weather and places
- restaurants and services
- music-related requests
- planning and schedules
- contacts and phone actions
- location
- SoberWatch health and driving information

LANGUAGES:
Understand and respond naturally in:
- Kinyarwanda
- English
- French
- Kiswahili
- mixed languages

If the user speaks Kinyarwanda, respond in natural Kinyarwanda.
If English, respond in English.
If French, respond in French.
If Kiswahili, respond in Kiswahili.
For mixed language, use the dominant language naturally.

CONVERSATION:
Maintain the context of the conversation.
Do not ask again for information already provided.
Be natural and helpful.

SOBERWATCH:
Use SoberWatch tools when they are useful.
Never invent telemetry values.
BAC is a sensor reading, not a diagnosis.

Current telemetry:
${JSON.stringify(telemetry || {}, null, 2)}

Current location:
${JSON.stringify(location || {}, null, 2)}

User profile:
${JSON.stringify(profile || {}, null, 2)}

ACTIONS:
You may request actions using tools.
Android is responsible for actually executing phone calls, location sharing, and emergency actions.
Never claim that a real action happened unless Android confirms execution.

VOICE:
Keep normal voice answers concise and natural unless the user asks for details.
`;
}

function extractText(response) {
  if (response?.text) return response.text.trim();

  const parts = response?.candidates?.[0]?.content?.parts || [];

  return parts
    .filter(part => part.text)
    .map(part => part.text)
    .join("")
    .trim();
}

function extractFunctionCalls(response) {
  if (Array.isArray(response?.functionCalls)) {
    return response.functionCalls;
  }

  const parts = response?.candidates?.[0]?.content?.parts || [];

  return parts
    .filter(part => part.functionCall)
    .map(part => part.functionCall);
}

function convertFunctionCalls(functionCalls) {
  return functionCalls.map(call => ({
    name: call.name,
    args: call.args || {},
    requiresAndroidExecution: true
  }));
}

async function chatWithAssistant({
  transcript,
  language,
  telemetry,
  location,
  profile,
  history = []
}) {
  if (!ai) {
    return {
      success: false,
      available: false,
      reply: "Gemini AI ntabwo yashyizweho kuri server.",
      language: language || "auto",
      actions: []
    };
  }

  if (!transcript || !String(transcript).trim()) {
    return {
      success: false,
      available: true,
      reply: "Nta butumwa numvise. Ongera umbwire.",
      language: language || "auto",
      actions: []
    };
  }

  const safeHistory = Array.isArray(history)
    ? history.slice(-12)
    : [];

  const conversation = [];

  for (const message of safeHistory) {
    if (!message?.text) continue;

    conversation.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: String(message.text) }]
    });
  }

  conversation.push({
    role: "user",
    parts: [{ text: String(transcript) }]
  });

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: conversation,
      config: {
        systemInstruction: buildSystemInstruction({
          language,
          telemetry,
          location,
          profile
        }),
        tools
      }
    });

    const functionCalls = extractFunctionCalls(response);
    const reply = extractText(response);

    return {
      success: true,
      available: true,
      model: GEMINI_MODEL,
      reply:
        reply ||
        (functionCalls.length
          ? "Ngiye gutegura icyo gikorwa."
          : "Ntabwo nabashije kubona igisubizo."),
      language: language || "auto",
      actions: convertFunctionCalls(functionCalls),
      sources: [],
      memory: {
        enabled: true,
        conversationTurns: safeHistory.length + 1
      },
      generatedAt: Date.now()
    };
  } catch (error) {
    console.error("VOICE AI ERROR:", error?.message || error);

    return {
      success: false,
      available: true,
      reply: "Habaye ikibazo mu guhuza na AI. Ongera ugerageze.",
      language: language || "auto",
      actions: [],
      error:
        process.env.NODE_ENV === "development"
          ? error?.message
          : undefined
    };
  }
}


async function generateProactiveGreeting({
  language = "rw",
  telemetry = {},
  location = {},
  profile = {},
  history = [],
  sessionId = null,
  userId = null
} = {}) {
  if (!ai) {
    return {
      success: false,
      available: false,
      reply: "",
      language: language || "rw",
      actions: [],
      error: "Gemini AI is not configured."
    };
  }

  const safeHistory = Array.isArray(history)
    ? history.slice(-12)
    : [];

  const context = `
This is a proactive voice turn from SoberWatch.

The user has NOT spoken yet.
Do NOT pretend that the user said anything.
Do NOT create a fake user message.
You are initiating the conversation naturally.

Your job is to decide whether there is something useful and natural to say right now.

You may:
- greet the user naturally
- briefly check in
- mention an important SoberWatch status when useful
- mention a relevant driving/safety issue
- start a normal conversation
- ask a natural question
- remain brief when there is nothing important

Do not sound like a notification, robot, alarm, or canned script.
Do not always use the same greeting.
Do not say "How can I help you?" every time.
Use the user's language naturally.
If language is Kinyarwanda, use natural conversational Kinyarwanda.

Current telemetry:
${JSON.stringify(telemetry || {}, null, 2)}

Current location:
${JSON.stringify(location || {}, null, 2)}

User profile:
${JSON.stringify(profile || {}, null, 2)}

Recent conversation:
${JSON.stringify(safeHistory, null, 2)}

Session ID:
${String(sessionId || "")}

User ID:
${String(userId || "")}

Generate ONLY the spoken response.
`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: context }]
        }
      ],
      config: {
        systemInstruction: buildSystemInstruction({
          language,
          telemetry,
          location,
          profile
        }),
        tools
      }
    });

    const functionCalls = extractFunctionCalls(response);
    const reply = extractText(response).trim();

    return {
      success: true,
      available: true,
      model: GEMINI_MODEL,
      reply:
        reply ||
        "Muraho. Ndi hano kugufasha igihe cyose ubikeneye.",
      language: language || "rw",
      actions: convertFunctionCalls(functionCalls),
      sources: [],
      generatedAt: Date.now()
    };
  } catch (error) {
    console.error(
      "PROACTIVE VOICE AI ERROR:",
      error?.message || error
    );

    return {
      success: false,
      available: true,
      reply: "",
      language: language || "rw",
      actions: [],
      error:
        process.env.NODE_ENV === "development"
          ? error?.message
          : undefined
    };
  }
}

module.exports = {
  chatWithAssistant,
  generateProactiveGreeting,
  GEMINI_MODEL
};
