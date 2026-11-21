import { useRouter } from 'expo-router';
import { ArrowsClockwise, ChatCircleSlash, ChatsCircle } from 'phosphor-react-native';
import { type ComponentRef, type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SocketStatus } from '../../../shared/realtime';
import { readingMaxWidth, type Theme, useTheme } from '../../../shared/theme';
import {
  GlassPanel,
  QuietButton,
  SkyBackground,
  StatusPanel,
  TopBar,
  useReduceTransparency,
} from '../../../shared/ui';
import { arrivedKeys, type ChatListItem } from '../chatItems';
import { useMySubscriptions } from '../hooks/useChat';
import { useRoomLive } from '../hooks/useRoomLive';
import { rowSurface } from '../rowSurface';
import { useAnnounceOnIos } from '../useAnnounceOnIos';
import { MessageComposer } from './MessageComposer';
import { MessageList } from './MessageList';

/** Refused by the server: the person is not (or no longer) part of the room. */
const FORBIDDEN = 'FORBIDDEN';

type Styles = ReturnType<typeof createStyles>;

/** The keyboard is up. iOS tells it before it moves; Android only once it has moved. */
function useKeyboardShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setShown(true),
    );
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setShown(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

/**
 * What a screen reader is told of the newest message of another person that arrives while the
 * room is open (WCAG 4.1.3). The history and my own messages are not news. The focus stays where
 * the person had it.
 */
function useArrivalNotice(items: ChatListItem[]) {
  const { t } = useTranslation();
  // The items of the previous render, to tell what has just arrived (React: «storing information
  // from previous renders»).
  const [previous, setPrevious] = useState(items);
  const [arrival, setArrival] = useState<{ key: string; text: string }>();
  if (items !== previous) {
    setPrevious(items);
    const arrived = arrivedKeys(items, previous);
    const newest = items.find(
      (item) => item.kind === 'message' && !item.mine && arrived.has(item.key),
    );
    if (newest?.kind === 'message') {
      const { author, text } = newest.message;
      setArrival({
        key: newest.key,
        text: t('chat.room.newMessage', { author: author.name ?? t('chat.unknownAuthor'), text }),
      });
    }
  }

  // Android reads the live region by itself; iOS needs an explicit announcement.
  useEffect(() => {
    if (arrival && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(arrival.text);
  }, [arrival]);

  return arrival;
}

/** The notice fades in where it floats, so nothing under it moves. Still with reduced motion. */
function useFadeIn() {
  const { duration } = useTheme();
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    // Stryker disable next-line ObjectLiteral: curve of the fade, visual only.
    shown.value = withTiming(1, { duration: duration.base, easing: Easing.out(Easing.cubic) });
  }, [shown, duration.base]);
  return useAnimatedStyle(() => ({ opacity: shown.value }));
}

/** A decorative icon: the text next to it carries the meaning. */
function Decoration({ children }: { children: ReactNode }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {children}
    </View>
  );
}

/**
 * «Reconnectant…», a small glass pill under the bar. Screen readers skip it: the composer already
 * says, as a live region, that nothing can be sent until the connection is back.
 */
function ReconnectingPill({ styles }: { styles: Styles }) {
  const { t } = useTranslation();
  const { colors, iconSizes } = useTheme();
  const fadeIn = useFadeIn();

  return (
    <Animated.View style={[styles.pill, fadeIn]}>
      <Decoration>
        <ArrowsClockwise size={iconSizes.sm} color={colors.text.secondary} />
      </Decoration>
      <Text accessible={false} importantForAccessibility="no" style={styles.pillText}>
        {t('chat.room.reconnecting')}
      </Text>
    </Animated.View>
  );
}

/** The connection states that show a notice (a pill, or the button to reconnect). */
function hasConnectionNotice(status: SocketStatus) {
  return status === 'reconnecting' || status === 'closed';
}

/**
 * The state of the live connection, floating under the bar. It does not move the messages, but
 * it reports its height so the list can start below it while it is there.
 */
