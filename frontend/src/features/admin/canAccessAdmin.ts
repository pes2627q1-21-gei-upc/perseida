import type { CurrentUser } from '../auth/api/getCurrentUser';

/** Who enters the admin panel (TG-77 criteri 3): admins and moderators, not plain users. */
export function canAccessAdmin(role: CurrentUser['role']): boolean {
  return role === 'admin' || role === 'moderator';
}
