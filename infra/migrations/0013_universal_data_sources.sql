-- Migration: Universal Data Sources
-- Adds tables for all information source categories

BEGIN;

-- =====================================================
-- AVIATION DATA
-- =====================================================

CREATE TABLE aviation_positions (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('opensky', 'adsb_lol')),
  icao24 TEXT NOT NULL,
  callsign TEXT NULL,
  origin_country TEXT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  altitude_m DOUBLE PRECISION NULL,
  velocity_mps DOUBLE PRECISION NULL,
  heading_deg DOUBLE PRECISION NULL,
  vertical_rate_mps DOUBLE PRECISION NULL,
  on_ground BOOLEAN NOT NULL DEFAULT false,
  squawk TEXT NULL,
  category INT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX aviation_positions_source_idx ON aviation_positions (source, observed_at DESC);
CREATE INDEX aviation_positions_icao24_idx ON aviation_positions (icao24, observed_at DESC);
CREATE INDEX aviation_positions_geom_idx ON aviation_positions USING GIST (ST_SetSRID(ST_MakePoint(lon, lat), 4326));

-- =====================================================
-- NEWS & INTELLIGENCE DATA
-- =====================================================

CREATE TABLE news_articles (
  article_id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('newsapi', 'mediastack', 'gdelt')),
  source_name TEXT NOT NULL,
  author TEXT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  url_to_image TEXT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  content TEXT NULL,
  category TEXT NULL,
  country TEXT NULL,
  language TEXT NULL,
  lat DOUBLE PRECISION NULL,
  lon DOUBLE PRECISION NULL,
  raw_tags TEXT[] NOT NULL DEFAULT '{}',
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, url)
);

CREATE INDEX news_articles_source_idx ON news_articles (source, published_at DESC);
CREATE INDEX news_articles_published_idx ON news_articles (published_at DESC);
CREATE INDEX news_articles_category_idx ON news_articles (category);
CREATE INDEX news_articles_geom_idx ON news_articles USING GIST (ST_SetSRID(ST_MakePoint(lon, lat), 4326));

-- =====================================================
-- WEATHER & ENVIRONMENTAL DATA
-- =====================================================

CREATE TABLE weather_observations (
  observation_id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('openweathermap', 'noaa')),
  station_id TEXT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  temperature_c DOUBLE PRECISION NULL,
  feels_like_c DOUBLE PRECISION NULL,
  humidity_pct DOUBLE PRECISION NULL,
  pressure_hpa DOUBLE PRECISION NULL,
  wind_speed_mps DOUBLE PRECISION NULL,
  wind_deg DOUBLE PRECISION NULL,
  wind_gust_mps DOUBLE PRECISION NULL,
  visibility_m INT NULL,
  cloud_cover_pct INT NULL,
  weather_condition TEXT NULL,
  weather_icon TEXT NULL,
  precipitation_1h_mm DOUBLE PRECISION NULL,
  precipitation_3h_mm DOUBLE PRECISION NULL,
  uv_index DOUBLE PRECISION NULL,
  air_quality_index INT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, station_id, observed_at)
);

CREATE INDEX weather_observations_source_idx ON weather_observations (source, observed_at DESC);
CREATE INDEX weather_observations_geom_idx ON weather_observations USING GIST (ST_SetSRID(ST_MakePoint(lon, lat), 4326));

-- =====================================================
-- WEATHER ALERTS
-- =====================================================

CREATE TABLE weather_alerts (
  alert_id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('noaa', 'openweathermap')),
  event_type TEXT NOT NULL,
  headline TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  severity TEXT NULL,
  urgency TEXT NULL,
  area_desc TEXT NULL,
  lat DOUBLE PRECISION NULL,
  lon DOUBLE PRECISION NULL,
  radius_km DOUBLE PRECISION NULL,
  polygon_geojson JSONB NULL,
  effective_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, issued_at, headline)
);

