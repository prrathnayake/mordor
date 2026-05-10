import { createHttpClient } from "../http-client.js";
import type { AdapterFetchResult, DataAdapter, FinancialData } from "../universal-types.js";

export interface AlphaVantageConfig {
  apiKey: string;
  symbols?: string[];
}

interface AvGlobalQuote {
  "01. symbol": string;
  "02. open": string;
  "03. high": string;
  "04. low": string;
  "05. price": string;
  "06. volume": string;
  "07. latest trading day": string;
  "08. previous close": string;
  "09. change": string;
  "10. change percent": string;
}

interface AvQuoteResponse {
  "Global Quote": AvGlobalQuote;
}

const DEFAULT_SYMBOLS = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "TSLA",
  "NVDA",
  "META",
  "SPY",
  "QQQ",
  "VIX",
];

export class AlphaVantageAdapter implements DataAdapter<FinancialData> {
  readonly sourceId = "alpha_vantage";
  readonly category = "finance" as const;
  private httpClient;

  constructor(private config: AlphaVantageConfig) {
    this.httpClient = createHttpClient({ timeoutMs: 15000, rateLimitMs: 15000 });
  }

  async fetch(): Promise<AdapterFetchResult<FinancialData>> {
    const startedAt = Date.now();
    const symbols = this.config.symbols ?? DEFAULT_SYMBOLS;
    const results: FinancialData[] = [];

    try {
      for (const symbol of symbols) {
        try {
          const url = new URL("https://www.alphavantage.co/query");
          url.searchParams.set("function", "GLOBAL_QUOTE");
          url.searchParams.set("symbol", symbol);
          url.searchParams.set("apikey", this.config.apiKey);

          const response = await this.httpClient.get(url.toString());
          if (!response.ok) continue;

          const data = (await response.json()) as AvQuoteResponse;
          const quote = data["Global Quote"];
          if (!quote?.["01. symbol"]) continue;

          results.push({
            id: `av_${symbol}_${quote["07. latest trading day"]}`,
            source: "alpha_vantage",
            symbol: quote["01. symbol"],
            name: quote["01. symbol"],
            assetType: "stock",
            priceUsd: Number.parseFloat(quote["05. price"]) || null,
            marketCapUsd: null,
            volume24h: Number.parseFloat(quote["06. volume"]) || null,
            change24hPct:
              Number.parseFloat(quote["10. change percent"]?.replace("%", "") ?? "") || null,
            high24h: Number.parseFloat(quote["03. high"]) || null,
            low24h: Number.parseFloat(quote["04. low"]) || null,
            timestamp: new Date(quote["07. latest trading day"]).toISOString(),
            currency: "USD",
            metadata: {
              open: quote["02. open"],
              previousClose: quote["08. previous close"],
              change: quote["09. change"],
            },
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

export function createAlphaVantageAdapter(apiKey: string, symbols?: string[]): AlphaVantageAdapter {
  return new AlphaVantageAdapter({ apiKey, symbols });
}
