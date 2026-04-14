# Startup and Shutdown Behavior

## Startup Sequence

1. **Config Validation**
   - Validate DATABASE_URL is set
   - Validate port numbers are in valid range (1-65535)
   - Validate LOG_LEVEL is valid
   - Exit with error if config is invalid

2. **Database Connection**
   - Connect to PostgreSQL using DATABASE_URL
   - Test connection with ping
   - If connection fails, exit with error

3. **Server Initialization**
   - Create HTTP server
   - Register state update callback for live events
   - Start listening on configured port

4. **Log Startup**
   - Log "Starting API server" with masked connection string
   - Log port when bound

## Shutdown Sequence

1. **Signal Handling**
   - Graceful shutdown on SIGTERM/SIGINT
   - Close HTTP server
   - Close database connections

2. **Log Shutdown**
   - Log "Shutting down API server"
   - Log "API server shut down" after cleanup

## Health Checks

### /health
- Always accessible (no auth required)
- Returns 200 if server is running
- Returns 500 if server has critical error

### /ready
- Returns 200 if ready to serve traffic
- Returns 503 if database connection unavailable
- Used by orchestrators (Kubernetes, etc.)

## Failure Modes

| Scenario | Behavior |
|----------|----------|
| No DATABASE_URL | Startup fails with error message |
| Invalid DATABASE_URL | Startup fails with connection error |
| Database unavailable | /ready returns 503 |
| Port in use | Startup fails with EADDRINUSE error |
