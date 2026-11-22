/** The most the badge shows as a number; from one more it shows «99+». */
export const MAX_SHOWN_UNREAD = 99;

/** Whether there is anything unread to show (a count that is not a positive number is nothing). */
export function hasUnread(count: number): boolean {
  return count > 0;
}

/** The text of the badge: the number, or «99+» once it passes 99. */
export function formatUnreadCount(count: number): string {
  return count > MAX_SHOWN_UNREAD ? `${MAX_SHOWN_UNREAD}+` : String(count);
}
