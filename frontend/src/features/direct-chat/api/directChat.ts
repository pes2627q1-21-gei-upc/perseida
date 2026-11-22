import { api } from '../../../shared/api/client';
import type { components } from '../../../shared/api/schema';
import { AppError } from '../../../shared/errors';
import { withSession } from '../../auth/api/authorized';

export type DirectConversation = components['schemas']['DirectConversationResponse'];
export type ConversationOverview = components['schemas']['ConversationOverview'];
export type DirectHistory = components['schemas']['DirectHistoryResponse'];
export type DirectMessage = components['schemas']['DirectMessageResponse'];

const PAGE_SIZE = 50;

function invalidResponse(status: number): AppError {
  return new AppError({ kind: 'http', code: 'INVALID_RESPONSE', status, retryable: false });
}

export async function openConversation(userId: string): Promise<DirectConversation> {
  return withSession(async (headers) => {
    const { data, response } = await api.POST('/api/direct-conversations', {
      headers,
      body: { user_id: userId },
    });
    if (!data) throw invalidResponse(response.status);
    return data;
  });
}

export async function listConversations(): Promise<ConversationOverview[]> {
  return withSession(async (headers) => {
    const { data, response } = await api.GET('/api/direct-conversations', { headers });
    if (!data) throw invalidResponse(response.status);
    return data;
  });
}

export async function fetchMessages(
  conversationId: string,
  before?: string,
): Promise<DirectHistory> {
  return withSession(async (headers) => {
    const { data, response } = await api.GET(
      '/api/direct-conversations/{conversation_id}/messages',
      {
        headers,
        params: {
          path: { conversation_id: conversationId },
          query: before ? { limit: PAGE_SIZE, before } : { limit: PAGE_SIZE },
        },
      },
    );
    if (!data) throw invalidResponse(response.status);
    return data;
  });
}

export async function markRead(conversationId: string): Promise<void> {
  await withSession(async (headers) => {
    await api.POST('/api/direct-conversations/{conversation_id}/read', {
      headers,
      params: { path: { conversation_id: conversationId } },
    });
  });
}

export async function blockUser(userId: string): Promise<void> {
  await withSession(async (headers) => {
    await api.PUT('/api/users/{user_id}/block', {
      headers,
      params: { path: { user_id: userId } },
    });
  });
}

export async function unblockUser(userId: string): Promise<void> {
  await withSession(async (headers) => {
    await api.DELETE('/api/users/{user_id}/block', {
      headers,
      params: { path: { user_id: userId } },
    });
  });
}
