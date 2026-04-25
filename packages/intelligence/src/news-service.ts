import { createHash } from "node:crypto";
import { DEFAULT_NEWS_FEEDS, fetchGdeltEvents, fetchRssFeed } from "./news-feeds.js";
import type { NewsCluster, NewsFeed, NewsItem, NewsThreatLevel } from "./news-types.js";

export interface NewsServiceOptions {
  feeds?: NewsFeed[];
  maxItemsPerFeed?: number;
  clusterThreshold?: number;
}

export interface NewsIntelligence {
  items: NewsItem[];
  clusters: NewsCluster[];
  feeds: NewsFeed[];
  fetched_at: string;
  total_count: number;
  critical_count: number;
  active_feeds: number;
}

const SIMILARITY_THRESHOLD = 0.5;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function clusterNewsItems(items: NewsItem[]): NewsCluster[] {
  const clusters: NewsCluster[] = [];
  const assigned = new Set<number>();

  const tokenLists: Array<{ idx: number; tokens: Set<string> }> = items.map((item, i) => ({
    idx: i,
    tokens: tokenize(item.title),
  }));

  for (const { idx, tokens } of tokenLists) {
    if (assigned.has(idx)) continue;

    const related = [items[idx]];
    assigned.add(idx);

    for (let j = idx + 1; j < items.length; j++) {
      if (assigned.has(j)) continue;
      if (jaccardSimilarity(tokens, tokenLists[j].tokens) >= SIMILARITY_THRESHOLD) {
        related.push(items[j]);
        assigned.add(j);
      }
    }

    const primary = related.reduce((best, curr) =>
      best.source_tier <= curr.source_tier ? best : curr,
    );

    const threatLevels: NewsThreatLevel[] = related.map((r) => r.threat_level);
    const topThreat = threatLevels.includes("critical")
      ? "critical"
      : threatLevels.includes("high")
        ? "high"
        : threatLevels.includes("medium")
          ? "medium"
          : "low";

    const lats = related.filter((r) => r.lat != null).map((r) => r.lat as number);
    const lons = related.filter((r) => r.lon != null).map((r) => r.lon as number);
    const countries = [...new Set(related.flatMap((r) => r.country_codes))];
    const dates = related.map((r) => Date.parse(r.published_at));
    const earliest = dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : "";
    const latest = dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : "";
    const sourcesPerHour =
      dates.length > 1
        ? (related.length / ((Math.max(...dates) - Math.min(...dates)) / 3_600_000)) * 24
        : related.length * 24;

    const phase =
      sourcesPerHour > 10
        ? "breaking"
        : sourcesPerHour > 2
          ? "developing"
          : sourcesPerHour > 0.5
            ? "sustained"
            : "fading";

    clusters.push({
      cluster_id: `cluster_${createHash("sha1").update(primary.link).digest("hex").substring(0, 12)}`,
      primary_item: primary,
      related_items: related,
      mention_count: related.length,
      source_count: new Set(related.map((r) => r.source)).size,
      source_tier: Math.min(...related.map((r) => r.source_tier)) as 1 | 2 | 3 | 4,
      category: primary.category,
      center_lat: lats.length > 0 ? lats.reduce((s, v) => s + v, 0) / lats.length : null,
      center_lon: lons.length > 0 ? lons.reduce((s, v) => s + v, 0) / lons.length : null,
      country_codes: countries,
      threat_level: topThreat,
      velocity_score: Math.min(sourcesPerHour, 24),
      story_phase: phase as NewsCluster["story_phase"],
      published_at_range: { earliest, latest },
    });
  }

  return clusters.sort((a, b) => {
    if (a.threat_level !== b.threat_level) {
      const order = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
      return order[a.threat_level] - order[b.threat_level];
    }
    return (
      new Date(b.published_at_range.latest).getTime() -
      new Date(a.published_at_range.latest).getTime()
    );
  });
}

export async function fetchAllNewsIntelligence(
  options: NewsServiceOptions = {},
): Promise<NewsIntelligence> {
  const feeds = options.feeds ?? DEFAULT_NEWS_FEEDS;
  const maxItems = options.maxItemsPerFeed ?? 50;
  const allItems: NewsItem[] = [];
  const updatedFeeds: NewsFeed[] = [];

  for (const feed of feeds) {
    try {
      let items: NewsItem[];
      if (feed.feed_id === "gdelt") {
        items = await fetchGdeltEvents();
      } else {
        items = await fetchRssFeed(feed.url);
      }

      const sliced = items.slice(0, maxItems);
      allItems.push(...sliced);
      updatedFeeds.push({
        ...feed,
        last_fetched_at: new Date().toISOString(),
        last_item_count: sliced.length,
        status: "active",
        error_message: null,
      });
    } catch (error) {
      updatedFeeds.push({
        ...feed,
        last_fetched_at: new Date().toISOString(),
        last_item_count: 0,
        status: "error",
        error_message: String(error instanceof Error ? error.message : error),
      });
    }
  }

  const clusters = clusterNewsItems(allItems);

  return {
    items: allItems,
    clusters,
    feeds: updatedFeeds,
    fetched_at: new Date().toISOString(),
    total_count: allItems.length,
    critical_count: allItems.filter((i) => i.threat_level === "critical").length,
    active_feeds: updatedFeeds.filter((f) => f.status === "active").length,
  };
}