CREATE INDEX weather_alerts_source_idx ON weather_alerts (source, issued_at DESC);
CREATE INDEX weather_alerts_geom_idx ON weather_alerts USING GIST (ST_SetSRID(ST_MakePoint(lon, lat), 4326));

-- =====================================================
-- SPACE & SATELLITE DATA
-- =====================================================

CREATE TABLE space_data (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('nasa', 'sentinel_hub', 'celestrak')),
  data_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  url TEXT NULL,
  thumbnail_url TEXT NULL,
  lat DOUBLE PRECISION NULL,
  lon DOUBLE PRECISION NULL,
  observed_at TIMESTAMPTZ NULL,
  satellite_id TEXT NULL,
  satellite_name TEXT NULL,
  instrument TEXT NULL,
  resolution_m DOUBLE PRECISION NULL,
  cloud_cover_pct DOUBLE PRECISION NULL,
  caption TEXT NULL,
  media_type TEXT NULL CHECK (media_type IN ('image', 'video', 'dataset', 'event', 'near_earth_object', 'mars_photo')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, data_type, url)
);

CREATE INDEX space_data_source_idx ON space_data (source, observed_at DESC);
CREATE INDEX space_data_type_idx ON space_data (data_type, observed_at DESC);
CREATE INDEX space_data_geom_idx ON space_data USING GIST (ST_SetSRID(ST_MakePoint(lon, lat), 4326));

-- =====================================================
-- FINANCIAL & ECONOMIC DATA
-- =====================================================

CREATE TABLE financial_data (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('alpha_vantage', 'fred', 'coingecko')),
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('stock', 'crypto', 'economic_indicator', 'exchange_rate', 'commodity')),
  price_usd DOUBLE PRECISION NULL,
  market_cap_usd DOUBLE PRECISION NULL,
  volume_24h DOUBLE PRECISION NULL,
  change_24h_pct DOUBLE PRECISION NULL,
  high_24h DOUBLE PRECISION NULL,
  low_24h DOUBLE PRECISION NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, symbol, timestamp)
);

CREATE INDEX financial_data_source_idx ON financial_data (source, timestamp DESC);
CREATE INDEX financial_data_symbol_idx ON financial_data (symbol, timestamp DESC);
CREATE INDEX financial_data_type_idx ON financial_data (asset_type, timestamp DESC);

-- =====================================================
-- SOCIAL MEDIA DATA
-- =====================================================

CREATE TABLE social_posts (
  post_id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('reddit', 'bluesky')),
  external_id TEXT NOT NULL,
  author TEXT NOT NULL,
  author_display_name TEXT NULL,
  subreddit TEXT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  url TEXT NULL,
  score INT NOT NULL DEFAULT 0,
  num_comments INT NOT NULL DEFAULT 0,
  upvote_ratio DOUBLE PRECISION NULL,
  created_utc TIMESTAMPTZ NOT NULL,
  permalink TEXT NULL,
  thumbnail TEXT NULL,
  lat DOUBLE PRECISION NULL,
  lon DOUBLE PRECISION NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_id)
);

CREATE INDEX social_posts_source_idx ON social_posts (source, created_utc DESC);
CREATE INDEX social_posts_score_idx ON social_posts (score DESC);
CREATE INDEX social_posts_created_idx ON social_posts (created_utc DESC);
CREATE INDEX social_posts_geom_idx ON social_posts USING GIST (ST_SetSRID(ST_MakePoint(lon, lat), 4326));

-- =====================================================
-- SECURITY / THREAT INTELLIGENCE DATA
-- =====================================================

