-- Migration: Incident Capture Jobs and Evidence Freeze
-- Adds tables for source snapshotting and evidence preservation

BEGIN;

-- Capture jobs table
CREATE TABLE capture_jobs (
  capture_job_id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  snapshot_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  freeze_status TEXT NOT NULL DEFAULT 'none' CHECK (freeze_status IN ('none', 'partial', 'frozen')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  CHECK (
    (status = 'pending' AND started_at IS NULL AND ended_at IS NULL) OR
    (status IN ('running', 'completed', 'failed', 'cancelled') AND started_at IS NOT NULL)
  )
);

CREATE INDEX capture_jobs_incident_idx ON capture_jobs (incident_id);
CREATE INDEX capture_jobs_status_idx ON capture_jobs (status);
CREATE INDEX capture_jobs_source_idx ON capture_jobs (source_type);
CREATE INDEX capture_jobs_freeze_idx ON capture_jobs (freeze_status);

-- Capture snapshots table
CREATE TABLE capture_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  capture_job_id TEXT NOT NULL REFERENCES capture_jobs(capture_job_id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  external_id TEXT,
  observed_at TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL,
  frozen BOOLEAN NOT NULL DEFAULT FALSE,
  frozen_at TIMESTAMPTZ,
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX capture_snapshots_job_idx ON capture_snapshots (capture_job_id);
CREATE INDEX capture_snapshots_source_idx ON capture_snapshots (source_type, observed_at);
CREATE INDEX capture_snapshots_frozen_idx ON capture_snapshots (frozen) WHERE frozen = TRUE;

-- Evidence freeze table
CREATE TABLE evidence_freeze (
  freeze_id TEXT PRIMARY KEY,
  capture_job_id TEXT NOT NULL REFERENCES capture_jobs(capture_job_id) ON DELETE RESTRICT,
  incident_id TEXT NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  freeze_status TEXT NOT NULL CHECK (freeze_status IN ('none', 'partial', 'frozen')),
  total_snapshots INTEGER NOT NULL DEFAULT 0,
  frozen_snapshots INTEGER NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL,
  source_name TEXT NOT NULL,
  frozen_by TEXT NOT NULL,
  frozen_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX evidence_freeze_incident_idx ON evidence_freeze (incident_id);
CREATE INDEX evidence_freeze_job_idx ON evidence_freeze (capture_job_id);
CREATE INDEX evidence_freeze_status_idx ON evidence_freeze (freeze_status);

-- Function to update capture job snapshot count
CREATE OR REPLACE FUNCTION update_capture_job_snapshot_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE capture_jobs SET snapshot_count = snapshot_count + 1 WHERE capture_job_id = NEW.capture_job_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE capture_jobs SET snapshot_count = snapshot_count - 1 WHERE capture_job_id = OLD.capture_job_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER capture_snapshots_count_trigger
  AFTER INSERT OR DELETE ON capture_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_capture_job_snapshot_count();

-- Function to update freeze statistics when snapshots are frozen
CREATE OR REPLACE FUNCTION update_freeze_statistics()
RETURNS TRIGGER AS $$
DECLARE
  v_total INTEGER;
  v_frozen INTEGER;
  v_freeze_status TEXT;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE frozen = TRUE)
  INTO v_total, v_frozen
  FROM capture_snapshots
  WHERE capture_job_id = NEW.capture_job_id;
  
  IF v_frozen = 0 THEN
    v_freeze_status := 'none';
  ELSIF v_frozen < v_total THEN
    v_freeze_status := 'partial';
  ELSE
    v_freeze_status := 'frozen';
  END IF;
  
  UPDATE capture_jobs SET freeze_status = v_freeze_status WHERE capture_job_id = NEW.capture_job_id;
  UPDATE evidence_freeze SET 
    frozen_snapshots = v_frozen,
    total_snapshots = v_total,
    freeze_status = v_freeze_status
  WHERE capture_job_id = NEW.capture_job_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER capture_snapshots_freeze_trigger
  AFTER UPDATE OF frozen ON capture_snapshots
  FOR EACH ROW
  WHEN (OLD.frozen IS DISTINCT FROM NEW.frozen)
  EXECUTE FUNCTION update_freeze_statistics();

-- View for incident capture status
CREATE OR REPLACE VIEW incident_capture_status_view AS
SELECT
  i.incident_id,
  COUNT(cj.capture_job_id) AS total_jobs,
  COUNT(cj.capture_job_id) FILTER (WHERE cj.status = 'completed') AS completed_jobs,
  COUNT(cj.capture_job_id) FILTER (WHERE cj.status = 'running') AS active_jobs,
  COUNT(cj.capture_job_id) FILTER (WHERE cj.status = 'failed') AS failed_jobs,
  COALESCE(SUM(cj.snapshot_count), 0) AS total_snapshots,
  CASE WHEN COUNT(ef.freeze_id) FILTER (WHERE ef.freeze_status = 'frozen') > 0 THEN TRUE ELSE FALSE END AS has_frozen_evidence,
  ARRAY_AGG(DISTINCT cj.source_type) FILTER (WHERE cj.status = 'completed') AS sources_captured,
  ARRAY_AGG(DISTINCT cj.source_type) FILTER (WHERE cj.freeze_status = 'frozen') AS sources_frozen
FROM incidents i
LEFT JOIN capture_jobs cj ON i.incident_id = cj.incident_id
LEFT JOIN evidence_freeze ef ON i.incident_id = ef.incident_id
GROUP BY i.incident_id;

-- View for capture job detail with snapshots
CREATE OR REPLACE VIEW capture_job_detail_view AS
SELECT
  cj.capture_job_id,
  cj.incident_id,
  cj.source_type,
  cj.status,
  cj.started_at,
  cj.ended_at,
  cj.snapshot_count,
  cj.error_code,
  cj.error_message,
  cj.freeze_status,
  cj.created_at,
  cj.created_by,
  ef.freeze_id,
  ef.freeze_status AS evidence_freeze_status,
  ef.frozen_by,
  ef.frozen_at,
  ef.notes
FROM capture_jobs cj
LEFT JOIN evidence_freeze ef ON cj.capture_job_id = ef.capture_job_id;

COMMIT;
