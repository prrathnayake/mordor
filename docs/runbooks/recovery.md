# Failure and Recovery

## Common Failure Scenarios

### Database Connection Failure

**Symptoms:**
- API server fails to start
- /health returns error
- /ready returns 503

**Recovery:**
1. Verify DATABASE_URL is correct
2. Verify PostgreSQL is running
3. Verify database exists
4. Verify PostGIS extension is enabled
5. Restart API server

### Authentication Failures

**Symptoms:**
- 401 Unauthorized responses
- Login attempts failing

**Recovery:**
1. Check auth logs for attempt details
2. Verify correct credentials (viewer:viewer123, operator:operator123, admin:admin123)
3. Token may be invalid/expired - re-authenticate

### Ingest Failures

**Symptoms:**
- 400 Bad Request on ingest endpoints
- Events not appearing in replay

**Recovery:**
1. Check validation issues in response
2. Verify input payload matches expected schema
3. Check quarantine table for rejected records:
```sql
SELECT * FROM raw_payloads WHERE parse_status = 'quarantined';
```

### Live Connection Failures

**Symptoms:**
- Live feed disconnected
- Connection status shows "Disconnected"

**Recovery:**
1. Check /health endpoint
2. Verify server is running
3. Refresh browser or reconnect SSE
4. Check browser console for errors

## Backup and Recovery

### Database Backup

```bash
# Backup entire database
pg_dump -U user -h localhost chronadb > backup.sql

# Backup with compression
pg_dump -U user -h localhost -Fc chronadb > backup.dump
```

### Database Restore

```bash
# Restore from SQL dump
psql -U user -h localhost chronadb < backup.sql

# Restore from compressed dump
pg_restore -U user -h localhost -d chronadb backup.dump
```

### Monitoring

Key metrics to monitor:
- /health endpoint latency
- Database connection pool usage
- Ingest success/failure rates
- Alert generation rates

## Log Analysis

Structured logs are JSON. Filter by level:
```bash
# Error logs only
grep '"level":"error"' /var/log/chronadb.log

# Auth attempts
grep 'Auth login' /var/log/chronadb.log

# Ingest operations
grep 'Ingest' /var/log/chronadb.log
```
