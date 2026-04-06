export type Role = "viewer" | "operator" | "admin";

export interface User {
  user_id: string;
  username: string;
  role: Role;
  created_at: string;
}

export interface AuthContext {
  user: User | null;
  isAuthenticated: boolean;
  error?: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}

export function hasPermission(user: User | null, requiredRole: Role): boolean {
  if (!user) return false;

  const roleHierarchy: Record<Role, number> = {
    viewer: 1,
    operator: 2,
    admin: 3,
  };

  return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
}

export function canIngest(user: User | null): boolean {
  return hasPermission(user, "operator");
}

export function canManageAlerts(user: User | null): boolean {
  return hasPermission(user, "operator");
}

export function canAdminister(user: User | null): boolean {
  return hasPermission(user, "admin");
}

export function canView(user: User | null): boolean {
  return hasPermission(user, "viewer");
}
