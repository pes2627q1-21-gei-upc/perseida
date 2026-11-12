import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import type { AppError } from '../../../shared/errors';
import { type AstronomicalEvent, getActiveEvents, getUpcomingEvents } from '../api/getEvents';
import { type ClassifiedEvents, classifyEvents } from '../classifyEvents';

export const eventKeys = {
  all: ['events'] as const,
  active: () => [...eventKeys.all, 'active'] as const,
  upcoming: (days: number) => [...eventKeys.all, 'upcoming', days] as const,
};

/** The map shows the events of the next 30 days, the maximum the API allows. */
export const MAP_UPCOMING_DAYS = 30;

// Launch times change often, so the events stay fresh for five minutes only.
const FIVE_MINUTES_MS = 5 * 60 * 1000;

// One retry, and only when the error is transient (network, 408, 429, 5xx).
function retryOnceIfTransient(failureCount: number, error: AppError): boolean {
  return failureCount < 1 && error.retryable;
}

/** Events that overlap today. Online only. */
export function useActiveEvents() {
  return useQuery<AstronomicalEvent[], AppError>({
    queryKey: eventKeys.active(),
    queryFn: getActiveEvents,
    staleTime: FIVE_MINUTES_MS,
    retry: retryOnceIfTransient,
  });
}

/** Events that start within the next `days` days. Online only. */
export function useUpcomingEvents(days: number) {
  return useQuery<AstronomicalEvent[], AppError>({
    queryKey: eventKeys.upcoming(days),
    queryFn: () => getUpcomingEvents(days),
    staleTime: FIVE_MINUTES_MS,
    retry: retryOnceIfTransient,
  });
}

/** Active and upcoming events of the map, classified once both requests have succeeded. */
export function useMapEvents() {
  const active = useActiveEvents();
  const upcoming = useUpcomingEvents(MAP_UPCOMING_DAYS);

  const data = useMemo<ClassifiedEvents | undefined>(
    () => (active.data && upcoming.data ? classifyEvents(active.data, upcoming.data) : undefined),
    [active.data, upcoming.data],
  );

  const refetchActive = active.refetch;
  const refetchUpcoming = upcoming.refetch;
  const refetch = useCallback(async () => {
    await Promise.all([refetchActive(), refetchUpcoming()]);
  }, [refetchActive, refetchUpcoming]);

  return {
    data,
    isLoading: active.isLoading || upcoming.isLoading,
    isError: active.isError || upcoming.isError,
    isSuccess: active.isSuccess && upcoming.isSuccess,
    error: active.error ?? upcoming.error,
    refetch,
  };
}
