import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { LakeBanks, LakeWater } from './Lake';
import { SkyBackground } from './SkyBackground';

type Node = { type?: string; props?: Record<string, unknown>; children?: (Node | string)[] | null };

/** Every node of the rendered tree, in paint order (later is painted on top). */
function paintOrder(): Node[] {
  const order: Node[] = [];
  const walk = (node: Node | string) => {
    if (typeof node === 'string') return;
    order.push(node);
    node.children?.forEach(walk);
  };
  walk(screen.toJSON() as unknown as Node);
  return order;
}

const isHiddenLayer = (node: Node) =>
  node.props?.accessibilityElementsHidden === true && node.props?.pointerEvents === 'none';

describe('lake layers', () => {
  it('the water is decorative: hidden from screen readers and from touches', async () => {
    await render(<LakeWater />);

    const root = screen.toJSON() as unknown as Node;
    expect(root.props?.accessibilityElementsHidden).toBe(true);
    expect(root.props?.importantForAccessibility).toBe('no-hide-descendants');
    expect(root.props?.pointerEvents).toBe('none');
  });

  it('the banks are decorative too', async () => {
    await render(<LakeBanks />);

    const root = screen.toJSON() as unknown as Node;
    expect(root.props?.accessibilityElementsHidden).toBe(true);
    expect(root.props?.importantForAccessibility).toBe('no-hide-descendants');
    expect(root.props?.pointerEvents).toBe('none');
  });

  it('puts the water first, then what passes behind the hills, then the banks, then the content', async () => {
    await render(
      <SkyBackground behind={<Text>behind</Text>}>
        <Text>content</Text>
      </SkyBackground>,
    );

    const order = paintOrder();
    const water = order.findIndex(isHiddenLayer);
    const banks = order.findIndex((node, index) => index > water && isHiddenLayer(node));
    const behind = order.findIndex((node) => node.children?.includes('behind'));
    const content = order.findIndex((node) => node.children?.includes('content'));

    expect(water).toBeGreaterThanOrEqual(0);
    expect(banks).toBeGreaterThan(water);
    expect(behind).toBeGreaterThan(water);
    // The meadow is over the things that pass behind it, and the content is over everything.
    expect(banks).toBeGreaterThan(behind);
    expect(content).toBeGreaterThan(banks);
  });

  it('renders the content of the screen untouched', async () => {
    await render(
      <SkyBackground>
        <Text>content</Text>
      </SkyBackground>,
    );

    expect(screen.getByText('content')).toBeOnTheScreen();
  });
});
