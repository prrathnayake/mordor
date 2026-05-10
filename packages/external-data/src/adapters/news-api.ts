import { createHttpClient } from "../http-client.js";
import type { AdapterFetchResult, DataAdapter, NewsArticle } from "../universal-types.js";

export interface NewsApiConfig {
  apiKey: string;
  maxArticles?: number;
}

interface NewsApiArticle {
  source: { id: string | null; name: string };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
}

interface NewsApiResponse {
  status: string;
  totalResults: number;
  articles: NewsApiArticle[];
}

export class NewsApiAdapter implements DataAdapter<NewsArticle> {
  readonly sourceId = "newsapi";
  readonly category = "news" as const;
  private httpClient;

  constructor(private config: NewsApiConfig) {
    this.httpClient = createHttpClient({ timeoutMs: 15000, rateLimitMs: 600 });
  }

  async fetch(): Promise<AdapterFetchResult<NewsArticle>> {
    const startedAt = Date.now();
    try {
      const max = this.config.maxArticles ?? 50;
      const url = new URL("https://newsapi.org/v2/top-headlines");
      url.searchParams.set("apiKey", this.config.apiKey);
      url.searchParams.set("language", "en");
      url.searchParams.set("pageSize", String(Math.min(max, 100)));
      url.searchParams.set("sources", "bbc-news,cnn,reuters,the-verge,wired,techcrunch");

      const response = await this.httpClient.get(url.toString());
      if (!response.ok) {
        return {
          success: false,
          data: [],
          error: `NewsAPI returned ${response.status}`,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        };
      }
      const payload = (await response.json()) as NewsApiResponse;
      const articles: NewsArticle[] = (payload.articles ?? [])
        .filter((a) => a.title && a.url)
        .map((a) => ({
          articleId: `newsapi_${Buffer.from(a.url).toString("base64").slice(0, 32)}`,
          source: "newsapi" as const,
          sourceName: a.source?.name ?? "Unknown",
          author: a.author,
          title: a.title,
          description: a.description ?? "",
          url: a.url,
          urlToImage: a.urlToImage,
          publishedAt: a.publishedAt,
          content: a.content,
          category: null,
          country: null,
          language: "en",
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

export function createNewsApiAdapter(apiKey: string, maxArticles?: number): NewsApiAdapter {
  return new NewsApiAdapter({ apiKey, maxArticles });
}
