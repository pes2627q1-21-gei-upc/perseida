import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../../../shared/errors';
import { useTheme } from '../../../shared/theme';
import { GelButton, QuietButton } from '../../../shared/ui';
import { formatEventDateTime } from '../../events/formatEvent';
import type { Post } from '../api/posts';
import { useDeletePost, useUpdatePost } from '../hooks/usePosts';
import { PostForm } from './PostForm';

interface Props {
  eventId: string;
  post: Post;
  /** The post is from the session owner: only then it can be edited or deleted (criteria 3-4). */
  own: boolean;
}

type Mode = 'view' | 'edit' | 'confirmDelete';

/**
 * One post of an event: author, date and text. The text is always plain text, never markup
 * nor a link (ADR-0024). Own posts are edited in place and deleted after a confirmation in
 * place too, which works the same on phones and on the web.
 */
export function PostItem({ eventId, post, own }: Props) {
  const { t, i18n } = useTranslation();
  const { colors, radii, spacing, typography } = useTheme();
  const [mode, setMode] = useState<Mode>('view');
  const update = useUpdatePost(eventId);
  const remove = useDeletePost(eventId);

  const meta = [
    post.author.name,
    formatEventDateTime(post.created_at, i18n.language),
    post.edited_at ? t('posts.item.edited') : null,
  ];

  return (
    <View
      style={[
        styles.card,
        {
          gap: spacing.sm,
          padding: spacing.md,
          borderRadius: radii.md,
          borderColor: colors.surface.glassBorder,
        },
      ]}
    >
      <View style={[styles.meta, { columnGap: spacing.sm }]}>
        {meta.map(
          (part, index) =>
            part && (
              <Text
                key={index}
                style={[
                  index === 0 ? typography.bodyStrong : typography.caption,
                  { color: index === 0 ? colors.text.primary : colors.text.secondary },
                ]}
              >
                {part}
              </Text>
            ),
        )}
      </View>

      {mode === 'edit' ? (
        <PostForm
          mode="edit"
          initialText={post.text}
          onSubmit={async (text) => {
            await update.mutateAsync({ postId: post.id, text });
            setMode('view');
          }}
          onCancel={() => setMode('view')}
        />
      ) : (
        <Text selectable style={[typography.body, { color: colors.text.primary }]}>
          {post.text}
        </Text>
      )}

      {own && mode === 'view' && (
        <View style={[styles.actions, { gap: spacing.md }]}>
          <QuietButton
            label={t('posts.item.edit')}
            accessibilityHint={t('posts.item.editHint')}
            onPress={() => setMode('edit')}
          />
          <QuietButton
            label={t('posts.item.delete')}
            accessibilityHint={t('posts.item.deleteHint')}
            onPress={() => {
              remove.reset();
              setMode('confirmDelete');
            }}
          />
        </View>
      )}

      {mode === 'confirmDelete' && (
        <View style={{ gap: spacing.sm }}>
          <Text
            accessibilityLiveRegion="polite"
            style={[typography.bodyStrong, { color: colors.text.primary }]}
          >
            {t('posts.item.confirmDelete')}
          </Text>
          <View style={[styles.actions, { gap: spacing.md }]}>
            <QuietButton label={t('posts.form.cancel')} onPress={() => setMode('view')} />
            <GelButton
              label={t('posts.item.delete')}
              busy={remove.isPending}
              onPress={() => remove.mutate(post.id)}
            />
          </View>
        </View>
      )}

      {remove.error && (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.state.danger }]}>
          {errorMessage(t, remove.error.code, remove.error.retryable)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end' },
});
