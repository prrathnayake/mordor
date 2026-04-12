import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface PreparedSwanArtifact {
  file_path: string;
  checksum: string;
  raw: string;
}

export class SwanArtifactStore {
  constructor(private readonly artifactRoot: string) {}

  resolveSessionDir(sessionId: string): string {
    return path.resolve(this.artifactRoot, sessionId);
  }

  private resolveArtifactPath(sessionId: string, artifactKey: string): string {
    if (artifactKey === "session") {
      return path.join(this.resolveSessionDir(sessionId), "session.json");
    }

    if (artifactKey === "panels") {
      return path.join(this.resolveSessionDir(sessionId), "panels.json");
    }

    if (artifactKey === "map") {
      return path.join(this.resolveSessionDir(sessionId), "map.json");
    }

    if (artifactKey === "notifications") {
      return path.join(this.resolveSessionDir(sessionId), "notifications.json");
    }

    if (artifactKey.startsWith("threads/")) {
      const threadId = artifactKey.replace("threads/", "");
      return path.join(this.resolveSessionDir(sessionId), "threads", `${threadId}.json`);
    }

    throw new Error(`Unsupported artifact key: ${artifactKey}`);
  }

  prepareArtifact(sessionId: string, artifactKey: string, payload: unknown): PreparedSwanArtifact {
    const filePath = this.resolveArtifactPath(sessionId, artifactKey);
    const raw = `${JSON.stringify(payload, null, 2)}\n`;
    const checksum = createHash("sha256").update(raw).digest("hex");

    return {
      file_path: filePath,
      checksum,
      raw,
    };
  }

  async materializeArtifact(artifact: PreparedSwanArtifact): Promise<void> {
    await mkdir(path.dirname(artifact.file_path), { recursive: true });
    const tempPath = `${artifact.file_path}.${randomUUID()}.tmp`;
    await writeFile(tempPath, artifact.raw, "utf8");
    await rename(tempPath, artifact.file_path);
  }

  async writeArtifact(
    sessionId: string,
    artifactKey: string,
    payload: unknown,
  ): Promise<PreparedSwanArtifact> {
    const artifact = this.prepareArtifact(sessionId, artifactKey, payload);
    await this.materializeArtifact(artifact);
    return artifact;
  }

  async readArtifact(filePath: string): Promise<unknown> {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as unknown;
  }
}
