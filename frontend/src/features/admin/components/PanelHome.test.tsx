import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { PanelSection } from '../panelSections';
import { PANEL_SECTIONS } from '../panelSections';
import { PanelHome } from './PanelHome';

// Texts in Catalan, the language of the tests (jest.setup.js).
const WELCOME = "Benvinguda al panell d'administració de Perseida";

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 1280, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderHome(sections?: readonly PanelSection[]) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <PanelHome sections={sections} />
    </SafeAreaProvider>,
  );
}

afterEach(() => jest.clearAllMocks());

describe('PanelHome (TG-77 criteri 6)', () => {
  it('welcomes the person with the screen heading', async () => {
    await renderHome();

    expect(screen.getByRole('header', { name: WELCOME })).toBeOnTheScreen();
  });

  it('has no sections yet: TG-78, TG-79 and TG-80 add theirs to PANEL_SECTIONS', async () => {
    expect(PANEL_SECTIONS).toEqual([]);

    await renderHome();

    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  describe('with sections registered by other user stories', () => {
    // A stand-in entry: the title key is any existing key (it reads «Sense accés»).
    const SECTIONS: PanelSection[] = [
      { href: '/panel/prova', titleKey: 'admin.noAccess.title' },
      { href: '/panel/altra', titleKey: 'auth.logout' },
    ];

    it('shows one card per section, as a link with the name of the section', async () => {
      await renderHome(SECTIONS);

      expect(screen.getAllByRole('link')).toHaveLength(2);
      expect(screen.getByRole('link', { name: 'Sense accés' })).toBeOnTheScreen();
      expect(screen.getByRole('link', { name: 'Tanca la sessió' })).toBeOnTheScreen();
    });

    it('opens the section of the card that is pressed', async () => {
      await renderHome(SECTIONS);

      await fireEvent.press(screen.getByRole('link', { name: 'Sense accés' }));

      expect(mockPush).toHaveBeenCalledWith('/panel/prova');
    });
  });
});
