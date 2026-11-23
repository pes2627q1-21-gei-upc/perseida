import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AdminShell } from './AdminShell';

// Texts in Catalan, the language of the tests (jest.setup.js).
const TEXT = {
  appName: 'Perseida',
  logout: 'Tanca la sessió',
  content: 'Contingut de la secció',
  skip: 'Salta al contingut',
  topBar: 'Barra superior del panell',
  main: 'Contingut del panell',
};

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 1280, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderShell() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <AdminShell>
          <Text>{TEXT.content}</Text>
        </AdminShell>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

describe('AdminShell (TG-77 criteri 6)', () => {
  it('shows the name of the app in the top bar', async () => {
    await renderShell();

    expect(screen.getByText(TEXT.appName)).toBeOnTheScreen();
  });

  it('lets the person sign out from the top bar', async () => {
    await renderShell();

    expect(screen.getByRole('button', { name: TEXT.logout })).toBeOnTheScreen();
  });

  it('draws the content of the section under the bar', async () => {
    await renderShell();

    expect(screen.getByText(TEXT.content)).toBeOnTheScreen();
  });

  describe('accessibility for keyboard and screen readers (WCAG 2.2 AA, TG-77 criteri 8)', () => {
    it('marks the top bar and the page as named regions, so a screen reader can jump to them', async () => {
      await renderShell();

      // A View is not an accessibility element for getByRole: the named region is found by label.
      const banner = screen.getByLabelText(TEXT.topBar);
      const main = screen.getByLabelText(TEXT.main);
      expect(banner).toHaveProp('role', 'banner');
      expect(main).toHaveProp('role', 'main');
      expect(within(banner).getByText(TEXT.appName)).toBeOnTheScreen();
      expect(within(main).getByText(TEXT.content)).toBeOnTheScreen();
    });

    it('offers a link to skip to the content that moves the focus to the page', async () => {
      const send = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation();
      await renderShell();

      await fireEvent.press(screen.getByRole('link', { name: TEXT.skip }));

      expect(send).toHaveBeenCalledWith(expect.anything(), 'focus');
      send.mockRestore();
    });

    it('shows a focus ring on the skip link when the keyboard reaches it', async () => {
      await renderShell();
      const link = screen.getByRole('link', { name: TEXT.skip });
      const ring = () => StyleSheet.flatten(screen.getByTestId('skip-link-ring').props.style);
      expect(ring().boxShadow).toBeUndefined();

      await fireEvent(link, 'focus');
      expect(ring().boxShadow).toMatch(/^0 0 0 3px #/);

      await fireEvent(link, 'blur');
      expect(ring().boxShadow).toBeUndefined();
    });
  });
});
