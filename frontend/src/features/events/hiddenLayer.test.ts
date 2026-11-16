import { hiddenLayerProps } from './hiddenLayer';

describe('hiddenLayerProps', () => {
  it('leaves a shown layer untouched on every platform', () => {
    for (const os of ['web', 'android', 'ios'] as const) {
      expect(hiddenLayerProps(false, os)).toEqual({ pointerEvents: 'auto' });
    }
  });

  it('on the web takes a hidden layer out of the tab order and of the accessibility tree', () => {
    // react-native-web ignores accessibilityElementsHidden and importantForAccessibility:
    // `visibility: hidden` removes the layer from focus and from screen readers without
    // changing its size, and `aria-hidden` reaches the DOM.
    const props = hiddenLayerProps(true, 'web');

    expect(props.style).toEqual({ opacity: 0, visibility: 'hidden' });
    expect(props['aria-hidden']).toBe(true);
    expect(props.pointerEvents).toBe('none');
  });

  it.each(['android', 'ios'] as const)(
    'on %s hides a hidden layer from touch and screen readers',
    (os) => {
      const props = hiddenLayerProps(true, os);

      expect(props.style).toEqual({ opacity: 0 });
      expect(props.pointerEvents).toBe('none');
      expect(props['aria-hidden']).toBe(true);
      expect(props.accessibilityElementsHidden).toBe(true);
      expect(props.importantForAccessibility).toBe('no-hide-descendants');
    },
  );
});
