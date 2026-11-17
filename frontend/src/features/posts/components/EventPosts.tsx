import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { errorMessage } from '../../../shared/errors';
import { useTheme } from '../../../shared/theme';
import { QuietButton } from '../../../shared/ui';
import { useCurrentUser } from '../../auth/hooks/useCurrentUser';
import { useCreatePost, useEventPosts } from '../hooks/usePosts';
import { PostForm } from './PostForm';
import { PostItem } from './PostItem';

/**
 * Community posts of an event (TG-628, criterion 7): the form to publish, then the posts,
 * newest first, with loading, empty and error states and a button for the next page.
 * The own posts are the ones whose author is the session owner.
 */
export function EventPosts({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const posts = useEventPosts(eventId);
  const create = useCreatePost(eventId);
  const me = useCurrentUser();

  const items = posts.data?.pages.flatMap((page) => page.items) ?? [];
  const textStyle = [typography.body, { color: colors.text.primary }];

  return (
    <View style={{ gap: spacing.md }}>
      <Text accessibilityRole="header" style={[typography.title, { color: colors.text.primary }]}>
        {t('posts.list.title')}
      </Text>

      <PostForm mode="create" onSubmit={(text) => create.mutateAsync(text)} />

      {posts.isPending && (
        <ActivityIndicator
          color={colors.text.primary}
          accessibilityLabel={t('posts.list.loading')}
        />
      )}

      {posts.isError && items.length === 0 && (
        <View style={{ gap: spacing.sm }}>
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={textStyle}>
            {errorMessage(t, posts.error.code, posts.error.retryable)}
          </Text>
          {posts.error.retryable && (
            <QuietButton
              label={t('posts.list.retry')}
              accessibilityHint={t('posts.list.retryHint')}
              onPress={() => void posts.refetch()}
            />
          )}
        </View>
      )}

      {posts.isSuccess && items.length === 0 && (
        <Text accessibilityLiveRegion="polite" style={textStyle}>
          {t('posts.list.empty')}
        </Text>
      )}

      {items.length > 0 && (
        <View testID="event-posts-list" style={{ gap: spacing.md }}>
          {items.map((post) => (
            <PostItem
              key={post.id}
              eventId={eventId}
              post={post}
              own={me.data?.id === post.author.id}
            />
          ))}
        </View>
      )}

      {posts.isFetchNextPageError && (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.state.danger }]}>
          {errorMessage(t, posts.error.code, posts.error.retryable)}
        </Text>
      )}

      {posts.hasNextPage && (
        <QuietButton
          label={t('posts.list.more')}
          busy={posts.isFetchingNextPage}
          onPress={() => void posts.fetchNextPage()}
        />
      )}
    </View>
  );
}
