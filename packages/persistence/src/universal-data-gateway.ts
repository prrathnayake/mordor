import type { PostgresDatabase } from "./database.js";

export interface AviationPositionRow {
  id: string;
  source: "opensky" | "adsb_lol";
  icao24: string;
  callsign: string | null;
  origin_country: string | null;
  lat: number;
  lon: number;
  altitude_m: number | null;
  velocity_mps: number | null;
  heading_deg: number | null;
  vertical_rate_mps: number | null;
  on_ground: boolean;
  squawk: string | null;
  category: number | null;
  observed_at: string;
}

export interface NewsArticleRow {
  article_id: string;
  source: "newsapi" | "mediastack" | "gdelt";
  source_name: string;
  author: string | null;
  title: string;
  description: string;
  url: string;
  url_to_image: string | null;
  published_at: string;
  content: string | null;
  category: string | null;
  country: string | null;
  language: string | null;
  lat: number | null;
  lon: number | null;
  raw_tags: string[];
}

export interface WeatherObservationRow {
  observation_id: string;
  source: "openweathermap" | "noaa";
  station_id: string | null;
  lat: number;
  lon: number;
  observed_at: string;
  temperature_c: number | null;
  feels_like_c: number | null;
  humidity_pct: number | null;
  pressure_hpa: number | null;
  wind_speed_mps: number | null;
  wind_deg: number | null;
  wind_gust_mps: number | null;
  visibility_m: number | null;
  cloud_cover_pct: number | null;
  weather_condition: string | null;
  weather_icon: string | null;
  precipitation_1h_mm: number | null;
  precipitation_3h_mm: number | null;
  uv_index: number | null;
  air_quality_index: number | null;
}

export interface FinancialDataRow {
  id: string;
  source: "alpha_vantage" | "fred" | "coingecko";
  symbol: string;
  name: string;
  asset_type: "stock" | "crypto" | "economic_indicator" | "exchange_rate" | "commodity";
  price_usd: number | null;
  market_cap_usd: number | null;
  volume_24h: number | null;
  change_24h_pct: number | null;
  high_24h: number | null;
  low_24h: number | null;
  timestamp: string;
  currency: string;
}

export interface SocialPostRow {
  post_id: string;
  source: "reddit" | "bluesky";
  external_id: string;
  author: string;
  author_display_name: string | null;
  subreddit: string | null;
  title: string;
  body: string;
  url: string | null;
  score: number;
  num_comments: number;
  upvote_ratio: number | null;
  created_utc: string;
  permalink: string | null;
  thumbnail: string | null;
  lat: number | null;
  lon: number | null;
  tags: string[];
}

export interface ThreatIntelRow {
  id: string;
  source: "abuseipdb" | "otx" | "shodan";
  ip_address: string | null;
  domain: string | null;
  port: number | null;
  protocol: string | null;
  threat_type: string | null;
  threat_category: string[];
  confidence: number;
  severity: string | null;
  is_whitelisted: boolean;
  country_code: string | null;
  lat: number | null;
  lon: number | null;
  isp: string | null;
  org: string | null;
  abuse_confidence: number | null;
  last_reported_at: string | null;
  total_reports: number | null;
  description: string | null;
  tags: string[];
  first_seen: string | null;
  last_seen: string;
}

export interface SpaceDataRow {
  id: string;
  source: "nasa" | "sentinel_hub" | "celestrak";
  data_type: string;
  title: string;
  description: string;
  url: string | null;
  thumbnail_url: string | null;
  lat: number | null;
  lon: number | null;
  observed_at: string | null;
  satellite_id: string | null;
  satellite_name: string | null;
  instrument: string | null;
  resolution_m: number | null;
  cloud_cover_pct: number | null;
  caption: string | null;
  media_type: string | null;
}

export interface SeismicEventRow {
  event_id: string;
  source: "usgs" | "emsc";
  external_id: string;
  magnitude: number;
  magnitude_type: "ml" | "mw" | "mb" | "md";
  depth_km: number;
  lat: number;
  lon: number;
  location_name: string;
  country: string | null;
  observed_at: string;
  tsunami_warning: boolean;
  felt_reports: number;
  significant: boolean;
  data_type: "earthquake" | "explosion" | "quarry";
}

