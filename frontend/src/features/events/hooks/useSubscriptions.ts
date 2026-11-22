import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '../../../shared/errors';
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

  return useMutation<void, AppError, SubscriptionToggle, { previous?: AstronomicalEvent[] }>({
    mutationKey,
    mutationFn: ({ event, subscribed }) =>
      subscribed ? subscribe(event.id) : unsubscribe(event.id),
    onMutate: async ({ event, subscribed }) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<AstronomicalEvent[]>(key);
      if (previous) {
        const others = previous.filter((item) => item.id !== event.id);
        client.setQueryData(key, subscribed ? [...others, event].sort(byStartThenId) : others);
      }
      return { previous };
    },
    onError: (_error, _toggle, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    // Only when the last toggle ends: a refetch in between would undo the ones still in flight.
    onSettled: () =>
      client.isMutating({ mutationKey }) === 1
        ? client.invalidateQueries({ queryKey: key })
        : undefined,
  });
}
