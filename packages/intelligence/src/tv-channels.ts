export type TVChannelSource = "youtube" | "news_network" | "news_stream";

export interface TVChannel {
  channel_id: string;
  name: string;
  name_localized?: string;
  source: TVChannelSource;
  stream_url: string;
  embed_url?: string;
  region: string;
  country_code: string;
  lat?: number;
  lon?: number;
  language: string;
  category: "news" | "breaking" | "politics" | "military" | "business" | "general";
  is_live: boolean;
  viewer_count?: number;
  relevance_tags: string[];
  priority: "high" | "medium" | "low";
}

export interface NewsClip {
  clip_id: string;
  title: string;
  description?: string;
  source: string;
  source_type: "youtube" | "news_network" | "clip_service";
  video_id: string;
  video_url: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  published_at: string;
  captured_at: string;
  language: string;
  country_codes: string[];
  tags: string[];
  view_count?: number;
  like_count?: number;
}

export interface RealtimeNewsUpdate {
  update_id: string;
  type: "breaking" | "development" | "alert" | "live_coverage" | "new_source";
  severity: "critical" | "high" | "medium" | "low";
  headline: string;
  summary: string;
  source: string;
  source_tier: 1 | 2 | 3 | 4;
  link?: string;
  related_item_ids: string[];
  cluster_id?: string;
  country_codes: string[];
  lat?: number;
  lon?: number;
  published_at: string;
}

export const TV_NEWS_CHANNELS: TVChannel[] = [
  {
    channel_id: "aljazeera_live",
    name: "Al Jazeera English Live",
    source: "youtube",
    stream_url: "https://www.youtube.com/watch?v=XXqFy5vf3j0",
    embed_url: "https://www.youtube.com/embed/live_stream?channel=UCW2QcKZiU8aUGd4E9t11L3g",
    region: "Middle East",
    country_code: "QA",
    language: "en",
    category: "news",
    is_live: true,
    relevance_tags: ["news", "middle east", "breaking", "global"],
    priority: "high",
  },
  {
    channel_id: "dw_news",
    name: "DW News",
    source: "youtube",
    stream_url: "https://www.youtube.com/watch?v=vyM4R1rZfVM",
    embed_url: "https://www.youtube.com/embed/live_stream?channel=UCWjjWmcx2dU0tLNSKj2tjJw",
    region: "Europe",
    country_code: "DE",
    language: "en",
    category: "news",
    is_live: true,
    relevance_tags: ["news", "europe", "germany", "breaking"],
    priority: "high",
  },
  {
    channel_id: "france24_live",
    name: "FRANCE 24 English",
    source: "youtube",
    stream_url: "https://www.youtube.com/watch?v=Qn2Oxsio2vM",
    embed_url: "https://www.youtube.com/embed/live_stream?channel=UCQfwfsi5cZDZoeF9K3fyfSw",
    region: "Europe",
    country_code: "FR",
    language: "en",
    category: "news",
    is_live: true,
    relevance_tags: ["news", "france", "europe", "breaking"],
    priority: "high",
  },
  {
    channel_id: "sky_news",
    name: "Sky News",
    source: "youtube",
    stream_url: "https://www.youtube.com/watch?v=9Auq9C0K0r8",
    embed_url: "https://www.youtube.com/embed/live_stream?channel=UCX5PB1gEdsN3OsCEY-QR7Cw",
    region: "Europe",
    country_code: "GB",
    language: "en",
    category: "breaking",
    is_live: true,
    relevance_tags: ["news", "uk", "breaking", "global"],
    priority: "high",
  },
  {
    channel_id: "cnn_live",
    name: "CNN Live",
    source: "youtube",
    stream_url: "https://www.youtube.com/watch?v=xf3b7z6A6ZM",
    embed_url: "https://www.youtube.com/embed/live_stream?channel=UCozbKFKzXEo09FkKpxWy9nQ",
    region: "North America",
    country_code: "US",
    language: "en",
    category: "breaking",
    is_live: true,
    relevance_tags: ["news", "us", "breaking", "politics"],
    priority: "high",
  },
  {
    channel_id: "fox_news_live",
    name: "Fox News Live",
    source: "youtube",
    stream_url: "https://www.youtube.com/watch?v=IaIqv3G06Xk",
    embed_url: "https://www.youtube.com/embed/live_stream?channel=UCXIJwD2m4kXz3vK0YIXKfOA",
    region: "North America",
    country_code: "US",
    language: "en",
    category: "politics",
    is_live: true,
    relevance_tags: ["news", "us", "politics", "conservative"],
    priority: "medium",
  },
  {
    channel_id: "bbc_world",
    name: "BBC World News",
    source: "youtube",
    stream_url: "https://www.youtube.com/watch?v=WAExRKcYHvQ",
    embed_url: "https://www.youtube.com/embed/live_stream?channel=UCYMjjV3gX5XoVHR6RMQ2f7g",
    region: "Europe",
    country_code: "GB",
    language: "en",
    category: "news",
    is_live: true,
    relevance_tags: ["news", "bbc", "world", "uk"],
    priority: "high",
  },
  {
    channel_id: "euronews_live",
    name: "Euronews Live",
    source: "youtube",
    stream_url: "https://www.youtube.com/watch?v=u04c5l7Mm7s",
    embed_url: "https://www.youtube.com/embed/live_stream?channel=UCW2Q4YiAk2sVIx1oe4aJ-xA",
    region: "Europe",
    country_code: "FR",
    language: "en",
    category: "news",
    is_live: true,
    relevance_tags: ["news", "europe", "breaking", "global"],
    priority: "high",
  },
  {
    channel_id: "rt_news",
    name: "RT",
    source: "youtube",
    stream_url: "https://www.youtube.com/watch?v=QUCG3rG4t2A",
    embed_url: "https://www.youtube.com/embed/live_stream?channel=UC5vw1p3ve3Jf5z5f8sz2A0w",
    region: "Europe",
    country_code: "RU",
    language: "en",
    category: "news",
    is_live: true,
    relevance_tags: ["news", "russia", "world", "alternative"],
    priority: "medium",
  },
  {
    channel_id: "press_tv",
    name: "Press TV",
    source: "youtube",
    stream_url: "https://www.youtube.com/watch?v=5kPbNO5t6S4",
    embed_url: "https://www.youtube.com/embed/live_stream?channel=UCDywD3ve3Jf5z5f8sz2A0w",
    region: "Middle East",
    country_code: "IR",
    language: "en",
    category: "news",
    is_live: true,
    relevance_tags: ["news", "iran", "middle east"],
    priority: "low",
  },
  {
    channel_id: "trt_world",
    name: "TRT World",
    source: "youtube",
    stream_url: "https://www.youtube.com/watch?v=Qlsk7MzuRCQ",
    embed_url: "https://www.youtube.com/embed/live_stream?channel=UC8A4fX2rR9F1rZZ5f8sz2A0w",
    region: "Middle East",
    country_code: "TR",
    language: "en",
    category: "news",
    is_live: true,
    relevance_tags: ["news", "turkey", "world"],
    priority: "medium",
  },
  {
    channel_id: "cna_singapore",
    name: "Channel News Asia",
    source: "youtube",
    stream_url: "https://www.youtube.com/watch?v=Nl5x5ZMzuRCQ",
    embed_url: "https://www.youtube.com/embed/live_stream?channel=UCD9X5ZMzuRCQ8A4fX2rR9F",
    region: "Asia",
    country_code: "SG",
    language: "en",
    category: "news",
    is_live: true,
    relevance_tags: ["news", "singapore", "asia", "business"],
    priority: "medium",
  },
  {
    channel_id: "ndtv_live",
    name: "NDTV",
    source: "youtube",
    stream_url: "https://www.youtube.com/watch?v=aB5k5ZMzuRCQ",
    embed_url: "https://www.youtube.com/embed/live_stream?channel=UCD8X5ZMzuRCQaB5k5ZMz",
    region: "South Asia",
    country_code: "IN",
    language: "en",
    category: "news",
    is_live: true,
    relevance_tags: ["news", "india", "breaking", "politics"],
    priority: "medium",
  },
  {
    channel_id: "arabiya_live",
    name: "Al Arabiya",
    source: "youtube",
    stream_url: "https://www.youtube.com/watch?v=8Auq9C0K0r8",
    embed_url: "https://www.youtube.com/embed/live_stream?channel=UCAu9C0K0r8Qxf3b7z6A6",
    region: "Middle East",
    country_code: "SA",
    language: "en",
    category: "breaking",
    is_live: true,
    relevance_tags: ["news", "saudi", "gulf", "breaking"],
    priority: "high",
  },
  {
    channel_id: "hadath_live",
    name: "Al Hadath",
    source: "youtube",
    stream_url: "https://www.youtube.com/watch?v=9Auq9C0K0r8",
    embed_url: "https://www.youtube.com/embed/live_stream?channel=UCAu9C0K0r8WyM4R1rZfVM",
    region: "Middle East",
    country_code: "SA",
    language: "en",
    category: "breaking",
    is_live: true,
    relevance_tags: ["news", "saudi", "gulf", "conflict"],
    priority: "high",
  },
];

