import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { achievement, mockAchievements } from '../../../../__mocks__/achievements';
import { deferredResponse } from '../../../../__mocks__/pendingResponses';
import { jsonResponse, problemResponse } from '../../../../__mocks__/profile';
import i18n from '../../../shared/i18n';
import * as tokenStorage from '../../auth/tokenStorage';
import { AchievementsSection } from './AchievementsSection';

// The glass panel draws a blur that has no meaning in the tests: a view with a name says where it is.
jest.mock('../../../shared/ui', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ...jest.requireActual<typeof import('../../../shared/ui')>('../../../shared/ui'),
    GlassPanel: ({ children }: { children: React.ReactNode }) => (
      <View testID="glass-panel">{children}</View>
    ),
  };
});

let queryClient: QueryClient;

async function renderSection() {
  return render(
    <QueryClientProvider client={queryClient}>
      <AchievementsSection />
    </QueryClientProvider>,
  );
}

function answerWith(body: unknown) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(body));
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  jest
    .spyOn(tokenStorage, 'getTokens')
    .mockResolvedValue({ accessToken: 'acc-1', refreshToken: 'ref-1' });
});

afterEach(async () => {
  queryClient.clear();
  jest.restoreAllMocks();
  await act(async () => {
    await i18n.changeLanguage('ca');
  });
});

describe('AchievementsSection (TG-59 #580)', () => {
  it('criterion 4: shows a loading state while the achievements arrive', async () => {
    const answer = deferredResponse();
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => answer.response);

    await renderSection();

    expect(screen.getByLabelText('Carregant les fites...')).toBeOnTheScreen();
    answer.answer(jsonResponse(mockAchievements));
    expect(await screen.findByText('Primera llum')).toBeOnTheScreen();
  });

  it('criterion 1: titled «Les teves insígnies», one trophy per achievement in the API order', async () => {
    answerWith(mockAchievements);

    await renderSection();

    expect(await screen.findByRole('header', { name: 'Les teves insígnies' })).toBeOnTheScreen();
    // The four unlocked ones are buttons; the other five are padlocks, not buttons.
    const unlocked = screen.getAllByRole('button').map((button) => button.props.accessibilityLabel);
    expect(unlocked).toEqual([
      'Primera llum',
      'Òrbita setmanal',
      'Primera alineació',
      "Caçador d'eclipsis",
    ]);
    expect(screen.getAllByLabelText('Fita pendent')).toHaveLength(5);
  });

  it('criterion 8: the trophies sit on a glass card, the title on the sky, so the names are legible', async () => {
    answerWith(mockAchievements);

    await renderSection();

    const card = within(await screen.findByTestId('glass-panel'));
    expect(card.getAllByRole('button')).toHaveLength(4);
    expect(card.getAllByLabelText('Fita pendent')).toHaveLength(5);
    expect(card.queryByRole('header')).not.toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Les teves insígnies' })).toBeOnTheScreen();
  });

  it('criterion 3: the pending ones show no name, so the unlocked ones are told apart without colour', async () => {
    answerWith(mockAchievements);

    await renderSection();

    await screen.findByText('Primera llum');
    expect(screen.queryByText('Lluna plena')).not.toBeOnTheScreen();
    expect(screen.queryByText('Telescopi nou')).not.toBeOnTheScreen();
  });

  it('with none unlocked it shows only the padlocks, with no message and nothing to press', async () => {
    answerWith([
      achievement({ code: 'primera_llum' }),
      achievement({ code: 'lluna_plena', name: 'Lluna plena' }),
    ]);

    await renderSection();

    expect(await screen.findAllByLabelText('Fita pendent')).toHaveLength(2);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('criterion 5: pressing an unlocked trophy opens its window with the description and «Compartir»', async () => {
    answerWith(mockAchievements);
    await renderSection();

    await fireEvent.press(await screen.findByRole('button', { name: 'Òrbita setmanal' }));

    expect(screen.getByRole('header', { name: 'Òrbita setmanal' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Compartir' })).toBeOnTheScreen();
  });

  it('closing the window leaves the grid as it was', async () => {
    answerWith(mockAchievements);
    await renderSection();
    await fireEvent.press(await screen.findByRole('button', { name: 'Òrbita setmanal' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Tancar' }));

    expect(screen.queryByRole('button', { name: 'Compartir' })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Òrbita setmanal' })).toBeOnTheScreen();
  });

  it('criterion 4: a transient error shows the message and a retry button that loads again', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => problemResponse(503, 'DATABASE_UNAVAILABLE'))
      .mockImplementationOnce(async () => problemResponse(503, 'DATABASE_UNAVAILABLE'))
      .mockImplementation(async () => jsonResponse(mockAchievements));

    await renderSection();

    const retry = await screen.findByRole('button', { name: 'Torna-ho a provar' });
    expect(retry.props.accessibilityHint).toBe('Torna a carregar les fites');
    expect(screen.getByRole('alert')).toHaveTextContent(
      "El servei no està disponible ara mateix. Torna-ho a provar d'aquí a una estona.",
    );

    await fireEvent.press(retry);

    expect(await screen.findByText('Primera llum')).toBeOnTheScreen();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('an error that retrying will not fix shows only its message', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => problemResponse(403, 'ACCOUNT_SUSPENDED'));

    await renderSection();

    expect(await screen.findByText('El teu compte està suspès.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Torna-ho a provar' })).not.toBeOnTheScreen();
  });

  it('criterion 7: follows the language of the app, title and names included', async () => {
    answerWith(mockAchievements);
    await renderSection();
    await screen.findByText('Primera llum');

    await act(async () => {
      await i18n.changeLanguage('es');
    });
    expect(screen.getByRole('header', { name: 'Tus insignias' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Primera luz' })).toBeOnTheScreen();
    expect(screen.getAllByLabelText('Logro pendiente')).toHaveLength(5);

    await act(async () => {
      await i18n.changeLanguage('en');
    });
    expect(screen.getByRole('header', { name: 'Your badges' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'First light' })).toBeOnTheScreen();
  });
});
