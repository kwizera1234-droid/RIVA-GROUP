const https = require("https");
const { URL } = require("url");

const SOURCES = {
  who: {
    name: "WHO",
    feed: "https://www.who.int/rss-feeds/news-english.xml",
  },
  cdc: {
    name: "CDC",
    feed: "https://tools.cdc.gov/api/publish/content/syndication/rss/",
  },
  pubmed: {
    name: "PubMed",
    search: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
    summary: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
  },
};

function fetchUrl(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "SoberWatch/1.0 health-news-service",
          Accept: "application/rss+xml, application/xml, text/xml, application/json, text/plain",
        },
      },
      (response) => {
        let data = "";

        response.setEncoding("utf8");

        response.on("data", (chunk) => {
          data += chunk;
        });

        response.on("end", () => {
          if (
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            return resolve(
              fetchUrl(
                new URL(response.headers.location, url).toString(),
                timeout
              )
            );
          }

          if (response.statusCode < 200 || response.statusCode >= 300) {
            return reject(
              new Error(`HTTP ${response.statusCode} for ${url}`)
            );
          }

          resolve(data);
        });
      }
    );

    request.setTimeout(timeout, () => {
      request.destroy(new Error(`Request timeout for ${url}`));
    });

    request.on("error", reject);
  });
}

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function stripHtml(value = "") {
  return decodeXml(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRss(xml, sourceName) {
  const items = [];
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

  for (const item of matches) {
    const title =
      item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";

    const link =
      item.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || "";

    const description =
      item.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || "";

    const pubDate =
      item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ||
      item.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1] ||
      item.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1] ||
      "";

    const cleanTitle = stripHtml(title);
    const cleanLink = decodeXml(link);
    const cleanDescription = stripHtml(description);

    if (!cleanTitle || !cleanLink) continue;

    items.push({
      source: sourceName,
      title: cleanTitle,
      url: cleanLink,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
      description: cleanDescription.slice(0, 500),
    });
  }

  return items;
}

async function fetchRssSource(source) {
  try {
    const xml = await fetchUrl(source.feed);

    return {
      source: source.name,
      success: true,
      articles: parseRss(xml, source.name),
    };
  } catch (error) {
    return {
      source: source.name,
      success: false,
      articles: [],
      error: error.message,
    };
  }
}

async function searchPubMed(query = "health", limit = 5) {
  try {
    const searchUrl = new URL(SOURCES.pubmed.search);

    searchUrl.searchParams.set("db", "pubmed");
    searchUrl.searchParams.set("term", query);
    searchUrl.searchParams.set("retmode", "json");
    searchUrl.searchParams.set("retmax", String(Math.min(limit, 10)));
    searchUrl.searchParams.set("sort", "date");

    const searchData = JSON.parse(await fetchUrl(searchUrl.toString()));

    const ids = searchData?.esearchresult?.idlist || [];

    if (!ids.length) {
      return {
        source: "PubMed",
        success: true,
        articles: [],
      };
    }

    const summaryUrl = new URL(SOURCES.pubmed.summary);

    summaryUrl.searchParams.set("db", "pubmed");
    summaryUrl.searchParams.set("id", ids.join(","));
    summaryUrl.searchParams.set("retmode", "json");

    const summaryData = JSON.parse(await fetchUrl(summaryUrl.toString()));

    const articles = ids
      .map((id) => {
        const article = summaryData?.result?.[id];

        if (!article) return null;

        return {
          source: "PubMed",
          title: article.title || "",
          url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
          publishedAt: article.pubdate
            ? new Date(article.pubdate).toISOString()
            : null,
          description: article.sorttitle || "",
        };
      })
      .filter(Boolean);

    return {
      source: "PubMed",
      success: true,
      articles,
    };
  } catch (error) {
    return {
      source: "PubMed",
      success: false,
      articles: [],
      error: error.message,
    };
  }
}

function buildGoogleNewsRssUrl(
  query = "Rwanda health",
  {
    language = "en",
    countryCode = "RW",
  } = {}
) {
  const localeMap = {
    rw: "en",
    en: "en",
    fr: "fr",
    sw: "sw",
  };

  const languageCode = localeMap[language] || "en";
  const url = new URL("https://news.google.com/rss/search");

  url.searchParams.set("q", query);
  url.searchParams.set("hl", `${languageCode}-${countryCode}`);
  url.searchParams.set("gl", countryCode);
  url.searchParams.set("ceid", `${countryCode}:${languageCode}`);

  return url.toString();
}

