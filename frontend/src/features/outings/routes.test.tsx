import { render, screen } from '@testing-library/react-native';

import EditOutingRoute from '../../app/(app)/outings/[id]/edit';
import OutingDetailRoute from '../../app/(app)/outings/[id]/index';
import OutingsRoute from '../../app/(app)/outings/index';
import NewOutingRoute from '../../app/(app)/outings/new';

let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));

// The screens have their own tests: here each one shows the props the route gave it.
jest.mock('./components/OutingsScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    OutingsScreen: ({ eventId }: { eventId?: string }) => (
      <Text testID="screen">{`outings:${eventId ?? '-'}`}</Text>
    ),
  };
});
jest.mock('./components/NewOutingScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    NewOutingScreen: ({ eventId }: { eventId?: string }) => (
      <Text testID="screen">{`new:${eventId ?? '-'}`}</Text>
    ),
  };
});
jest.mock('./components/OutingDetailScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    OutingDetailScreen: ({ id }: { id: string }) => <Text testID="screen">{`detail:${id}`}</Text>,
  };
});
jest.mock('./components/EditOutingScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    EditOutingScreen: ({ id }: { id: string }) => <Text testID="screen">{`edit:${id}`}</Text>,
  };
});

describe('routes of the outings (TG-629)', () => {
  it('/outings shows the outings of the person', async () => {
    mockParams = {};
    await render(<OutingsRoute />);

    expect(screen.getByTestId('screen')).toHaveTextContent('outings:-');
  });

  it('/outings?eventId= shows the outings of the event', async () => {
    mockParams = { eventId: 'event-1' };
    await render(<OutingsRoute />);

    expect(screen.getByTestId('screen')).toHaveTextContent('outings:event-1');
  });

  it('/outings/new opens a new outing', async () => {
    mockParams = {};
    await render(<NewOutingRoute />);

    expect(screen.getByTestId('screen')).toHaveTextContent('new:-');
  });

  it('/outings/new?eventId= opens a new outing linked to the event', async () => {
    mockParams = { eventId: 'event-1' };
    await render(<NewOutingRoute />);

    expect(screen.getByTestId('screen')).toHaveTextContent('new:event-1');
  });

  it('/outings/{id} shows that outing', async () => {
    mockParams = { id: 'outing-1' };
    await render(<OutingDetailRoute />);

    expect(screen.getByTestId('screen')).toHaveTextContent('detail:outing-1');
  });

  it('/outings/{id}/edit edits that outing', async () => {
    mockParams = { id: 'outing-1' };
    await render(<EditOutingRoute />);

    expect(screen.getByTestId('screen')).toHaveTextContent('edit:outing-1');
  });
});