function ConnectionNotice({
  status,
  onReconnect,
  top,
  onHeight,
  styles,
}: {
  status: SocketStatus;
  onReconnect: () => void;
  top: number;
  onHeight: (height: number) => void;
  styles: Styles;
}) {
  const { t } = useTranslation();
  const { colors, iconSizes } = useTheme();

  let notice;
  if (status === 'reconnecting') notice = <ReconnectingPill styles={styles} />;
  else if (status === 'closed')
    notice = (
      <View style={styles.buttonPill}>
        <QuietButton
          label={t('chat.room.reconnect')}
          onPress={onReconnect}
          icon={
            <Decoration>
              <ArrowsClockwise size={iconSizes.sm} color={colors.text.primary} />
            </Decoration>
          }
        />
      </View>
    );
  else return null;

  return (
    <View
      pointerEvents="box-none"
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
      style={[styles.notice, { top }]}
    >
      {notice}
    </View>
  );
}

/** A calm glass card in the middle of the room: an icon, a text and, maybe, an action. */
function RoomCard({
  icon,
  text,
  live = false,
  children,
  styles,
}: {
  icon: ReactNode;
  text: string;
  /** The card replaces what was there (e.g. the person was taken out): it is read out. */
  live?: boolean;
  children?: ReactNode;
  styles: Styles;
}) {
  useAnnounceOnIos(live ? text : undefined);

  return (
    <View style={styles.column}>
      <GlassPanel>
        <View style={styles.card}>
          <Decoration>{icon}</Decoration>
          <Text accessibilityLiveRegion={live ? 'polite' : 'none'} style={styles.cardText}>
            {text}
          </Text>
          {children}
        </View>
      </GlassPanel>
    </View>
  );
}

/**
 * The room of an event (TG-469, US TG-64): the sky, a floating glass bar with the title of the
 * event and the way back, the messages over the sky and the composer as a glass capsule at the
 * bottom, kept above the keyboard. The page only orchestrates: the room lives in useRoomLive,
 * whose reload also joins the live room again after a refused join. A message that did not go
 * through stays in its bubble, with its reason, to retry or discard it there.
 * Taken out of the room (or refused), it explains why and offers the way back, with no composer.
 */
