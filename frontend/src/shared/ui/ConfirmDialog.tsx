import { Modal, StyleSheet, Text, View } from 'react-native';

import { readingMaxWidth, useTheme } from '../theme';
import { GelButton } from './GelButton';
import { GlassPanel } from './GlassPanel';
import { QuietButton } from './QuietButton';

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  /** Also what the back button of the system and Escape on the web do. */
  onCancel: () => void;
  /** The action is in progress: the confirm button is announced as busy and ignores taps. */
  busy?: boolean;
}

/**
 * Asks before something that cannot be undone. A glass panel over a veil, in a Modal so it
 * works on every platform (`Alert.alert` does nothing on the web): the system sends the focus
 * into it, and screen readers leave the screen behind alone.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
}: Props) {
  const { colors, spacing, typography } = useTheme();

  return (
    <Modal
      testID="confirm-dialog-modal"
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View
        testID="confirm-dialog"
        accessibilityViewIsModal
        style={[styles.veil, { backgroundColor: colors.surface.scrim, padding: spacing.md }]}
      >
        <View style={[styles.panel, { maxWidth: readingMaxWidth }]}>
          <GlassPanel>
            <View style={{ gap: spacing.md }}>
              <Text
                accessibilityRole="header"
                style={[typography.title, { color: colors.text.primary }]}
              >
                {title}
              </Text>
              <Text style={[typography.body, { color: colors.text.primary }]}>{message}</Text>
              <View style={[styles.actions, { gap: spacing.sm }]}>
                <QuietButton label={cancelLabel} onPress={onCancel} />
                <GelButton label={confirmLabel} onPress={onConfirm} busy={busy} />
              </View>
            </View>
          </GlassPanel>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  veil: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panel: { width: '100%' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap' },
});
