import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { z } from 'zod';

import { errorMessage, isAppError } from '../../../shared/errors';
import { useTheme } from '../../../shared/theme';
import { GelButton, QuietButton } from '../../../shared/ui';

/** Same limit as the API (TG-628 criterion 1); the server stays the real check. */
export const POST_MAX_LENGTH = 1000;

/** Codes of the text field: the client and the server share them, so they share their text. */
const TEXT_CODES = ['POST_TEXT_EMPTY', 'POST_TEXT_TOO_LONG'];

/** Characters as the server counts them (code points), so an emoji counts once, not twice. */
function characterCount(text: string) {
  return [...text.trim()].length;
}

// Convenience validation only: the messages are error codes, translated with errorMessage.
const schema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'POST_TEXT_EMPTY')
    .refine((text) => characterCount(text) <= POST_MAX_LENGTH, 'POST_TEXT_TOO_LONG'),
});
type FormValues = z.input<typeof schema>;

/** Any error that is not about the text: announced as an alert under the buttons. */
interface FormFailure {
  code: string;
  retryable: boolean;
}

interface Props {
  /** `create` empties the field after publishing; `edit` starts with the current text. */
  mode: 'create' | 'edit';
  initialText?: string;
  /** Sends the text as typed; the server trims it. A rejection keeps the text in the field. */
  onSubmit: (text: string) => Promise<unknown>;
  /** Edit only: leaves the form without saving. */
  onCancel?: () => void;
}

export function PostForm({ mode, initialText = '', onSubmit, onCancel }: Props) {
  const { t } = useTranslation();
  const { colors, radii, spacing, touch, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const { control, handleSubmit, reset, setError, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { text: initialText },
  });

  const length = characterCount(useWatch({ control, name: 'text' }));
  const tooLong = length > POST_MAX_LENGTH;
  const fieldCode = tooLong ? 'POST_TEXT_TOO_LONG' : formState.errors.text?.message;
  const fieldError = fieldCode ? errorMessage(t, fieldCode, false) : '';

  const submit = handleSubmit(async ({ text }) => {
    setFailure(null);
    try {
      await onSubmit(text);
      if (mode === 'create') reset({ text: '' });
    } catch (error) {
      if (isAppError(error) && TEXT_CODES.includes(error.code)) {
        setError('text', { message: error.code });
      } else if (isAppError(error)) {
        setFailure({ code: error.code, retryable: error.retryable });
      } else {
        setFailure({ code: 'GENERIC_FINAL', retryable: false });
      }
    }
  });

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[typography.bodyStrong, { color: colors.text.primary }]}>
        {t('posts.form.label')}
      </Text>
      <Controller
        control={control}
        name="text"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            accessibilityLabel={t('posts.form.label')}
            // The error goes first in the hint, so it is read when the field gets the focus.
            accessibilityHint={[fieldError, t('posts.form.hint')].filter(Boolean).join(' ')}
            // Editing replaces the button that had the focus: the focus moves to the text.
            autoFocus={mode === 'edit'}
            multiline
            textAlignVertical="top"
            value={value}
            onChangeText={onChange}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              onBlur();
            }}
            style={[
              typography.body,
              styles.input,
              {
                minHeight: touch.min * 2,
                padding: spacing.md,
                borderRadius: radii.md,
                color: colors.text.primary,
                backgroundColor: colors.surface.onGlass,
                borderColor: focused || fieldCode ? colors.focusRing : colors.surface.glassBorder,
                borderWidth: focused || fieldCode ? 2 : 1,
              },
            ]}
          />
        )}
      />
      <View style={[styles.row, { gap: spacing.md }]}>
        <Text
          accessibilityLiveRegion="polite"
          style={[typography.caption, styles.grow, { color: colors.state.danger }]}
        >
          {fieldError}
        </Text>
        <Text
          accessibilityLabel={t('posts.form.counter', { count: length, max: POST_MAX_LENGTH })}
          style={[typography.caption, { color: colors.text.secondary }]}
        >
          {`${length}/${POST_MAX_LENGTH}`}
        </Text>
      </View>
      <View style={[styles.row, styles.actions, { gap: spacing.md }]}>
        {mode === 'edit' && onCancel && (
          <QuietButton label={t('posts.form.cancel')} onPress={onCancel} />
        )}
        <GelButton
          label={t(mode === 'create' ? 'posts.form.publish' : 'posts.form.save')}
          onPress={() => void submit()}
          busy={formState.isSubmitting}
          disabled={length === 0 || tooLong}
        />
      </View>
      {failure && (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.state.danger }]}>
          {errorMessage(t, failure.code, failure.retryable)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  actions: { justifyContent: 'flex-end' },
});
