import { startApiServer } from "../../apps/api/src/index.js";
import { authenticate } from "../../packages/auth/src/index.js";
import type { IncidentIntelligenceCollector } from "../../packages/intelligence/src/index.js";
import { startPostgresTestEnvironment } from "./postgres-test-environment.js";

export interface AuthenticatedTestSetup {
  api: Awaited<ReturnType<typeof startApiServer>>;
  environment: Awaited<ReturnType<typeof startPostgresTestEnvironment>>;
  authToken: string;
  operatorToken: string;
  adminToken: string;
}

export async function setupAuthenticatedApi(input?: {
  incidentIntelligenceCollectors?: IncidentIntelligenceCollector[];
}): Promise<AuthenticatedTestSetup> {
  const environment = await startPostgresTestEnvironment();
  const api = await startApiServer({
    connection_string: environment.connection_string,
    skipConfigValidation: true,
    incidentIntelligenceCollectors: input?.incidentIntelligenceCollectors,
  });

  const viewerAuth = authenticate("viewer", "viewer123");
  const operatorAuth = authenticate("operator", "operator123");
  const adminAuth = authenticate("admin", "admin123");

  return {
    api,
    environment,
    authToken: viewerAuth.token ?? "",
    operatorToken: operatorAuth.token ?? "",
    adminToken: adminAuth.token ?? "",
  };
}

export async function teardownAuthenticatedApi(
  setup: AuthenticatedTestSetup | null | undefined,
): Promise<void> {
  if (!setup) {
    return;
  }

  await setup.api.close();
  await setup.environment.stop();
}