export function ChatRoomScreen({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const { colors, iconSizes, spacing } = theme;
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, useReduceTransparency());
  const live = useRoomLive(eventId);
  const subscriptions = useMySubscriptions();
  const keyboardShown = useKeyboardShown();
  const composerField = useRef<ComponentRef<typeof TextInput>>(null);
  const arrival = useArrivalNotice(live.items);
  const [barBottom, setBarBottom] = useState(0);
  const [noticeHeight, setNoticeHeight] = useState(0);

  const title =
    subscriptions.data?.find((event) => event.id === eventId)?.title ?? t('chat.room.title');
  const revoked = live.revoked || live.error?.code === FORBIDDEN;
  const error = revoked ? null : live.error;
  const canWrite = !revoked && !error;
  // The notice floats under the bar: while it is there the list and the states of the room
  // (loading, empty) start below it, not under it.
  const noticeShown = canWrite && hasConnectionNotice(live.status);
  const listTop = barBottom + spacing.sm + (noticeShown ? noticeHeight + spacing.sm : 0);

  function goBack() {
    // Opened from a link there is nowhere to go back to: open the list of rooms instead.
    if (router.canGoBack()) router.back();
    else router.replace('/chat');
  }

  const disabledReasons: Partial<Record<SocketStatus, string>> = {
    connecting: t('chat.room.connection.connecting'),
    reconnecting: t('chat.room.connection.reconnecting'),
    closed: t('chat.room.connection.closed'),
  };
  const statusTexts = {
    loadingLabel: t('chat.room.loading'),
    retry: t('chat.retry'),
    retryHint: t('chat.room.retryHint'),
  };
  const underBar = { paddingTop: barBottom };
  const underNotice = noticeShown ? { paddingTop: listTop } : underBar;

  let body;
  if (revoked) {
    body = (
      <View style={[styles.center, underBar]}>
        <RoomCard
          live
          text={t('chat.room.revoked')}
          icon={<ChatCircleSlash size={iconSizes.lg} color={colors.text.primary} />}
          styles={styles}
        >
          <QuietButton label={t('chat.room.backToRooms')} onPress={goBack} />
        </RoomCard>
      </View>
    );
  } else if (error) {
    body = (
      <View style={[styles.fill, underBar]}>
        <StatusPanel
          state="error"
          code={error.code}
          onRetry={error.retryable ? live.reload : undefined}
          texts={statusTexts}
        />
      </View>
    );
  } else if (live.isLoading) {
    body = (
      <View style={[styles.fill, underNotice]}>
        <StatusPanel state="loading" texts={statusTexts} />
      </View>
    );
  } else if (live.items.length === 0) {
    body = (
      <View style={[styles.center, underNotice]}>
        <RoomCard
          text={t('chat.room.empty')}
          icon={<ChatsCircle size={iconSizes.lg} color={colors.text.primary} weight="duotone" />}
          styles={styles}
        />
      </View>
    );
  } else {
    body = (
      <MessageList
        items={live.items}
        hasMore={live.hasMore}
        isFetchingMore={live.isFetchingMore}
        onLoadOlder={live.loadOlder}
        onRetry={(clientMessageId) => void live.retry(clientMessageId)}
        onDiscard={(clientMessageId) => {
          live.discard(clientMessageId);
          // The bubble goes away with it: the focus goes to the field, not nowhere.
          composerField.current?.focus();
        }}
        listProps={{
          keyboardShouldPersistTaps: 'handled',
          keyboardDismissMode: 'interactive',
          // The list is inverted: its bottom padding is drawn at the top, under the bar.
          contentContainerStyle: {
            paddingBottom: listTop,
            paddingLeft: insets.left + spacing.md,
            paddingRight: insets.right + spacing.md,
          },
        }}
      />
    );
  }

  return (
    <SkyBackground>
      <TopBar title={title} testID="chat-room-top-bar" onBack={goBack} onLayout={setBarBottom} />
      {canWrite && (
        <ConnectionNotice
          status={live.status}
          onReconnect={live.reconnect}
          top={barBottom + spacing.sm}
          onHeight={setNoticeHeight}
          styles={styles}
        />
      )}
      <KeyboardAvoidingView
        testID="chat-room-keyboard"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <View style={styles.fill}>{body}</View>
        {canWrite && (
          <MessageComposer
            onSend={live.send}
            busy={live.isLoading}
            disabledReason={disabledReasons[live.status]}
            bottomInset={keyboardShown ? 0 : insets.bottom}
            fieldRef={composerField}
          />
        )}
      </KeyboardAvoidingView>
      {arrival && Platform.OS !== 'ios' && (
        // A live region only speaks when its text changes: each arrival gets a new one (its key),
        // so a message with the same text as the one before is read too.
        <Text key={arrival.key} accessibilityLiveRegion="polite" style={styles.offscreen}>
          {arrival.text}
        </Text>
      )}
    </SkyBackground>
  );
}

// Purely visual styles, all from theme tokens. They are left out of mutation testing on
// purpose: a changed padding or colour is not behaviour a unit test should pin down
// (convencions/testing.md, «Mutation testing»). Behaviour stays in the JSX above.
// Stryker disable all
function createStyles({ colors, radii, spacing, typography }: Theme, reduceTransparency: boolean) {
  const pillSurface = rowSurface(colors.surface, reduceTransparency);
  return StyleSheet.create({
    fill: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', padding: spacing.md },
    column: { width: '100%', maxWidth: readingMaxWidth, alignSelf: 'center' },
    card: { alignItems: 'center', gap: spacing.md },
    cardText: { ...typography.body, textAlign: 'center', color: colors.text.primary },
    notice: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderWidth: 1,
      borderRadius: radii.pill,
      borderColor: colors.surface.glassBorder,
      backgroundColor: pillSurface,
    },
    pillText: { ...typography.caption, color: colors.text.primary },
    // The quiet button draws the rim; the pill under it gives the text its contrast.
    buttonPill: { borderRadius: radii.pill, backgroundColor: pillSurface },
    // Read by TalkBack as a live region, never seen: one pixel, clipped. Not transparent nor off
    // the screen, which TalkBack could take for not shown and skip.
    offscreen: { position: 'absolute', top: 0, left: 0, width: 1, height: 1, overflow: 'hidden' },
  });
}
// Stryker restore all
