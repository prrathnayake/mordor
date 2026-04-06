import type { CanonicalEvent, ObjectState } from "../../contracts/src/models.js";

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertStatus = "open" | "acknowledged" | "closed";

export interface AlertRule {
  rule_id: string;
  name: string;
  evaluate: (event: CanonicalEvent, state: ObjectState | null) => AlertEvaluationResult | null;
}

export interface AlertEvaluationResult {
  should_alert: boolean;
  severity: AlertSeverity;
  summary: string;
  explanation: string;
  evidence_event_ids: string[];
  evidence_object_ids: string[];
  confidence: number;
}

export const ALERT_SCHEMA_VERSION = "1.0.0";

export function createAlertRuleId(ruleId: string, timestamp: string): string {
  const ts = timestamp.replace(/[-:]/g, "").replace(".000", "");
  return `alert_${ruleId}_${ts}`;
}

export function evaluateObjectStaleRule(
  event: CanonicalEvent,
  state: ObjectState | null,
): AlertEvaluationResult | null {
  if (!state) return null;

  const lastEventTime = new Date(state.as_of).getTime();
  const currentEventTime = new Date(event.observed_at).getTime();
  const staleThresholdMs = 5 * 60 * 1000;

  if (currentEventTime - lastEventTime > staleThresholdMs) {
    return {
      should_alert: true,
      severity: "warning",
      summary: `Object ${state.object_id} has not reported for over 5 minutes`,
      explanation: `The last event for object ${state.object_id} was at ${state.as_of}, and the current event is at ${event.observed_at}. This indicates the object may be stationary, out of range, or experiencing communication issues.`,
      evidence_event_ids: [event.event_id, state.last_event_id],
      evidence_object_ids: [state.object_id],
      confidence: 0.85,
    };
  }

  return null;
}

export function evaluateSourceErrorRule(
  event: CanonicalEvent,
  _state: ObjectState | null,
): AlertEvaluationResult | null {
  if (event.event_type === "source_error") {
    return {
      should_alert: true,
      severity: "critical",
      summary: `Source ${event.source_id} reported an error`,
      explanation: `Source ${event.source_id} generated an error event at ${event.observed_at}. The error payload: ${JSON.stringify(event.payload)}`,
      evidence_event_ids: [event.event_id],
      evidence_object_ids: event.related_object_ids ?? [],
      confidence: 0.99,
    };
  }

  return null;
}

export function evaluateSourceDisconnectedRule(
  event: CanonicalEvent,
  _state: ObjectState | null,
): AlertEvaluationResult | null {
  if (event.event_type === "source_disconnected") {
    return {
      should_alert: true,
      severity: "critical",
      summary: `Source ${event.source_id} disconnected`,
      explanation: `Source ${event.source_id} disconnected at ${event.observed_at}. This may indicate a hardware failure, network issue, or intentional shutdown.`,
      evidence_event_ids: [event.event_id],
      evidence_object_ids: [],
      confidence: 0.95,
    };
  }

  return null;
}

export function evaluateLowSpeedRule(
  event: CanonicalEvent,
  _state: ObjectState | null,
): AlertEvaluationResult | null {
  if (event.event_type === "position_observed" && typeof event.speed_mps === "number") {
    const speedMph = event.speed_mps * 2.237;
    if (speedMph < 0.5 && event.speed_mps > 0) {
      return {
        should_alert: true,
        severity: "info",
        summary: `Object ${event.object_id} moving at very low speed`,
        explanation: `Object ${event.object_id} is moving at ${speedMph.toFixed(1)} mph (${event.speed_mps.toFixed(1)} m/s), which is below the typical minimum threshold. This may indicate congestion, a temporary stop, or a slow-moving object.`,
        evidence_event_ids: [event.event_id],
        evidence_object_ids: [event.object_id],
        confidence: 0.7,
      };
    }
  }

  return null;
}

export const ALERT_RULES: AlertRule[] = [
  {
    rule_id: "object_stale",
    name: "Object Stale Detection",
    evaluate: evaluateObjectStaleRule,
  },
  {
    rule_id: "source_error",
    name: "Source Error Detection",
    evaluate: evaluateSourceErrorRule,
  },
  {
    rule_id: "source_disconnected",
    name: "Source Disconnection Detection",
    evaluate: evaluateSourceDisconnectedRule,
  },
  {
    rule_id: "low_speed",
    name: "Low Speed Detection",
    evaluate: evaluateLowSpeedRule,
  },
];

export function evaluateEventForAlerts(
  event: CanonicalEvent,
  state: ObjectState | null,
): AlertEvaluationResult[] {
  const results: AlertEvaluationResult[] = [];

  for (const rule of ALERT_RULES) {
    const result = rule.evaluate(event, state);
    if (result?.should_alert) {
      results.push(result);
    }
  }

  return results;
}
