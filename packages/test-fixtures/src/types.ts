import type { CanonicalEvent } from "../../contracts/src/models.js";

export interface ReplayIncidentFixture {
  name: string;
  description: string;
  events: CanonicalEvent[];
  expected_event_order: string[];
}
