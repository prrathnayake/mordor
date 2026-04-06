# API App

This app now provides the first narrow runtime slice defined in `docs/05_BACKEND_DESIGN.md`.

Implemented endpoints:
- `GET /health`
- `POST /ingest/fixture-telemetry`
- `POST /replay/query`

Current scope is intentionally limited to deterministic fixture ingest and replay verification. Broader source, object, and alert surfaces remain for later phases.
