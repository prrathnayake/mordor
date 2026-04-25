import { createHash, timingSafeEqual } from "node:crypto";
import type { AuthContext, AuthResult, User } from "./models.js";

const TOKEN_EXPIRY_MS = 30 * 60 * 1000;

function hashPassword(password: string): Buffer {
  return createHash("sha256").update(password).digest();
}

function secureCompare(a: string, b: string): boolean {
  try {
    return timingSafeEqual(hashPassword(a), hashPassword(b));
  } catch {
    return false;
  }
}

function getEnvPassword(role: string, fallback: string): string {
  const envValue = process.env[`AUTH_PASSWORD_${role.toUpperCase()}`];
  if (envValue) return envValue;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`AUTH_PASSWORD_${role.toUpperCase()} must be set in production`);
  }
  return fallback;
}

const MOCK_USERS: Record<string, { password: string; user: User }> = {
  viewer: {
    password: getEnvPassword("viewer", "viewer123"),
    user: {
      user_id: "user_viewer",
      username: "viewer",
      role: "viewer",
      created_at: new Date().toISOString(),
    },
  },
  operator: {
    password: getEnvPassword("operator", "operator123"),
    user: {
      user_id: "user_operator",
      username: "operator",
      role: "operator",
      created_at: new Date().toISOString(),
    },
  },
  admin: {
    password: getEnvPassword("admin", "admin123"),
    user: {
      user_id: "user_admin",
      username: "admin",
      role: "admin",
      created_at: new Date().toISOString(),
    },
  },
};

interface TokenMetadata {
  user: User;
  createdAt: number;
  expiresAt: number;
}

const VALID_TOKENS: Map<string, TokenMetadata> = new Map();

export function authenticate(username: string, password: string): AuthResult {
  const credentials = MOCK_USERS[username];
  if (!credentials || !secureCompare(credentials.password, password)) {
    return { success: false, error: "Invalid credentials" };
  }

  const now = Date.now();
  const token = `token_${credentials.user.user_id}_${now}`;
  VALID_TOKENS.set(token, {
    user: credentials.user,
    createdAt: now,
    expiresAt: now + TOKEN_EXPIRY_MS,
  });

  return {
    success: true,
    user: credentials.user,
    token,
  };
}

export function validateToken(token: string): AuthContext {
  const metadata = VALID_TOKENS.get(token);
  if (!metadata) {
    return { user: null, isAuthenticated: false };
  }

  if (Date.now() > metadata.expiresAt) {
    VALID_TOKENS.delete(token);
    return { user: null, isAuthenticated: false, error: "Token expired" };
  }

  return { user: metadata.user, isAuthenticated: true };
}

export function isTokenExpired(token: string): boolean {
  const metadata = VALID_TOKENS.get(token);
  if (!metadata) return true;
  return Date.now() > metadata.expiresAt;
}

export function logout(token: string): void {
  VALID_TOKENS.delete(token);
}

export function getUserFromToken(token: string): User | null {
  return VALID_TOKENS.get(token)?.user ?? null;
}

export function getTokenExpiry(token: string): number | null {
  const metadata = VALID_TOKENS.get(token);
  return metadata?.expiresAt ?? null;
}
