import type { CanonicalEvent } from "../../contracts/src/models.js";
import type { AlertEvaluationResult, AlertSeverity, AlertStatus } from "./rules.js";

export interface AlertRecord {
  alert_id: string;
  rule_id: string;
  severity: AlertSeverity;
  status: AlertStatus;
  opened_at: string;
  updated_at: string;
  closed_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  schema_version: string;
  evidence_event_ids: string[];
  evidence_object_ids: string[];
  summary: string;
  explanation: string;
  confidence: number;
}

export interface AlertPersistence {
  persistAlert(input: {
    canonical_event: CanonicalEvent;
    rule_id: string;
    evaluation: AlertEvaluationResult;
  }): Promise<AlertRecord>;

  fetchAlerts(input?: {
    status?: AlertStatus;
    severity?: AlertSeverity;
    object_id?: string;
    limit?: number;
  }): Promise<AlertRecord[]>;

  fetchAlert(alertId: string): Promise<AlertRecord | null>;

  updateAlertStatus(input: {
    alert_id: string;
    status: AlertStatus;
    acknowledged_by?: string;
  }): Promise<AlertRecord>;
}

export interface AlertCreatedPayload {
  alert: AlertRecord;
  canonical_event: CanonicalEvent;
}
