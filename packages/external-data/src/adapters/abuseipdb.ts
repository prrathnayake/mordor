import { createHttpClient } from "../http-client.js";
import type { AdapterFetchResult, DataAdapter, ThreatIntel } from "../universal-types.js";

export interface AbuseIpDbConfig {
  apiKey: string;
  maxAgeDays?: number;
}

interface AbuseIpDbReport {
  ip: string;
  isPublic: boolean;
  ipVersion: number;
  isWhitelisted: boolean;
  abuseConfidenceScore: number;
  countryCode: string | null;
  usageType: string | null;
  isp: string | null;
  domain: string | null;
  totalReports: number;
  lastReportedAt: string | null;
}

const BLACKLIST_IPS = [
  "1.1.1.1",
  "8.8.8.8",
  "185.220.101.0",
  "103.235.46.0",
  "45.33.32.0",
  "104.248.0.0",
  "159.65.0.0",
  "167.99.0.0",
];

export class AbuseIpDbAdapter implements DataAdapter<ThreatIntel> {
  readonly sourceId = "abuseipdb";
  readonly category = "security" as const;
  private httpClient;

  constructor(private config: AbuseIpDbConfig) {
    this.httpClient = createHttpClient({ timeoutMs: 15000, rateLimitMs: 3000 });
  }

  async fetch(): Promise<AdapterFetchResult<ThreatIntel>> {
    const startedAt = Date.now();
    const results: ThreatIntel[] = [];

    try {
      for (const ip of BLACKLIST_IPS) {
        try {
          const url = new URL("https://api.abuseipdb.com/api/v2/check");
          url.searchParams.set("ipAddress", ip);
          url.searchParams.set("maxAgeInDays", String(this.config.maxAgeDays ?? 30));
          url.searchParams.set("verbose", "true");

          const response = await this.httpClient.get(url.toString(), {
            Key: this.config.apiKey,
            Accept: "application/json",
          });
          if (!response.ok) continue;

          const data = (await response.json()) as { data: AbuseIpDbReport };
          const report = data.data;
          if (!report) continue;

          const severity =
            report.abuseConfidenceScore >= 75
              ? "critical"
              : report.abuseConfidenceScore >= 50
                ? "high"
                : report.abuseConfidenceScore >= 25
                  ? "medium"
                  : "low";

          results.push({
            id: `abuse_${report.ip}_${Date.now()}`,
            source: "abuseipdb",
            ipAddress: report.ip,
            domain: report.domain,
            port: null,
            protocol: null,
            threatType: "malicious_ip",
            threatCategory: report.usageType ? [report.usageType] : [],
            confidence: report.abuseConfidenceScore,
            severity: report.isWhitelisted ? null : severity,
            isWhitelisted: report.isWhitelisted,
            countryCode: report.countryCode,
            lat: null,
            lon: null,
            isp: report.isp,
            org: report.isp,
            abuseConfidence: report.abuseConfidenceScore,
            lastReportedAt: report.lastReportedAt,
            totalReports: report.totalReports,
            description: `IP ${report.ip} reported ${report.totalReports} times (${report.abuseConfidenceScore}% confidence)`,
            tags: ["abuseipdb", ...(report.usageType ? [report.usageType] : [])],
            firstSeen: null,
            lastSeen: report.lastReportedAt ?? new Date().toISOString(),
          });
        } catch {}
      }

      return {
        success: results.length > 0,
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

export function createAbuseIpDbAdapter(apiKey: string, maxAgeDays?: number): AbuseIpDbAdapter {
  return new AbuseIpDbAdapter({ apiKey, maxAgeDays });
}
