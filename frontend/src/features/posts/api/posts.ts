import { api } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { AppError } from '../../../shared/errors';
import { authHeaders } from '../../auth/authHeaders';

export type Post = components['schemas']['PostResponse'];
export type PostPage = components['schemas']['PostPageResponse'];

function invalidResponse(status: number): AppError {
  // 2xx without a body: treat as an unusable response, not as a crash.
  return new AppError({ kind: 'http', code: 'INVALID_RESPONSE', status, retryable: false });
}

// Every posts endpoint needs a session (TG-628 criterion 5): see authHeaders.

/** One page of the posts of an event, newest first. `cursor` is the `next_cursor` of the previous page. */
export async function listEventPosts(eventId: string, cursor?: string): Promise<PostPage> {
  const { data, response } = await api.GET('/api/events/{event_id}/posts', {
    params: { path: { event_id: eventId }, query: cursor ? { cursor } : {} },
    headers: await authHeaders(),
  });
  if (!data) throw invalidResponse(response.status);
  return data;
}

export async function createPost(eventId: string, text: string): Promise<Post> {
  const { data, response } = await api.POST('/api/events/{event_id}/posts', {
    params: { path: { event_id: eventId } },
    body: { text },
    headers: await authHeaders(),
  });
  if (!data) throw invalidResponse(response.status);
  return data;
}

export async function updatePost(postId: string, text: string): Promise<Post> {
  const { data, response } = await api.PATCH('/api/posts/{post_id}', {
    params: { path: { post_id: postId } },
    body: { text },
    headers: await authHeaders(),
  });
  if (!data) throw invalidResponse(response.status);
  return data;
}

export async function deletePost(postId: string): Promise<void> {
  await api.DELETE('/api/posts/{post_id}', {
    params: { path: { post_id: postId } },
    headers: await authHeaders(),
  });
}
