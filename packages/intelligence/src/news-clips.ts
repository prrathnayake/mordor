import { createHash } from "node:crypto";
import type { NewsClip, RealtimeNewsUpdate } from "./tv-channels.js";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3";

export async function fetchYouTubeClips(channelId: string, maxResults = 20): Promise<NewsClip[]> {
  if (!YOUTUBE_API_KEY) {
    return fetchYouTubeSearchFallback(channelId, maxResults);
  }

  try {
    const searchUrl = `${YOUTUBE_API_URL}/search?part=snippet&channelId=${channelId}&type=video&order=date&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(searchUrl, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return [];

    const data = (await response.json()) as {
      items?: Array<{
        id: { videoId: string };
        snippet: {
          title: string;
          description?: string;
          channelTitle: string;
          publishedAt: string;
          thumbnails: { medium?: { url: string }; high?: { url: string } };
        };
      }>;
    };

    const now = new Date().toISOString();
    return (data.items ?? []).map(
      (item): NewsClip => ({
        clip_id: `yt_clip_${item.id.videoId}`,
        title: item.snippet.title,
        description: item.snippet.description,
        source: item.snippet.channelTitle,
        source_type: "youtube",
        video_id: item.id.videoId,
        video_url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        thumbnail_url: item.snippet.thumbnails.high?.url ?? item.snippet.thumbnails.medium?.url,
        published_at: item.snippet.publishedAt,
        captured_at: now,
        language: "en",
        country_codes: [],
        tags: [],
      }),
    );
  } catch {
    return [];
  }
}

async function fetchYouTubeSearchFallback(
  channelId: string,
  maxResults: number,
): Promise<NewsClip[]> {
  return [];
}

export async function fetchBreakingNewsClips(maxResults = 20): Promise<NewsClip[]> {
  if (!YOUTUBE_API_KEY) return [];

  try {
    const searchUrl = `${YOUTUBE_API_URL}/search?part=snippet&q=breaking+news+live&type=video&order=date&maxResults=${maxResults}&eventType=completed&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(searchUrl, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return [];

    const data = (await response.json()) as {
      items?: Array<{
        id: { videoId: string };
        snippet: {
          title: string;
          description?: string;
          channelTitle: string;
          publishedAt: string;
          thumbnails: { medium?: { url: string }; high?: { url: string } };
        };
      }>;
    };

    const now = new Date().toISOString();
    return (data.items ?? []).map(
      (item): NewsClip => ({
        clip_id: `yt_clip_${item.id.videoId}`,
        title: item.snippet.title,
        description: item.snippet.description,
        source: item.snippet.channelTitle,
        source_type: "youtube",
        video_id: item.id.videoId,
        video_url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        thumbnail_url: item.snippet.thumbnails.high?.url ?? item.snippet.thumbnails.medium?.url,
        published_at: item.snippet.publishedAt,
        captured_at: now,
        language: "en",
        country_codes: [],
        tags: ["breaking", "news", "live"],
      }),
    );
  } catch {
    return [];
  }
}

export async function fetchLatestClipsByTopic(topic: string, maxResults = 10): Promise<NewsClip[]> {
  if (!YOUTUBE_API_KEY) return [];

  try {
    const searchUrl = `${YOUTUBE_API_URL}/search?part=snippet&q=${encodeURIComponent(topic)}&type=video&order=date&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(searchUrl, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return [];

    const data = (await response.json()) as {
      items?: Array<{
        id: { videoId: string };
        snippet: {
          title: string;
          description?: string;
          channelTitle: string;
          publishedAt: string;
          thumbnails: { medium?: { url: string }; high?: { url: string } };
        };
      }>;
    };

    const now = new Date().toISOString();
    return (data.items ?? []).map(
      (item): NewsClip => ({
        clip_id: `yt_clip_${item.id.videoId}`,
        title: item.snippet.title,
        description: item.snippet.description,
        source: item.snippet.channelTitle,
        source_type: "youtube",
        video_id: item.id.videoId,
        video_url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        thumbnail_url: item.snippet.thumbnails.high?.url ?? item.snippet.thumbnails.medium?.url,
        published_at: item.snippet.publishedAt,
        captured_at: now,
        language: "en",
        country_codes: [],
        tags: [topic],
      }),
    );
  } catch {
    return [];
  }
}

export function detectBreakingFromNews(
  items: Array<{ title: string; source_tier: number; threat_level?: string }>,
): RealtimeNewsUpdate[] {
  const updates: RealtimeNewsUpdate[] = [];
  const now = new Date().toISOString();

  const criticalItems = items.filter(
    (i) => i.threat_level === "critical" || i.threat_level === "high",
  );

  for (const item of criticalItems) {
    const updateId = createHash("sha1")
      .update(`${item.title}_${now}`)
      .digest("hex")
      .substring(0, 16);

    updates.push({
      update_id: `rt_${updateId}`,
      type: "breaking",
      severity: item.threat_level === "critical" ? "critical" : "high",
      headline: item.title,
      summary: item.title,
      source: "auto-detected",
      source_tier: item.source_tier as 1 | 2 | 3 | 4,
      related_item_ids: [],
      country_codes: [],
      published_at: now,
    });
  }

  return updates;
}

export interface RealtimeNewsServiceState {
  updates: RealtimeNewsUpdate[];
  lastFetchedAt: string;
  activeSubscriptions: number;
}

const realtimeState: RealtimeNewsServiceState = {
  updates: [],
  lastFetchedAt: new Date().toISOString(),
  activeSubscriptions: 0,
};

export function getRealtimeState(): RealtimeNewsServiceState {
  return { ...realtimeState };
}

export function addRealtimeUpdate(update: RealtimeNewsUpdate): void {
  realtimeState.updates.unshift(update);
  if (realtimeState.updates.length > 500) {
    realtimeState.updates = realtimeState.updates.slice(0, 500);
  }
}

export function getRealtimeUpdates(since?: string, limit = 50): RealtimeNewsUpdate[] {
  if (!since) return realtimeState.updates.slice(0, limit);

  const sinceTime = new Date(since).getTime();
  return realtimeState.updates
    .filter((u) => new Date(u.published_at).getTime() > sinceTime)
    .slice(0, limit);
}

export function incrementSubscriptions(): void {
  realtimeState.activeSubscriptions++;
}

export function decrementSubscriptions(): void {
  realtimeState.activeSubscriptions = Math.max(0, realtimeState.activeSubscriptions - 1);
}

export function getSubscriptionCount(): number {
  return realtimeState.activeSubscriptions;
}
