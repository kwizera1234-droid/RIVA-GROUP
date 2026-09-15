const SEARCH_CACHE_DEFAULT_MS = 5 * 60 * 1000;
const searchCache = new Map();

function getCacheKey(query) {
  return String(query || "").trim().toLowerCase();
}

function getCachedSearch(query) {
  const key = getCacheKey(query);
  const item = searchCache.get(key);

  if (!item) return null;

  if (Date.now() - item.createdAt > item.ttl) {
    searchCache.delete(key);
    return null;
  }

  return item.value;
}

function setCachedSearch(query, value, ttl) {
  searchCache.set(getCacheKey(query), {
    value,
    createdAt: Date.now(),
    ttl,
  });
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function extractPublishedAt(item) {
  const meta = item?.pagemap?.metatags;

  if (!Array.isArray(meta) || !meta.length) return null;

  const candidate = meta[0];

  const values = [
    candidate["article:published_time"],
    candidate["datepublished"],
    candidate["datePublished"],
    candidate["publishdate"],
    candidate["publish_date"],
    candidate["date"],
    candidate["og:updated_time"],
  ];

  for (const value of values) {
    if (!value) continue;

    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
}

function normalizeArticle(item) {
  if (!item || typeof item !== "object") return null;

  const url = String(item.link || "").trim();
  const title = String(item.title || "").trim();

  if (!url || !title) return null;

  return {
    title,
    summary: String(item.snippet || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500),
    source:
      String(item.displayLink || "").trim() ||
      getHostname(url) ||
      "Web",
    url,
    publishedAt: extractPublishedAt(item),
  };
}

async function googleWebSearch({
  query,
  limit = 8,
  days = 7,
} = {}) {
  const apiKey = String(process.env.GOOGLE_SEARCH_API_KEY || "").trim();
  const engineId = String(
    process.env.GOOGLE_SEARCH_ENGINE_ID || ""
  ).trim();

  if (!apiKey) {
    throw new Error("GOOGLE_SEARCH_API_KEY is missing");
  }

  if (!engineId) {
    throw new Error("GOOGLE_SEARCH_ENGINE_ID is missing");
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 10);

  const url = new URL(
    "https://www.googleapis.com/customsearch/v1"
  );

  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", engineId);
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(safeLimit));
  url.searchParams.set("gl", "rw");

  if (Number(days) > 0) {
    url.searchParams.set(
      "dateRestrict",
      `d${Math.min(Number(days), 365)}`
    );
  }

  console.log("GOOGLE WEB SEARCH URL:", url.origin + url.pathname);
  console.log("GOOGLE WEB SEARCH QUERY:", query);

  const response = await fetch(url);
  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Google Search returned invalid JSON (${response.status})`
    );
  }

  if (!response.ok) {
    console.error(
      "GOOGLE WEB SEARCH ERROR:",
      JSON.stringify(data)
    );

    throw new Error(
      data?.error?.message ||
        `Google Search failed with HTTP ${response.status}`
    );
  }

  const items = Array.isArray(data.items)
    ? data.items
    : [];

  console.log(
    "GOOGLE WEB SEARCH RESULT COUNT:",
    items.length
  );

  return items
    .map(normalizeArticle)
    .filter(Boolean);
}

async function searchCurrentInfo({
  query = "Rwanda road safety latest news",
  limit = 8,
  days = 7,
  cacheMs = SEARCH_CACHE_DEFAULT_MS,
} = {}) {
  const safeQuery = String(query || "")
    .trim()
    .slice(0, 200);

  if (!safeQuery) {
    return {
      success: false,
      query: safeQuery,
      results: [],
      error: "query is required",
    };
  }

  console.log("SEARCH REQUEST RECEIVED:", safeQuery);

  const cached = getCachedSearch(safeQuery);

  if (cached) {
    console.log("SEARCH CACHE HIT:", safeQuery);

    return {
      ...cached,
      cached: true,
    };
  }

  console.log("GOOGLE SEARCH STARTED:", safeQuery);

  try {
    const articles = await googleWebSearch({
      query: safeQuery,
      limit,
      days,
    });

    const results = articles.slice(0, limit);

    const payload = {
      success: true,
      query: safeQuery,
      generatedAt: new Date().toISOString(),
      results,
    };

    setCachedSearch(
      safeQuery,
      payload,
      Number(cacheMs) || SEARCH_CACHE_DEFAULT_MS
    );

    console.log("SEARCH RESPONSE SENT:", safeQuery);

    return payload;
  } catch (error) {
    console.error(
      "SEARCH ERROR:",
      error?.message || error
    );

    return {
      success: false,
      query: safeQuery,
      results: [],
      error: error?.message || "Search failed",
    };
  }
}

function invalidateSearchCache() {
  searchCache.clear();
}

module.exports = {
  searchCurrentInfo,
  invalidateSearchCache,
  normalizeArticle,
  SEARCH_CACHE_DEFAULT_MS,
};
