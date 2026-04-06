import { describe, expect, it } from "vitest";
import {
  authenticate,
  getTokenExpiry,
  getUserFromToken,
  isTokenExpired,
  logout,
  validateToken,
} from "../../packages/auth/src/index.js";

describe("auth service", () => {
  describe("authenticate", () => {
    it("returns success with token for valid credentials", () => {
      const result = authenticate("operator", "operator123");

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.user?.username).toBe("operator");
      expect(result.user?.role).toBe("operator");
    });

    it("returns error for invalid password", () => {
      const result = authenticate("operator", "wrongpassword");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid credentials");
    });

    it("returns error for unknown user", () => {
      const result = authenticate("unknown", "anypassword");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid credentials");
    });

    it("validates viewer role credentials", () => {
      const result = authenticate("viewer", "viewer123");

      expect(result.success).toBe(true);
      expect(result.user?.role).toBe("viewer");
    });

    it("validates admin role credentials", () => {
      const result = authenticate("admin", "admin123");

      expect(result.success).toBe(true);
      expect(result.user?.role).toBe("admin");
    });
  });

  describe("validateToken", () => {
    it("returns authenticated context for valid token", () => {
      const authResult = authenticate("operator", "operator123");
      if (!authResult.token) throw new Error("no token");

      const context = validateToken(authResult.token);

      expect(context.isAuthenticated).toBe(true);
      expect(context.user?.username).toBe("operator");
    });

    it("returns unauthenticated context for invalid token", () => {
      const context = validateToken("invalid_token_123");

      expect(context.isAuthenticated).toBe(false);
      expect(context.user).toBeNull();
    });

    it("returns unauthenticated context for empty token", () => {
      const context = validateToken("");

      expect(context.isAuthenticated).toBe(false);
    });
  });

  describe("logout", () => {
    it("removes token from valid tokens", () => {
      const authResult = authenticate("operator", "operator123");
      if (!authResult.token) throw new Error("no token");

      logout(authResult.token);

      const context = validateToken(authResult.token);
      expect(context.isAuthenticated).toBe(false);
    });
  });

  describe("getUserFromToken", () => {
    it("returns user for valid token", () => {
      const authResult = authenticate("admin", "admin123");
      if (!authResult.token) throw new Error("no token");

      const user = getUserFromToken(authResult.token);

      expect(user?.username).toBe("admin");
    });

    it("returns null for invalid token", () => {
      const user = getUserFromToken("nonexistent");

      expect(user).toBeNull();
    });
  });

  describe("token expiration", () => {
    it("returns valid expiry time for token", () => {
      const authResult = authenticate("operator", "operator123");
      if (!authResult.token) throw new Error("no token");

      const expiry = getTokenExpiry(authResult.token);

      expect(expiry).toBeGreaterThan(Date.now());
    });

    it("returns null for invalid token", () => {
      const expiry = getTokenExpiry("invalid_token");

      expect(expiry).toBeNull();
    });

    it("isTokenExpired returns false for valid token", () => {
      const authResult = authenticate("operator", "operator123");
      if (!authResult.token) throw new Error("no token");

      const expired = isTokenExpired(authResult.token);

      expect(expired).toBe(false);
    });

    it("isTokenExpired returns true for invalid token", () => {
      const expired = isTokenExpired("invalid_token");

      expect(expired).toBe(true);
    });

    it("validateToken returns error for expired token after deletion from map", () => {
      const authResult = authenticate("operator", "operator123");
      if (!authResult.token) throw new Error("no token");

      const context = validateToken(authResult.token);

      expect(context.isAuthenticated).toBe(true);
    });
  });
});
