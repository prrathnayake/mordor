import { AbuseIpDbAdapter } from "../adapters/abuseipdb.js";
import { AdsbLolAdapter } from "../adapters/adsb-lol.js";
import { AlphaVantageAdapter } from "../adapters/alpha-vantage.js";
import { BlueskyAdapter } from "../adapters/bluesky.js";
import { CoinGeckoAdapter } from "../adapters/coingecko.js";
import { FredAdapter } from "../adapters/fred.js";
import { IpInfoAdapter } from "../adapters/ipinfo.js";
import { MediaStackAdapter } from "../adapters/media-stack.js";
import { NasaApiAdapter } from "../adapters/nasa-apis.js";
import { NewsApiAdapter } from "../adapters/news-api.js";
import { OpenWeatherMapAdapter } from "../adapters/openweathermap.js";
import { OtxAdapter } from "../adapters/otx.js";
import { RedditAdapter } from "../adapters/reddit.js";
import { RestCountriesAdapter } from "../adapters/rest-countries.js";
import { ShodanAdapter } from "../adapters/shodan.js";
import type {
  AdapterFetchResult,
  DataAdapter,
  DataSourceCategory,
  DataSourceConfig,
} from "../universal-types.js";

export interface UniversalDataRegistryConfig {
  newsApiKey?: string;
  mediaStackApiKey?: string;
  openWeatherMapApiKey?: string;
  nasaApiKey?: string;
  alphaVantageApiKey?: string;
  fredApiKey?: string;
  abuseIpDbApiKey?: string;
  otxApiKey?: string;
  shodanApiKey?: string;
  ipInfoApiKey?: string;
}

export class UniversalDataRegistry {
  private adapters: Map<string, DataAdapter<unknown>> = new Map();
  private sourceConfigs: Map<string, DataSourceConfig> = new Map();
  private config: UniversalDataRegistryConfig;

  constructor(config: UniversalDataRegistryConfig = {}) {
    this.config = config;
    this.registerAdapters();
  }

  private registerAdapters(): void {
    this.registerAdapter(
      "adsb_lol",
      "aviation",
      "ADSB.lol",
      "Open aviation tracking network",
      "ADSB.lol",
      null,
      false,
      30,
      60,
      new AdsbLolAdapter(),
    );

    if (this.config.newsApiKey) {
      this.registerAdapter(
        "newsapi",
        "news",
        "NewsAPI",
        "Headlines from thousands of news sources",
        "NewsAPI",
        "https://newsapi.org/v2",
        true,
        100,
        600,
        new NewsApiAdapter({ apiKey: this.config.newsApiKey }),
      );
    }

    if (this.config.mediaStackApiKey) {
      this.registerAdapter(
        "mediastack",
        "news",
        "MediaStack",
        "Global news feeds with JSON API",
        "MediaStack",
        "http://api.mediastack.com/v1",
        true,
        100,
        600,
        new MediaStackAdapter({ apiKey: this.config.mediaStackApiKey }),
      );
    }

    if (this.config.openWeatherMapApiKey) {
      this.registerAdapter(
        "openweathermap",
        "weather",
        "OpenWeatherMap",
        "Global weather data and forecasts",
        "OpenWeatherMap",
        "https://api.openweathermap.org/data/2.5",
        true,
        60,
        300,
        new OpenWeatherMapAdapter({ apiKey: this.config.openWeatherMapApiKey }),
      );
    }

    if (this.config.nasaApiKey) {
      this.registerAdapter(
        "nasa",
        "space",
        "NASA APIs",
        "Space imagery, astronomy, Mars rover photos",
        "NASA",
        "https://api.nasa.gov",
        true,
        30,
        3600,
        new NasaApiAdapter({ apiKey: this.config.nasaApiKey }),
      );
    }

    if (this.config.alphaVantageApiKey) {
      this.registerAdapter(
        "alpha_vantage",
        "finance",
        "Alpha Vantage",
        "Stock and financial market data",
        "Alpha Vantage",
        "https://www.alphavantage.co/query",
        true,
        5,
        3600,
        new AlphaVantageAdapter({ apiKey: this.config.alphaVantageApiKey }),
      );
    }

    if (this.config.fredApiKey) {
      this.registerAdapter(
        "fred",
        "finance",
        "FRED Economic Data",
        "Federal Reserve macroeconomic indicators",
        "FRED",
        "https://api.stlouisfed.org/fred",
        true,
        120,
        86400,
        new FredAdapter({ apiKey: this.config.fredApiKey }),
      );
    }

    this.registerAdapter(
      "coingecko",
      "finance",
      "CoinGecko",
      "Cryptocurrency market data",
      "CoinGecko",
      "https://api.coingecko.com/api/v3",
      false,
      10,
      300,
      new CoinGeckoAdapter(),
    );

    this.registerAdapter(
      "reddit",
      "social",
      "Reddit API",
      "Community discussions and sentiment",
      "Reddit",
      "https://www.reddit.com",
      false,
      30,
      600,
      new RedditAdapter(),
    );

    this.registerAdapter(
      "bluesky",
      "social",
      "Bluesky Social",
      "Real-time decentralized social firehose",
      "Bluesky",
      "https://public.api.bsky.app",
      false,
      30,
      300,
      new BlueskyAdapter(),
    );

    if (this.config.abuseIpDbApiKey) {
      this.registerAdapter(
        "abuseipdb",
        "security",
        "AbuseIPDB",
        "Malicious IP reputation database",
        "AbuseIPDB",
        "https://api.abuseipdb.com/api/v2",
        true,
        30,
        3600,
        new AbuseIpDbAdapter({ apiKey: this.config.abuseIpDbApiKey }),
      );
    }

    if (this.config.otxApiKey) {
      this.registerAdapter(
        "otx",
        "security",
        "AlienVault OTX",
        "Open threat intelligence platform",
        "AlienVault",
        "https://otx.alienvault.com/api/v1",
        true,
        10,
        3600,
        new OtxAdapter({ apiKey: this.config.otxApiKey }),
      );
    }

    if (this.config.shodanApiKey) {
      this.registerAdapter(
        "shodan",
        "security",
        "Shodan",
        "Internet-wide device scanning",
        "Shodan",
        "https://api.shodan.io",
        true,
        1,
        86400,
        new ShodanAdapter({ apiKey: this.config.shodanApiKey }),
      );
    }

    this.registerAdapter(
      "rest_countries",
      "utility",
      "REST Countries",
      "Country data (flags, currencies, languages)",
      "REST Countries",
      "https://restcountries.com/v3.1",
      false,
      30,
      86400,
      new RestCountriesAdapter(),
    );

    if (this.config.ipInfoApiKey) {
      this.registerAdapter(
        "ipinfo",
        "utility",
        "IPInfo",
        "IP geolocation and network information",
        "IPInfo",
        "https://ipinfo.io",
        true,
        50000,
        86400,
        new IpInfoAdapter({ apiKey: this.config.ipInfoApiKey }),
      );
    }
  }

