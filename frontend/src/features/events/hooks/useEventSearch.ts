import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { AppError } from '../../../shared/errors';
import { type AstronomicalEvent, type EventSearchFilters, searchEvents } from '../api/getEvents';
import { eventKeys, FIVE_MINUTES_MS, retryOnceIfTransient } from './useEvents';

/**
 * Events of the filters of the list (TG-51). Online only. While new filters load, the list of
 * the previous ones stays in view instead of a spinner.
 */
export function useEventSearch(filters: EventSearchFilters) {
  return useQuery<AstronomicalEvent[], AppError>({
    queryKey: eventKeys.search(filters),
    queryFn: () => searchEvents(filters),
    staleTime: FIVE_MINUTES_MS,
    retry: retryOnceIfTransient,
    placeholderData: keepPreviousData,
  });
}