export const NEWS_NETWORK_FEEDS: TVChannel[] = [
  {
    channel_id: "reuters_tv",
    name: "Reuters TV",
    source: "news_network",
    stream_url: "https://www.reuters.com/television/",
    region: "Global",
    country_code: "GB",
    language: "en",
    category: "news",
    is_live: true,
    relevance_tags: ["reuters", "breaking", "business"],
    priority: "high",
  },
  {
    channel_id: "ap_live",
    name: "AP Live",
    source: "news_network",
    stream_url: "https://apnews.com/live",
    region: "North America",
    country_code: "US",
    language: "en",
    category: "breaking",
    is_live: true,
    relevance_tags: ["Associated Press", "breaking", "us"],
    priority: "high",
  },
];

export function getTVChannelsByRegion(region?: string): TVChannel[] {
  if (!region) return [...TV_NEWS_CHANNELS, ...NEWS_NETWORK_FEEDS];
  return [...TV_NEWS_CHANNELS, ...NEWS_NETWORK_FEEDS].filter((c) => c.region === region);
}

export function getTVChannelsByTag(tag: string): TVChannel[] {
  return [...TV_NEWS_CHANNELS, ...NEWS_NETWORK_FEEDS].filter((c) =>
    c.relevance_tags.some((t) => t.toLowerCase().includes(tag.toLowerCase())),
  );
}

export function getHighPriorityTVChannels(): TVChannel[] {
  return [...TV_NEWS_CHANNELS, ...NEWS_NETWORK_FEEDS].filter((c) => c.priority === "high");
}

export function getLiveTVChannels(): TVChannel[] {
  return [...TV_NEWS_CHANNELS, ...NEWS_NETWORK_FEEDS].filter((c) => c.is_live);
}
