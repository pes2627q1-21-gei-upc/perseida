import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AdminShell } from './AdminShell';

// Texts in Catalan, the language of the tests (jest.setup.js).
const TEXT = { appName: 'Perseida', logout: 'Tanca la sessió', content: 'Contingut de la secció' };

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
});
