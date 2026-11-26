import { MAX_SHOWN_UNREAD, formatUnreadCount, hasUnread } from './unreadCount';

describe('unread count (TG-65)', () => {
  it('has nothing to show at 0, nor for a negative or non-numeric count', () => {
    expect(hasUnread(0)).toBe(false);
    expect(hasUnread(-3)).toBe(false);
    expect(hasUnread(Number.NaN)).toBe(false);
  });

  it('has something to show from 1', () => {
    expect(hasUnread(1)).toBe(true);
    expect(hasUnread(250)).toBe(true);
  });

  it('shows the number up to 99 and «99+» from 100', () => {
    expect(MAX_SHOWN_UNREAD).toBe(99);
    expect(formatUnreadCount(1)).toBe('1');
    expect(formatUnreadCount(99)).toBe('99');
    expect(formatUnreadCount(100)).toBe('99+');
    expect(formatUnreadCount(4000)).toBe('99+');
  });
});
