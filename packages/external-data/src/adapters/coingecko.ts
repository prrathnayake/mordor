import { createHttpClient } from "../http-client.js";
import type { AdapterFetchResult, DataAdapter, FinancialData } from "../universal-types.js";

interface CoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_24h: number;
  high_24h: number;
  low_24h: number;
  circulating_supply: number;
  total_supply: number | null;
  ath: number;
  ath_date: string;
  last_updated: string;
}

const COINS = [
  "bitcoin",
  "ethereum",
  "solana",
  "ripple",
  "cardano",
  "avalanche-2",
  "polkadot",
  "chainlink",
  "near",
  "uniswap",
];

export class CoinGeckoAdapter implements DataAdapter<FinancialData> {
  readonly sourceId = "coingecko";
  readonly category = "finance" as const;
  private httpClient;

  constructor() {
    this.httpClient = createHttpClient({ timeoutMs: 15000, rateLimitMs: 2000 });
  }

  async fetch(): Promise<AdapterFetchResult<FinancialData>> {
    const startedAt = Date.now();
    try {
      const url = new URL("https://api.coingecko.com/api/v3/coins/markets");
      url.searchParams.set("vs_currency", "usd");
      url.searchParams.set("ids", COINS.join(","));
      url.searchParams.set("order", "market_cap_desc");
      url.searchParams.set("per_page", String(COINS.length));
      url.searchParams.set("sparkline", "false");
      url.searchParams.set("price_change_percentage", "24h");

      const response = await this.httpClient.get(url.toString(), {
        Accept: "application/json",
      });
      if (!response.ok) {
        return {
          success: false,
          data: [],
          error: `CoinGecko returned ${response.status}`,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        };
      }
      const coins = (await response.json()) as CoinGeckoCoin[];
      const results: FinancialData[] = coins.map((coin) => ({
        id: `cg_${coin.id}_${Date.now()}`,
        source: "coingecko",
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        assetType: "crypto",
        priceUsd: coin.current_price,
        marketCapUsd: coin.market_cap,
        volume24h: coin.total_volume,
        change24hPct: coin.price_change_percentage_24h,
        high24h: coin.high_24h,
        low24h: coin.low_24h,
        timestamp: coin.last_updated,
        currency: "USD",
        metadata: {
          image: coin.image,
          market_cap_rank: coin.market_cap_rank,
          circulating_supply: coin.circulating_supply,
          total_supply: coin.total_supply,
          ath: coin.ath,
          ath_date: coin.ath_date,
        },
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

export function createCoinGeckoAdapter(): CoinGeckoAdapter {
  return new CoinGeckoAdapter();
}
