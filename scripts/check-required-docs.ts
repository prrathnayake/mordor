import { stat } from "node:fs/promises";
import path from "node:path";

const requiredFiles = [
  "docs/00_INDEX.md",
  "docs/10_IMPLEMENTATION_PLAN.md",
  "docs/11_TEST_STRATEGY.md",
  "docs/12_HARD_GATES_AND_COMPLIANCE.md",
  "docs/14_AGENT_VIBE_CODING_RULES.md",
  "docs/adr/0001-modular-monolith.md",
  "docs/adr/0002-canonical-event-contract-baseline.md",
  "docs/adr/0003-technology-baseline.md",
  "docs/plans/00_EXECUTION_BASELINE.md",
  "infra/migrations/0001_initial_schema.sql",
  "packages/contracts/schemas/source.schema.json",
  "packages/contracts/schemas/tracked-object.schema.json",
  "packages/contracts/schemas/canonical-event.schema.json",
  "packages/contracts/schemas/object-state.schema.json",
  "packages/contracts/schemas/alert.schema.json",
];

const requiredDirectories = [
  "apps/api",
  "apps/api/src",
  "apps/web",
  "apps/web/src",
  "apps/worker",
  "apps/worker/src",
  "packages/adapters",
  "packages/contracts",
  "packages/domain",
  "packages/ingestion",
  "packages/persistence",
  "packages/replay",
  "packages/test-fixtures",
  "infra/migrations",
  "tests/unit",
  "tests/integration",
  "tests/contract",
  "tests/replay",
  "tests/e2e",
  "scripts",
  ".github/workflows",
];

async function pathExists(relativePath: string): Promise<boolean> {
  try {
    await stat(path.join(process.cwd(), relativePath));
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const missing: string[] = [];

  for (const relativePath of [...requiredFiles, ...requiredDirectories]) {
    if (!(await pathExists(relativePath))) {
      missing.push(relativePath);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required repo bootstrap assets:\n- ${missing.join("\n- ")}`);
  }

  console.log(
    `Verified required bootstrap docs and skeleton assets (${requiredFiles.length} files, ${requiredDirectories.length} directories).`,
  );
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
