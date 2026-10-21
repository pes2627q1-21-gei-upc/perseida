import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LOGOUT_NOTICE } from '../hooks/useLogout';
import { LAKE_SHARE } from '../../../shared/ui/lakeLayout';
import { LIMITS, PerseidShower, SLOT_COUNT } from './PerseidShower';
import { authStrings } from '../strings';
import LoginScreen from '../../../app/login';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));

const mockUseReducedMotion = jest.fn(() => false);
// Every meteor launch, with the (fake) clock at that moment and its flight time.
const mockLaunches: { start: number; duration: number }[] = [];
const mockWithTiming = jest.fn((value: number, config?: unknown) => {
  const { duration, easing } = config as { duration: number; easing: unknown };
  // The meteors fly with a linear easing; the lake loops (waves, bubbles...) use another one.
  if (easing === 'linear') mockLaunches.push({ start: Date.now(), duration });
  return value;
});

// Reanimated needs its native worklets runtime, which does not run under Jest: the stand-in in
// __mocks__ keeps the values (no animation); here only the two things the tests watch change.
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('../../../../__mocks__/react-native-reanimated'),
  useReducedMotion: () => mockUseReducedMotion(),
  withTiming: (value: number, config: unknown) => mockWithTiming(value, config),
}));

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <LoginScreen />
    </SafeAreaProvider>,
  );
}

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockLaunches.length = 0;
  mockUseReducedMotion.mockReturnValue(false);
  mockParams = {};
});

