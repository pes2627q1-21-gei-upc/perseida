import { PaperPlaneRight } from 'phosphor-react-native';
import { type ComponentRef, useContext, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { type AppError, errorMessage } from '../../../shared/errors';
import { readingMaxWidth, type Theme, useTheme } from '../../../shared/theme';
import { GelIconButton, useReduceTransparency } from '../../../shared/ui';
import { type ComposerSurface, composerSurface } from '../composerSurface';
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
  /**
   * Room to leave below it. The screen decides: the bottom safe area with the keyboard down, none
   * with the keyboard up. The sides always follow the safe area.
   */
  bottomInset?: number;
}

/**
 * Where a message is written (TG-469): a floating glass capsule with a field that grows up to
 * five lines and a round gel send button. Enter adds a line; only the button sends. The counter
 * counts as the server does and, over the limit, an alert says so and blocks sending without
 * cutting the text. A rejected send keeps the text; the parent shows its error here, with no
 * retry of its own (the bubble of the message offers it).
 */
export function MessageComposer({
  onSend,
  busy = false,
  disabledReason,
  error,
  bottomInset = 0,
}: Props) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { colors, iconSizes, spacing } = theme;
  const reduceTransparency = useReduceTransparency();
  const styles = createStyles(theme, composerSurface(colors, reduceTransparency));
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
  useAnnounceOnIos(disabledReason);

  async function send() {
    if (!canSend || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    const sent = text;
    try {
      await onSend(sent.trim());
      // The field stays editable while the send is on its way. Takes out the text that was sent
      // from the start of the field and keeps what was added after it, so it is neither lost nor
      // sent twice. If the sent text was edited, the field is kept whole: nothing is thrown away.
      setText((current) =>
        current.startsWith(sent) ? current.slice(sent.length).trimStart() : current,
      );
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
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.alert}>
      {message}
    </Text>
  );

  return (
    <View
      testID="chat-composer"
      style={[
        styles.frame,
        {
          paddingBottom: spacing.sm + bottomInset,
          paddingLeft: spacing.sm + (insets?.left ?? 0),
          paddingRight: spacing.sm + (insets?.right ?? 0),
        },
      ]}
    >
      <View style={styles.panel}>
        <View style={styles.highlight} pointerEvents="none" />
        {disabledReason !== undefined && (
          <Text accessibilityLiveRegion="polite" style={styles.reason}>
            {disabledReason}
          </Text>
        )}
        {tooLongText !== '' && alert(tooLongText)}
        {errorText !== '' && alert(errorText)}
        <View style={styles.row}>
          <TextInput
            ref={field}
            accessibilityLabel={t('chat.composer.label')}
            placeholder={t('chat.composer.label')}
            placeholderTextColor={colors.text.secondary}
            multiline
            submitBehavior="newline"
            scrollEnabled
            value={text}
            onChangeText={setText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[styles.field, focused && styles.fieldFocused]}
          />
          <GelIconButton
            label={t('chat.composer.send')}
            // Stryker disable next-line StringLiteral: icon weight, visual only.
            icon={<PaperPlaneRight size={iconSizes.md} color={colors.gel.text} weight="fill" />}
            onPress={() => void send()}
            disabled={!canSend}
            busy={busy || sending}
          />
        </View>
        <Text
          accessibilityLabel={t('chat.composer.counter', { count, max: MESSAGE_MAX_LENGTH })}
          style={[styles.counter, tooLong && styles.counterOver]}
        >
          {`${count}/${MESSAGE_MAX_LENGTH}`}
        </Text>
      </View>
    </View>
  );
}

// Purely visual styles, all from theme tokens. They are left out of mutation testing on
// purpose: a changed padding or colour is not behaviour a unit test should pin down
// (convencions/testing.md, «Mutation testing»). Behaviour stays in the JSX above.
// Stryker disable all
const VISIBLE_LINES = 5;
function createStyles(
  { colors, radii, spacing, touch, typography }: Theme,
  surface: ComposerSurface,
) {
  const fieldPadding = spacing.sm + spacing.xs;
  return StyleSheet.create({
    frame: {
      width: '100%',
      maxWidth: readingMaxWidth,
      alignSelf: 'center',
      paddingTop: spacing.xs,
    },
    panel: {
      gap: spacing.xs,
      padding: spacing.sm,
      overflow: 'hidden',
      borderWidth: 1,
      borderRadius: radii.lg,
      borderColor: colors.surface.glassBorder,
      backgroundColor: surface.panel,
      boxShadow: `0 10px 32px ${colors.accentGlow}4D`,
    },
    highlight: {
      position: 'absolute',
      top: 0,
      left: radii.lg,
      right: radii.lg,
      height: 1,
      backgroundColor: colors.gel.highlight[0],
    },
    reason: { ...typography.body, color: colors.text.secondary },
    alert: { ...typography.body, color: colors.state.danger },
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
    field: {
      ...typography.body,
      flex: 1,
      minHeight: touch.min,
      maxHeight: typography.body.lineHeight * VISIBLE_LINES + fieldPadding * 2,
      paddingHorizontal: spacing.md,
      paddingVertical: fieldPadding,
      borderWidth: 1,
      borderRadius: radii.md,
      textAlignVertical: 'top',
      color: colors.text.primary,
      backgroundColor: surface.field,
      borderColor: colors.surface.glassBorder,
    },
    // A ring outside the border: the focus shows without moving the layout.
    fieldFocused: { boxShadow: `0 0 0 2px ${colors.focusRing}` },
    counter: { ...typography.caption, alignSelf: 'flex-end', color: colors.text.secondary },
    counterOver: { color: colors.state.danger },
  });
}
// Stryker restore all
