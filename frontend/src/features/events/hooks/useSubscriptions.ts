import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '../../../shared/errors';
import { chatKeys } from '../../chat/hooks/useChat';
import type { AstronomicalEvent } from '../api/getEvents';
import { listMySubscriptions, subscribe, unsubscribe } from '../api/subscriptions';
import { byStartThenId } from '../classifyEvents';
import { eventKeys, FIVE_MINUTES_MS, retryOnceIfTransient } from './useEvents';

/** Events the user of the session follows (TG-53), ordered by start like the API. */
export function useMySubscriptions() {
  return useQuery<AstronomicalEvent[], AppError>({
    queryKey: eventKeys.subscriptions(),
    queryFn: listMySubscriptions,
    staleTime: FIVE_MINUTES_MS,
    retry: retryOnceIfTransient,
  });
}

export interface SubscriptionToggle {
  event: AstronomicalEvent;
  /** Whether to follow the event (true) or stop following it (false). */
  subscribed: boolean;
}

/**
 * Follows or stops following an event. The subscriptions change at once (optimistic), go back
 * as they were if the API fails, and are asked again when it ends.
 */
export function useToggleSubscription() {
  const client = useQueryClient();
  const key = eventKeys.subscriptions();
  const mutationKey = [...key, 'toggle'];

  return useMutation<void, AppError, SubscriptionToggle>({
    mutationKey,
    mutationFn: ({ event, subscribed }) =>
      subscribed ? subscribe(event.id) : unsubscribe(event.id),
    onMutate: async ({ event, subscribed }) => {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<AstronomicalEvent[]>(key, (current) =>
        toggled(current, event, subscribed),
      );
    },
    // Undo only this toggle, on the list as it is now: another one may still be in flight.
    onError: (_error, { event, subscribed }) => {
      client.setQueryData<AstronomicalEvent[]>(key, (current) =>
        toggled(current, event, !subscribed),
      );
    },
    // Only when the last toggle ends: a refetch in between would undo the ones still in flight.
    // The rooms of the chat are the ones of the followed events.
    onSettled: async () => {
      if (client.isMutating({ mutationKey }) !== 1) return;
      await Promise.all([
        client.invalidateQueries({ queryKey: key }),
        client.invalidateQueries({ queryKey: chatKeys.rooms }),
      ]);
    },
  });
}

/** The followed events with `event` in (`subscribed`) or out, in order of start. */
function toggled(
  current: AstronomicalEvent[] | undefined,
  event: AstronomicalEvent,
  subscribed: boolean,
): AstronomicalEvent[] | undefined {
  if (!current) return current;
  const others = current.filter((item) => item.id !== event.id);
  return subscribed ? [...others, event].sort(byStartThenId) : others;
}
