import { createHttpClient } from "../http-client.js";
import type { AdapterFetchResult, DataAdapter, UtilityData } from "../universal-types.js";

interface CountryData {
  name: { common: string; official: string };
  cca2: string;
  cca3: string;
  capital: string[];
  region: string;
  latlng: [number, number];
  area: number;
  population: number;
  flags: { png: string; svg: string };
  continents: string[];
}

export class RestCountriesAdapter implements DataAdapter<UtilityData> {
  readonly sourceId = "rest_countries";
  readonly category = "utility" as const;
  private httpClient;

  constructor() {
    this.httpClient = createHttpClient({ timeoutMs: 20000, rateLimitMs: 2000 });
  }

  async fetch(): Promise<AdapterFetchResult<UtilityData>> {
    const startedAt = Date.now();
    try {
      const response = await this.httpClient.get(
        "https://restcountries.com/v3.1/all?fields=name,cca2,cca3,capital,region,latlng,area,population,flags,continents",
      );
      if (!response.ok) {
        return {
          success: false,
          data: [],
          error: `REST Countries returned ${response.status}`,
          fetchedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        };
      }
      const countries = (await response.json()) as CountryData[];
      const results: UtilityData[] = countries.map((c) => ({
        id: `rc_${c.cca2}`,
        source: "rest_countries",
        dataType: "country",
        queryKey: c.cca2,
        value: {
          name: c.name,
          cca2: c.cca2,
          cca3: c.cca3,
          capital: c.capital,
          region: c.region,
          area: c.area,
          population: c.population,
          flags: c.flags,
          continents: c.continents,
        },
        lat: c.latlng?.[0] ?? null,
        lon: c.latlng?.[1] ?? null,
        observedAt: new Date().toISOString(),
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

export function createRestCountriesAdapter(): RestCountriesAdapter {
  return new RestCountriesAdapter();
}
