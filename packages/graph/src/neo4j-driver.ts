import neo4j, { type Driver } from "neo4j-driver";

export interface Neo4jConfig {
  uri: string;
  user: string;
  password: string;
}

let _driver: Driver | null = null;

export function getDefaultConfig(): Neo4jConfig {
  return {
    uri: process.env.NEO4J_URI || "bolt://127.0.0.1:7687",
    user: process.env.NEO4J_USER || "neo4j",
    password: process.env.NEO4J_PASSWORD || "password",
  };
}

export function createNeo4jDriver(config: Neo4jConfig): Driver {
  const driver = neo4j.driver(config.uri, neo4j.auth.basic(config.user, config.password), {
    maxConnectionLifetime: 3 * 60 * 60 * 1000,
    maxConnectionPoolSize: 50,
  });
  return driver;
}

export function getOrCreateDriver(config?: Neo4jConfig): Driver {
  if (!_driver) {
    _driver = createNeo4jDriver(config ?? getDefaultConfig());
  }
  return _driver;
}

export function getDriver(): Driver | null {
  return _driver;
}

export async function closeDriver(): Promise<void> {
  if (_driver) {
    await _driver.close();
    _driver = null;
  }
}

export async function verifyConnectivity(driver?: Driver): Promise<boolean> {
  const target = driver ?? _driver;
  if (!target) {
    return false;
  }
  try {
    const info = await target.getServerInfo();
    return info?.agent !== undefined;
  } catch {
    return false;
  }
}
