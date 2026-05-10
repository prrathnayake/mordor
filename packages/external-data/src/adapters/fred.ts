import { createHttpClient } from "../http-client.js";
import type { AdapterFetchResult, DataAdapter, FinancialData } from "../universal-types.js";

export interface FredConfig {
  apiKey: string;
  series?: string[];
}

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations: FredObservation[];
}

const DEFAULT_SERIES: Array<{ id: string; name: string }> = [
  { id: "GDP", name: "Gross Domestic Product" },
  { id: "UNRATE", name: "Unemployment Rate" },
  { id: "CPIAUCSL", name: "Consumer Price Index" },
  { id: "FEDFUNDS", name: "Federal Funds Rate" },
  { id: "DGS10", name: "10-Year Treasury Rate" },
  { id: "SP500", name: "S&P 500 Index" },
  { id: "T5YIE", name: "5-Year Breakeven Inflation" },
  { id: "M2SL", name: "M2 Money Stock" },
];

export class FredAdapter implements DataAdapter<FinancialData> {
  readonly sourceId = "fred";
  readonly category = "finance" as const;
  private httpClient;

  constructor(private config: FredConfig) {
    this.httpClient = createHttpClient({ timeoutMs: 15000, rateLimitMs: 1000 });
  }

  async fetch(): Promise<AdapterFetchResult<FinancialData>> {
    const startedAt = Date.now();
    const seriesList = this.config.series ?? DEFAULT_SERIES.map((s) => s.id);
    const results: FinancialData[] = [];

    try {
      for (const seriesId of seriesList) {
        try {
          const url = new URL("https://api.stlouisfed.org/fred/series/observations");
          url.searchParams.set("series_id", seriesId);
          url.searchParams.set("api_key", this.config.apiKey);
          url.searchParams.set("file_type", "json");
          url.searchParams.set("sort_order", "desc");
          url.searchParams.set("limit", "1");

          const response = await this.httpClient.get(url.toString());
          if (!response.ok) continue;

          const data = (await response.json()) as FredResponse;
          const obs = data.observations?.[0];
          if (!obs) continue;

          const seriesName = DEFAULT_SERIES.find((s) => s.id === seriesId)?.name ?? seriesId;
          const value = Number.parseFloat(obs.value);
          if (Number.isNaN(value)) continue;

          results.push({
            id: `fred_${seriesId}_${obs.date}`,
            source: "fred",
            symbol: seriesId,
            name: seriesName,
            assetType: "economic_indicator",
            priceUsd: value,
            marketCapUsd: null,
            volume24h: null,
            change24hPct: null,
            high24h: null,
            low24h: null,
            timestamp: new Date(obs.date).toISOString(),
            currency: "USD",
            metadata: { series_id: seriesId, series_name: seriesName, raw_value: obs.value },
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

export function createFredAdapter(apiKey: string, series?: string[]): FredAdapter {
  return new FredAdapter({ apiKey, series });
}
