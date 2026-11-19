import { PaperPlaneRight } from 'phosphor-react-native';
import { type ComponentRef, useContext, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { type EdgeInsets, SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { type AppError, errorMessage } from '../../../shared/errors';
import { readingMaxWidth, type Theme, useTheme } from '../../../shared/theme';
import { GelIconButton, GlassPanel } from '../../../shared/ui';
import { useAnnounceOnIos } from '../useAnnounceOnIos';

/**
 * Same limit as the server for a chat message; the server stays the real check. Not shared with
 * the posts: they are two contracts of the API that can change apart.
 */
export const MESSAGE_MAX_LENGTH = 1000;

/** Characters as the server counts them (code points), so an emoji counts once, not twice. */
function characterCount(text: string) {
  return [...text.trim()].length;
}

interface Props {
  /** Sends the trimmed text. A rejection keeps the text in the field, so nothing is lost. */
  onSend: (text: string) => Promise<unknown> | void;
  /** The parent is busy (e.g. joining the room): nothing can be sent. */
  busy?: boolean;
  /** Why nothing can be sent now (e.g. offline). The person can keep writing. */
  disabledReason?: string;
  /** The error of the last send, shown in the language of the app (gestio-errors). */
  error?: AppError | null;
}

// Gel and glass of the composer: purely visual, left out of mutation testing on purpose
// (convencions/testing.md, «Mutation testing»).
// Stryker disable all
const VISIBLE_LINES = 5;
const styles = StyleSheet.create({
  frame: { width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  input: { flex: 1, borderWidth: 1, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end' },
});

/** Every style of the composer that depends on the theme or on the state of the field. */
function composerLook(
  { colors, radii, spacing, touch, typography }: Theme,
  insets: EdgeInsets | null,
  focused: boolean,
  tooLong: boolean,
) {
  const fieldPadding = spacing.sm + spacing.xs;
  return {
    frame: {
      maxWidth: readingMaxWidth,
      paddingTop: spacing.xs,
      paddingBottom: spacing.sm + (insets?.bottom ?? 0),
      paddingLeft: spacing.sm + (insets?.left ?? 0),
      paddingRight: spacing.sm + (insets?.right ?? 0),
    },
    column: { gap: spacing.xs },
    row: { gap: spacing.sm },
    alert: [typography.body, { color: colors.state.danger }],
    reason: [typography.body, { color: colors.text.secondary }],
    placeholder: colors.text.secondary,
    field: [
      typography.body,
      styles.input,
      {
        minHeight: touch.min,
        maxHeight: typography.body.lineHeight * VISIBLE_LINES + fieldPadding * 2,
        paddingHorizontal: spacing.md,
        paddingVertical: fieldPadding,
        borderRadius: radii.md,
        color: colors.text.primary,
        backgroundColor: colors.surface.onGlass,
        borderColor: colors.surface.glassBorder,
        // A ring outside the border: the focus shows without moving the layout.
        boxShadow: focused ? `0 0 0 2px ${colors.focusRing}` : undefined,
      },
    ],
    counter: [
      typography.caption,
      styles.counter,
      { color: tooLong ? colors.state.danger : colors.text.secondary },
    ],
  };
}
// Stryker restore all

/**
 * Where a message is written (TG-469): a floating glass capsule with a field that grows up to
 * five lines and a round gel send button. Enter adds a line; only the button sends. The counter
 * counts as the server does and, over the limit, an alert says so and blocks sending without
 * cutting the text. A rejected send keeps the text; the parent shows its error here, with no
 * retry of its own (the bubble of the message offers it).
 */
export function MessageComposer({ onSend, busy = false, disabledReason, error }: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors, iconSizes } = theme;
  const insets = useContext(SafeAreaInsetsContext);
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  const inFlight = useRef(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState(false);

  const count = characterCount(text);
  const tooLong = count > MESSAGE_MAX_LENGTH;
  const canSend = count > 0 && !tooLong && !busy && !sending && !disabledReason;
  const tooLongText = tooLong
    ? t('chat.composer.tooLong', {
        max: new Intl.NumberFormat(i18n.language).format(MESSAGE_MAX_LENGTH),
      })
    : '';
  const errorText = error ? errorMessage(t, error.code, error.retryable) : '';
  useAnnounceOnIos(tooLongText || undefined);
  useAnnounceOnIos(errorText || undefined);
  const look = composerLook(theme, insets, focused, tooLong);

  async function send() {
    if (!canSend || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    try {
      await onSend(text.trim());
      setText('');
      // Keeps the keyboard up for the next message (checked on a device, not in a unit test).
      field.current?.focus();
    } catch {
      // The parent shows why through `error`; the text stays, so nothing typed is lost.
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  const alert = (message: string) => (
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={look.alert}>
      {message}
    </Text>
  );

  return (
    <View style={[styles.frame, look.frame]}>
      <GlassPanel compact>
        <View style={look.column}>
          {disabledReason !== undefined && (
            <Text accessibilityLiveRegion="polite" style={look.reason}>
              {disabledReason}
            </Text>
          )}
          {tooLongText !== '' && alert(tooLongText)}
          {errorText !== '' && alert(errorText)}
          <View style={[styles.row, look.row]}>
            <TextInput
              ref={field}
              accessibilityLabel={t('chat.composer.label')}
              placeholder={t('chat.composer.label')}
              placeholderTextColor={look.placeholder}
              multiline
              submitBehavior="newline"
              scrollEnabled
              value={text}
              onChangeText={setText}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={look.field}
            />
            <GelIconButton
              label={t('chat.composer.send')}
              icon={<PaperPlaneRight size={iconSizes.md} color={colors.gel.text} weight="fill" />}
              onPress={() => void send()}
              disabled={!canSend}
              busy={busy || sending}
            />
          </View>
          <Text
            accessibilityLabel={t('chat.composer.counter', { count, max: MESSAGE_MAX_LENGTH })}
            style={look.counter}
          >
            {`${count}/${MESSAGE_MAX_LENGTH}`}
          </Text>
        </View>
      </GlassPanel>
    </View>
  );
}
