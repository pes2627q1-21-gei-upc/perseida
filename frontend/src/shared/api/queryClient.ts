import { QueryClient } from '@tanstack/react-query';

/** Single TanStack Query client for the app. Each hook sets its own staleTime and retry. */
export const queryClient = new QueryClient();
