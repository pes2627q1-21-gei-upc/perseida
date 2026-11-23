import { render, screen } from '@testing-library/react-native';

import MeetingPointsRoute from '../../app/(app)/meeting-points/[eventId]';

let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));

// The screen has its own tests: here only that the route gives it the event of the URL.
jest.mock('./components/MeetingPointsScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    MeetingPointsScreen: ({ eventId }: { eventId: string }) => (
      <Text testID="screen">{`meeting-points:${eventId}`}</Text>
    ),
  };
});

describe('route of the meeting points (TG-352, criterion 4)', () => {
  it('/meeting-points/{eventId} shows the meeting points of that event', async () => {
    mockParams = { eventId: 'event-1' };
    await render(<MeetingPointsRoute />);

    expect(screen.getByTestId('screen')).toHaveTextContent('meeting-points:event-1');
  });
});
