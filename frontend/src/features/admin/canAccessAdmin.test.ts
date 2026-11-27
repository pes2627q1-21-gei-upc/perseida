import { canAccessAdmin } from './canAccessAdmin';

describe('canAccessAdmin', () => {
  // TG-77 criteri 3: only admin and moderator enter the panel.
  it.each(['admin', 'moderator'] as const)('lets the %s role in', (role) => {
    expect(canAccessAdmin(role)).toBe(true);
  });

  it('keeps a plain user out', () => {
    expect(canAccessAdmin('user')).toBe(false);
  });
});
