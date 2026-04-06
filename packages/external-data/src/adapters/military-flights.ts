/**
 * Military Flights Adapter
 *
 * Status: UNAVAILABLE
 *
 * No legitimate open source exists for real-time military aircraft positions.
 * While ADS-B Exchange provides data, tracking military aircraft raises
 * legal and ethical concerns that make it unsuitable for this system.
 *
 * This adapter serves as a placeholder that explicitly marks the layer
 * as unavailable with an honest explanation.
 */

import type { ExternalDataSource, FetchResult } from "../types.js";

/**
 * Military Flights Adapter (Unavailable)
 */
export class MilitaryFlightsAdapter {
  readonly source: ExternalDataSource = {
    layerId: "military",
    label: "Military Flights",
    provider: "N/A",
    license: "N/A",
    status: "unavailable",
    updateCadenceSeconds: 0,
    toggleable: false,
  };

  /**
   * Always returns unavailable status.
   */
  async fetch(): Promise<FetchResult> {
    return {
      success: false,
      events: [],
      error:
        "No legitimate open source available for real-time military aircraft positions. ADS-B data for military aircraft raises legal and ethical concerns.",
      fetchedAt: new Date().toISOString(),
      durationMs: 0,
    };
  }

  /**
   * Get explanation for unavailability.
   */
  getUnavailabilityReason(): string {
    return `Military aircraft tracking is intentionally unavailable for the following reasons:

1. NO LEGITIMATE OPEN SOURCE: There is no publicly documented, legally usable API for real-time military aircraft positions.

2. LEGAL CONCERNS: Tracking military aircraft may violate:
   - National security laws in various jurisdictions
   - Terms of service of available flight tracking services
   - Aviation safety regulations

3. ETHICAL CONCERNS: Publishing military aircraft locations could:
   - Compromise operational security
   - Endanger personnel
   - Violate privacy and safety protocols

4. DATA INTEGRITY: Any "military flight" data from unofficial sources would be:
   - Unverifiable
   - Potentially spoofed or falsified
   - In violation of data provider terms

This layer remains as a placeholder to document this intentional limitation.
If a legitimate, lawful source becomes available in the future, this adapter can be updated.`;
  }
}

/**
 * Create a military flights adapter instance.
 */
export function createMilitaryFlightsAdapter(): MilitaryFlightsAdapter {
  return new MilitaryFlightsAdapter();
}
