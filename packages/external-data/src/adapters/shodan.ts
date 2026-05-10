import { createHttpClient } from "../http-client.js";
import type { AdapterFetchResult, DataAdapter, ThreatIntel } from "../universal-types.js";

export interface ShodanConfig {
  apiKey: string;
}

interface ShodanMatch {
  ip_str: string;
  port: number;
  protocol: string;
  org: string | null;
  isp: string | null;
  country_code: string | null;
  lat: number | null;
  lon: number | null;
  hostnames: string[];
  domains: string[];
  product: string | null;
  os: string | null;
  transport: string;
  timestamp: string;
  tags: string[];
  vulns?: string[];
  data: string;
}

interface ShodanResponse {
  matches: ShodanMatch[];
  total: number;
}

const SEARCH_QUERIES = [
  "port:22 product:OpenSSH",
  "port:3389 product:Microsoft",
  "port:23 telnet",
  "port:9200 elasticsearch",
  "port:5432 PostgreSQL",
  "port:6379 redis",
  "port:27017 mongodb",
  "port:8080 http title:login",
];

export class ShodanAdapter implements DataAdapter<ThreatIntel> {
  readonly sourceId = "shodan";
  readonly category = "security" as const;
  private httpClient;
  private queryIndex = 0;

  constructor(private config: ShodanConfig) {
    this.httpClient = createHttpClient({ timeoutMs: 20000, rateLimitMs: 1000 });
  }

  async fetch(): Promise<AdapterFetchResult<ThreatIntel>> {
    const startedAt = Date.now();
    const query = SEARCH_QUERIES[this.queryIndex % SEARCH_QUERIES.length];
    this.queryIndex++;

    try {
      const url = new URL("https://api.shodan.io/shodan/host/search");
      url.searchParams.set("key", this.config.apiKey);
      url.searchParams.set("query", query);
      url.searchParams.set("limit", "10");

      const response = await this.httpClient.get(url.toString());
      if (!response.ok) {
        return {
          success: false,
          data: [],
          error: `Shodan returned ${response.status}`,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        };
      }
      const data = (await response.json()) as ShodanResponse;
      const results: ThreatIntel[] = (data.matches ?? []).map((m) => ({
        id: `shodan_${m.ip_str}_${m.port}_${m.timestamp}`,
        source: "shodan",
        ipAddress: m.ip_str,
        domain: m.domains?.[0] ?? null,
        port: m.port,
        protocol: m.protocol,
        threatType: `exposed_service:${m.product ?? "unknown"}`,
        threatCategory: ["exposed_service", ...(m.vulns ?? []).map((v) => `vuln:${v}`)],
        confidence: m.vulns?.length ? 75 : 30,
        severity: m.vulns?.length ? ("high" as const) : ("medium" as const),
        isWhitelisted: false,
        countryCode: m.country_code,
        lat: m.lat,
        lon: m.lon,
        isp: m.isp ?? null,
        org: m.org ?? null,
        abuseConfidence: null,
        lastReportedAt: m.timestamp,
        totalReports: null,
        description: `${m.ip_str}:${m.port} (${m.product ?? m.protocol}) - ${m.data?.slice(0, 200) ?? ""}`,
        tags: ["shodan", ...(m.tags ?? []), ...(m.vulns ?? []).map((v) => `vuln:${v}`)],
        firstSeen: null,
        lastSeen: m.timestamp,
      }));

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

export function createShodanAdapter(apiKey: string): ShodanAdapter {
  return new ShodanAdapter({ apiKey });
}
