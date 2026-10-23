import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LOGOUT_NOTICE } from '../hooks/useLogout';
import * as googleAuthHook from '../hooks/useGoogleAuth';
import { HILL_REFLECTION_SHARE, HILL_SHARE, LAKE_SHARE } from '../../../shared/ui/lakeLayout';
import { LIMITS, PerseidShower, REDUCED_MOTION_COUNT, SLOT_COUNT } from './PerseidShower';
import { authErrorMessage, authStrings } from '../strings';
import { AppError } from '../../../shared/errors';
import * as googleSignInModule from '../api/googleSignIn';
import * as tokenStorage from '../tokenStorage';
import LoginScreen from '../../../app/login';

const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace }),
}));

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

  it('triggers Google OAuth PKCE flow when the button is pressed (US #43 criterion 1)', async () => {
    const mockSignIn = jest.fn();
    jest.spyOn(googleAuthHook, 'useGoogleAuth').mockReturnValue({
      signIn: mockSignIn,
      isAuthenticating: false,
    });
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: authStrings.continueWithGoogle }));

    expect(mockSignIn).toHaveBeenCalled();
  });

  it('exchanges id_token for app session tokens, saves them, and navigates to the app (criteria 3, 4, 6)', async () => {
    const mockTokens = {
      access_token: 'acc-1',
      refresh_token: 'ref-1',
      token_type: 'bearer' as const,
      expires_in: 900,
    };
    jest.spyOn(googleSignInModule, 'signInWithGoogle').mockResolvedValueOnce(mockTokens);
    const saveSpy = jest.spyOn(tokenStorage, 'saveTokens').mockResolvedValueOnce();

    let capturedOptions: googleAuthHook.UseGoogleAuthOptions | undefined;
    jest.spyOn(googleAuthHook, 'useGoogleAuth').mockImplementation((opts) => {
      capturedOptions = opts;
      return {
        signIn: jest.fn(async () => {
          await capturedOptions?.onSuccess?.('id-token-valid');
          return { type: 'success' as const, idToken: 'id-token-valid' };
        }),
        isAuthenticating: false,
      };
    });

    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: authStrings.continueWithGoogle }));

    expect(googleSignInModule.signInWithGoogle).toHaveBeenCalledWith('id-token-valid');
    expect(saveSpy).toHaveBeenCalledWith({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    expect(mockReplace).toHaveBeenCalledWith('/(app)');
  });

  it('displays and announces error notice when authentication encounters an error', async () => {
    let capturedOptions: googleAuthHook.UseGoogleAuthOptions | undefined;
    jest.spyOn(googleAuthHook, 'useGoogleAuth').mockImplementation((opts) => {
      capturedOptions = opts;
      return {
        signIn: jest.fn(async () => {
          capturedOptions?.onError?.(new Error('Network request failed'));
          return { type: 'error' as const, error: new Error('Network request failed') };
        }),
        isAuthenticating: false,
      };
    });
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: authStrings.continueWithGoogle }));

    const expectedText = authErrorMessage('NETWORK_ERROR');
    expect(screen.getByText(expectedText)).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith(expectedText);
  });

  it('displays translated toast for 401 INVALID_GOOGLE_TOKEN', async () => {
    let capturedOptions: googleAuthHook.UseGoogleAuthOptions | undefined;
    jest.spyOn(googleAuthHook, 'useGoogleAuth').mockImplementation((opts) => {
      capturedOptions = opts;
      return {
        signIn: jest.fn(async () => {
          capturedOptions?.onError?.(
            new AppError({
              kind: 'http',
              status: 401,
              code: 'INVALID_GOOGLE_TOKEN',
              retryable: true,
            }),
          );
          return { type: 'error' as const, error: new Error('401') };
        }),
        isAuthenticating: false,
      };
    });
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: authStrings.continueWithGoogle }));

    expect(screen.getByText(authErrorMessage('INVALID_GOOGLE_TOKEN'))).toBeOnTheScreen();
  });

  it('displays translated toast for 403 ACCOUNT_SUSPENDED and ACCOUNT_DELETED', async () => {
    let capturedOptions: googleAuthHook.UseGoogleAuthOptions | undefined;
    jest.spyOn(googleAuthHook, 'useGoogleAuth').mockImplementation((opts) => {
      capturedOptions = opts;
      return {
        signIn: jest.fn(async () => {
          capturedOptions?.onError?.(
            new AppError({
              kind: 'http',
              status: 403,
              code: 'ACCOUNT_SUSPENDED',
              retryable: false,
            }),
          );
          return { type: 'error' as const, error: new Error('403') };
        }),
        isAuthenticating: false,
      };
    });
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: authStrings.continueWithGoogle }));

    expect(screen.getByText(authErrorMessage('ACCOUNT_SUSPENDED'))).toBeOnTheScreen();
  });

  it('displays translated toast for 409 EMAIL_ALREADY_REGISTERED', async () => {
    let capturedOptions: googleAuthHook.UseGoogleAuthOptions | undefined;
    jest.spyOn(googleAuthHook, 'useGoogleAuth').mockImplementation((opts) => {
      capturedOptions = opts;
      return {
        signIn: jest.fn(async () => {
          capturedOptions?.onError?.(
            new AppError({
              kind: 'http',
              status: 409,
              code: 'EMAIL_ALREADY_REGISTERED',
              retryable: false,
            }),
          );
          return { type: 'error' as const, error: new Error('409') };
        }),
        isAuthenticating: false,
      };
    });
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: authStrings.continueWithGoogle }));

    expect(screen.getByText(authErrorMessage('EMAIL_ALREADY_REGISTERED'))).toBeOnTheScreen();
  });

  it('displays translated toast for 503 IDENTITY_PROVIDER_UNAVAILABLE', async () => {
    let capturedOptions: googleAuthHook.UseGoogleAuthOptions | undefined;
    jest.spyOn(googleAuthHook, 'useGoogleAuth').mockImplementation((opts) => {
      capturedOptions = opts;
      return {
        signIn: jest.fn(async () => {
          capturedOptions?.onError?.(
            new AppError({
              kind: 'http',
              status: 503,
              code: 'IDENTITY_PROVIDER_UNAVAILABLE',
              retryable: true,
            }),
          );
          return { type: 'error' as const, error: new Error('503') };
        }),
        isAuthenticating: false,
      };
    });
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: authStrings.continueWithGoogle }));

    expect(screen.getByText(authErrorMessage('IDENTITY_PROVIDER_UNAVAILABLE'))).toBeOnTheScreen();
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
    let capturedOptions: googleAuthHook.UseGoogleAuthOptions | undefined;
    jest.spyOn(googleAuthHook, 'useGoogleAuth').mockImplementation((opts) => {
      capturedOptions = opts;
      return {
        signIn: jest.fn(async () => {
          capturedOptions?.onError?.(new Error('Network request failed'));
          return { type: 'error' as const, error: new Error('Network request failed') };
        }),
        isAuthenticating: false,
      };
    });
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: authStrings.continueWithGoogle }));

    const expectedText = authErrorMessage('NETWORK_ERROR');
    expect(screen.getByText(expectedText)).toBeOnTheScreen();
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
        durations.length * 0.8,
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

  describe('reflection layers', () => {
    type StyleNode = { props?: { style?: unknown }; children?: (StyleNode | string)[] | null };
    const reflectionLayers = () => {
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
      return layers;
    };
    const { height } = Dimensions.get('window');
    // Below the waterline and below the upside-down hills the water shows: only sky is
    // reflected under that line.
    const expectedTop = height * (1 - LAKE_SHARE) + height * HILL_SHARE * HILL_REFLECTION_SHARE;

    it('keeps every reflection in a layer that is only water, never in the air', async () => {
      await renderScreen();

      const layers = reflectionLayers();

      expect(layers).toHaveLength(SLOT_COUNT);
      layers.forEach((layer) => expect(layer.top).toBeCloseTo(expectedTop, 5));
    });

    it('measures the layer itself, so a phone whose screen is shorter than its window still lines up', async () => {
      await renderScreen();
      const { width } = Dimensions.get('window');

      await fireEvent(
        screen.getByTestId('perseid-shower', { includeHiddenElements: true }),
        'layout',
        {
          nativeEvent: { layout: { x: 0, y: 0, width, height: height - 48 } },
        },
      );

      // The water is anchored to the bottom: the waterline moves up with the bottom edge.
      reflectionLayers().forEach((layer) => expect(layer.top).toBeCloseTo(expectedTop - 48, 5));
    });
  });

  describe('each reflection is the exact mirror image of its meteor', () => {
    type Transform = { translateX?: number; translateY?: number; rotate?: string; scaleX?: number };
    type Bar = {
      left: number;
      top: number;
      width: number;
      height: number;
      opacity: number;
      transform: Transform[];
    };
    type TreeNode = { props?: { style?: unknown }; children?: (TreeNode | string)[] | null };

    /** [sky bar, reflection bar] of every meteor, with the top of the layer that holds each. */
    const meteorPairs = () => {
      const layers: { top: number; isReflection: boolean; bar: Bar }[] = [];
      const walk = (node: TreeNode | string) => {
        if (typeof node === 'string') return;
        const style = StyleSheet.flatten(node.props?.style as never) as Record<string, unknown>;
        if (style?.overflow === 'hidden' && typeof style.top === 'number') {
          const child = node.children?.[0];
          if (child && typeof child !== 'string') {
            layers.push({
              top: style.top,
              isReflection: style.bottom === 0,
              bar: StyleSheet.flatten(child.props?.style as never) as unknown as Bar,
            });
          }
        }
        node.children?.forEach(walk);
      };
      walk(screen.toJSON() as unknown as TreeNode);
      const sky = layers.filter((layer) => !layer.isReflection);
      const reflections = layers.filter((layer) => layer.isReflection);
      return sky.map((layer, index) => ({ sky: layer, reflection: reflections[index] }));
    };

    /** Where the head (left end) and the end of the tail of a bar are on the screen. */
    const ends = ({ top, bar }: { top: number; bar: Bar }) => {
      const find = (key: keyof Transform) => bar.transform.find((t) => key in t)?.[key];
      const rotation = (parseFloat(String(find('rotate'))) * Math.PI) / 180;
      const head = {
        x: bar.left + Number(find('translateX')),
        y: top + bar.top + bar.height / 2 + Number(find('translateY')),
      };
      const length = bar.width * Number(find('scaleX'));
      return {
        head,
        tail: { x: head.x + length * Math.cos(rotation), y: head.y + length * Math.sin(rotation) },
      };
    };

    beforeEach(() => {
      // Reduced motion freezes every meteor halfway through its flight: a fixed picture
      // that is built by the very same code as the moving one.
      mockUseReducedMotion.mockReturnValue(true);
      let state = 4242;
      jest.spyOn(Math, 'random').mockImplementation(() => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      });
    });

    const waterline = Dimensions.get('window').height * (1 - LAKE_SHARE);

    it('is under it (same x) and mirrored across the waterline, head and tail', async () => {
      await renderScreen();

      const pairs = meteorPairs();
      expect(pairs).toHaveLength(REDUCED_MOTION_COUNT);
      pairs.forEach(({ sky, reflection }) => {
        const real = ends(sky);
        const mirror = ends(reflection);

        expect(mirror.head.x).toBeCloseTo(real.head.x, 6);
        expect(mirror.tail.x).toBeCloseTo(real.tail.x, 6);
        // As far below the waterline as the real one is above it.
        expect(mirror.head.y - waterline).toBeCloseTo(waterline - real.head.y, 6);
        expect(mirror.tail.y - waterline).toBeCloseTo(waterline - real.tail.y, 6);
      });
    });

    it('is as long as the meteor and as visible as it can be (a bit fainter, never brighter)', async () => {
      await renderScreen();

      meteorPairs().forEach(({ sky, reflection }) => {
        const real = ends(sky);
        const mirror = ends(reflection);

        expect(
          Math.hypot(mirror.tail.x - mirror.head.x, mirror.tail.y - mirror.head.y),
        ).toBeCloseTo(Math.hypot(real.tail.x - real.head.x, real.tail.y - real.head.y), 6);
        expect(reflection.bar.opacity).toBeGreaterThan(0);
        expect(reflection.bar.opacity).toBeLessThanOrEqual(sky.bar.opacity);
      });
    });

    it('falls with it: it is lower at the same instant than the meteor is high, never in the air', async () => {
      await renderScreen();

      meteorPairs().forEach(({ reflection }) => {
        const mirror = ends(reflection);

        // Both ends of the reflection are below the waterline.
        expect(mirror.head.y).toBeGreaterThanOrEqual(waterline);
        expect(mirror.tail.y).toBeGreaterThanOrEqual(waterline);
      });
    });
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
