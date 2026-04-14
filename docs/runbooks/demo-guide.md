# Demo Guide

This guide walks you through demonstrating the Chrona Twin platform's key features.

## Prerequisites

1. Start PostgreSQL with PostGIS:
   ```bash
   # Using Docker
   docker run -d -e POSTGRES_PASSWORD=password -e POSTGRES_DB=chrona -p 5432:5432 postgis/postgis
   ```

2. Install and run:
   ```bash
   npm install
   npm run validate
   npm run api:dev
   ```
   
   In another terminal:
   ```bash
   npm run web:dev
   ```

3. Open `http://127.0.0.1:3001` in your browser

---

## Demo 1: Basic Replay

**Objective**: Show how to load and play historical events

**Steps**:
1. Ensure you're in Replay mode (default)
2. Default time window shows: `2026-04-05T10:15:00Z` to `2026-04-05T10:16:00Z`
3. Default object ID: `veh_42`
4. Click **Load Replay**
5. Observe:
   - Status message shows "Loaded X replay item(s)"
   - Timeline slider becomes active
   - Map shows object marker
   - Track polyline appears
6. Click **Play** to watch the replay animate
7. Use **Step** to advance one event at a time

**Key Points**:
- Deterministic - same query always returns same results
- Timeline controls allow manual scrubbing
- Map reflects position at each event

---

## Demo 2: Live Monitoring

**Objective**: Show real-time object tracking

**Steps**:
1. Click **Live** button in the Mode section
2. Observe:
   - Status changes to "Live feed connected"
   - Connection status shows green "Connected"
   - Map shows current object positions
3. Ingest test data (from another terminal):
   ```bash
   curl -X POST http://127.0.0.1:3000/ingest/fixture-telemetry \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $(node -e "console.log(require('./packages/auth').authenticate('operator','operator123').token)")" \
     -d @packages/test-fixtures/fixtures/adapters/fixture-telemetry/valid.request.json
   ```
4. Watch the map update with new positions
5. Click **Replay** to return to historical mode

**Key Points**:
- SSE provides real-time updates
- Auto-reconnect handles connection drops
- Latest state is bootstrapped on connect

---

## Demo 3: Alert Investigation

**Objective**: Show how to investigate alerts and jump to replay

**Steps**:
1. Login as operator:
   - Click **Login**
   - Username: `operator`
   - Password: `operator123`
   - Click **Sign In**
2. The Alerts panel shows open alerts
3. Click an alert to see details:
   - Alert summary and severity
   - Explanation and rule that triggered
   - Triggering events (clickable)
   - Related objects
4. Click an event ID to see full event data:
   - Position, velocity, source
5. Click **Jump to Replay**:
   - Time window auto-fills to ±5 minutes around alert
   - Object ID auto-fills
6. Click **Load Replay** to investigate

**Key Points**:
- Evidence chain links alerts to events
- One-click jump to relevant replay window
- Event detail shows complete context

---

## Demo 4: Alert Workflow (Acknowledge & Close)

**Objective**: Show operator workflow for managing alerts

**Steps**:
1. Login as operator (if not already)
2. Find an open alert in the list
3. Click the alert to open detail
4. Click **Acknowledge**:
   - Alert status changes to "acknowledged"
   - Badge updates in alert list
5. Click **Close Alert**:
   - Alert is closed
   - Returns to alert list

**Key Points**:
- Operators can acknowledge and close alerts
- Viewers cannot modify alert status
- Audit log tracks all changes

---

## Demo 5: Multi-Object Alert

**Objective**: Show alerts that span multiple objects

**Steps**:
1. Create a test alert with multiple objects (via API):
   ```bash
   # First login to get token
   TOKEN=$(curl -s -X POST http://127.0.0.1:3000/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"operator","password":"operator123"}' | jq -r .token)
   
   # Create alert with multiple objects
   curl -X POST http://127.0.0.1:3000/alerts/test_multi \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{
       "rule_id": "source_error",
       "severity": "critical",
       "evidence_event_ids": ["evt_1", "evt_2"],
       "evidence_object_ids": ["veh_42", "veh_43", "veh_44"],
       "summary": "Multi-object test alert",
       "explanation": "Test",
       "confidence": 0.99
     }'
   ```
2. Refresh the web page
3. Click the multi-object alert
4. Observe the object dropdown selector
5. Select different objects and click **Go**
6. Map shows the selected object's track

**Key Points**:
- Alerts can span multiple objects
- Dropdown allows investigating each object
- Time window remains focused on alert period

---

## Demo 6: Session Management

**Objective**: Show authentication and session features

**Steps**:
1. Login as operator
2. Note the session shows "operator (operator)"
3. Reload the page (F5)
4. Observe session persists (still logged in as operator)
5. Wait 30+ minutes (token expiration)
6. Reload the page
7. Observe session is cleared (logged out)

**Key Points**:
- Session persists across page reloads
- Token validation on page load
- Expired tokens are cleared automatically

---

## Demo 7: Role-Based Access

**Objective**: Show permission differences between roles

**Steps**:
1. Logout
2. Login as viewer:
   - Username: `viewer`
   - Password: `viewer123`
3. Try to close an alert - button should be hidden
4. Logout
5. Login as operator
6. Close an alert - button is visible

**Key Points**:
- Viewer: read-only access
- Operator: can acknowledge/close alerts
- Admin: full access (same as operator in MVP)

---

## Troubleshooting

### No replay data showing
- Check the time window includes data (default is 2026-04-05)
- Ensure ingestion has run

### Alerts not appearing
- Login as operator (alerts require authentication)
- Check database has alerts table with data

### Connection issues
- Check API server is running on port 3000
- Check Web server is running on port 3001
- Check PostgreSQL is accessible

### Token expired
- Simply login again - tokens expire after 30 minutes
