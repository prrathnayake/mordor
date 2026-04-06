import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const scanRoots = ["apps", "packages", "scripts", "tests"];
const importPattern =
  /(?:import|export)\s[\s\S]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const directoryEntries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of directoryEntries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

function toRepoPath(absolutePath: string): string {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

function isWithin(absolutePath: string, relativeRoot: string): boolean {
  const normalizedRoot = path.join(repoRoot, relativeRoot);
  return absolutePath === normalizedRoot || absolutePath.startsWith(`${normalizedRoot}${path.sep}`);
}

function extractImportSpecifiers(sourceText: string): string[] {
  const specifiers = new Set<string>();

  for (const match of sourceText.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];

    if (specifier) {
      specifiers.add(specifier);
    }
  }

  return [...specifiers];
}

function resolveRelativeSpecifier(filePath: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }

  return path.resolve(path.dirname(filePath), specifier);
}

function isCorePackage(filePath: string): boolean {
  return [
    "packages/contracts",
    "packages/domain",
    "packages/replay",
    "packages/ingestion",
    "packages/persistence",
    "packages/alerting",
    "packages/analytics",
    "packages/adapters",
  ].some((root) => isWithin(filePath, root));
}

async function main(): Promise<void> {
  const files = (
    await Promise.all(scanRoots.map((root) => collectTypeScriptFiles(path.join(repoRoot, root))))
  ).flat();

  const errors: string[] = [];

  for (const file of files) {
    const sourceText = await readFile(file, "utf8");
    const specifiers = extractImportSpecifiers(sourceText);

    for (const specifier of specifiers) {
      const resolvedTarget = resolveRelativeSpecifier(file, specifier);

      if (!resolvedTarget) {
        continue;
      }

      if (isWithin(file, "packages") && isWithin(resolvedTarget, "apps")) {
        errors.push(
          `${toRepoPath(file)} imports ${specifier}, but packages may not depend on app entrypoints`,
        );
      }

      if (isWithin(file, "packages") && isWithin(resolvedTarget, "tests")) {
        errors.push(
          `${toRepoPath(file)} imports ${specifier}, but production packages may not depend on tests`,
        );
      }

      if (isCorePackage(file) && isWithin(resolvedTarget, "packages/ui-components")) {
        errors.push(
          `${toRepoPath(file)} imports ${specifier}, but core packages may not depend on UI components`,
        );
      }

      if (
        (isWithin(file, "apps/web") || isWithin(file, "packages/ui-components")) &&
        isWithin(resolvedTarget, "packages/adapters")
      ) {
        errors.push(
          `${toRepoPath(file)} imports ${specifier}, but frontend code may not couple directly to adapters`,
        );
      }

      if (isWithin(file, "apps/web") && isWithin(resolvedTarget, "apps/api")) {
        errors.push(
          `${toRepoPath(file)} imports ${specifier}, but web code must not depend directly on API implementation files`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Architecture boundary violations detected:\n- ${errors.join("\n- ")}`);
  }

  console.log(`Verified architecture boundaries across ${files.length} TypeScript files.`);
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
