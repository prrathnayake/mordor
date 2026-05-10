import { createHttpClient } from "../http-client.js";
import type { AdapterFetchResult, DataAdapter, UtilityData } from "../universal-types.js";

export interface IpInfoConfig {
  apiKey: string;
}

interface IpInfoResponse {
  ip: string;
  city: string;
  region: string;
  country: string;
  loc: string;
  org: string;
  postal: string;
  timezone: string;
  asn: { asn: string; name: string; domain: string; route: string; type: string } | null;
  company: { name: string; domain: string; type: string } | null;
  privacy: {
    vpn: boolean;
    proxy: boolean;
    tor: boolean;
    relay: boolean;
    hosting: boolean;
    service: string;
  } | null;
  abuse: {
    address: string;
    country: string;
    email: string;
    name: string;
    network: string;
    phone: string;
  } | null;
}

const TARGET_IPS = ["8.8.8.8", "1.1.1.1", "185.220.101.0", "23.129.64.0"];

export class IpInfoAdapter implements DataAdapter<UtilityData> {
  readonly sourceId = "ipinfo";
  readonly category = "utility" as const;
  private httpClient;

  constructor(private config: IpInfoConfig) {
    this.httpClient = createHttpClient({ timeoutMs: 15000, rateLimitMs: 1000 });
  }

  async fetch(): Promise<AdapterFetchResult<UtilityData>> {
    const startedAt = Date.now();
    const results: UtilityData[] = [];

    try {
      for (const ip of TARGET_IPS) {
        try {
          const url = `https://ipinfo.io/${ip}?token=${this.config.apiKey}`;
          const response = await this.httpClient.get(url);
          if (!response.ok) continue;

          const data = (await response.json()) as IpInfoResponse;
          const loc = data.loc?.split(",").map(Number);
          const lat = loc?.[0] ?? null;
          const lon = loc?.[1] ?? null;

          results.push({
            id: `ipinfo_${data.ip}`,
            source: "ipinfo",
            dataType: "ip_geolocation",
            queryKey: data.ip,
            value: {
              ip: data.ip,
              city: data.city,
              region: data.region,
              country: data.country,
              loc: data.loc,
              org: data.org,
              postal: data.postal,
              timezone: data.timezone,
              asn: data.asn,
              company: data.company,
              privacy: data.privacy,
              abuse: data.abuse,
            },
            lat,
            lon,
            observedAt: new Date().toISOString(),
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

export function createIpInfoAdapter(apiKey: string): IpInfoAdapter {
  return new IpInfoAdapter({ apiKey });
}
