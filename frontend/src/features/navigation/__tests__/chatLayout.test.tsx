import { render } from '@testing-library/react-native';

import ChatLayout from '../../../app/(app)/chat/_layout';

const mockStackOptions = jest.fn();
jest.mock('expo-router', () => ({
  Stack: (props: { screenOptions?: unknown }) => {
    mockStackOptions(props.screenOptions);
    return null;
  },
}));

describe('Chat layout (TG-469)', () => {
  it('is a Stack without a header: the screens draw their own', async () => {
    await render(<ChatLayout />);

    expect(mockStackOptions).toHaveBeenCalledWith(expect.objectContaining({ headerShown: false }));
  });
});