CREATE TABLE threat_intel (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('abuseipdb', 'otx', 'shodan')),
  ip_address TEXT NULL,
  domain TEXT NULL,
  port INT NULL,
  protocol TEXT NULL,
  threat_type TEXT NULL,
  threat_category TEXT[] NOT NULL DEFAULT '{}',
  confidence INT NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 100),
  severity TEXT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_whitelisted BOOLEAN NOT NULL DEFAULT false,
  country_code TEXT NULL,
  lat DOUBLE PRECISION NULL,
  lon DOUBLE PRECISION NULL,
  isp TEXT NULL,
  org TEXT NULL,
  abuse_confidence INT NULL CHECK (abuse_confidence IS NULL OR (abuse_confidence >= 0 AND abuse_confidence <= 100)),
  last_reported_at TIMESTAMPTZ NULL,
  total_reports INT NULL,
  description TEXT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  first_seen TIMESTAMPTZ NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, ip_address, domain, last_seen)
);

CREATE INDEX threat_intel_source_idx ON threat_intel (source, last_seen DESC);
CREATE INDEX threat_intel_severity_idx ON threat_intel (severity, last_seen DESC);
CREATE INDEX threat_intel_confidence_idx ON threat_intel (confidence DESC);
CREATE INDEX threat_intel_geom_idx ON threat_intel USING GIST (ST_SetSRID(ST_MakePoint(lon, lat), 4326));
CREATE INDEX threat_intel_ip_idx ON threat_intel (ip_address);

-- =====================================================
-- UTILITY / REFERENCE DATA
-- =====================================================

CREATE TABLE utility_data (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('rest_countries', 'ipinfo')),
  data_type TEXT NOT NULL,
  query_key TEXT NOT NULL,
  value JSONB NOT NULL,
  lat DOUBLE PRECISION NULL,
  lon DOUBLE PRECISION NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, data_type, query_key)
);

CREATE INDEX utility_data_source_idx ON utility_data (source, data_type);

-- =====================================================
-- GLOBAL DATA SOURCE REGISTRY
-- =====================================================

CREATE TABLE data_source_registry (
  source_id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN (
    'aviation', 'news', 'weather', 'space', 'maps',
    'finance', 'social', 'security', 'utility', 'intelligence'
  )),
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL,
  base_url TEXT NULL,
  api_key_required BOOLEAN NOT NULL DEFAULT false,
  rate_limit_requests_per_min INT NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
  last_fetch_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  update_cadence_seconds INT NOT NULL DEFAULT 300,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX data_source_registry_category_idx ON data_source_registry (category, status);

-- =====================================================
-- SEED DEFAULT DATA SOURCE CONFIGURATIONS
-- =====================================================

