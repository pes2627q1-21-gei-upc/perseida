import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { readingMaxWidth, useTheme } from '../../../shared/theme';
import { SkyBackground, TopBar } from '../../../shared/ui';

interface Props {
  title: string;
  /** Gets the room the floating bar covers at the top, so the content can start under it. */
  children: (topInset: number) => ReactNode;
}

/** The sky, the floating bar with the title and the way back, and the room for the content. */
export function OutingsFrame({ title, children }: Props) {
  const router = useRouter();
  const [barBottom, setBarBottom] = useState(0);

  function goBack() {
    // Opened from a link there is nowhere to go back to: go home instead.
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <SkyBackground>
      <TopBar title={title} testID="outings-top-bar" onBack={goBack} onLayout={setBarBottom} />
      <View style={StyleSheet.absoluteFill}>{children(barBottom)}</View>
    </SkyBackground>
  );
}

/** A reading column that scrolls, under the floating bar. */
export function ScrollColumn({ topInset, children }: { topInset: number; children: ReactNode }) {
  const { spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.column,
        {
          maxWidth: readingMaxWidth,
          paddingTop: topInset + spacing.md,
          paddingBottom: insets.bottom + spacing.md,
          paddingLeft: insets.left + spacing.md,
          paddingRight: insets.right + spacing.md,
        },
      ]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', alignSelf: 'center' },
});
