import { createHttpClient } from "../http-client.js";
import type { AdapterFetchResult, DataAdapter, SocialPost } from "../universal-types.js";

interface RedditPostData {
  id: string;
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  score: number;
  num_comments: number;
  upvote_ratio: number;
  created_utc: number;
  permalink: string;
  url: string;
  thumbnail: string;
  link_flair_text: string | null;
  post_hint: string | null;
  domain: string | null;
}

interface RedditChild {
  data: RedditPostData;
}

interface RedditResponse {
  data: {
    children: RedditChild[];
    dist: number;
  };
}

const SUBREDDITS = [
  "worldnews",
  "technology",
  "space",
  "science",
  "collapse",
  "preppers",
  "cybersecurity",
];

export class RedditAdapter implements DataAdapter<SocialPost> {
  readonly sourceId = "reddit";
  readonly category = "social" as const;
  private httpClient;

  constructor() {
    this.httpClient = createHttpClient({ timeoutMs: 15000, rateLimitMs: 2000, maxRetries: 2 });
  }

  async fetch(): Promise<AdapterFetchResult<SocialPost>> {
    const startedAt = Date.now();
    const posts: SocialPost[] = [];

    try {
      for (const subreddit of SUBREDDITS) {
        try {
          const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=15`;
          const response = await this.httpClient.get(url, {
            "User-Agent": "MORDOR/1.0 (intelligence-collector)",
          });
          if (!response.ok) continue;

          const data = (await response.json()) as RedditResponse;
          const children = data.data?.children ?? [];
          for (const child of children) {
            const p = child.data;
            posts.push({
              postId: `reddit_${p.id}`,
              source: "reddit",
              externalId: p.id,
              author: p.author,
              authorDisplayName: null,
              subreddit: p.subreddit,
              title: p.title,
              body: p.selftext.slice(0, 1000),
              url: p.url,
              score: p.score,
              numComments: p.num_comments,
              upvoteRatio: p.upvote_ratio,
              createdUtc: new Date(p.created_utc * 1000).toISOString(),
              permalink: `https://www.reddit.com${p.permalink}`,
              thumbnail: p.thumbnail?.startsWith("http") ? p.thumbnail : null,
              lat: null,
              lon: null,
              tags: [p.subreddit, ...(p.link_flair_text ? [p.link_flair_text] : [])],
              metadata: {
                domain: p.domain,
                post_hint: p.post_hint,
                link_flair_text: p.link_flair_text,
              },
            });
          }
        } catch {}
      }

      return {
        success: posts.length > 0,
        data: posts,
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

export function createRedditAdapter(): RedditAdapter {
  return new RedditAdapter();
}
