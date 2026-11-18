import { useMapEvents } from '../../events/hooks/useEvents';

/**
 * The title of the event an outing is linked to. The API only gives the id, so it is looked up
 * among the events of the map (the active ones and the ones of the next 30 days): undefined if
 * the outing has no event, or if it is not among them (it has already passed, or it is still
 * loading).
 */
export function useEventTitle(eventId: string | null): string | undefined {
  const { data } = useMapEvents();
  if (eventId === null) return undefined;
  return data?.all.find((event) => event.id === eventId)?.title;
}
