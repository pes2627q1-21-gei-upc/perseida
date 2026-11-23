import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import i18n from '../../shared/i18n';
import { AdminShell } from './components/AdminShell';
import { NoAccessScreen } from './components/NoAccessScreen';
import { PanelHome } from './components/PanelHome';

// Every text of the panel in the three languages (TG-77 criteri 7).
const TEXTS = {
  ca: {
    welcome: "Benvinguda al panell d'administració de Perseida",
    skip: 'Salta al contingut',
    logout: 'Tanca la sessió',
    noAccess: 'Sense accés',
  },
  es: {
    welcome: 'Bienvenida al panel de administración de Perseida',
    skip: 'Salta al contenido',
    logout: 'Cierra la sesión',
    noAccess: 'Sin acceso',
  },
  en: {
    welcome: 'Welcome to the Perseida admin panel',
    skip: 'Skip to content',
    logout: 'Sign out',
    noAccess: 'No access',
  },
} as const;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 1280, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderInProviders(children: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SafeAreaProvider initialMetrics={SAFE_AREA}>{children}</SafeAreaProvider>
    </QueryClientProvider>,
  );
}

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('ca');
  });
});

describe('the panel changes language as a whole (TG-77 criteri 7)', () => {
  it.each(['ca', 'es', 'en'] as const)('shows the home and the top bar in %s', async (lang) => {
    await act(async () => {
      await i18n.changeLanguage(lang);
    });

    await renderInProviders(
      <AdminShell>
        <PanelHome />
      </AdminShell>,
    );

    expect(screen.getByRole('header', { name: TEXTS[lang].welcome })).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: TEXTS[lang].skip })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: TEXTS[lang].logout })).toBeOnTheScreen();
  });

  it.each(['ca', 'es', 'en'] as const)('shows «sense accés» in %s', async (lang) => {
    await act(async () => {
      await i18n.changeLanguage(lang);
    });

    await renderInProviders(<NoAccessScreen />);

    expect(screen.getByRole('header', { name: TEXTS[lang].noAccess })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: TEXTS[lang].logout })).toBeOnTheScreen();
  });

  it('switches the text of a screen that is already open', async () => {
    await renderInProviders(
      <AdminShell>
        <PanelHome />
      </AdminShell>,
    );
    expect(screen.getByRole('header', { name: TEXTS.ca.welcome })).toBeOnTheScreen();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('header', { name: TEXTS.en.welcome })).toBeOnTheScreen();
    expect(screen.queryByText(TEXTS.ca.welcome)).not.toBeOnTheScreen();
  });
});
