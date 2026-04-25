import { createHash } from "node:crypto";
import type { NewsCategory, NewsFeed, NewsItem, NewsThreatLevel } from "./news-types.js";

export interface NewsFeedAdapter {
  feed_id: string;
  name: string;
  fetch(): Promise<NewsItem[]>;
}

function categorizeByKeywords(title: string, snippet: string): NewsCategory {
  const text = `${title} ${snippet}`.toLowerCase();
  if (/military|army|navy|air force|bomb|attack|war|gaza|ukraine|syria|missile/i.test(text))
    return "conflict";
  if (/infrastructure|cable|pipeline|port|energy|electric/i.test(text)) return "infrastructure";
  if (/earthquake|flood|storm|wildfire|cyclone|tsunami/i.test(text)) return "disaster";
  if (/economy|market|oil|trade|sanction|inflation/i.test(text)) return "economic";
  if (/cyber|hack|ransomware|malware|apt|breach/i.test(text)) return "cyber";
  if (/climate|co2|temperature|arctic|ice/i.test(text)) return "climate";
  if (/election|government|diplomat|UN|nato/i.test(text)) return "political";
  return "conflict";
}

function classifyThreatLevel(title: string, snippet: string): NewsThreatLevel {
  const text = `${title} ${snippet}`.toLowerCase();
  if (/major|extensive|widespread|catastrophic|deadly/i.test(text)) return "critical";
  if (/significant|escalat|threat|bombing|attack/i.test(text)) return "high";
  if (/report|announce|develop/i.test(text)) return "medium";
  return "low";
}

function extractCountryCodes(title: string, snippet: string): string[] {
  const text = `${title} ${snippet}`.toLowerCase();
  const countries = [
    { code: "US", names: ["united states", "usa", "america"] },
    { code: "UA", names: ["ukraine", "kyiv"] },
    { code: "IL", names: ["israel", "gaza", "hamas", "netanyahu"] },
    { code: "RU", names: ["russia", "putin", "moscow"] },
    { code: "IR", names: ["iran", "tehran", "tehran"] },
    { code: "CN", names: ["china", "beijing", "xi jinping"] },
    { code: "SY", names: ["syria", "assad", "damascus"] },
    { code: "TR", names: ["turkey", "ankara", "erdogan"] },
    { code: "IN", names: ["india", "modi", "delhi"] },
    { code: "PK", names: ["pakistan", "islamabad"] },
    { code: "KP", names: ["north korea", "kim jong"] },
    { code: "GB", names: ["uk", "britain", "london"] },
    { code: "FR", names: ["france", "paris", "macron"] },
    { code: "DE", names: ["germany", "berlin"] },
  ];
  return countries
    .filter(({ names }) => names.some((n) => text.includes(n)))
    .map(({ code }) => code);
}

function extractGeo(title: string, snippet: string): { lat: number; lon: number } | null {
  const latMatch = /lat[:\s]*(-?\d+\.?\d*)/i.exec(`${title} ${snippet}`);
  const lonMatch = /lon[gst][:\s]*(-?\d+\.?\d*)/i.exec(`${title} ${snippet}`);
  if (latMatch && lonMatch) {
    const lat = Number.parseFloat(latMatch[1]);
    const lon = Number.parseFloat(lonMatch[1]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  }
  return null;
}

function generateItemId(url: string): string {
  return `news_${createHash("sha1").update(url).digest("hex").substring(0, 12)}`;
}

export async function fetchRssFeed(url: string): Promise<NewsItem[]> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return [];

  const xml = await response.text();
  const items: NewsItem[] = [];

  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  for (const match of xml.matchAll(itemRegex)) {
    const block = match[1];
    const getTag = (tag: string) => {
      const m = new RegExp(
        `<${tag}[^>]*><![CDATA[(.*?)]]></${tag}>|<${tag}[^>]*>(.*?)</${tag}>`,
        "i",
      ).exec(block);
      return m ? (m[1] || m[2] || "").trim() : "";
    };

    const title = getTag("title");
    const description = getTag("description");
    const link = getTag("link");
    const pubDate = getTag("pubDate");
    const rawSource = getTag("dc:creator") || new URL(url).hostname.replace("www.", "");

    if (!title || !link) continue;

    const geo = extractGeo(title, description);
    const now = new Date().toISOString();
    const item: NewsItem = {
      item_id: generateItemId(link),
      title: title.substring(0, 200),
      link,
      source: rawSource,
      source_tier: 3,
      category: categorizeByKeywords(title, description),
      published_at: pubDate ? new Date(pubDate).toISOString() : now,
      captured_at: now,
      lat: geo?.lat ?? null,
      lon: geo?.lon ?? null,
      country_codes: extractCountryCodes(title, description),
      threat_level: classifyThreatLevel(title, description),
      snippet: description.substring(0, 300),
      thumbnail_url: null,
      language: "en",
      metadata: {},
    };
    items.push(item);
  }

  return items;
}

