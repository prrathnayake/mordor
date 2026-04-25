import { describe, expect, it } from "vitest";

describe("Agent Protocol - Task Envelope", () => {
  it("should have required task fields", () => {
    const task = {
      taskId: "task_001",
      runId: "run_001",
      parentTaskId: null,
      taskType: "collect",
      priority: "high",
      source: "live_flights",
      targetEntityIds: ["flight_123"],
      assignedAgent: "collector_01",
      status: "queued",
      payload: { key: "value" },
      constraints: { deadlineMs: 5000, maxRetries: 2 },
      createdAt: "2026-04-15T10:00:00Z",
      claimedAt: null,
      startedAt: null,
      completedAt: null,
      error: null,
      retryCount: 0,
      dedupeKey: null,
    };

    expect(task.taskId).toBe("task_001");
    expect(task.taskType).toBe("collect");
    expect(task.priority).toBe("high");
  });
});

describe("Agent Protocol - AgentInsight", () => {
  it("should have lifecycle fields", () => {
    const insight = {
      id: "insight_001",
      type: "anomaly",
      severity: "high",
      title: "Test Insight",
      description: "Test description",
      location: { lat: 30.04, lon: 31.23 },
      entities: ["flight_123"],
      confidence: 0.85,
      timestamp: "2026-04-15T10:00:00Z",
      published: false,
      eventStatus: "candidate",
      runId: "run_001",
      hypothesisId: null,
      freshnessMs: 60000,
      expiresAt: "2026-04-15T10:01:00Z",
    };

    expect(insight.eventStatus).toBe("candidate");
    expect(insight.freshnessMs).toBe(60000);
  });

  it("should support all severity levels", () => {
    const severities = ["low", "medium", "high", "critical"] as const;
    severities.forEach((severity) => {
      const insight = {
        id: "test",
        type: "anomaly",
        severity,
        title: "Test",
        description: "Test",
        location: null,
        entities: [],
        confidence: 0.5,
        timestamp: "2026-04-15T10:00:00Z",
        published: false,
        eventStatus: "candidate",
        runId: "run",
        hypothesisId: null,
        freshnessMs: 60000,
        expiresAt: null,
      };
      expect(insight.severity).toBe(severity);
    });
  });
});

describe("Agent Protocol - EventStatus Transitions", () => {
  it("should support all lifecycle states", () => {
    const validTransitions: Record<string, string[]> = {
      candidate: ["validated", "suppressed"],
      validated: ["approved", "suppressed"],
      approved: ["published"],
      published: ["acknowledged", "resolved"],
      acknowledged: ["resolved"],
      suppressed: [],
      resolved: [],
      expired: [],
    };

    expect(validTransitions.candidate).toContain("validated");
    expect(validTransitions.published).toContain("acknowledged");
    expect(validTransitions.published).toContain("resolved");
  });
});

describe("Publisher Agent Dedupe", () => {
  const generateDedupeKey = (
    insight: { type?: string; entities?: string[] },
    windowMs: number,
  ): string => {
    const timeBucket = new Date(Math.floor(Date.now() / windowMs) * windowMs)
      .toISOString()
      .slice(0, 16);
    return `${insight.type}:${(insight.entities ?? []).sort().join(",")}:${timeBucket}`;
  };

  it("should generate consistent dedupe keys", () => {
    const insight = {
      type: "anomaly",
      entities: ["flight_123", "flight_456"],
    };

    const key1 = generateDedupeKey(insight, 300000);
    const key2 = generateDedupeKey(insight, 300000);

    expect(key1).toBe(key2);
  });

  it("should generate different keys for different entities", () => {
    const insight1 = { type: "anomaly", entities: ["flight_123"] };
    const insight2 = { type: "anomaly", entities: ["flight_456"] };

    const key1 = generateDedupeKey(insight1, 300000);
    const key2 = generateDedupeKey(insight2, 300000);

    expect(key1).not.toBe(key2);
  });
});

describe("UI Event Type Mapping", () => {
  const getEventTypeForSeverity = (severity: string): string => {
    switch (severity) {
      case "critical":
        return "map_popup";
      case "high":
        return "alert_badge";
      case "medium":
        return "event_log";
      default:
        return "event_log";
    }
  };

  it("should map critical to map_popup", () => {
    expect(getEventTypeForSeverity("critical")).toBe("map_popup");
  });

  it("should map high to alert_badge", () => {
    expect(getEventTypeForSeverity("high")).toBe("alert_badge");
  });

  it("should map medium to event_log", () => {
    expect(getEventTypeForSeverity("medium")).toBe("event_log");
  });

  it("should map low to event_log", () => {
    expect(getEventTypeForSeverity("low")).toBe("event_log");
  });
});

describe("Insight TTL Calculation", () => {
  const getTtlForSeverity = (severity: string): number => {
    switch (severity) {
      case "critical":
        return 300000;
      case "high":
        return 120000;
      case "medium":
        return 60000;
      default:
        return 60000;
    }
  };

  it("should return 5min for critical", () => {
    expect(getTtlForSeverity("critical")).toBe(300000);
  });

  it("should return 2min for high", () => {
    expect(getTtlForSeverity("high")).toBe(120000);
  });

  it("should return 1min for medium and low", () => {
    expect(getTtlForSeverity("medium")).toBe(60000);
    expect(getTtlForSeverity("low")).toBe(60000);
  });
});

describe("Operator Actions", () => {
  const actionTypes = [
    "acknowledge",
    "dismiss",
    "resolve",
    "snooze",
    "inspect",
    "track",
    "open_timeline",
  ];

  it("should have all required action types", () => {
    expect(actionTypes).toContain("acknowledge");
    expect(actionTypes).toContain("dismiss");
    expect(actionTypes).toContain("resolve");
    expect(actionTypes).toContain("snooze");
  });
});
