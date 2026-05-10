import { createHttpClient } from "../http-client.js";
import type { AdapterFetchResult, DataAdapter, ThreatIntel } from "../universal-types.js";

export interface OtxConfig {
  apiKey: string;
}

interface OtxPulse {
  id: string;
  name: string;
  description: string;
  author_name: string;
  created: string;
  modified: string;
  tags: string[];
  adversary: string | null;
  indicators: Array<{
    type: string;
    indicator: string;
    description?: string;
  }>;
}

interface OtxResponse {
  results: OtxPulse[];
  count: number;
}

export class OtxAdapter implements DataAdapter<ThreatIntel> {
  readonly sourceId = "otx";
  readonly category = "security" as const;
  private httpClient;

  constructor(private config: OtxConfig) {
    this.httpClient = createHttpClient({ timeoutMs: 15000, rateLimitMs: 2000 });
  }

  async fetch(): Promise<AdapterFetchResult<ThreatIntel>> {
    const startedAt = Date.now();
    try {
      const url = new URL("https://otx.alienvault.com/api/v1/pulses/subscribed");
      url.searchParams.set("limit", "20");
      url.searchParams.set("page", "1");

      const response = await this.httpClient.get(url.toString(), {
        "X-OTX-API-KEY": this.config.apiKey,
        Accept: "application/json",
      });
      if (!response.ok) {
        return {
          success: false,
          data: [],
          error: `OTX returned ${response.status}`,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        };
      }
      const data = (await response.json()) as OtxResponse;
      const results: ThreatIntel[] = [];

      for (const pulse of data.results ?? []) {
        for (const indicator of pulse.indicators?.slice(0, 5) ?? []) {
          const isIp = indicator.type === "IPv4" || indicator.type === "IPv6";
          const isDomain = indicator.type === "domain" || indicator.type === "hostname";
          results.push({
            id: `otx_${indicator.indicator}_${pulse.id}`,
            source: "otx",
            ipAddress: isIp ? indicator.indicator : null,
            domain: isDomain ? indicator.indicator : null,
            port: null,
            protocol: null,
            threatType: indicator.type,
            threatCategory: pulse.tags ?? [],
            confidence: 50,
            severity: "medium" as const,
            isWhitelisted: false,
            countryCode: null,
            lat: null,
            lon: null,
            isp: null,
            org: null,
            abuseConfidence: null,
            lastReportedAt: pulse.modified,
            totalReports: null,
            description: indicator.description ?? pulse.description ?? pulse.name,
            tags: [...(pulse.tags ?? []), `adversary:${pulse.adversary ?? "unknown"}`],
            firstSeen: pulse.created,
            lastSeen: pulse.modified,
          });
        }
      }

      return {
        success: true,
        data: results,
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

export function createOtxAdapter(apiKey: string): OtxAdapter {
  return new OtxAdapter({ apiKey });
}
