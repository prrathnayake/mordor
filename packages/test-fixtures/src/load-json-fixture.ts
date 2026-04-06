import { readFile } from "node:fs/promises";

const FIXTURE_ROOT = new URL("../fixtures/", import.meta.url);

export async function loadJsonFixture<T>(...segments: string[]): Promise<T> {
  const targetUrl = new URL(segments.join("/"), FIXTURE_ROOT);
  const raw = await readFile(targetUrl, "utf8");

  return JSON.parse(raw) as T;
}
