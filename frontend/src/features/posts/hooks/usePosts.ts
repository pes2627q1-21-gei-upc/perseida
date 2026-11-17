import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '../../../shared/errors';
import {
  type Post,
  type PostPage,
  createPost,
  deletePost,
  listEventPosts,
  updatePost,
} from '../api/posts';

export const postKeys = {
  all: ['posts'] as const,
  list: (eventId: string) => [...postKeys.all, 'list', eventId] as const,
};

// One retry, and only when the error is transient (network, 408, 429, 5xx).
function retryOnceIfTransient(failureCount: number, error: AppError): boolean {
  return failureCount < 1 && error.retryable;
}

/** Posts of an event, newest first, one page per cursor (TG-628 criterion 2). Online only. */
export function useEventPosts(eventId: string) {
  return useInfiniteQuery<
    PostPage,
    AppError,
    { pages: PostPage[]; pageParams: (string | undefined)[] },
    ReturnType<typeof postKeys.list>,
    string | undefined
  >({
    queryKey: postKeys.list(eventId),
    queryFn: ({ pageParam }) => listEventPosts(eventId, pageParam),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    retry: retryOnceIfTransient,
  });
}

/** After a change the list of the event is fetched again: the server decides the order. */
function useInvalidateEventPosts(eventId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: postKeys.list(eventId) });
}

export function useCreatePost(eventId: string) {
  const invalidate = useInvalidateEventPosts(eventId);
  return useMutation<Post, AppError, string>({
    mutationFn: (text) => createPost(eventId, text),
    onSuccess: invalidate,
  });
}

export function useUpdatePost(eventId: string) {
  const invalidate = useInvalidateEventPosts(eventId);
  return useMutation<Post, AppError, { postId: string; text: string }>({
    mutationFn: ({ postId, text }) => updatePost(postId, text),
    onSuccess: invalidate,
  });
}

export function useDeletePost(eventId: string) {
  const invalidate = useInvalidateEventPosts(eventId);
  return useMutation<void, AppError, string>({
    mutationFn: deletePost,
    onSuccess: invalidate,
  });
}
