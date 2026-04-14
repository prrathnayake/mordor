# Local Run Instructions

## Prerequisites

- Node.js 24.x
- npm 11+
- PostgreSQL 15+ with PostGIS extension
- a working container runtime if you want to run integration or e2e suites through `testcontainers`

## Environment Setup

1. Set the database connection:
```bash
export DATABASE_URL="postgres://user:password@localhost:5432/chronadb"
```

2. Install dependencies:
```bash
npm ci
```

3. Copy local env defaults if needed:
```bash
cp .env.example .env
```

## Running the API Server

Default API port is `3000`:

```bash
npm run api:dev
```

Custom API port:

```bash
API_PORT=3002 npm run api:dev
```

## Running the Web Server

Default web port is `3001` and the default API target is `http://127.0.0.1:3000`:

```bash
npm run web:dev
```

Custom ports:

```bash
API_PORT=3002 WEB_PORT=3003 API_BASE_URL=http://127.0.0.1:3002 npm run web:dev
```

Sharper globe imagery:

```bash
MAP_IMAGERY_PROVIDER=arcgis-world-imagery npm run web:dev
```

Once the web app is running, use the `MAP SURFACE` buttons in the right rail to switch
between satellite imagery and a street-map view without restarting the app.

Optional close-range scene support:

```bash
STREET_SCENE_PROVIDER=osm-buildings npm run web:dev
```

After selecting an object, use the inspector's `ENTER GROUND VIEW` action to dive the
camera to a low-angle street/ground perspective. The control stays disabled when no
street-scene provider is configured, so the rest of the tactical UI keeps working normally.

## Running the Fixture Worker

```bash
WORKER_INPUT_FILE=./packages/test-fixtures/fixtures/adapters/fixture-telemetry/valid.request.json \
DATABASE_URL="$DATABASE_URL" \
npm run worker:fixture
```

## Running Tests

Full verification:

```bash
npm run validate
```

Focused suites:

```bash
npm run test:unit
npm run test:contract
npm run test:integration
npm run test:replay
npm run test:e2e
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `API_PORT` | No | `3000` | API server port |
| `WEB_PORT` | No | `3001` | Web server port |
| `API_BASE_URL` | No | `http://127.0.0.1:3000` | Browser app target for API requests |
| `MAP_IMAGERY_PROVIDER` | No | `arcgis-world-imagery` | Globe basemap provider: `arcgis-world-imagery`, `osm-street`, or `url-template` |
| `MAP_IMAGERY_URL` | No | provider default | Optional basemap URL override |
| `MAP_IMAGERY_CREDIT` | No | provider default | Optional attribution override for custom tiles |
| `MAP_IMAGERY_MAX_LEVEL` | No | `19` | Maximum zoom level for tile-based imagery |
| `STREET_SCENE_PROVIDER` | No | `none` | Optional close-range 3D scene provider: `none`, `google-photorealistic`, or `osm-buildings` |
| `CESIUM_ION_TOKEN` | No | unset | Optional Cesium ion token for OSM/ion 3D tiles |
| `GOOGLE_MAPS_API_KEY` | No | unset | Optional Google Maps key for photorealistic 3D tiles |
| `LOG_LEVEL` | No | `info` | Logging level |
| `AUTH_ENABLED` | No | `true` | Enable authentication |
| `NODE_ENV` | No | `development` | Runtime environment |
