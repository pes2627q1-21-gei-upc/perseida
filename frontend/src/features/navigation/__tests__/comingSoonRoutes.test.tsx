import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BottomTabBarHeightContext } from 'expo-router/tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ChatScreen from '../../../app/(app)/chat';
import EventsScreen from '../../../app/(app)/events';
import GamificationScreen from '../../../app/(app)/gamification';
import HomeScreen from '../../../app/(app)/index';
import ProfileRoute from '../../../app/(app)/profile';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('../../profile', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return { ProfileScreen: () => <MockText>profile-screen</MockText> };
});

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderRoute(Route: () => React.JSX.Element) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <Route />
    </SafeAreaProvider>,
  );
}

afterEach(() => mockPush.mockClear());

describe('Tab routes (TG-385 #388)', () => {
  it.each([
    ['chat', ChatScreen, 'Comunitat i xat'],
    ['events', EventsScreen, 'Esdeveniments astronòmics'],
    ['gamification', GamificationScreen, 'Gamificació i reptes'],
  ])('%s shows its translated «coming soon» screen', async (_name, Route, title) => {
    await renderRoute(Route);

    expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();
    expect(screen.getByText('Pròximament')).toBeOnTheScreen();
  });

  it('events opens the events map from its «coming soon» screen', async () => {
    await renderRoute(EventsScreen);

    await fireEvent.press(screen.getByRole('button', { name: "Obre el mapa d'esdeveniments" }));

    expect(mockPush).toHaveBeenCalledWith('/map');
  });

  it('profile renders the profile feature screen', async () => {
    await renderRoute(ProfileRoute);

    expect(screen.getByText('profile-screen')).toBeOnTheScreen();
  });

  it('the temporary home keeps its buttons clear of the floating tab bar (TG-385 criteri 5)', async () => {
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <QueryClientProvider client={new QueryClient()}>
          <BottomTabBarHeightContext.Provider value={83}>
            <HomeScreen />
          </BottomTabBarHeightContext.Provider>
        </QueryClientProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('home-screen')).toHaveStyle({ paddingBottom: 83 });
  });
});