export interface VesselPositionRow {
  vessel_id: string;
  source: "marinetraffic" | "vesselfinder";
  imo: string | null;
  vessel_name: string;
  vessel_type: string;
  flag: string | null;
  lat: number;
  lon: number;
  speed_knots: number | null;
  heading_deg: number | null;
  destination: string | null;
  eta: string | null;
  observed_at: string;
}

export interface CustomIntelSourceRow {
  source_id: string;
  source_name: string;
  source_type: string;
  provider: string;
  license: string;
  status: "active" | "inactive" | "error";
  update_cadence_seconds: number;
}

export interface CustomIntelObservationRow {
  intel_id: string;
  source_id: string;
  source_name: string;
  title: string;
  description: string | null;
  severity: "low" | "medium" | "high" | "critical";
  lat: number | null;
  lon: number | null;
  tags: string[];
  received_at: string;
}

export class UniversalDataGateway {
  constructor(private readonly database: PostgresDatabase) {}

  async ping(): Promise<void> {
    await this.database.ping();
  }

  // ============ AVIATION ============

  async persistAviationPositions(positions: AviationPositionRow[]): Promise<void> {
    if (positions.length === 0) return;
    const client = await this.database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM aviation_positions WHERE observed_at < NOW() - INTERVAL '1 hour'",
      );
      for (const p of positions) {
        await client.query(
          `INSERT INTO aviation_positions (id, source, icao24, callsign, origin_country, lat, lon, altitude_m, velocity_mps, heading_deg, vertical_rate_mps, on_ground, squawk, category, observed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (id) DO UPDATE SET lat=EXCLUDED.lat, lon=EXCLUDED.lon, altitude_m=EXCLUDED.altitude_m, velocity_mps=EXCLUDED.velocity_mps, heading_deg=EXCLUDED.heading_deg, observed_at=EXCLUDED.observed_at`,
          [
            p.id,
            p.source,
            p.icao24,
            p.callsign,
            p.origin_country,
            p.lat,
            p.lon,
            p.altitude_m,
            p.velocity_mps,
            p.heading_deg,
            p.vertical_rate_mps,
            p.on_ground,
            p.squawk,
            p.category,
            p.observed_at,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async fetchAviationPositions(bounds?: {
    west: number;
    south: number;
    east: number;
    north: number;
  }): Promise<AviationPositionRow[]> {
    const params: unknown[] = [];
    let whereClause = "";
    if (bounds) {
      params.push(bounds.west, bounds.south, bounds.east, bounds.north);
      whereClause = "WHERE lon BETWEEN $1 AND $3 AND lat BETWEEN $2 AND $4";
    }
    const result = await this.database.pool.query(
      `SELECT * FROM aviation_positions ${whereClause} ORDER BY observed_at DESC LIMIT 500`,
      params,
    );
    return result.rows;
  }

  // ============ NEWS ============

  async persistNewsArticles(articles: NewsArticleRow[]): Promise<void> {
    if (articles.length === 0) return;
    const client = await this.database.pool.connect();
    try {
      await client.query("BEGIN");
      for (const a of articles) {
        await client.query(
          `INSERT INTO news_articles (article_id, source, source_name, author, title, description, url, url_to_image, published_at, content, category, country, language, lat, lon, raw_tags)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::text[])
           ON CONFLICT (source, url) DO UPDATE SET title=EXCLUDED.title, published_at=EXCLUDED.published_at`,
          [
            a.article_id,
            a.source,
            a.source_name,
            a.author,
            a.title,
            a.description,
            a.url,
            a.url_to_image,
            a.published_at,
            a.content,
            a.category,
            a.country,
            a.language,
            a.lat,
            a.lon,
            a.raw_tags,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async fetchNewsArticles(input?: {
    category?: string;
    source?: string;
    limit?: number;
  }): Promise<NewsArticleRow[]> {
    let query = "SELECT * FROM news_articles WHERE 1=1";
    const params: unknown[] = [];
    let idx = 1;
    if (input?.category) {
      query += ` AND category = $${idx++}`;
      params.push(input.category);
    }
    if (input?.source) {
      query += ` AND source = $${idx++}`;
      params.push(input.source);
    }
    query += ` ORDER BY published_at DESC LIMIT $${idx}`;
    params.push(input?.limit ?? 50);
    const result = await this.database.pool.query(query, params);
    return result.rows;
  }

  // ============ WEATHER ============

  async persistWeatherObservations(observations: WeatherObservationRow[]): Promise<void> {
    if (observations.length === 0) return;
    const client = await this.database.pool.connect();
    try {
      await client.query("BEGIN");
      for (const o of observations) {
        await client.query(
          `INSERT INTO weather_observations (observation_id, source, station_id, lat, lon, observed_at, temperature_c, feels_like_c, humidity_pct, pressure_hpa, wind_speed_mps, wind_deg, wind_gust_mps, visibility_m, cloud_cover_pct, weather_condition, weather_icon, precipitation_1h_mm, precipitation_3h_mm, uv_index, air_quality_index, payload)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'{}'::jsonb)
           ON CONFLICT (source, station_id, observed_at) DO UPDATE SET temperature_c=EXCLUDED.temperature_c, humidity_pct=EXCLUDED.humidity_pct, wind_speed_mps=EXCLUDED.wind_speed_mps`,
          [
            o.observation_id,
            o.source,
            o.station_id,
            o.lat,
            o.lon,
            o.observed_at,
            o.temperature_c,
            o.feels_like_c,
            o.humidity_pct,
            o.pressure_hpa,
            o.wind_speed_mps,
            o.wind_deg,
            o.wind_gust_mps,
            o.visibility_m,
            o.cloud_cover_pct,
            o.weather_condition,
            o.weather_icon,
            o.precipitation_1h_mm,
            o.precipitation_3h_mm,
            o.uv_index,
            o.air_quality_index,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async fetchWeatherObservations(): Promise<WeatherObservationRow[]> {
    const result = await this.database.pool.query(
      "SELECT DISTINCT ON (lat, lon) * FROM weather_observations ORDER BY lat, lon, observed_at DESC",
    );
    return result.rows;
  }

  // ============ SPACE ============

  async persistSpaceData(items: SpaceDataRow[]): Promise<void> {
    if (items.length === 0) return;
    for (const item of items) {
      await this.database.pool.query(
        `INSERT INTO space_data (id, source, data_type, title, description, url, thumbnail_url, lat, lon, observed_at, satellite_id, satellite_name, instrument, resolution_m, cloud_cover_pct, caption, media_type, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'{}'::jsonb)
         ON CONFLICT (source, data_type, url) DO NOTHING`,
        [
          item.id,
          item.source,
          item.data_type,
          item.title,
          item.description,
          item.url,
          item.thumbnail_url,
          item.lat,
          item.lon,
          item.observed_at,
          item.satellite_id,
          item.satellite_name,
          item.instrument,
          item.resolution_m,
          item.cloud_cover_pct,
          item.caption,
          item.media_type,
        ],
      );
    }
  }

  async fetchSpaceData(input?: {
    dataType?: string;
    source?: string;
    limit?: number;
  }): Promise<SpaceDataRow[]> {
    let query = "SELECT * FROM space_data WHERE 1=1";
    const params: unknown[] = [];
    let idx = 1;
    if (input?.dataType) {
      query += ` AND data_type = $${idx++}`;
      params.push(input.dataType);
    }
    if (input?.source) {
      query += ` AND source = $${idx++}`;
      params.push(input.source);
    }
    query += ` ORDER BY observed_at DESC NULLS LAST LIMIT $${idx}`;
    params.push(input?.limit ?? 50);
    const result = await this.database.pool.query(query, params);
    return result.rows;
  }

  // ============ FINANCE ============

  async persistFinancialData(items: FinancialDataRow[]): Promise<void> {
    if (items.length === 0) return;
    for (const item of items) {
      await this.database.pool.query(
        `INSERT INTO financial_data (id, source, symbol, name, asset_type, price_usd, market_cap_usd, volume_24h, change_24h_pct, high_24h, low_24h, timestamp, currency, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'{}'::jsonb)
         ON CONFLICT (source, symbol, timestamp) DO UPDATE SET price_usd=EXCLUDED.price_usd, change_24h_pct=EXCLUDED.change_24h_pct, volume_24h=EXCLUDED.volume_24h`,
        [
          item.id,
          item.source,
          item.symbol,
          item.name,
          item.asset_type,
          item.price_usd,
          item.market_cap_usd,
          item.volume_24h,
          item.change_24h_pct,
          item.high_24h,
          item.low_24h,
          item.timestamp,
          item.currency,
        ],
      );
    }
  }

  async fetchFinancialData(input?: {
    assetType?: string;
    symbol?: string;
    limit?: number;
  }): Promise<FinancialDataRow[]> {
    let query = "SELECT DISTINCT ON (symbol) * FROM financial_data WHERE 1=1";
    const params: unknown[] = [];
    let idx = 1;
    if (input?.assetType) {
      query += ` AND asset_type = $${idx++}`;
      params.push(input.assetType);
    }
    if (input?.symbol) {
      query += ` AND symbol = $${idx++}`;
      params.push(input.symbol);
    }
    query += ` ORDER BY symbol, timestamp DESC`;
    const result = await this.database.pool.query(query, params);
    return result.rows;
  }

  // ============ SOCIAL ============

  async persistSocialPosts(posts: SocialPostRow[]): Promise<void> {
    if (posts.length === 0) return;
    for (const p of posts) {
      await this.database.pool.query(
        `INSERT INTO social_posts (post_id, source, external_id, author, author_display_name, subreddit, title, body, url, score, num_comments, upvote_ratio, created_utc, permalink, thumbnail, lat, lon, tags, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::text[],'{}'::jsonb)
         ON CONFLICT (source, external_id) DO UPDATE SET score=EXCLUDED.score, num_comments=EXCLUDED.num_comments`,
        [
          p.post_id,
          p.source,
          p.external_id,
          p.author,
          p.author_display_name,
          p.subreddit,
          p.title,
          p.body,
          p.url,
          p.score,
          p.num_comments,
          p.upvote_ratio,
          p.created_utc,
          p.permalink,
          p.thumbnail,
          p.lat,
          p.lon,
          p.tags,
        ],
      );
    }
  }

  async fetchSocialPosts(input?: { source?: string; limit?: number }): Promise<SocialPostRow[]> {
    let query = "SELECT * FROM social_posts WHERE 1=1";
    const params: unknown[] = [];
    let idx = 1;
    if (input?.source) {
      query += ` AND source = $${idx++}`;
      params.push(input.source);
    }
    query += ` ORDER BY score DESC LIMIT $${idx}`;
    params.push(input?.limit ?? 50);
    const result = await this.database.pool.query(query, params);
    return result.rows;
  }

  // ============ SECURITY ============

  async persistThreatIntel(items: ThreatIntelRow[]): Promise<void> {
    if (items.length === 0) return;
    for (const item of items) {
      await this.database.pool.query(
        `INSERT INTO threat_intel (id, source, ip_address, domain, port, protocol, threat_type, threat_category, confidence, severity, is_whitelisted, country_code, lat, lon, isp, org, abuse_confidence, last_reported_at, total_reports, description, tags, first_seen, last_seen)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::text[],$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::text[],$22,$23)
         ON CONFLICT (source, ip_address, domain, last_seen) DO UPDATE SET confidence=EXCLUDED.confidence, last_reported_at=EXCLUDED.last_reported_at`,
        [
          item.id,
          item.source,
          item.ip_address,
          item.domain,
          item.port,
          item.protocol,
          item.threat_type,
          item.threat_category,
          item.confidence,
          item.severity,
          item.is_whitelisted,
          item.country_code,
          item.lat,
          item.lon,
          item.isp,
          item.org,
          item.abuse_confidence,
          item.last_reported_at,
          item.total_reports,
          item.description,
          item.tags,
          item.first_seen,
          item.last_seen,
        ],
      );
    }
  }

  async fetchThreatIntel(input?: {
    severity?: string;
    source?: string;
    limit?: number;
  }): Promise<ThreatIntelRow[]> {
    let query = "SELECT * FROM threat_intel WHERE 1=1";
    const params: unknown[] = [];
    let idx = 1;
    if (input?.severity) {
      query += ` AND severity = $${idx++}`;
      params.push(input.severity);
    }
    if (input?.source) {
      query += ` AND source = $${idx++}`;
      params.push(input.source);
    }
    query += ` ORDER BY confidence DESC LIMIT $${idx}`;
    params.push(input?.limit ?? 50);
    const result = await this.database.pool.query(query, params);
    return result.rows;
  }

  // ============ SEISMIC ============

  async persistSeismicEvents(events: SeismicEventRow[]): Promise<void> {
    if (events.length === 0) return;
    for (const e of events) {
      await this.database.pool.query(
        `INSERT INTO seismic_events (event_id, source, external_id, magnitude, magnitude_type, depth_km, lat, lon, location_name, country, observed_at, tsunami_warning, felt_reports, significant, data_type, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'{}'::jsonb)
         ON CONFLICT (source, external_id, observed_at) DO UPDATE SET magnitude=EXCLUDED.magnitude, felt_reports=EXCLUDED.felt_reports`,
        [
          e.event_id,
          e.source,
          e.external_id,
          e.magnitude,
          e.magnitude_type,
          e.depth_km,
          e.lat,
          e.lon,
          e.location_name,
          e.country,
          e.observed_at,
          e.tsunami_warning,
          e.felt_reports,
          e.significant,
          e.data_type,
        ],
      );
    }
  }

  async fetchSeismicEvents(input?: {
    minMagnitude?: number;
    source?: string;
    bounds?: { west: number; south: number; east: number; north: number };
    limit?: number;
  }): Promise<SeismicEventRow[]> {
    const params: unknown[] = [];
    let whereClause = "WHERE 1=1";
    let idx = 1;

    if (input?.minMagnitude !== undefined) {
      whereClause += ` AND magnitude >= $${idx++}`;
      params.push(input.minMagnitude);
    }
    if (input?.source) {
      whereClause += ` AND source = $${idx++}`;
      params.push(input.source);
    }
    if (input?.bounds) {
      whereClause += ` AND lon BETWEEN $${idx++} AND $${idx++} AND lat BETWEEN $${idx++} AND $${idx++}`;
      params.push(input.bounds.west, input.bounds.east, input.bounds.south, input.bounds.north);
    }

    const query = `SELECT * FROM seismic_events ${whereClause} ORDER BY observed_at DESC LIMIT $${idx}`;
    params.push(input?.limit ?? 100);

    const result = await this.database.pool.query(query, params);
    return result.rows;
  }

  // ============ VESSEL POSITIONS ============

  async persistVesselPositions(positions: VesselPositionRow[]): Promise<void> {
    if (positions.length === 0) return;
    for (const p of positions) {
      await this.database.pool.query(
        `INSERT INTO vessel_positions (vessel_id, source, imo, vessel_name, vessel_type, flag, lat, lon, speed_knots, heading_deg, destination, eta, observed_at, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'{}'::jsonb)
         ON CONFLICT (vessel_id, observed_at) DO UPDATE SET lat=EXCLUDED.lat, lon=EXCLUDED.lon, speed_knots=EXCLUDED.speed_knots, heading_deg=EXCLUDED.heading_deg`,
        [
          p.vessel_id,
          p.source,
          p.imo,
          p.vessel_name,
          p.vessel_type,
          p.flag,
          p.lat,
          p.lon,
          p.speed_knots,
          p.heading_deg,
          p.destination,
          p.eta,
          p.observed_at,
        ],
      );
    }
  }

  async fetchVesselPositions(input?: {
    bounds?: { west: number; south: number; east: number; north: number };
    flag?: string;
    vesselType?: string;
    limit?: number;
  }): Promise<VesselPositionRow[]> {
    const params: unknown[] = [];
    let whereClause = "WHERE 1=1";
    let idx = 1;

    if (input?.bounds) {
      whereClause += ` AND lon BETWEEN $${idx++} AND $${idx++} AND lat BETWEEN $${idx++} AND $${idx++}`;
      params.push(input.bounds.west, input.bounds.east, input.bounds.south, input.bounds.north);
    }
    if (input?.flag) {
      whereClause += ` AND flag = $${idx++}`;
      params.push(input.flag);
    }
    if (input?.vesselType) {
      whereClause += ` AND vessel_type = $${idx++}`;
      params.push(input.vesselType);
    }

    const query = `SELECT * FROM vessel_positions ${whereClause} ORDER BY observed_at DESC LIMIT $${idx}`;
    params.push(input?.limit ?? 100);

    const result = await this.database.pool.query(query, params);
    return result.rows;
  }

  // ============ CUSTOM INTEL ============

  async persistCustomIntelSources(sources: CustomIntelSourceRow[]): Promise<void> {
    if (sources.length === 0) return;
    for (const s of sources) {
      await this.database.pool.query(
        `INSERT INTO custom_intel_sources (source_id, source_name, source_type, provider, license, status, update_cadence_seconds, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'{}'::jsonb)
         ON CONFLICT (source_id) DO UPDATE SET source_name=EXCLUDED.source_name, status=EXCLUDED.status`,
        [
          s.source_id,
          s.source_name,
          s.source_type,
          s.provider,
          s.license,
          s.status,
          s.update_cadence_seconds,
        ],
      );
    }
  }

  async persistCustomIntelObservations(observations: CustomIntelObservationRow[]): Promise<void> {
    if (observations.length === 0) return;
    for (const o of observations) {
      await this.database.pool.query(
        `INSERT INTO custom_intel_observations (intel_id, source_id, source_name, title, description, severity, lat, lon, tags, metadata, received_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::text[],'{}'::jsonb,$10)
         ON CONFLICT (intel_id) DO UPDATE SET title=EXCLUDED.title, severity=EXCLUDED.severity, tags=EXCLUDED.tags`,
        [
          o.intel_id,
          o.source_id,
          o.source_name,
          o.title,
          o.description,
          o.severity,
          o.lat,
          o.lon,
          o.tags,
          o.received_at,
        ],
      );
    }
  }

  async fetchCustomIntelSources(): Promise<CustomIntelSourceRow[]> {
    const result = await this.database.pool.query(
      "SELECT * FROM custom_intel_sources WHERE status = 'active' ORDER BY source_name",
    );
    return result.rows;
  }

  async fetchCustomIntel(input?: {
    sourceId?: string;
    severity?: string;
    limit?: number;
  }): Promise<CustomIntelObservationRow[]> {
    const params: unknown[] = [];
    let whereClause = "WHERE 1=1";
    let idx = 1;

    if (input?.sourceId) {
      whereClause += ` AND source_id = $${idx++}`;
      params.push(input.sourceId);
    }
    if (input?.severity) {
      whereClause += ` AND severity = $${idx++}`;
      params.push(input.severity);
    }

    const query = `SELECT * FROM custom_intel_observations ${whereClause} ORDER BY received_at DESC LIMIT $${idx}`;
    params.push(input?.limit ?? 50);

    const result = await this.database.pool.query(query, params);
    return result.rows;
  }

  // ============ DATA SOURCE REGISTRY ============

  async updateDataSourceRegistryStatus(
    sourceId: string,
    status: string,
    error?: string,
  ): Promise<void> {
    await this.database.pool.query(
      `UPDATE data_source_registry SET status = $2, last_fetch_at = NOW(), last_error = $3, updated_at = NOW() WHERE source_id = $1`,
      [sourceId, status, error ?? null],
    );
  }

  async getDataSourceRegistry(): Promise<
    Array<{
      source_id: string;
      category: string;
      display_name: string;
      status: string;
      last_fetch_at: string | null;
      last_error: string | null;
      update_cadence_seconds: number;
    }>
  > {
    const result = await this.database.pool.query(
      "SELECT source_id, category, display_name, status, last_fetch_at, last_error, update_cadence_seconds FROM data_source_registry ORDER BY category, source_id",
    );
    return result.rows;
  }
}
