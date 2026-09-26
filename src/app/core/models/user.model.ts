/** Permission level granted to a {@link User} within a project. */
export type UserRole = 'admin' | 'member' | 'viewer';

/** Every valid {@link UserRole} value, ordered from most to least privileged. */
export const USER_ROLES: readonly UserRole[] = ['admin', 'member', 'viewer'];

/** Type guard narrowing an arbitrary value to a {@link UserRole}. */
export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

/** A board participant. */
export interface User {
  id: string;
  name: string;
  email: string;
  /**
   * Absolute URL of the user's avatar image. An empty string is a valid,
   * meaningful value: consumers must fall back to initials rendering.
   */
  avatarUrl: string;
  role: UserRole;
  createdAt: string;
}
