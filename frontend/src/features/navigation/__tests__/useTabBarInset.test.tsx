import { renderHook } from '@testing-library/react-native';
import { BottomTabBarHeightContext } from 'expo-router/tabs';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useTabBarInset } from '../useTabBarInset';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function wrapper(tabBarHeight?: number) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <BottomTabBarHeightContext.Provider value={tabBarHeight}>
          {children}
        </BottomTabBarHeightContext.Provider>
      </SafeAreaProvider>
    );
  };
}

describe('useTabBarInset (TG-385 criteri 5)', () => {
  it('is the real height of the floating tab bar, which already includes the bottom safe area', async () => {
    const { result } = await renderHook(() => useTabBarInset(), { wrapper: wrapper(83) });

    expect(result.current).toBe(83);
  });

  it('is the bottom safe area when the screen is not inside the tab bar', async () => {
    const { result } = await renderHook(() => useTabBarInset(), { wrapper: wrapper(undefined) });

    expect(result.current).toBe(34);
  });
});
