import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { achievement, mockAchievements } from '../../../../__mocks__/achievements';
import { deferredResponse } from '../../../../__mocks__/pendingResponses';
import { jsonResponse, problemResponse } from '../../../../__mocks__/profile';
import i18n from '../../../shared/i18n';
import * as tokenStorage from '../../auth/tokenStorage';
import { AchievementProgressSection } from './AchievementProgressSection';

let queryClient: QueryClient;

async function renderSection() {
  return render(
    <QueryClientProvider client={queryClient}>
      <AchievementProgressSection />
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

describe('AchievementProgressSection (TG-57)', () => {
  it('criterion 4: shows a loading state while the achievements arrive', async () => {
    const answer = deferredResponse();
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => answer.response);

    await renderSection();

    expect(screen.getByLabelText('Carregant les fites...')).toBeOnTheScreen();
    answer.answer(jsonResponse(mockAchievements));
    expect(await screen.findByText('Lluna plena')).toBeOnTheScreen();
  });

  it('criterion 1: one card per category, in order, even the ones at 0', async () => {
    answerWith(mockAchievements);

    await renderSection();

    await screen.findByText('Lluna plena');
    const headers = screen.getAllByRole('header').map((header) => header.props.children);
    expect(headers).toEqual([
      'Les teves properes fites',
      'Ratxes',
      'Quiz',
      'Esdeveniments',
      'Social',
      'Minijoc',
    ]);
    expect(screen.getByText('Telescopi nou')).toBeOnTheScreen();
    expect(screen.getByText('Satèl·lit')).toBeOnTheScreen();
    expect(screen.getByText('Llançament')).toBeOnTheScreen();
  });

  it('criteria 2 and 7: the next achievement with its progress, read as «name, X de Y»', async () => {
    answerWith(mockAchievements);

    await renderSection();

    expect(await screen.findByText('8/14 dies')).toBeOnTheScreen();
    const bar = screen.getByRole('progressbar', { name: 'Lluna plena, 8 de 14' });
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 14, now: 8 });
    // Quiz, Social and Minijoc are still at 0 of their first achievement.
    expect(screen.getAllByText('0/1')).toHaveLength(3);
  });

  it('criterion 2: a finished category keeps the bar full and congratulates', async () => {
    answerWith(mockAchievements);

    await renderSection();

    const bar = await screen.findByRole('progressbar', { name: "Caçador d'eclipsis, 10 de 10" });
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 10, now: 10 });
    expect(within(bar).getByTestId('achievement-progress-fill')).toHaveStyle({ width: '100%' });
    expect(
      screen.getByText("Enhorabona! Has completat totes les fites d'aquesta categoria."),
    ).toBeOnTheScreen();
  });

  it('criterion 3: a streak at 0 invites to start, with the singular «1 dia»', async () => {
    answerWith([achievement({ code: 'primera_llum', current: 0, goal: 1 })]);

    await renderSection();

    expect(await screen.findByText('0/1 dia')).toBeOnTheScreen();
    expect(
      screen.getByText('Obre la imatge astronòmica del dia per començar la teva ratxa.'),
    ).toBeOnTheScreen();
  });

  it('a streak already going does not show the invitation', async () => {
    answerWith(mockAchievements);

    await renderSection();

    await screen.findByText('8/14 dies');
    expect(screen.queryByText(/per començar la teva ratxa/)).not.toBeOnTheScreen();
  });

  it('the progress never goes past the goal, even if the server sends more', async () => {
    answerWith([achievement({ code: 'lluna_plena', current: 20, goal: 14 })]);

    await renderSection();

    const bar = await screen.findByRole('progressbar', { name: 'Lluna plena, 14 de 14' });
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 14, now: 14 });
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

    expect(await screen.findByText('Lluna plena')).toBeOnTheScreen();
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

  it('criterion 6: follows the language of the app, names of the achievements included', async () => {
    answerWith(mockAchievements);
    await renderSection();
    await screen.findByText('Lluna plena');

    await act(async () => {
      await i18n.changeLanguage('es');
    });
    expect(screen.getByRole('header', { name: 'Tus próximos logros' })).toBeOnTheScreen();
    expect(screen.getByText('Luna llena')).toBeOnTheScreen();
    expect(screen.getByText('8/14 días')).toBeOnTheScreen();

    await act(async () => {
      await i18n.changeLanguage('en');
    });
    expect(screen.getByRole('header', { name: 'Streaks' })).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'Full moon, 8 of 14' })).toBeOnTheScreen();
  });

  it('an achievement the app does not know yet shows the name the server sends', async () => {
    answerWith([achievement({ code: 'nova_fita', name: 'Nova fita', goal: 3 })]);

    await renderSection();

    expect(await screen.findByText('Nova fita')).toBeOnTheScreen();
  });

  it('a category with no achievement in the catalogue says so instead of a bar', async () => {
    answerWith([]);

    await renderSection();

    expect(await screen.findAllByText('Encara no hi ha fites en aquesta categoria.')).toHaveLength(
      5,
    );
    expect(screen.queryByRole('progressbar')).not.toBeOnTheScreen();
  });
});
