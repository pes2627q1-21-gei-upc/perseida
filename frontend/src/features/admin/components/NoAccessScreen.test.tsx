import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NoAccessScreen } from './NoAccessScreen';

// Texts in Catalan, the language of the tests (jest.setup.js).
const TEXT = {
  title: 'Sense accés',
  message: "El teu compte no té permís per entrar al panell d'administració.",
  logout: 'Tanca la sessió',
} as const;

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 1280, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderScreen() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <NoAccessScreen />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

// Fake timers: each test decides when the tick that brings the message in goes by.
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('NoAccessScreen (TG-77 criteri 3)', () => {
  it('tells the person, with a heading, that this account cannot use the panel', async () => {
    await renderScreen();

    expect(screen.getByRole('header', { name: TEXT.title })).toBeOnTheScreen();
    // The message comes in right after the mount (see the live region test).
    await act(() => jest.runOnlyPendingTimers());
    expect(screen.getByText(TEXT.message)).toBeOnTheScreen();
  });

  it('offers to sign out, so the person can enter with another account', async () => {
    await renderScreen();

    expect(screen.getByRole('button', { name: TEXT.logout })).toBeOnTheScreen();
  });

  it('announces the message politely to a screen reader (decided with the person, WCAG 4.1.3)', async () => {
    await renderScreen();

    // A screen reader only announces a change inside a live region that already existed: the
    // region is a container that mounts empty and gets the message after, not the text itself.
    const region = screen.getByTestId('no-access-live-region');
    expect(region).toHaveProp('accessibilityLiveRegion', 'polite');
    expect(region).toHaveProp('aria-live', 'polite');
    expect(within(region).queryByText(TEXT.message)).toBeNull();

    await act(() => jest.runOnlyPendingTimers());
    expect(within(region).getByText(TEXT.message)).toBeOnTheScreen();
    expect(screen.getByText(TEXT.message)).not.toHaveProp('accessibilityLiveRegion');
  });
});
