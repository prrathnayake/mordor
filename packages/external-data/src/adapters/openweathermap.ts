import { createHttpClient } from "../http-client.js";
import type { AdapterFetchResult, DataAdapter, WeatherObservation } from "../universal-types.js";

export interface OpenWeatherMapConfig {
  apiKey: string;
  cities?: Array<{ lat: number; lon: number }>;
}

interface OwmMain {
  temp: number;
  feels_like: number;
  temp_min: number;
  temp_max: number;
  pressure: number;
  humidity: number;
  sea_level?: number;
  grnd_level?: number;
}

interface OwmWind {
  speed: number;
  deg: number;
  gust?: number;
}

interface OwmWeather {
  id: number;
  main: string;
  description: string;
  icon: string;
}

interface OwmClouds {
  all: number;
}

interface OwmSys {
  country: string;
  sunrise: number;
  sunset: number;
}

interface OwmResponse {
  coord: { lat: number; lon: number };
  weather: OwmWeather[];
  main: OwmMain;
  visibility: number;
  wind: OwmWind;
  clouds: OwmClouds;
  rain?: { "1h"?: number; "3h"?: number };
  snow?: { "1h"?: number; "3h"?: number };
  dt: number;
  sys: OwmSys;
  timezone: number;
  id: number;
  name: string;
}

const DEFAULT_CITIES = [
  { lat: 40.7128, lon: -74.006 },
  { lat: 34.0522, lon: -118.2437 },
  { lat: 51.5074, lon: -0.1278 },
  { lat: 48.8566, lon: 2.3522 },
  { lat: 35.6762, lon: 139.6503 },
  { lat: 55.7558, lon: 37.6173 },
  { lat: -33.8688, lon: 151.2093 },
  { lat: 19.076, lon: 72.8777 },
  { lat: 31.2304, lon: 121.4737 },
  { lat: 28.6139, lon: 77.209 },
];

export class OpenWeatherMapAdapter implements DataAdapter<WeatherObservation> {
  readonly sourceId = "openweathermap";
  readonly category = "weather" as const;
  private httpClient;

  constructor(private config: OpenWeatherMapConfig) {
    this.httpClient = createHttpClient({ timeoutMs: 15000, rateLimitMs: 1200 });
  }

  async fetch(): Promise<AdapterFetchResult<WeatherObservation>> {
    const startedAt = Date.now();
    const cities = this.config.cities ?? DEFAULT_CITIES;
    const observations: WeatherObservation[] = [];

    try {
      for (const city of cities) {
        try {
          const url = new URL("https://api.openweathermap.org/data/2.5/weather");
          url.searchParams.set("lat", String(city.lat));
          url.searchParams.set("lon", String(city.lon));
          url.searchParams.set("appid", this.config.apiKey);
          url.searchParams.set("units", "metric");

          const response = await this.httpClient.get(url.toString());
          if (!response.ok) continue;

          const data = (await response.json()) as OwmResponse;
          observations.push({
            observationId: `owm_${data.id}_${data.dt}`,
            source: "openweathermap",
            stationId: String(data.id),
            lat: data.coord.lat,
            lon: data.coord.lon,
            observedAt: new Date(data.dt * 1000).toISOString(),
            temperatureC: data.main.temp,
            feelsLikeC: data.main.feels_like,
            humidityPct: data.main.humidity,
            pressureHpa: data.main.pressure,
            windSpeedMps: data.wind.speed,
            windDeg: data.wind.deg,
            windGustMps: data.wind.gust ?? null,
            visibilityM: data.visibility,
            cloudCoverPct: data.clouds.all,
            weatherCondition: data.weather[0]?.description ?? null,
            weatherIcon: data.weather[0]?.icon ?? null,
            precipitation1hMm: data.rain?.["1h"] ?? data.snow?.["1h"] ?? null,
            precipitation3hMm: data.rain?.["3h"] ?? data.snow?.["3h"] ?? null,
            uvIndex: null,
            airQualityIndex: null,
          });
        } catch {}
      }

      return {
        success: observations.length > 0,
        data: observations,
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

export function createOpenWeatherMapAdapter(
  apiKey: string,
  cities?: Array<{ lat: number; lon: number }>,
): OpenWeatherMapAdapter {
  return new OpenWeatherMapAdapter({ apiKey, cities });
}
