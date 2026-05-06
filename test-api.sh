#!/bin/bash
set -e

API_BASE="http://localhost:3000"
TOKEN=""
PASSED=0
FAILED=0

run_test() {
  local name="$1"
  local expected="$2"
  shift 2
  local actual
  actual=$(curl -s -o /dev/null -w "%{http_code}" "$@")

  if [ "$actual" = "$expected" ]; then
    echo "PASS  $name ($actual)"
    PASSED=$((PASSED + 1))
  else
    echo "FAIL  $name (expected $expected, got $actual)"
    FAILED=$((FAILED + 1))
  fi
}

echo "========================================"
echo "Chrona Twin API Comprehensive Test"
echo "========================================"
echo ""

# Login
echo "--- Authenticating ---"
AUTH_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}')
TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  echo "FATAL: Failed to login"
  exit 1
fi
echo "Token acquired"
echo ""

# Health & Readiness
echo "--- Health & Readiness ---"
run_test "GET /health" "200" -X GET "$API_BASE/health"
run_test "GET /ready" "200" -X GET "$API_BASE/ready"
run_test "GET /health/detailed" "200" -X GET "$API_BASE/health/detailed" -H "Authorization: Bearer $TOKEN"
run_test "GET /metrics" "200" -X GET "$API_BASE/metrics" -H "Authorization: Bearer $TOKEN"
run_test "GET /metrics/agents" "200" -X GET "$API_BASE/metrics/agents"
echo ""

# Auth
echo "--- Auth ---"
run_test "POST /auth/validate" "200" -X POST "$API_BASE/auth/validate" -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}"
run_test "POST /auth/logout" "200" -X POST "$API_BASE/auth/logout" -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\"}"
# Re-login after logout
AUTH_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}')
TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo ""

# State
echo "--- State ---"
run_test "GET /state/latest" "200" -X GET "$API_BASE/state/latest" -H "Authorization: Bearer $TOKEN"
run_test "GET /state/tracks/:id" "200" -X GET "$API_BASE/state/tracks/veh_42" -H "Authorization: Bearer $TOKEN"
echo ""

# Ingest
echo "--- Ingest ---"
run_test "POST /ingest/fixture-telemetry" "200" -X POST "$API_BASE/ingest/fixture-telemetry" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d @packages/test-fixtures/fixtures/adapters/fixture-telemetry/valid.request.json
run_test "POST /ingest/camera-observation" "200" -X POST "$API_BASE/ingest/camera-observation" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d @packages/test-fixtures/fixtures/adapters/camera-observation/valid.request.json
echo ""

# Events
echo "--- Events ---"
run_test "GET /events/:id" "200" -X GET "$API_BASE/events/evt_veh_42_20260405T101530Z_position_observed" -H "Authorization: Bearer $TOKEN"
echo ""

# Replay
echo "--- Replay ---"
run_test "POST /replay/query" "200" -X POST "$API_BASE/replay/query" -H "Content-Type: application/json" -d '{"start_at":"2026-04-05T00:00:00Z","end_at":"2026-04-05T23:59:59Z"}'
echo ""

# Layers
echo "--- Layers ---"
run_test "GET /layers" "200" -X GET "$API_BASE/layers"
run_test "GET /layers/:id" "200" -X GET "$API_BASE/layers/earthquakes"
run_test "GET /layers/:id/data" "200" -X GET "$API_BASE/layers/earthquakes/data"
run_test "POST /layers/:id/refresh" "200" -X POST "$API_BASE/layers/earthquakes/refresh" -H "Authorization: Bearer $TOKEN"
echo ""

