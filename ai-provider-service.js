const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";

const OPENROUTER_URL =
  process.env.OPENROUTER_URL ||
  "https://openrouter.ai/api/v1/chat/completions";

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openrouter/free";

// App attribution sent to OpenRouter (server-side only, never exposed).
const OPENROUTER_SITE_URL = process.env.OPENROUTER_SITE_URL || "https://soberwatch.app";
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || "SoberWatch";

const REQUEST_TIMEOUT_MS = 45000;

async function chatWithAI({
  messages,
  tools = [],
  temperature = 0.2,
  maxTokens = 700,
}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("AI messages are required");
  }

  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const body = {
    model: OPENROUTER_MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (Array.isArray(tools) && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": OPENROUTER_SITE_URL,
      "X-Title": OPENROUTER_APP_NAME,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      text.slice(0, 500) ||
      `HTTP ${response.status}`;

    throw new Error(
      `OpenRouter request failed: ${response.status} ${message}`
    );
  }

  const message = data?.choices?.[0]?.message || {};

  const reply =
    typeof message.content === "string"
      ? message.content.trim()
      : Array.isArray(message.content)
        ? message.content
            .filter((part) => part?.type === "text")
            .map((part) => part.text)
            .join(" ")
            .trim()
        : "";

  return {
    provider: "openrouter",
    model: data?.model || OPENROUTER_MODEL,
    message,
    reply,
    toolCalls: Array.isArray(message.tool_calls)
      ? message.tool_calls
      : [],
    sources: Array.isArray(data?.sources)
      ? data.sources
      : [],
    raw: data,
  };
}

function getAIProviderStatus() {
  return {
    configured: Boolean(OPENROUTER_API_KEY),
    provider: "openrouter",
    model: OPENROUTER_MODEL,
    endpoint: OPENROUTER_URL,
  };
}

module.exports = {
  chatWithAI,
  getAIProviderStatus,
  OPENROUTER_MODEL,
};
