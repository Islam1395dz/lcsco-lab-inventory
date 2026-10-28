import { UserRole } from '../types/inventory';

/**
 * Roles with full laboratory administration authority.
 *
 * The Secretary is deliberately a peer of the Director: both roles can access
 * every administrative screen, approve requests, manage accounts, and mutate
 * inventory. Keeping them in one list prevents the two roles drifting apart.
 */
export const ADMIN_ROLES: readonly UserRole[] = [UserRole.ADMIN, UserRole.SECRETARY];

export function isAdminRole(role: UserRole | string | null | undefined): boolean {
  return role === UserRole.ADMIN || role === UserRole.SECRETARY;
}