  private registerAdapter(
    sourceId: string,
    category: DataSourceCategory,
    displayName: string,
    description: string,
    provider: string,
    baseUrl: string | null,
    apiKeyRequired: boolean,
    rateLimitRequestsPerMin: number,
    updateCadenceSeconds: number,
    adapter: DataAdapter<unknown>,
  ): void {
    this.adapters.set(sourceId, adapter);
    this.sourceConfigs.set(sourceId, {
      sourceId,
      category,
      displayName,
      description,
      provider,
      baseUrl,
      apiKeyRequired,
      rateLimitRequestsPerMin,
      updateCadenceSeconds,
      status: "active",
      config: {},
    });
  }

  getAdapter(sourceId: string): DataAdapter<unknown> | undefined {
    return this.adapters.get(sourceId);
  }

  getConfig(sourceId: string): DataSourceConfig | undefined {
    return this.sourceConfigs.get(sourceId);
  }

  getAdaptersByCategory(
    category: DataSourceCategory,
  ): Array<{ adapter: DataAdapter<unknown>; config: DataSourceConfig }> {
    const result: Array<{ adapter: DataAdapter<unknown>; config: DataSourceConfig }> = [];
    for (const [sourceId, adapter] of this.adapters) {
      const config = this.sourceConfigs.get(sourceId);
      if (config?.category === category) {
        result.push({ adapter, config });
      }
    }
    return result;
  }

  getCategories(): DataSourceCategory[] {
    const categories = new Set<DataSourceCategory>();
    for (const config of this.sourceConfigs.values()) {
      categories.add(config.category);
    }
    return Array.from(categories).sort();
  }

  getAllSources(): DataSourceConfig[] {
    return Array.from(this.sourceConfigs.values());
  }

  getActiveSources(): DataSourceConfig[] {
    return this.getAllSources().filter((s) => s.status === "active");
  }

  async fetchSource(sourceId: string): Promise<AdapterFetchResult<unknown>> {
    const adapter = this.adapters.get(sourceId);
    if (!adapter) {
      return {
        success: false,
        data: [],
        error: `Unknown source: ${sourceId}`,
        fetchedAt: new Date().toISOString(),
        durationMs: 0,
      };
    }
    return adapter.fetch();
  }

  async fetchAllActive(): Promise<Record<string, AdapterFetchResult<unknown>>> {
    const results: Record<string, AdapterFetchResult<unknown>> = {};
    for (const [sourceId] of this.adapters) {
      try {
        results[sourceId] = await this.fetchSource(sourceId);
      } catch (error) {
        results[sourceId] = {
          success: false,
          data: [],
          error: error instanceof Error ? error.message : String(error),
          fetchedAt: new Date().toISOString(),
          durationMs: 0,
        };
      }
    }
    return results;
  }

  async fetchCategory(
    category: DataSourceCategory,
  ): Promise<Record<string, AdapterFetchResult<unknown>>> {
    const results: Record<string, AdapterFetchResult<unknown>> = {};
    const sources = this.getAdaptersByCategory(category);
    for (const { adapter } of sources) {
      try {
        results[adapter.sourceId] = await adapter.fetch();
      } catch (error) {
        results[adapter.sourceId] = {
          success: false,
          data: [],
          error: error instanceof Error ? error.message : String(error),
          fetchedAt: new Date().toISOString(),
          durationMs: 0,
        };
      }
    }
    return results;
  }

  getSubscribedAdapterIds(): string[] {
    return Array.from(this.adapters.keys());
  }
}

export function createUniversalDataRegistry(
  config: UniversalDataRegistryConfig = {},
): UniversalDataRegistry {
  return new UniversalDataRegistry(config);
}