INSERT INTO data_source_registry (source_id, category, display_name, description, provider, base_url, api_key_required, rate_limit_requests_per_min, update_cadence_seconds, status, config) VALUES
  ('opensky', 'aviation', 'OpenSky Network', 'Live flight tracking via ADS-B transponders', 'OpenSky Network', 'https://opensky-network.org/api', false, 10, 60, 'active', '{"limit": 500}'),
  ('adsb_lol', 'aviation', 'ADSB.lol', 'Open aviation tracking network', 'ADSB.lol', 'https://api.adsb.lol', false, 30, 60, 'active', '{}'),
  ('newsapi', 'news', 'NewsAPI', 'Headlines from thousands of news sources', 'NewsAPI', 'https://newsapi.org/v2', true, 100, 600, 'inactive', '{"max_articles": 50}'),
  ('mediastack', 'news', 'MediaStack', 'Global news feeds with JSON API', 'MediaStack', 'http://api.mediastack.com/v1', true, 100, 600, 'inactive', '{"max_articles": 50}'),
  ('gdelt', 'intelligence', 'GDELT Project', 'Global event and news monitoring', 'GDELT', 'https://api.gdeltproject.org/api/v2', false, 60, 600, 'active', '{"max_records": 10}'),
  ('openweathermap', 'weather', 'OpenWeatherMap', 'Global weather data and forecasts', 'OpenWeatherMap', 'https://api.openweathermap.org/data/2.5', true, 60, 300, 'inactive', '{}'),
  ('noaa', 'weather', 'NOAA Weather', 'Government-grade environmental data', 'NOAA/NWS', 'https://api.weather.gov', false, 30, 600, 'active', '{}'),
  ('nasa', 'space', 'NASA APIs', 'Space imagery, astronomy, Mars rover photos', 'NASA', 'https://api.nasa.gov', true, 30, 3600, 'inactive', '{"max_items": 10}'),
  ('sentinel_hub', 'space', 'Sentinel Hub', 'Earth observation satellite imagery', 'ESA/Sentinel Hub', 'https://services.sentinel-hub.com', true, 10, 86400, 'inactive', '{}'),
  ('alpha_vantage', 'finance', 'Alpha Vantage', 'Stock and financial market data', 'Alpha Vantage', 'https://www.alphavantage.co/query', true, 5, 3600, 'inactive', '{"symbols": ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA"]}'),
  ('fred', 'finance', 'FRED Economic Data', 'Federal Reserve macroeconomic indicators', 'Federal Reserve Bank of St. Louis', 'https://api.stlouisfed.org/fred', true, 120, 86400, 'inactive', '{"series": ["GDP", "UNRATE", "CPI", "FEDFUNDS"]}'),
  ('coingecko', 'finance', 'CoinGecko', 'Cryptocurrency market data', 'CoinGecko', 'https://api.coingecko.com/api/v3', false, 10, 300, 'active', '{"coins": ["bitcoin", "ethereum", "solana"]}'),
  ('reddit', 'social', 'Reddit API', 'Community discussions and sentiment', 'Reddit', 'https://www.reddit.com', false, 30, 600, 'active', '{"subreddits": ["worldnews", "technology", "space", "science"]}'),
  ('bluesky', 'social', 'Bluesky Social', 'Real-time decentralized social firehose', 'Bluesky', 'https://public.api.bsky.app', false, 30, 300, 'active', '{}'),
  ('abuseipdb', 'security', 'AbuseIPDB', 'Malicious IP reputation database', 'AbuseIPDB', 'https://api.abuseipdb.com/api/v2', true, 30, 3600, 'inactive', '{"max_age_days": 30}'),
  ('otx', 'security', 'AlienVault OTX', 'Open threat intelligence platform', 'AlienVault', 'https://otx.alienvault.com/api/v1', true, 10, 3600, 'inactive', '{}'),
  ('shodan', 'security', 'Shodan', 'Internet-wide device scanning', 'Shodan', 'https://api.shodan.io', true, 1, 86400, 'inactive', '{}'),
  ('rest_countries', 'utility', 'REST Countries', 'Country data (flags, currencies, languages)', 'REST Countries', 'https://restcountries.com/v3.1', false, 30, 86400, 'active', '{}'),
  ('ipinfo', 'utility', 'IPInfo', 'IP geolocation and network information', 'IPInfo', 'https://ipinfo.io', true, 50000, 86400, 'inactive', '{}');

INSERT INTO external_data_layers (layer_id, source_name, source_url, license, update_cadence_seconds, status) VALUES
  ('aviation', 'OpenSky / ADSB.lol', 'https://opensky-network.org', 'Open Data', 60, 'real'),
  ('space', 'NASA / Sentinel Hub', 'https://api.nasa.gov', 'Public Domain', 3600, 'real'),
  ('finance', 'Alpha Vantage / FRED / CoinGecko', 'https://www.alphavantage.co', 'Various APIs', 300, 'degraded'),
  ('social', 'Reddit / Bluesky', 'https://www.reddit.com', 'Platform APIs', 300, 'real'),
  ('security', 'AbuseIPDB / OTX / Shodan', 'https://www.abuseipdb.com', 'Various APIs', 3600, 'degraded'),
  ('news', 'NewsAPI / MediaStack / GDELT', 'https://newsapi.org', 'Various APIs', 600, 'real'),
  ('weather', 'OpenWeatherMap / NOAA', 'https://openweathermap.org', 'Various APIs', 300, 'real'),
  ('utility', 'REST Countries / IPInfo', 'https://restcountries.com', 'Open Data', 86400, 'real')
ON CONFLICT (layer_id) DO NOTHING;

COMMIT;
