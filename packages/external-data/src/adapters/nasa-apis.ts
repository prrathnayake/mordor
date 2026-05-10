import { createHttpClient } from "../http-client.js";
import type { AdapterFetchResult, DataAdapter, SpaceData } from "../universal-types.js";

export interface NasaApiConfig {
  apiKey: string;
  maxItems?: number;
}

interface NasaApodItem {
  date: string;
  explanation: string;
  hdurl: string | null;
  media_type: "image" | "video";
  service_version: string;
  title: string;
  url: string;
  thumbnail_url?: string;
}

interface NasaMarsPhoto {
  id: number;
  sol: number;
  camera: { id: number; name: string; rover_id: number; full_name: string };
  img_src: string;
  earth_date: string;
  rover: { id: number; name: string; landing_date: string; launch_date: string; status: string };
}

interface NasaEonetEvent {
  id: string;
  title: string;
  description: string;
  link: string;
  categories: Array<{ id: number; title: string }>;
  sources: Array<{ id: string; url: string }>;
  geometries: Array<{
    date: string;
    type: string;
    coordinates: number[];
  }>;
}

interface NasaEonetResponse {
  title: string;
  events: NasaEonetEvent[];
}

export class NasaApiAdapter implements DataAdapter<SpaceData> {
  readonly sourceId = "nasa";
  readonly category = "space" as const;
  private httpClient;

  constructor(private config: NasaApiConfig) {
    this.httpClient = createHttpClient({ timeoutMs: 20000, rateLimitMs: 2000 });
  }

  async fetch(): Promise<AdapterFetchResult<SpaceData>> {
    const startedAt = Date.now();
    const max = this.config.maxItems ?? 10;
    const results: SpaceData[] = [];

    try {
      const [apodItems, marsItems, eonetItems] = await Promise.allSettled([
        this.fetchApod(max),
        this.fetchMarsPhotos(max),
        this.fetchEonetEvents(max),
      ]);

      if (apodItems.status === "fulfilled") results.push(...apodItems.value);
      if (marsItems.status === "fulfilled") results.push(...marsItems.value);
      if (eonetItems.status === "fulfilled") results.push(...eonetItems.value);

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

  private async fetchApod(max: number): Promise<SpaceData[]> {
    const url = new URL("https://api.nasa.gov/planetary/apod");
    url.searchParams.set("api_key", this.config.apiKey);
    url.searchParams.set("count", String(max));

    const response = await this.httpClient.get(url.toString());
    if (!response.ok) return [];

    const items = (await response.json()) as NasaApodItem[];
    return (Array.isArray(items) ? items : [items]).map((item) => ({
      id: `nasa_apod_${item.date}`,
      source: "nasa" as const,
      dataType: "apod",
      title: item.title,
      description: item.explanation.slice(0, 500),
      url: item.hdurl ?? item.url,
      thumbnailUrl: item.thumbnail_url ?? item.url,
      lat: null,
      lon: null,
      observedAt: new Date(item.date).toISOString(),
      satelliteId: null,
      satelliteName: null,
      instrument: null,
      resolutionM: null,
      cloudCoverPct: null,
      caption: null,
      mediaType: item.media_type === "video" ? "video" : "image",
      payload: { apod_date: item.date, media_type: item.media_type },
    }));
  }

  private async fetchMarsPhotos(max: number): Promise<SpaceData[]> {
    const url = new URL("https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/latest_photos");
    url.searchParams.set("api_key", this.config.apiKey);

    const response = await this.httpClient.get(url.toString());
    if (!response.ok) return [];

    const data = (await response.json()) as { latest_photos?: NasaMarsPhoto[] };
    return (data.latest_photos ?? []).slice(0, max).map((p) => ({
      id: `nasa_mars_${p.id}`,
      source: "nasa" as const,
      dataType: "mars_photo",
      title: `Mars Photo by ${p.camera.full_name} (Sol ${p.sol})`,
      description: `Rover: ${p.rover.name}, Camera: ${p.camera.full_name}, Earth Date: ${p.earth_date}`,
      url: p.img_src,
      thumbnailUrl: p.img_src,
      lat: null,
      lon: null,
      observedAt: new Date(p.earth_date).toISOString(),
      satelliteId: null,
      satelliteName: p.rover.name,
      instrument: p.camera.full_name,
      resolutionM: null,
      cloudCoverPct: null,
      caption: null,
      mediaType: "mars_photo",
      payload: { sol: p.sol, camera: p.camera.name, rover: p.rover.name, earth_date: p.earth_date },
    }));
  }

  private async fetchEonetEvents(max: number): Promise<SpaceData[]> {
    const url = new URL("https://eonet.gsfc.nasa.gov/api/v3/events");
    url.searchParams.set("limit", String(max));
    url.searchParams.set("status", "open");

    const response = await this.httpClient.get(url.toString());
    if (!response.ok) return [];

    const data = (await response.json()) as NasaEonetResponse;
    return (data.events ?? []).slice(0, max).map((event) => {
      const geo = event.geometries?.[0];
      const coords = geo?.coordinates;
      return {
        id: `nasa_eonet_${event.id}`,
        source: "nasa" as const,
        dataType: "event",
        title: event.title,
        description: event.description ?? event.categories.map((c) => c.title).join(", "),
        url: event.link || event.sources?.[0]?.url || null,
        thumbnailUrl: null,
        lat: coords && geo?.type === "Point" ? coords[1] : null,
        lon: coords && geo?.type === "Point" ? coords[0] : null,
        observedAt: geo?.date ?? null,
        satelliteId: null,
        satelliteName: null,
        instrument: null,
        resolutionM: null,
        cloudCoverPct: null,
        caption: null,
        mediaType: "event",
        payload: {
          categories: event.categories.map((c) => c.title),
          sources: event.sources,
          geometries: event.geometries,
        },
      };
    });
  }
}

export function createNasaApiAdapter(apiKey: string, maxItems?: number): NasaApiAdapter {
  return new NasaApiAdapter({ apiKey, maxItems });
}
