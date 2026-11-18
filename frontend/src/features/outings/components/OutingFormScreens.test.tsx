import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { jsonResponse, problemResponse } from '../../../../__mocks__/apod';
import { myOuting } from '../../../../__mocks__/outings';
import { AppError } from '../../../shared/errors';
import { saveTokens } from '../../auth/tokenStorage';
import { type OutingFormValues, outingToValues } from '../outingForm';
import { EditOutingScreen } from './EditOutingScreen';
import { NewOutingScreen } from './NewOutingScreen';

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  push: jest.fn(),
  replace: jest.fn(),
};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

// SecureStore is native: an in-memory store stands in for the device keychain.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

// The form has its own tests: here it is a button that hands the screen the values it is asked
// to, and shows what the screen gave it.
let mockFormProps: {
  initial: OutingFormValues;
  editing?: boolean;
  onSubmit: (values: OutingFormValues) => Promise<unknown>;
};
let mockSubmitted: OutingFormValues | undefined;
let mockSubmitResult: unknown;
jest.mock('./OutingForm', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    OutingForm: (props: typeof mockFormProps) => {
      mockFormProps = props;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="send form"
          onPress={() => {
            if (mockSubmitted) {
              props.onSubmit(mockSubmitted).then(
                (value) => (mockSubmitResult = value),
                (error) => (mockSubmitResult = error),
              );
            }
          }}
        >
          <Text>form</Text>
        </Pressable>
      );
    },
  };
});

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

let client: QueryClient;
let fetchSpy: jest.SpyInstance;
let answer: (request: Request) => Response | Promise<Response>;

function requests(method: string) {
  return fetchSpy.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => request.method === method);
}

function wrap(element: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <QueryClientProvider client={client}>{element}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const values: OutingFormValues = {
  title: ' Perseides ',
  description: '',
  startsAt: new Date('2099-08-12T20:00:00Z'),
  endsAt: new Date('2099-08-13T02:00:00Z'),
  location: { latitude: 42.05, longitude: 0.73 },
  eventId: 'event-1',
};

beforeEach(async () => {
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  await saveTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  mockRouter.canGoBack.mockReturnValue(true);
  mockSubmitted = undefined;
  mockSubmitResult = undefined;
  answer = () => jsonResponse(myOuting);
  fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => answer(input as Request));
});

afterEach(() => {
  client.clear();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('NewOutingScreen', () => {
  it('has the title of a new outing as a header', async () => {
    await wrap(<NewOutingScreen />);

    expect(screen.getByRole('header', { name: 'Nova sortida' })).toBeOnTheScreen();
  });

  it('starts with an empty outing', async () => {
    await wrap(<NewOutingScreen />);

    expect(mockFormProps.editing).toBeFalsy();
    expect(mockFormProps.initial).toMatchObject({ title: '', location: null, eventId: null });
  });

  it('starts linked to the event it was opened from', async () => {
    await wrap(<NewOutingScreen eventId="event-1" />);

    expect(mockFormProps.initial.eventId).toBe('event-1');
  });

  it('creates the outing with the body of the API and opens it', async () => {
    mockSubmitted = values;
    await wrap(<NewOutingScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'send form' }));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith(`/outings/${myOuting.id}`));
    const [request] = requests('POST');
    expect(new URL(request.url).pathname).toBe('/api/outings');
    expect(request.headers.get('Authorization')).toBe('Bearer access-1');
    expect(await request.json()).toEqual({
      title: 'Perseides',
      description: '',
      starts_at: '2099-08-12T20:00:00.000Z',
      ends_at: '2099-08-13T02:00:00.000Z',
      location: { latitude: 42.05, longitude: 0.73 },
      event_id: 'event-1',
    });
  });

  it('gives the form the error of the server and does not leave the screen', async () => {
    mockSubmitted = values;
    answer = () => problemResponse(422, 'OUTING_STARTS_IN_PAST');
    await wrap(<NewOutingScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'send form' }));

    await waitFor(() => expect(mockSubmitResult).toBeInstanceOf(AppError));
    expect(mockSubmitResult).toMatchObject({ code: 'OUTING_STARTS_IN_PAST' });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('goes back with the back button', async () => {
    await wrap(<NewOutingScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Torna' }));

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});

describe('EditOutingScreen', () => {
  it('says it is loading', async () => {
    fetchSpy.mockImplementation(() => new Promise(() => undefined));

    await wrap(<EditOutingScreen id={myOuting.id} />);

    expect(screen.getByLabelText('Carregant sortides')).toBeOnTheScreen();
  });

  it('shows the text of the error when the outing cannot be read', async () => {
    answer = () => problemResponse(404, 'OUTING_NOT_FOUND');

    await wrap(<EditOutingScreen id={myOuting.id} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Aquesta sortida no existeix o s'ha esborrat.",
    );
  });

  it('opens the form with the values of the outing, as an edition', async () => {
    await wrap(<EditOutingScreen id={myOuting.id} />);

    expect(await screen.findByRole('header', { name: 'Edita la sortida' })).toBeOnTheScreen();
    // The title is there while the outing loads: wait for the form before reading its props.
    await screen.findByRole('button', { name: 'send form' });
    expect(mockFormProps.editing).toBe(true);
    expect(mockFormProps.initial).toEqual(outingToValues(myOuting));
  });

  it('sends only what changed and goes back', async () => {
    await wrap(<EditOutingScreen id={myOuting.id} />);
    await screen.findByRole('button', { name: 'send form' });
    mockSubmitted = { ...outingToValues(myOuting), title: 'Nou títol' };

    await fireEvent.press(screen.getByRole('button', { name: 'send form' }));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    const [request] = requests('PATCH');
    expect(new URL(request.url).pathname).toBe(`/api/outings/${myOuting.id}`);
    expect(request.headers.get('Authorization')).toBe('Bearer access-1');
    expect(await request.json()).toEqual({ title: 'Nou títol' });
  });

  it('calls nothing and goes back when nothing changed', async () => {
    await wrap(<EditOutingScreen id={myOuting.id} />);
    await screen.findByRole('button', { name: 'send form' });
    mockSubmitted = outingToValues(myOuting);

    await fireEvent.press(screen.getByRole('button', { name: 'send form' }));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(requests('PATCH')).toHaveLength(0);
  });

  it('gives the form the error of the server and stays', async () => {
    await wrap(<EditOutingScreen id={myOuting.id} />);
    await screen.findByRole('button', { name: 'send form' });
    mockSubmitted = { ...outingToValues(myOuting), title: 'Nou títol' };
    answer = (request) =>
      request.method === 'PATCH'
        ? problemResponse(403, 'OUTING_FORBIDDEN')
        : jsonResponse(myOuting);

    await fireEvent.press(screen.getByRole('button', { name: 'send form' }));

    await waitFor(() => expect(mockSubmitResult).toMatchObject({ code: 'OUTING_FORBIDDEN' }));
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
