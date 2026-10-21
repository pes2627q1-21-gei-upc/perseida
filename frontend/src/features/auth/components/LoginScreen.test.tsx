import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LOGOUT_NOTICE } from '../hooks/useLogout';
import { PerseidShower } from './PerseidShower';
import { authStrings } from '../strings';
import LoginScreen from '../../../app/login';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));

const mockUseReducedMotion = jest.fn(() => false);
const mockWithRepeat = jest.fn((animation: unknown) => animation);

// Reanimated needs its native worklets runtime, which does not run under Jest: a small stand-in
// that keeps the values (no animation) is enough to check what the screen decides.
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { linear: 'linear' },
    cancelAnimation: jest.fn(),
    interpolate: () => 0,
    useAnimatedStyle: (style: () => object) => style(),
    useReducedMotion: () => mockUseReducedMotion(),
    useSharedValue: (value: number) => ({ value }),
    withDelay: (_delay: number, animation: unknown) => animation,
    withRepeat: (animation: unknown) => mockWithRepeat(animation),
    withTiming: (value: number) => value,
  };
});

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

  it('starts one animation per meteor by default', async () => {
    await renderScreen();

    expect(mockWithRepeat).toHaveBeenCalledTimes(3);
  });

  it('starts no animation with reduced motion on: the streaks stay frozen', async () => {
    mockUseReducedMotion.mockReturnValue(true);

    await renderScreen();

    expect(mockWithRepeat).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: authStrings.continueWithGoogle })).toBeOnTheScreen();
  });
});
