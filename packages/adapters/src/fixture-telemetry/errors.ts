export class FixtureTelemetryAdapterError extends Error {
  constructor(
    public readonly code: "PayloadMalformed" | "SchemaMismatch" | "NormalizationFailed",
    message: string,
  ) {
    super(message);
    this.name = "FixtureTelemetryAdapterError";
  }
}