async function searchGoogleNews(
  query = "Rwanda health",
  limit = 10,
  { days = 7, languages = ["rw", "en", "fr", "sw"], country = "Rwanda" } = {}
) {
  try {
    const healthQueries = {
      rw: [
        "Rwanda ubuzima",
        "Rwanda indwara",
        "Rwanda ibitaro",
        "Minisiteri y'Ubuzima Rwanda",
      ],
      en: [
        "Rwanda health",
        "Rwanda healthcare",
        "Rwanda disease",
        "Rwanda Ministry of Health",
      ],
      fr: [
        "Rwanda santé",
        "Rwanda hôpital",
        "Rwanda maladie",
        "Ministère de la Santé Rwanda",
      ],
      sw: [
        "Rwanda afya",
        "Rwanda hospitali",
        "Rwanda ugonjwa",
        "Wizara ya Afya Rwanda",
      ],
    };

    const localeMap = {
      rw: "en",
      en: "en",
      fr: "fr",
      sw: "sw",
    };

    const languageQueries = languages.flatMap((language) =>
      (healthQueries[language] || healthQueries.en).map((q) => ({
        query: q,
        language,
      }))
    );

    const results = await Promise.all(
      languageQueries.map(async ({ query: q, language }) => {
        try {
          const xml = await fetchUrl(
            buildGoogleNewsRssUrl(q, {
              language,
              countryCode: "RW",
            })
          );

          return parseRss(xml, "Google News").map((article) => ({
            ...article,
            language,
            country,
            category: "health",
          }));
        } catch {
          return [];
        }
      })
    );

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const healthKeywords = [
      "health",
      "healthcare",
      "hospital",
      "hospitals",
      "medicine",
      "medical",
      "doctor",
      "doctors",
      "patient",
      "patients",
      "disease",
      "diseases",
      "treatment",
      "vaccine",
      "vaccination",
      "malaria",
      "hiv",
      "aids",
      "tuberculosis",
      "tb",
      "maternal",
      "child health",
      "mental health",
      "alcohol",
      "addiction",
      "nutrition",
      "public health",
      "santé",
      "hôpital",
      "maladie",
      "médecin",
      "patient",
      "vaccination",
      "traitement",
      "afya",
      "hospitali",
      "ugonjwa",
      "daktari",
      "chanjo",
      "matibabu",
      "ubuzima",
      "ibitaro",
      "indwara",
      "muganga",
      "urukingo",
      "ubuvuzi",
      "inzoga",
      "imirire",
    ];

    const articles = deduplicateArticles(
      sortByDate(results.flat()).filter((article) => {
        if (!article.publishedAt) return false;

        const published = new Date(article.publishedAt).getTime();

        if (!Number.isFinite(published) || published < cutoff) {
          return false;
        }

        const text =
          `${article.title || ""} ${article.description || ""}`.toLowerCase();

        return healthKeywords.some((keyword) =>
          text.includes(keyword.toLowerCase())
        );
      })
    ).slice(0, limit);

    return {
      source: "Google News",
      success: true,
      query,
      country,
      days,
      languages,
      articles,
    };
  } catch (error) {
    return {
      source: "Google News",
      success: false,
      articles: [],
      error: error.message,
    };
  }
}

function sortByDate(articles) {
  return [...(articles || [])].sort((a, b) => {
    const dateA = a?.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const dateB = b?.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return dateB - dateA;
  });
}

function deduplicateArticles(articles) {
  const seen = new Set();

  return (articles || []).filter((article) => {
    const key = `${(article.title || "").toLowerCase().trim()}|${(article.url || "").toLowerCase().trim()}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

async function searchHealthNews({
  query = "Rwanda health",
  pubmedQuery = "Rwanda health",
  limit = 5,
  days = 7,
  languages = ["rw", "en", "fr", "sw"],
} = {}) {
  const [who, cdc, pubmed, googleNews] = await Promise.all([
    fetchRssSource(SOURCES.who),
    fetchRssSource(SOURCES.cdc),
    searchPubMed(pubmedQuery, limit),
    searchGoogleNews(query, limit * 2, {
      days,
      languages,
      country: "Rwanda",
    }),
  ]);

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const filterRecent = (articles) =>
    (articles || []).filter((article) => {
      if (!article.publishedAt) return false;

      const published = new Date(article.publishedAt).getTime();

      return Number.isFinite(published) && published >= cutoff;
    });

  const recentWho = filterRecent(who.articles);
  const recentCdc = filterRecent(cdc.articles);
  const recentPubmed = filterRecent(pubmed.articles);
  const recentGoogleNews = filterRecent(googleNews.articles);

  const healthNewsKeywords = [
    "health", "healthcare", "hospital", "hospitals", "medical",
    "medicine", "disease", "treatment", "vaccine", "vaccination",
    "malaria", "hiv", "aids", "tuberculosis", "tb",
    "maternal", "child health", "mental health", "alcohol",
    "addiction", "nutrition", "public health", "santé", "hôpital",
    "maladie", "vaccin", "traitement", "afya", "hospitali",
    "ugonjwa", "chanjo", "matibabu", "ubuzima", "ibitaro",
    "indwara", "urukingo", "ubuvuzi", "inzoga", "imirire"
  ];

  const filteredHealthNews = [
    ...recentGoogleNews,
    ...recentWho,
    ...recentCdc,
    ...recentPubmed,
  ].filter((article) => {
    const text = `${article.title || ""} ${article.description || ""}`.toLowerCase();
    return healthNewsKeywords.some((keyword) => text.includes(keyword));
  });

  const articles = deduplicateArticles(
    sortByDate(filteredHealthNews)
  ).slice(0, Math.min(limit, 8));

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    articles: articles.map((article) => ({
      title: article.title,
      description: article.description,
      publishedAt: article.publishedAt,
      language: article.language,
      category: article.category,
    })),
  };
}

module.exports = {
  searchHealthNews,
  searchGoogleNews,
  searchPubMed,
};
