export type NewsCategory =
  | "conflict"
  | "military"
  | "infrastructure"
  | "disaster"
  | "economic"
  | "cyber"
  | "climate"
  | "political";

export type NewsThreatLevel = "critical" | "high" | "medium" | "low" | "none";

export interface NewsItem {
  item_id: string;
  title: string;
  link: string;
  source: string;
  source_tier: 1 | 2 | 3 | 4;
  category: NewsCategory;
  published_at: string;
  captured_at: string;
  lat?: number | null;
  lon?: number | null;
  country_codes: string[];
  threat_level: NewsThreatLevel;
  snippet: string;
  thumbnail_url?: string | null;
  language: string;
  metadata: Record<string, unknown>;
}

export interface NewsCluster {
  cluster_id: string;
  primary_item: NewsItem;
  related_items: NewsItem[];
  mention_count: number;
  source_count: number;
  source_tier: 1 | 2 | 3 | 4;
  category: NewsCategory;
  center_lat?: number | null;
  center_lon?: number | null;
  country_codes: string[];
  threat_level: NewsThreatLevel;
  velocity_score: number;
  story_phase: "breaking" | "developing" | "sustained" | "fading" | "unknown";
  published_at_range: { earliest: string; latest: string };
}

export interface NewsFeed {
  feed_id: string;
  name: string;
  url: string;
  category: NewsCategory;
  tier: 1 | 2 | 3 | 4;
  language: string;
  last_fetched_at: string | null;
  last_item_count: number;
  status: "active" | "error" | "disabled";
  error_message?: string | null;
}
