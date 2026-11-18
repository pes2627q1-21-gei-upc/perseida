import { fireEvent, render, screen } from '@testing-library/react-native';
import { BottomTabBarHeightContext } from 'expo-router/tabs';
import { Planet } from 'phosphor-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { spacing } from '../../../shared/theme';
import { ComingSoonTab } from './ComingSoonTab';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('ComingSoonTab (TG-385 #388)', () => {
  it('renders title, description and badge', async () => {
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <ComingSoonTab
          title="Esdeveniments astronòmics"
          description="Molt aviat podràs consultar pluges d'estels i fenòmens."
          icon={Planet}
          badge="Pròximament"
        />
      </SafeAreaProvider>,
    );

    const heading = screen.getByRole('header');
    expect(heading).toHaveTextContent('Esdeveniments astronòmics');
    expect(
      screen.getByText("Molt aviat podràs consultar pluges d'estels i fenòmens."),
    ).toBeOnTheScreen();
    expect(screen.getByText('Pròximament')).toBeOnTheScreen();
  });

  it('renders action button and triggers onPress callback when clicked', async () => {
    const handlePress = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <ComingSoonTab
          title="Esdeveniments astronòmics"
          description="Explora el mapa."
          icon={Planet}
          action={{ label: 'Obre el mapa', onPress: handlePress }}
        />
      </SafeAreaProvider>,
    );

    const button = screen.getByRole('button', { name: 'Obre el mapa' });
    expect(button).toBeOnTheScreen();
    await fireEvent.press(button);
    expect(handlePress).toHaveBeenCalledTimes(1);
  });

  it('keeps its content clear of the floating tab bar (TG-385 criteri 5)', async () => {
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <BottomTabBarHeightContext.Provider value={83}>
          <ComingSoonTab title="Xat" description="Aviat." icon={Planet} />
        </BottomTabBarHeightContext.Provider>
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('coming-soon-tab').props.contentContainerStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ paddingBottom: 83 + spacing.lg })]),
    );
  });

  it('scrolls when the window is too short for the card, e.g. a phone in landscape (TG-385 #520)', async () => {
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <ComingSoonTab
          title="Esdeveniments astronòmics"
          description="Explora el mapa."
          icon={Planet}
          action={{ label: 'Obre el mapa', onPress: jest.fn() }}
        />
      </SafeAreaProvider>,
    );

    const scroll = screen.getByTestId('coming-soon-tab');
    expect(scroll.type).toBe('RCTScrollView');
    expect(scroll).toContainElement(screen.getByRole('button', { name: 'Obre el mapa' }));
  });
});