describe('Login screen', () => {
  it('shows the app name as the screen heading and the tagline', async () => {
    await renderScreen();

    expect(screen.getByRole('header', { name: authStrings.appName })).toBeOnTheScreen();
    expect(screen.getByText(authStrings.tagline)).toBeOnTheScreen();
  });

  it('offers the Google button, reachable by role and name (US #43 criterion 1)', async () => {
    await renderScreen();

    expect(screen.getByRole('button', { name: authStrings.continueWithGoogle })).toBeOnTheScreen();
  });

  it('shows no notice until the button is pressed', async () => {
    await renderScreen();

    expect(screen.queryByText(authStrings.loginUnavailable)).not.toBeOnTheScreen();
  });

  it('explains that the sign-in is not available yet and announces it', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: authStrings.continueWithGoogle }));

    expect(screen.getByText(authStrings.loginUnavailable)).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith(authStrings.loginUnavailable);
  });

  it('explains that the sign-out was not confirmed when it comes from a failed logout', async () => {
    mockParams = { notice: LOGOUT_NOTICE };

    await renderScreen();

    expect(screen.getByText(authStrings.logoutNotConfirmed)).toBeOnTheScreen();
  });

  it('shows no notice for an unknown notice param', async () => {
    mockParams = { notice: 'something-else' };

    await renderScreen();

    expect(screen.queryByText(authStrings.logoutNotConfirmed)).not.toBeOnTheScreen();
  });

  it('leaves the announcement to the live region on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: authStrings.continueWithGoogle }));

    expect(screen.getByText(authStrings.loginUnavailable)).toBeOnTheScreen();
    expect(announce).not.toHaveBeenCalled();
  });

  it('hides the decorative Perseid shower from screen readers and from touches', async () => {
    await render(<PerseidShower />);

    const root = screen.toJSON() as { props: Record<string, unknown> };
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(root.props.pointerEvents).toBe('none');
  });

  describe('with the clock under control', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      // The shower is random: a fixed seed keeps these tests from ever flaking (mulberry32).
      let state = 20261021;
      jest.spyOn(Math, 'random').mockImplementation(() => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      });
    });
    afterEach(() => jest.useRealTimers());

    const advance = (ms: number) =>
      act(async () => {
        await jest.advanceTimersByTimeAsync(ms);
      });

    it('launches meteors by itself, one after another, as time goes by', async () => {
      await renderScreen();
      expect(mockLaunches).toHaveLength(0);

      await advance(60_000);

      expect(mockLaunches.length).toBeGreaterThan(SLOT_COUNT);
    });

    it('gives every meteor its own flight time, inside the limits', async () => {
      await renderScreen();

      await advance(120_000);

      const durations = mockLaunches.map(({ duration }) => duration);
      expect(durations.length).toBeGreaterThan(20);
      durations.forEach((duration) => {
        expect(duration).toBeGreaterThanOrEqual(LIMITS.flightMs[0]);
        expect(duration).toBeLessThanOrEqual(LIMITS.flightMs[1]);
      });
      expect(new Set(durations.map((d) => Math.round(d))).size).toBeGreaterThan(
        durations.length * 0.9,
      );
    });

    it('keeps launching without ever stacking more flights than the limit', async () => {
      await renderScreen();

      await advance(180_000);

      expect(mockLaunches.length).toBeGreaterThan(20);
      // Sweep over the launches and landings, in time order, counting the flights in the air.
      const events = mockLaunches
        .flatMap(({ start, duration }) => [
          { at: start, change: 1 },
          { at: start + duration, change: -1 },
        ])
        // At the same instant a landing comes first: the place is free for the next launch.
        .sort((a, b) => a.at - b.at || a.change - b.change);
      let inFlight = 0;
      let mostAtOnce = 0;
      events.forEach(({ change }) => {
        inFlight += change;
        mostAtOnce = Math.max(mostAtOnce, inFlight);
      });
      expect(mostAtOnce).toBeLessThanOrEqual(LIMITS.maxActive[1]);
      expect(mostAtOnce).toBeGreaterThanOrEqual(2);
    });
  });

  it('keeps every reflection in a layer that is exactly the water, so it is never in the air', async () => {
    await renderScreen();

    type StyleNode = { props?: { style?: unknown }; children?: (StyleNode | string)[] | null };
    const layers: Record<string, unknown>[] = [];
    const walk = (node: StyleNode | string) => {
      if (typeof node === 'string') return;
      const style = StyleSheet.flatten(node.props?.style as never) as Record<string, unknown>;
      if (style?.overflow === 'hidden' && typeof style.top === 'number' && style.bottom === 0) {
        layers.push(style);
      }
      node.children?.forEach(walk);
    };
    walk(screen.toJSON() as unknown as StyleNode);
    const { height } = Dimensions.get('window');
    const waterline = height * (1 - LAKE_SHARE);

    // One reflection layer per meteor slot, every one starting at the waterline.
    expect(layers).toHaveLength(SLOT_COUNT);
    layers.forEach((layer) => expect(layer.top).toBeCloseTo(waterline, 5));
  });

  it('paints the shower before the content: no meteor can cover a letter or a button', async () => {
    await renderScreen();

    type Node = { props?: Record<string, unknown>; children?: (Node | string)[] | null };
    const order: Node[] = [];
    const walk = (node: Node | string) => {
      if (typeof node === 'string') return;
      order.push(node);
      node.children?.forEach(walk);
    };
    walk(screen.toJSON() as unknown as Node);
    const position = (matches: (node: Node) => boolean) => order.findIndex(matches);
    const shower = position(
      (node) =>
        node.props?.accessibilityElementsHidden === true && node.props?.pointerEvents === 'none',
    );
    const title = position((node) => node.props?.accessibilityRole === 'header');
    const button = position((node) => node.props?.accessibilityRole === 'button');

    expect(shower).toBeGreaterThanOrEqual(0);
    // Later in the tree is painted on top: the shower has to come first.
    expect(shower).toBeLessThan(title);
    expect(shower).toBeLessThan(button);
  });

  it('starts no animation with reduced motion on: the streaks stay frozen', async () => {
    mockUseReducedMotion.mockReturnValue(true);

    await renderScreen();

    expect(mockLaunches).toHaveLength(0);
    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: authStrings.continueWithGoogle })).toBeOnTheScreen();
  });
});
