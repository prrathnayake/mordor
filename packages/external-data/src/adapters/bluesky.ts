import { createHttpClient } from "../http-client.js";
import type { AdapterFetchResult, DataAdapter, SocialPost } from "../universal-types.js";

interface BskyAuthorFeedItem {
  post: {
    uri: string;
    cid: string;
    author: {
      did: string;
      handle: string;
      displayName?: string;
      avatar?: string;
    };
    record: {
      text: string;
      createdAt: string;
      embed?: {
        $type: string;
        external?: {
          uri: string;
          title?: string;
          description?: string;
          thumb?: string;
        };
      };
    };
    likeCount?: number;
    replyCount?: number;
    repostCount?: number;
    indexedAt: string;
  };
}

interface BskyAuthorFeedResponse {
  feed: BskyAuthorFeedItem[];
}

export class BlueskyAdapter implements DataAdapter<SocialPost> {
  readonly sourceId = "bluesky";
  readonly category = "social" as const;
  private httpClient;

  constructor() {
    this.httpClient = createHttpClient({ timeoutMs: 15000, rateLimitMs: 2000 });
  }

  async fetch(): Promise<AdapterFetchResult<SocialPost>> {
    const startedAt = Date.now();
    try {
      // Use public getAuthorFeed for a well-known feed (Bluesky dev account)
      const response = await this.httpClient.get(
        "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=did:plc:z72i7hdynmk6r22z27h6tvur&limit=30",
      );
      if (!response.ok) {
        return {
          success: false,
          data: [],
          error: `Bluesky returned ${response.status}`,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        };
      }
      const data = (await response.json()) as BskyAuthorFeedResponse;
      const posts: SocialPost[] = (data.feed ?? []).map((item) => {
        const post = item.post;
        const record = post.record;
        const embed = record.embed?.external;
        return {
          postId: `bsky_${post.cid}`,
          source: "bluesky",
          externalId: post.uri,
          author: post.author.handle,
          authorDisplayName: post.author.displayName ?? null,
          subreddit: null,
          title: embed?.title ?? record.text.slice(0, 120),
          body: record.text,
          url:
            embed?.uri ??
            `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split("/").pop()}`,
          score: (post.likeCount ?? 0) + (post.repostCount ?? 0),
          numComments: post.replyCount ?? 0,
          upvoteRatio: null,
          createdUtc: record.createdAt,
          permalink: `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split("/").pop()}`,
          thumbnail: embed?.thumb ?? post.author.avatar ?? null,
          lat: null,
          lon: null,
          tags: ["bluesky"],
          metadata: {
            did: post.author.did,
            handle: post.author.handle,
            indexed_at: post.indexedAt,
            embed_title: embed?.title ?? null,
            embed_description: embed?.description ?? null,
          },
        };
      });

      return {
        success: true,
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

export function createBlueskyAdapter(): BlueskyAdapter {
  return new BlueskyAdapter();
}