# Incidents
echo "--- Incidents ---"
run_test "GET /incidents" "200" -X GET "$API_BASE/incidents" -H "Authorization: Bearer $TOKEN"
# Create incident
INCIDENT_RESPONSE=$(curl -s -X POST "$API_BASE/incidents" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"title":"Test Incident","start_at":"2026-05-01T00:00:00Z","end_at":"2026-05-02T00:00:00Z","severity":"high"}')
INCIDENT_ID=$(echo "$INCIDENT_RESPONSE" | grep -o '"incident_id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$INCIDENT_ID" ]; then
  echo "PASS  POST /incidents (created $INCIDENT_ID)"
  PASSED=$((PASSED + 1))
else
  echo "FAIL  POST /incidents"
  FAILED=$((FAILED + 1))
fi
run_test "GET /incidents/:id" "200" -X GET "$API_BASE/incidents/$INCIDENT_ID" -H "Authorization: Bearer $TOKEN"
run_test "GET /incidents/:id/timeline" "200" -X GET "$API_BASE/incidents/$INCIDENT_ID/timeline" -H "Authorization: Bearer $TOKEN"
run_test "GET /incidents/:id/chapters" "200" -X GET "$API_BASE/incidents/$INCIDENT_ID/chapters" -H "Authorization: Bearer $TOKEN"
run_test "GET /incidents/:id/links" "200" -X GET "$API_BASE/incidents/$INCIDENT_ID/links" -H "Authorization: Bearer $TOKEN"
run_test "GET /incidents/:id/evidence" "200" -X GET "$API_BASE/incidents/$INCIDENT_ID/evidence" -H "Authorization: Bearer $TOKEN"
run_test "GET /incidents/:id/capture-status" "200" -X GET "$API_BASE/incidents/$INCIDENT_ID/capture-status" -H "Authorization: Bearer $TOKEN"
run_test "GET /incidents/:id/intelligence" "200" -X GET "$API_BASE/incidents/$INCIDENT_ID/intelligence" -H "Authorization: Bearer $TOKEN"
echo ""

# Capture Jobs
echo "--- Capture Jobs ---"
CJ_RESPONSE=$(curl -s -X POST "$API_BASE/incidents/$INCIDENT_ID/capture-jobs" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"source_type":"flights"}')
CJ_ID=$(echo "$CJ_RESPONSE" | grep -o '"capture_job_id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$CJ_ID" ]; then
  echo "PASS  POST /incidents/:id/capture-jobs (created $CJ_ID)"
  PASSED=$((PASSED + 1))
else
  echo "FAIL  POST /incidents/:id/capture-jobs"
  FAILED=$((FAILED + 1))
fi
run_test "GET /incidents/:id/capture-jobs" "200" -X GET "$API_BASE/incidents/$INCIDENT_ID/capture-jobs" -H "Authorization: Bearer $TOKEN"
run_test "GET /capture-jobs/:id" "200" -X GET "$API_BASE/capture-jobs/$CJ_ID" -H "Authorization: Bearer $TOKEN"
run_test "GET /capture-jobs/:id/snapshots" "200" -X GET "$API_BASE/capture-jobs/$CJ_ID/snapshots" -H "Authorization: Bearer $TOKEN"
echo ""

# SWAN
echo "--- SWAN ---"
run_test "POST /swan/session" "201" -X POST "$API_BASE/swan/session" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"client_session_id":"test-session-final","context":{"route":"/test"}}'
run_test "GET /swan/session" "200" -X GET "$API_BASE/swan/session?client_session_id=test-session-final" -H "Authorization: Bearer $TOKEN"
run_test "POST /swan/activity" "202" -X POST "$API_BASE/swan/activity" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"client_session_id":"test-session-final","activity_type":"object_selected","target_type":"object","target_id":"test-123"}'
run_test "GET /swan/findings" "200" -X GET "$API_BASE/swan/findings?client_session_id=test-session-final" -H "Authorization: Bearer $TOKEN"
run_test "DELETE /swan/session" "200" -X DELETE "$API_BASE/swan/session?client_session_id=test-session-final" -H "Authorization: Bearer $TOKEN"
echo ""

