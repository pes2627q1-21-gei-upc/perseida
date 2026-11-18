import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import HomeScreen from '../../../app/(app)/index';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

afterEach(() => jest.clearAllMocks());

describe('Home screen: way into the outings (TG-629)', () => {
  it('has a button to the outings of the person', async () => {
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <QueryClientProvider client={new QueryClient()}>
          <HomeScreen />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Les meves sortides' }));

    expect(mockRouter.push).toHaveBeenCalledWith('/outings');
  });
});
