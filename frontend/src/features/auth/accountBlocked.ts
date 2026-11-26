/** Codes of an account that can no longer use the app: the session ends and /login says why. */
export const ACCOUNT_BLOCKED_CODES = ['ACCOUNT_SUSPENDED', 'ACCOUNT_DELETED'] as const;

export type AccountBlockedCode = (typeof ACCOUNT_BLOCKED_CODES)[number];

export function isAccountBlocked(code: string | null | undefined): code is AccountBlockedCode {
  return ACCOUNT_BLOCKED_CODES.some((blocked) => blocked === code);
}
