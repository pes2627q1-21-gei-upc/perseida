import { AccessibilityInfo } from 'react-native';

import { moveFocusTo } from './moveFocusTo';

type Element = Parameters<typeof moveFocusTo>[0];

const native = AccessibilityInfo.sendAccessibilityEvent;

afterEach(() => {
  jest.restoreAllMocks();
  AccessibilityInfo.sendAccessibilityEvent = native;
});

// react-native-web does not implement sendAccessibilityEvent: the element takes the focus.
function withoutSendAccessibilityEvent() {
  (AccessibilityInfo as { sendAccessibilityEvent?: unknown }).sendAccessibilityEvent = undefined;
}

describe('moveFocusTo', () => {
  it('asks the screen reader to focus the element where it can', () => {
    const send = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation();
    const element = { focus: jest.fn() } as unknown as Element;

    moveFocusTo(element);

    expect(send).toHaveBeenCalledWith(element, 'focus');
    expect(element.focus).not.toHaveBeenCalled();
  });

  it('focuses the element itself on the web, which has no sendAccessibilityEvent', () => {
    withoutSendAccessibilityEvent();
    const element = { focus: jest.fn() } as unknown as Element;

    moveFocusTo(element);

    expect(element.focus).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the element cannot be focused', () => {
    withoutSendAccessibilityEvent();

    expect(() => moveFocusTo({} as unknown as Element)).not.toThrow();
  });
});
