import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { GlassPanel } from './GlassPanel';

/** The wrapper of the panel and the view of its content: the parents of the child, innermost first. */
function layers() {
  const content = screen.getByText('Dins').parent!;
  const wrapper = content.parent!;
  return {
    wrapper: StyleSheet.flatten(wrapper.props.style),
    content: StyleSheet.flatten(content.props.style),
  };
}

describe('GlassPanel', () => {
  it('fills the height of its parent, in the wrapper and in the content, with fill (TG-646)', async () => {
    await render(
      <GlassPanel fill>
        <Text>Dins</Text>
      </GlassPanel>,
    );

    const { wrapper, content } = layers();
    expect(wrapper.flex).toBe(1);
    expect(content.flex).toBe(1);
  });

  it('does not fill by default', async () => {
    await render(
      <GlassPanel>
        <Text>Dins</Text>
      </GlassPanel>,
    );

    const { wrapper, content } = layers();
    expect(wrapper.flex).toBeUndefined();
    expect(content.flex).toBeUndefined();
  });
});
