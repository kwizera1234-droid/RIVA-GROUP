const OPENROUTER_SITE_URL = process.env.OPENROUTER_SITE_URL || "https://soberwatch.app";
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || "SoberWatch";

function getOpenRouterApiKey() {
  return String(process.env.OPENROUTER_API_KEY || "").trim();
}

function getOpenRouterModel() {
  return String(process.env.OPENROUTER_MODEL || "openrouter/free").trim();
}

function getOpenRouterFallbackModels() {
  const configured = String(process.env.OPENROUTER_FALLBACK_MODELS || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return [...new Set(configured)].slice(0, 3);
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 45000;

const { searchCurrentInfo } = require("./search-service");
const { buildPersonalizedSafetyMessage } = require("./static-safety-message");

function isFreshnessRequest(text) {
  const value = String(text || "").toLowerCase();
  return /(latest|current|today|now|weather|news|restaurant|near me|nearby|price|prices|recent|this week|tomorrow|upcoming|today's|current information|what is happening|what's happening|where is|how much|laws|traffic|amakuru\s+mashya|makuru\s+mashya|mashya|uyu munsi|birabaye|icyumweru|nouveaux|aujourd'hui|actu|météo|habari\s+mpya|mpya|ya\s+leo|leo)/i.test(value);
}

function buildOpenRouterTools(includeSearch) {
  const functionTools = [
    {
      type: "function",
      function: {
        name: "get_latest_health",
        description: "Get the user's latest SoberWatch health and alcohol telemetry.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "get_recent_readings",
        description: "Get recent SoberWatch sensor readings and trends.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Number of readings requested, maximum 30." },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_location",
        description: "Request the user's current device location.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "find_contact",
        description: "Find one of the user's saved contacts.",
        parameters: {
          type: "object",
          properties: { name: { type: "string", description: "Contact name." } },
          required: ["name"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "call_contact",
        description: "Request a real phone call to a saved contact.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Contact name." },
            phone: { type: "string", description: "Phone number if known." },
            reason: { type: "string", description: "Reason for the call." },
          },
          required: ["name"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "share_location",
        description: "Request sharing the user's current location with a contact.",
        parameters: {
          type: "object",
          properties: {
            contactName: { type: "string", description: "Recipient name." },
            reason: { type: "string", description: "Reason for sharing." },
          },
          required: ["contactName"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "emergency_alert",
        description: "Request a SoberWatch emergency alert.",
        parameters: {
          type: "object",
          properties: {
            reason: { type: "string", description: "Emergency reason." },
            severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
          },
          required: ["reason", "severity"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_report",
        description: "Request a SoberWatch report.",
        parameters: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["health", "driving", "alcohol", "weekly", "general"] },
          },
          required: ["type"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "open_page",
        description:
          "Navigate the SoberWatch app to a different page when the user asks to open a page or change screen. Allowed pages: dashboard, history, alerts, settings, voice, emergency-contacts, notifications.",
        parameters: {
          type: "object",
          properties: {
            page: {
              type: "string",
              enum: ["dashboard", "history", "alerts", "settings", "voice", "emergency-contacts", "notifications"],
            },
          },
          required: ["page"],
        },
      },
    },
  ];

  const tools = [...functionTools];
  if (includeSearch) {
    tools.unshift({ type: "openrouter:web_search" });
  }
  return tools;
}

function buildSystemInstruction({ language, telemetry, location, profile, page, deviceStatus, alerts, readingsSummary }) {
  return `You are SoberWatch AI, a highly capable natural multilingual conversational assistant.

Understand the users intended meaning, not isolated keywords. Understand natural Kinyarwanda, English, French, Kiswahili, slang, jokes, sarcasm, idioms, incomplete speech, ASR mistakes, and mixed-language conversation. Do not treat jokes, hypotheticals, stories, or figurative language as real device commands.

Use conversation history to understand follow-ups and previous context. Answer the actual question naturally instead of forcing everything into SoberWatch. Do not give canned responses. If the user is joking, respond naturally. If meaning is genuinely unclear, ask one short clarification in the same language.

Reply in the users dominant language. For Kinyarwanda, use fluent natural Kinyarwanda, not awkward literal translations.

Tools can perform real actions. Only use consequential Android actions when the users intention is clear. Never call, message, share location, or trigger emergency actions merely because those words were mentioned. Never claim an action completed unless Android confirms it.

Never invent telemetry, health readings, contacts, or location. SoberWatch readings are device measurements, not automatically a medical diagnosis. If a telemetry field is missing or null, say it is unavailable — never fabricate a value.

The page the user is currently viewing is: ${String(page || 'dashboard').toUpperCase()}. Use this page context to tailor your answer (e.g. device questions on DEVICE/dashboard, health questions on HEALTH/dashboard).

Telemetry: ${JSON.stringify(telemetry || {}, null, 2)}
Device status: ${JSON.stringify(deviceStatus || {}, null, 2)}
Recent alerts: ${JSON.stringify(Array.isArray(alerts) ? alerts.slice(-8) : [], null, 2)}
Recent readings summary: ${JSON.stringify(readingsSummary || {}, null, 2)}
Location: ${JSON.stringify(location || {}, null, 2)}
User profile: ${JSON.stringify(profile || {}, null, 2)}
Requested language: ${language || 'auto'}

Be warm, intelligent, direct, and concise. Give simple answers to simple questions and clear explanations to complex questions. Never invent facts.`;
}

function normalizeOpenRouterMessages(history = []) {
  const safeHistory = Array.isArray(history) ? history.slice(-12) : [];
  const messages = [];

  for (const message of safeHistory) {
    const role = String(message?.role || "user").toLowerCase();
    const content = String(message?.content || message?.text || "").trim();
    if (!content) continue;
    if (role === "assistant") {
      messages.push({ role: "assistant", content });
    } else {
      messages.push({ role: "user", content });
    }
  }

  return messages;
}

function extractOpenRouterReply(message) {
  if (!message) return "";
  if (typeof message.content === "string") return message.content.trim();
  if (Array.isArray(message.content)) {
    return message.content
      .filter((part) => typeof part === "object" && part?.type === "text" && part?.text)
      .map((part) => part.text)
      .join(" ")
      .trim();
  }
  return "";
}

function extractToolCalls(message) {
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const allowedTools = new Set([
    "get_latest_health",
    "get_recent_readings",
    "get_location",
    "find_contact",
    "call_contact",
    "share_location",
    "emergency_alert",
    "create_report",
    "open_page",
  ]);
  return toolCalls
    .filter((call) => call?.type === "function" && call.function && allowedTools.has(call.function.name))
    .map((call) => {
      const args = (() => {
        try {
          return JSON.parse(call.function.arguments || "{}") || {};
        } catch {
          return {};
        }
      })();
      return {
        name: call.function.name,
        args: args && typeof args === "object" && !Array.isArray(args) ? args : {},
      };
    });
}

function extractOpenRouterSources(data) {
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  if (sources.length) return sources;
  if (Array.isArray(data?.choices?.[0]?.message?.sources)) return data.choices[0].message.sources;
  return [];
}

async function callOpenRouter({ messages, tools, systemPrompt, temperature = 0.3 }) {
  const apiKey = getOpenRouterApiKey();
  const model = getOpenRouterModel();
  const fallbackModels = getOpenRouterFallbackModels();

  if (!apiKey) {
    throw new Error("OpenRouter API key is not configured on the server.");
  }

  const response = await fetch(OPENROUTER_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": OPENROUTER_SITE_URL,
      "X-Title": OPENROUTER_APP_NAME,
    },
    body: JSON.stringify({
      model,
      models: fallbackModels.length ? [model, ...fallbackModels] : undefined,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      tools: tools && tools.length ? tools : undefined,
      temperature,
      max_tokens: 500,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const responseText = await response.text();
  let data;
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(`OpenRouter returned invalid JSON: ${responseText.slice(0, 200)}`);
  }

  if (!response.ok) {
    const status = response.status;
    const errorText = data?.error?.message || data?.message || responseText;
    const error = new Error(errorText || `OpenRouter request failed with HTTP ${status}`);
    error.code = `OPENROUTER_${status}`;
    throw error;
  }

  const choice = data?.choices?.[0];
  const message = choice?.message || {};
  return {
    message,
    reply: extractOpenRouterReply(message),
    toolCalls: extractToolCalls(message),
    sources: extractOpenRouterSources(data),
    raw: data,
  };
}


async function chatWithAssistant({
  transcript,
  language,
  telemetry,
  location,
  profile,
  history = [],
  sessionId = null,
  userId = null,
  page = null,
  deviceStatus = null,
  alerts = [],
  readingsSummary = null,
}) {
  const safeTranscript = String(transcript || "").trim();

  if (!safeTranscript) {
    return {
      success: false,
      available: true,
      reply: "Nta butumwa numvise. Ongera umbwire.",
      language: language || "auto",
      actions: [],
      sources: [],
    };
  }

  const systemPrompt = buildSystemInstruction({ language, telemetry, location, profile, page, deviceStatus, alerts, readingsSummary });
  const messages = normalizeOpenRouterMessages(history);
  messages.push({ role: "user", content: safeTranscript });

  const hasSearch = isFreshnessRequest(safeTranscript) || isFreshnessRequest(JSON.stringify(history || []));
  const tools = buildOpenRouterTools(hasSearch);

  // When current information is required, the backend performs a real Google
  // (Google News RSS) search and includes the real results as grounded context
  // so the AI never fabricates news. Results are also returned as real sources.
  let groundedSources = [];
  if (hasSearch) {
    try {
      const search = await searchCurrentInfo({
        query: safeTranscript.length > 80 ? safeTranscript.slice(0, 80) : safeTranscript,
        limit: 5,
        days: 7,
      });
      if (search && search.success && Array.isArray(search.results)) {
        groundedSources = search.results;
        const contextBlock = groundedSources
          .map(
            (r, index) =>
              `${index + 1}. ${r.title} — ${r.summary} (${r.source}, ${r.publishedAt || "date unknown"}) ${r.url}`
          )
          .join("\n");

        if (contextBlock) {
          messages.push({
            role: "user",
            content: `Current web search results for the user's request:\n${contextBlock}\n\nUse ONLY these facts to answer the user's question about current events. Clearly cite the source when you use it. If the results are unrelated, say so honestly.`,
          });
        }
      }
    } catch (searchError) {
      console.error("VOICE SEARCH ERROR:", searchError?.message || searchError);
    }
  }

  try {
    const result = await callOpenRouter({ messages, tools, systemPrompt });
    if (!result.reply) {
      const error = new Error("OpenRouter returned no assistant reply");
      error.code = "OPENROUTER_EMPTY_RESPONSE";
      throw error;
    }
    const reply = result.reply;
    const actions = result.toolCalls.map((call) => ({
      name: call.name,
      args: call.args || {},
      requiresAndroidExecution: ["call_contact", "share_location", "emergency_alert"].includes(call.name),
    }));

    // Merge OpenRouter-provided sources with the backend's real Google results.
    const mergedSources = [...(Array.isArray(result.sources) ? result.sources : [])];
    if (groundedSources.length) {
      const existingKeys = new Set(mergedSources.map((s) => String(s?.url || "")));
      for (const source of groundedSources) {
        if (source.url && !existingKeys.has(source.url)) {
          mergedSources.push(source);
          existingKeys.add(source.url);
        }
      }
    }

    return {
      success: true,
      available: true,
      model: getOpenRouterModel(),
      reply,
      language: language || "auto",
      actions,
      intent: mapIntentFromActions(actions) || inferIntentFromTranscript(safeTranscript),
      sources: mergedSources.slice(0, 8),
      sessionId: sessionId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      memory: { enabled: true, conversationTurns: messages.length },
      generatedAt: Date.now(),
    };
  } catch (error) {
    console.error("OPENROUTER VOICE AI ERROR:", error?.message || error);
    // OpenRouter failed → reply with the FULL static personalized safety message
    // (based on the ACTUAL reading) instead of a bare error string.
    return {
      success: false,
      available: false,
      reply: buildPersonalizedSafetyMessage(
        language === "auto" ? "en" : language || "en",
        telemetry || null
      ),
      language: language || "auto",
      actions: [],
      sources: [],
      errorCode: error?.code || "OPENROUTER_UNAVAILABLE",
      error: process.env.NODE_ENV === "production" ? undefined : (error?.message || String(error)),
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
  userId = null,
} = {}) {
  const context = `This is a proactive voice turn from SoberWatch. The user has not spoken yet. Respond naturally, briefly, and in the language requested. Current telemetry: ${JSON.stringify(telemetry || {}, null, 2)} Current location: ${JSON.stringify(location || {}, null, 2)} Recent conversation: ${JSON.stringify(Array.isArray(history) ? history.slice(-6) : [], null, 2)}`;

  const systemPrompt = buildSystemInstruction({ language, telemetry, location, profile });
  try {
    const result = await callOpenRouter({
      messages: [{ role: "user", content: context }],
      tools: [],
      systemPrompt,
      temperature: 0.7,
    });

    if (!result.reply) {
      const error = new Error("OpenRouter returned no assistant reply");
      error.code = "OPENROUTER_EMPTY_RESPONSE";
      throw error;
    }
    const reply = result.reply;

    return {
      success: true,
      available: true,
      model: getOpenRouterModel(),
      reply,
      language: language || "rw",
      actions: [],
      sources: result.sources || [],
      generatedAt: Date.now(),
    };
  } catch (error) {
    console.error("PROACTIVE VOICE AI ERROR:", error?.message || error);
    // OpenRouter failed → still greet with the FULL static personalized safety
    // message based on the ACTUAL telemetry.
    return {
      success: false,
      available: false,
      reply: buildPersonalizedSafetyMessage(
        language === "auto" ? "en" : language || "en",
        telemetry || null
      ),
      language: language || "rw",
      actions: [],
      errorCode: error?.code || "OPENROUTER_UNAVAILABLE",
      error: process.env.NODE_ENV === "development" ? error?.message : undefined,
    };
  }
}

module.exports = {
  chatWithAssistant,
  generateProactiveGreeting,
  getOpenRouterModel,
};

/**
 * Maps an OpenRouter tool call to a normalized SoberWatch intent string so the
 * frontend can execute the action through its own validated action layer.
 */
function mapIntentFromActions(actions) {
  const names = (actions || []).map((a) => typeof a?.name === "string" ? a.name : "");
  if (names.includes("emergency_alert")) return "EMERGENCY_REQUEST";
  if (names.includes("call_contact")) {
    return names.includes("share_location") ? "SHARE_LOCATION" : "CALL_CONTACT";
  }
  if (names.includes("share_location")) return "SHARE_LOCATION";
  if (names.includes("open_page")) {
    const openPage = (actions || []).find((a) => a?.name === "open_page");
    const target = openPage?.args?.page || "dashboard";
    if (target === "emergency-contacts") return "OPEN_EMERGENCY_CONTACTS";
    return "OPEN_PAGE";
  }
  if (names.includes("get_latest_health") || names.includes("get_recent_readings")) {
    return "CHECK_HEALTH";
  }
  return null;
}

const INTENT_TRANSCRIPT_MARKERS = [
  { intent: "EMERGENCY_REQUEST", pattern: /(ubutabazi|ndababaye|nkeneye ubufasha|help me|emergency|kidnapp|accident|secours|urgence|saida|dharura)/i },
  { intent: "CANCEL_EMERGENCY", pattern: /(hagarika|reka|nta kibazo|cancel|annuler|sitisha|ghairi)/i },
  { intent: "CALL_CONTACT", pattern: /(hamagara|muhagare|mpamagarira|call\s+(mom|dad|mama|papa|john)|appeler|piga simu)/i },
  { intent: "CHECK_DRIVING_READINESS", pattern: /(gutwara|drive|conduire|kuendesha|am i safe to drive|nshobora)/i },
  { intent: "CHECK_ALCOHOL_STATUS", pattern: /(bac|inzoga|alcohol|alcool|pombe)/i },
  { intent: "CHECK_HEALTH", pattern: /(reba uko meze|heart|umutima|health|sante|afya|ubuzima)/i },
  { intent: "OPEN_PAGE", pattern: /(fungura|open|navigate|go to|ouvre|fungua)/i },
];

function inferIntentFromTranscript(text) {
  const norm = String(text || "").toLowerCase();
  for (const marker of INTENT_TRANSCRIPT_MARKERS) {
    if (marker.pattern.test(norm)) return marker.intent;
  }
  return "NORMAL_CONVERSATION";
}
