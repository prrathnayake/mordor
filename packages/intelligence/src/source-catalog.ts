export type IntelligenceSourceType =
  | "hazard"
  | "atmosphere"
  | "space"
  | "maritime"
  | "media"
  | "cyber"
  | "health";

export type IntelligenceStorageTarget =
  | "external_data_events"
  | "source_registry"
  | "source_snapshots"
  | "intelligence_media_observations";

export interface IntelligenceSourceCatalogEntry {
  readonly source_id: string;
  readonly layer_id: string;
  readonly source_type: IntelligenceSourceType;
  readonly label: string;
  readonly provider: string;
  readonly source_url: string;
  readonly license: string;
  readonly status: "real" | "degraded" | "planned";
  readonly update_cadence_seconds: number;
  readonly lat: number | null;
  readonly lon: number | null;
  readonly coverage: "global" | "regional" | "point" | "non_map";
  readonly normalized_event_type: string;
  readonly storage_targets: readonly IntelligenceStorageTarget[];
  readonly watch_capabilities: readonly string[];
  readonly useful_fields: readonly string[];
  readonly ui_layer: string;
  readonly ui_summary: string;
  readonly embed_url?: string;
  readonly video_id?: string;
}

export const INTELLIGENCE_SOURCE_CATALOG: readonly IntelligenceSourceCatalogEntry[] = [
  {
    source_id: "nasa-eonet-open-events",
    layer_id: "natural_hazards",
    source_type: "hazard",
    label: "Natural Event Tracker",
    provider: "NASA EONET",
    source_url: "https://eonet.gsfc.nasa.gov/api/v3/events",
    license: "NASA open data",
    status: "real",
    update_cadence_seconds: 900,
    lat: 0,
    lon: -30,
    coverage: "global",
    normalized_event_type: "natural_hazard_observed",
    storage_targets: ["external_data_events"],
    watch_capabilities: ["wildfire", "storm", "volcano", "dust", "event imagery"],
    useful_fields: ["id", "title", "categories", "geometry", "sources", "closed"],
    ui_layer: "Hazards",
    ui_summary: "Near-real-time global natural events with source imagery links.",
  },
  {
    source_id: "gdacs-global-disasters",
    layer_id: "global_disasters",
    source_type: "hazard",
    label: "Global Disaster Alerts",
    provider: "GDACS",
    source_url: "https://www.gdacs.org/xml/rss.xml",
    license: "Attribution requested",
    status: "real",
    update_cadence_seconds: 360,
    lat: 10,
    lon: 20,
    coverage: "global",
    normalized_event_type: "disaster_alert_observed",
    storage_targets: ["external_data_events"],
    watch_capabilities: ["earthquake", "cyclone", "flood", "volcano", "severity alert"],
    useful_fields: ["eventid", "eventtype", "alertlevel", "country", "fromdate", "todate"],
    ui_layer: "Disasters",
    ui_summary: "Global sudden-onset disaster alerts for operational triage.",
  },
  {
    source_id: "nasa-firms-active-fire",
    layer_id: "wildfire_thermal",
    source_type: "hazard",
    label: "Active Fire Hotspots",
    provider: "NASA FIRMS",
    source_url: "https://firms.modaps.eosdis.nasa.gov/",
    license: "NASA open data; API key may be required",
    status: "planned",
    update_cadence_seconds: 10800,
    lat: 36.7,
    lon: -119.8,
    coverage: "global",
    normalized_event_type: "fire_hotspot_observed",
    storage_targets: ["external_data_events"],
    watch_capabilities: ["thermal anomaly", "fire confidence", "satellite instrument"],
    useful_fields: ["latitude", "longitude", "brightness", "confidence", "frp", "acq_date"],
    ui_layer: "Wildfires",
    ui_summary: "Thermal hotspot layer for fires, explosions, and heat anomalies.",
  },
  {
    source_id: "openaq-global-air-quality",
    layer_id: "air_quality",
    source_type: "atmosphere",
    label: "Air Quality Measurements",
    provider: "OpenAQ",
    source_url: "https://api.openaq.org/v3/",
    license: "OpenAQ terms and source-provider terms",
    status: "planned",
    update_cadence_seconds: 1800,
    lat: 48.85,
    lon: 2.35,
    coverage: "global",
    normalized_event_type: "air_quality_observed",
    storage_targets: ["external_data_events"],
    watch_capabilities: ["PM2.5", "PM10", "NO2", "O3", "sensor health"],
    useful_fields: ["parameter", "value", "unit", "datetime", "sensor_id", "location"],
    ui_layer: "Atmosphere",
    ui_summary: "Global air quality readings for hazard and health context.",
  },
  {
    source_id: "noaa-swpc-space-weather",
    layer_id: "space_weather",
    source_type: "space",
    label: "Space Weather Alerts",
    provider: "NOAA SWPC",
    source_url: "https://services.swpc.noaa.gov/json/",
    license: "Public domain",
    status: "planned",
    update_cadence_seconds: 300,
    lat: null,
    lon: null,
    coverage: "non_map",
    normalized_event_type: "space_weather_observed",
    storage_targets: ["source_snapshots"],
    watch_capabilities: ["geomagnetic storm", "radio blackout", "solar radiation", "Kp index"],
    useful_fields: ["issue_datetime", "message", "scale", "kp", "product_id"],
    ui_layer: "Space Weather",
    ui_summary: "Non-map alert strip for GNSS, comms, and power-grid risk.",
  },
  {
    source_id: "celestrak-gp-active",
    layer_id: "satellites",
    source_type: "space",
    label: "Active Satellite GP Data",
    provider: "CelesTrak",
    source_url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json",
    license: "Public data; respect CelesTrak cadence guidance",
    status: "real",
    update_cadence_seconds: 7200,
    lat: 0,
    lon: 0,
    coverage: "global",
    normalized_event_type: "satellite_position_observed",
    storage_targets: ["external_data_events"],
    watch_capabilities: ["orbit propagation", "NORAD id", "object class", "track replay"],
    useful_fields: ["NORAD_CAT_ID", "OBJECT_NAME", "EPOCH", "MEAN_MOTION", "INCLINATION"],
    ui_layer: "Orbital",
    ui_summary: "Live orbital objects and replayable satellite positions.",
  },
  {
    source_id: "usgs-earthquake-geojson",
    layer_id: "earthquakes",
    source_type: "hazard",
    label: "Realtime Earthquake GeoJSON",
    provider: "USGS",
    source_url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
    license: "Public domain",
    status: "real",
    update_cadence_seconds: 60,
    lat: 37.09,
    lon: -95.71,
    coverage: "global",
    normalized_event_type: "earthquake_observed",
    storage_targets: ["external_data_events"],
    watch_capabilities: ["magnitude", "depth", "tsunami flag", "alert level", "felt reports"],
    useful_fields: ["mag", "place", "time", "updated", "alert", "tsunami", "geometry"],
    ui_layer: "Seismic",
    ui_summary: "Realtime global earthquake feed with magnitude and impact metadata.",
  },
  {
    source_id: "official-live-watchwall",
    layer_id: "live_video",
    source_type: "media",
    label: "Live Video Watch Wall",
    provider: "Official webcams and public live TV",
    source_url: "https://www.youtube.com/",
    license: "Per-channel terms",
    status: "degraded",
    update_cadence_seconds: 300,
    lat: 40.76,
    lon: -73.98,
    coverage: "point",
    normalized_event_type: "video_source_observed",
    storage_targets: ["source_registry", "intelligence_media_observations"],
    watch_capabilities: [
      "embedded player",
      "live availability",
      "location popup",
      "evidence capture",
    ],
    useful_fields: [
      "video_id",
      "embed_url",
      "channel_id",
      "live_status",
      "tags",
      "last_checked_at",
    ],
    ui_layer: "Live Watch",
    ui_summary: "Embeddable, location-linked video sources for the globe and incident panels.",
    embed_url: "https://www.youtube-nocookie.com/embed/jfKfPfyJRdk",
    video_id: "jfKfPfyJRdk",
  },
  {
    source_id: "maritime-coastal-open-sources",
    layer_id: "maritime_watch",
    source_type: "maritime",
    label: "Maritime and Coastal Watch",
    provider: "NOAA, port feeds, buoy networks",
    source_url: "https://www.ndbc.noaa.gov/",
    license: "Public domain where NOAA; verify partner feeds",
    status: "planned",
    update_cadence_seconds: 600,
    lat: 1.29,
    lon: 103.85,
    coverage: "regional",
    normalized_event_type: "maritime_signal_observed",
    storage_targets: ["external_data_events", "source_registry"],
    watch_capabilities: ["buoys", "marine warnings", "port cameras", "shipping chokepoints"],
    useful_fields: ["station_id", "wave_height", "wind_speed", "warning_type", "source_url"],
    ui_layer: "Maritime",
    ui_summary: "Chokepoint and coastal operations context for ports and sea lanes.",
  },
  {
    source_id: "cisa-known-exploited-vulnerabilities",
    layer_id: "cyber_advisories",
    source_type: "cyber",
    label: "Known Exploited Vulnerabilities",
    provider: "CISA",
    source_url:
      "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    license: "Public domain",
    status: "planned",
    update_cadence_seconds: 86400,
    lat: null,
    lon: null,
    coverage: "non_map",
    normalized_event_type: "cyber_advisory_observed",
    storage_targets: ["source_snapshots"],
    watch_capabilities: ["CVE", "vendor", "product", "due date", "ransomware flag"],
    useful_fields: ["cveID", "vendorProject", "product", "dateAdded", "dueDate"],
    ui_layer: "Cyber",
    ui_summary: "Infrastructure risk layer for asset-linked advisories.",
  },
];

export function getIntelligenceSourceCatalog() {
  const layers = Array.from(
    new Set(INTELLIGENCE_SOURCE_CATALOG.map((source) => source.layer_id)),
  ).map((layerId) => {
    const sources = INTELLIGENCE_SOURCE_CATALOG.filter((source) => source.layer_id === layerId);
    const primary = sources[0];
    return {
      layer_id: layerId,
      label: primary?.ui_layer ?? layerId,
      source_count: sources.length,
      source_types: Array.from(new Set(sources.map((source) => source.source_type))),
      status: sources.some((source) => source.status === "real")
        ? "real"
        : (sources[0]?.status ?? "planned"),
    };
  });

  return {
    generated_at: new Date().toISOString(),
    total_count: INTELLIGENCE_SOURCE_CATALOG.length,
    embeddable_count: INTELLIGENCE_SOURCE_CATALOG.filter((source) => source.embed_url).length,
    layers,
    sources: INTELLIGENCE_SOURCE_CATALOG,
  };
}