# News & Intelligence
echo "--- News & Intelligence ---"
run_test "GET /news" "200" -X GET "$API_BASE/news" -H "Authorization: Bearer $TOKEN"
run_test "GET /news/feeds" "200" -X GET "$API_BASE/news/feeds" -H "Authorization: Bearer $TOKEN"
run_test "GET /news/realtime" "200" -X GET "$API_BASE/news/realtime"
run_test "GET /news/clips" "200" -X GET "$API_BASE/news/clips?limit=5" -H "Authorization: Bearer $TOKEN"
run_test "GET /intelligence/sources" "200" -X GET "$API_BASE/intelligence/sources" -H "Authorization: Bearer $TOKEN"
run_test "GET /webcams" "200" -X GET "$API_BASE/webcams" -H "Authorization: Bearer $TOKEN"
run_test "GET /tv-channels" "200" -X GET "$API_BASE/tv-channels" -H "Authorization: Bearer $TOKEN"
echo ""

# Sources
echo "--- Sources ---"
run_test "GET /sources" "200" -X GET "$API_BASE/sources" -H "Authorization: Bearer $TOKEN"
run_test "GET /health/sources" "200" -X GET "$API_BASE/health/sources"
run_test "GET /sources/nearest-to-point" "404" -X GET "$API_BASE/sources/nearest-to-point?lat=40.7128&lon=-74.006" -H "Authorization: Bearer $TOKEN"
echo ""

# Inferences
echo "--- Inferences ---"
run_test "GET /inferences" "200" -X GET "$API_BASE/inferences" -H "Authorization: Bearer $TOKEN"
run_test "GET /inferences/timeline" "200" -X GET "$API_BASE/inferences/timeline" -H "Authorization: Bearer $TOKEN"
run_test "POST /inferences" "201" -X POST "$API_BASE/inferences" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"inference_type":"anomaly","time_window_start":"2026-04-01T00:00:00Z","time_window_end":"2026-04-02T00:00:00Z","evidence_summary":"Test inference","details":{"confidence":0.85}}'
run_test "GET /degradation-zones" "200" -X GET "$API_BASE/degradation-zones" -H "Authorization: Bearer $TOKEN"
echo ""

# Insights
echo "--- Insights ---"
run_test "GET /insights" "200" -X GET "$API_BASE/insights" -H "Authorization: Bearer $TOKEN"
echo ""

# Correlations
echo "--- Correlations ---"
run_test "GET /correlations" "200" -X GET "$API_BASE/correlations" -H "Authorization: Bearer $TOKEN"
echo ""

# Web Frontend
echo "--- Web Frontend ---"
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/")
if [ "$WEB_STATUS" = "200" ]; then
  echo "PASS  GET http://localhost:3001/ (200)"
  PASSED=$((PASSED + 1))
else
  echo "FAIL  GET http://localhost:3001/ (expected 200, got $WEB_STATUS)"
  FAILED=$((FAILED + 1))
fi
WEB_JS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/app.js")
if [ "$WEB_JS" = "200" ]; then
  echo "PASS  GET http://localhost:3001/app.js (200)"
  PASSED=$((PASSED + 1))
else
  echo "FAIL  GET http://localhost:3001/app.js (expected 200, got $WEB_JS)"
  FAILED=$((FAILED + 1))
fi
WEB_CSS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/styles.css")
if [ "$WEB_CSS" = "200" ]; then
  echo "PASS  GET http://localhost:3001/styles.css (200)"
  PASSED=$((PASSED + 1))
else
  echo "FAIL  GET http://localhost:3001/styles.css (expected 200, got $WEB_CSS)"
  FAILED=$((FAILED + 1))
fi
echo ""

echo "========================================"
echo "TEST RESULTS"
echo "========================================"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo "========================================"

if [ "$FAILED" -eq 0 ]; then
  echo "ALL TESTS PASSED"
  exit 0
else
  echo "SOME TESTS FAILED"
  exit 1
fi
