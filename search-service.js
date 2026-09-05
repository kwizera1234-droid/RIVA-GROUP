const { searchGoogleNews } = require("./news-service");

const SEARCH_CACHE_DEFAULT_MS = 5 * 60 * 1000; // 5 minutes default
const searchCache = new Map();

function getCacheKey(query) {
  return String(query || "")
    .trim()
    .toLowerCase();
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
  const key = getCacheKey(query);
  searchCache.set(key, { value, createdAt: Date.now(), ttl });
}

/**
 * Normalize a raw article into the shared frontend shape.
 *
 * Callers always pass real URLs from real sources. We never construct or
 * invent URLs, titles, summaries, or dates here.
 */
function normalizeArticle(article, query) {
  if (!article || typeof article !== "object") return null;

  const url = String(article.url || article.link || "").trim();
  // A result without a usable source URL cannot be surfaced in a card that
  // requires a clickable link.
  if (!url) return null;

  const title = String(article.title || "").trim();
  if (!title) return null;

  const published = article.publishedAt
    ? new Date(article.publishedAt)
    : null;
  const hasValidDate = published && !Number.isNaN(published.getTime());

  return {
    title,
    summary: String(article.description || article.summary || "").trim().slice(0, 300),
    source: String(article.source || article.domain || "").trim() || "Google News",
    url,
    publishedAt: hasValidDate ? published.toISOString() : null,
  };
}

/**
 * Search Google News for the current information requested by the frontend or
 * the voice AI. This is the canonical backend "Google Search" source: real news
 * results fetched live from Google News RSS. No fabricated data.
 *
 * Results are cached in memory for `cacheMs` to avoid hammering the source and
 * consuming fetch/API quota on repeated/duplicate requests.
 */
async function searchCurrentInfo({
  query = "Rwanda road safety news",
  limit = 8,
  days = 7,
  languages = ["rw", "en", "fr", "sw"],
  cacheMs = SEARCH_CACHE_DEFAULT_MS,
} = {}) {
  const safeQuery = String(query || "").trim();
  if (!safeQuery) {
    return { success: false, query: safeQuery, results: [], error: "query is required" };
  }

  console.log("SEARCH REQUEST RECEIVED:", safeQuery);

  const cached = getCachedSearch(safeQuery);
  if (cached) {
    console.log("SEARCH CACHE HIT:", safeQuery);
    return { ...cached, cached: true };
  }

  console.log("GOOGLE SEARCH STARTED:", safeQuery);

  let articles = [];
  try {
    const result = await searchGoogleNews(safeQuery, Math.max(limit, 10), {
      days,
      languages,
      country: "Rwanda",
    });
    articles = Array.isArray(result?.articles) ? result.articles : [];
  } catch (error) {
    console.error("SEARCH ERROR:", error?.message || error);
    return {
      success: false,
      query: safeQuery,
      results: [],
      error: error?.message || "Search failed",
    };
  }

  const results = articles
    .map((article) => normalizeArticle(article, safeQuery))
    .filter(Boolean)
    .slice(0, limit);

  console.log("GOOGLE SEARCH RESULT COUNT:", results.length);

  const payload = {
    success: true,
    query: safeQuery,
    generatedAt: new Date().toISOString(),
    results,
  };

  setCachedSearch(safeQuery, payload, Number(cacheMs) || SEARCH_CACHE_DEFAULT_MS);

  console.log("SEARCH RESPONSE SENT:", safeQuery);
  return payload;
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
