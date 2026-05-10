import { createHttpClient } from "../http-client.js";
import type { AdapterFetchResult, DataAdapter, NewsArticle } from "../universal-types.js";

export interface MediaStackConfig {
  apiKey: string;
  maxArticles?: number;
}

interface MediaStackArticle {
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  source: string;
  image: string | null;
  category: string;
  language: string;
  country: string;
  published_at: string;
}

interface MediaStackResponse {
  pagination: { limit: number; offset: number; total: number };
  data: MediaStackArticle[];
}

export class MediaStackAdapter implements DataAdapter<NewsArticle> {
  readonly sourceId = "mediastack";
  readonly category = "news" as const;
  private httpClient;

  constructor(private config: MediaStackConfig) {
    this.httpClient = createHttpClient({ timeoutMs: 15000, rateLimitMs: 600 });
  }

  async fetch(): Promise<AdapterFetchResult<NewsArticle>> {
    const startedAt = Date.now();
    try {
      const max = this.config.maxArticles ?? 50;
      const url = new URL("http://api.mediastack.com/v1/news");
      url.searchParams.set("access_key", this.config.apiKey);
      url.searchParams.set("languages", "en");
      url.searchParams.set("limit", String(Math.min(max, 100)));
      url.searchParams.set("sort", "published_desc");

      const response = await this.httpClient.get(url.toString());
      if (!response.ok) {
        return {
          success: false,
          data: [],
          error: `MediaStack returned ${response.status}`,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        };
      }
      const payload = (await response.json()) as MediaStackResponse;
      const articles: NewsArticle[] = (payload.data ?? [])
        .filter((a) => a.title && a.url)
        .map((a) => ({
          articleId: `ms_${Buffer.from(a.url).toString("base64").slice(0, 32)}`,
          source: "mediastack" as const,
          sourceName: a.source,
          author: a.author,
          title: a.title,
          description: a.description ?? "",
          url: a.url,
          urlToImage: a.image,
          publishedAt: a.published_at,
          content: null,
          category: a.category || null,
          country: a.country || null,
          language: a.language || "en",
          lat: null,
          lon: null,
          rawTags: [],
        }));

      return {
        success: true,
        data: articles.slice(0, max),
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        error: error instanceof Error ? error.message : String(error),
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      };
    }
  }
}

export function createMediaStackAdapter(apiKey: string, maxArticles?: number): MediaStackAdapter {
  return new MediaStackAdapter({ apiKey, maxArticles });
}