export async function fetchGdeltEvents(): Promise<NewsItem[]> {
  const response = await fetch(
    "https://api.gdeltproject.org/api/v2/doc/doc?format=json&maxrecords=50&mode=artlist&sort=DateDesc&sourcecountry=ALL",
    { signal: AbortSignal.timeout(20_000) },
  );
  if (!response.ok) return [];

  const data = (await response.json()) as {
    articles?: Array<{
      url: string;
      title: string;
      domain: string;
      seendate: string;
      socialimage?: string;
      language: string;
      country?: string;
    }>;
  };

  const now = new Date().toISOString();
  return (data.articles ?? []).map((article): NewsItem => {
    const geo = extractGeo(article.title, "");
    return {
      item_id: `gdelt_${createHash("sha1").update(article.url).digest("hex").substring(0, 12)}`,
      title: article.title?.substring(0, 200) ?? "Untitled",
      link: article.url,
      source: article.domain?.replace("www.", "") ?? "GDELT",
      source_tier: 2,
      category: categorizeByKeywords(article.title ?? "", ""),
      published_at: article.seendate ? new Date(article.seendate).toISOString() : now,
      captured_at: now,
      lat: geo?.lat ?? null,
      lon: geo?.lon ?? null,
      country_codes: article.country
        ? [article.country]
        : extractCountryCodes(article.title ?? "", ""),
      threat_level: classifyThreatLevel(article.title ?? "", ""),
      snippet: article.title ?? "",
      thumbnail_url: article.socialimage || null,
      language: article.language ?? "en",
      metadata: {},
    };
  });
}

export const DEFAULT_NEWS_FEEDS: NewsFeed[] = [
  {
    feed_id: "liveuamap",
    name: "Liveuamap",
    url: "https://liveuamap.com/feedxml",
    category: "conflict",
    tier: 2,
    language: "en",
    last_fetched_at: null,
    last_item_count: 0,
    status: "active",
  },
  {
    feed_id: "reuters",
    name: "Reuters World",
    url: "https://feeds.reuters.com/reuters/worldnews",
    category: "conflict",
    tier: 1,
    language: "en",
    last_fetched_at: null,
    last_item_count: 0,
    status: "active",
  },
  {
    feed_id: "bbc",
    name: "BBC News",
    url: "http://feeds.bbci.co.uk/news/world/rss.xml",
    category: "conflict",
    tier: 1,
    language: "en",
    last_fetched_at: null,
    last_item_count: 0,
    status: "active",
  },
  {
    feed_id: "guardian",
    name: "The Guardian",
    url: "https://www.theguardian.com/world/rss",
    category: "conflict",
    tier: 1,
    language: "en",
    last_fetched_at: null,
    last_item_count: 0,
    status: "active",
  },
  {
    feed_id: "aljazeera",
    name: "Al Jazeera",
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    category: "conflict",
    tier: 2,
    language: "en",
    last_fetched_at: null,
    last_item_count: 0,
    status: "active",
  },
  {
    feed_id: "wsj",
    name: "WSJ World",
    url: "https://feeds.a.dj.com/rss/RSSWorldNews.xml",
    category: "political",
    tier: 1,
    language: "en",
    last_fetched_at: null,
    last_item_count: 0,
    status: "active",
  },
  {
    feed_id: "gdelt",
    name: "GDELT Events",
    url: "gdelt:events",
    category: "conflict",
    tier: 2,
    language: "en",
    last_fetched_at: null,
    last_item_count: 0,
    status: "active",
  },
  {
    feed_id: "crisisnet",
    name: "CrisisNet",
    url: "https://crisisnet.org/feed/rss",
    category: "disaster",
    tier: 3,
    language: "en",
    last_fetched_at: null,
    last_item_count: 0,
    status: "active",
  },
  {
    feed_id: "defenseone",
    name: "Defense One",
    url: "https://www.defenseone.com/feed/",
    category: "military",
    tier: 2,
    language: "en",
    last_fetched_at: null,
    last_item_count: 0,
    status: "active",
  },
  {
    feed_id: "thediplomat",
    name: "The Diplomat",
    url: "https://thediplomat.com/feed/",
    category: "political",
    tier: 2,
    language: "en",
    last_fetched_at: null,
    last_item_count: 0,
    status: "active",
  },
];
