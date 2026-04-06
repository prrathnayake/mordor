import type { AuthContext, Role, User } from "./models.js";
import { validateToken } from "./service.js";

export interface AuthenticatedRequest extends Request {
  auth: AuthContext;
}

export function createAuthMiddleware() {
  return (request: AuthenticatedRequest): AuthContext => {
    const authHeader = request.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return { user: null, isAuthenticated: false };
    }

    const token = authHeader.substring(7);
    return validateToken(token);
  };
}

export function requireAuth(request: AuthenticatedRequest): AuthContext {
  const auth = request.auth;
  if (!auth.isAuthenticated) {
    throw new UnauthorizedError();
  }
  return auth;
}

export function requireRole(request: AuthenticatedRequest, requiredRole: Role): User {
  const auth = requireAuth(request);
  if (!auth.user) {
    throw new UnauthorizedError();
  }

  const roleHierarchy: Record<Role, number> = {
    viewer: 1,
    operator: 2,
    admin: 3,
  };

  if (roleHierarchy[auth.user.role] < roleHierarchy[requiredRole]) {
    throw new ForbiddenError();
  }

  return auth.user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}
