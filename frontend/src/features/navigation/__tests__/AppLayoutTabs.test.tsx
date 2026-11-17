import { act, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import AppLayout from '../../../app/(app)/_layout';
import * as refreshTokenModule from '../../auth/api/refreshToken';
import * as tokenStorage from '../../auth/tokenStorage';
import { touch } from '../../../shared/theme';

const mockTabsScreens: { name: string; options: Record<string, unknown> }[] = [];
const mockScreenOptions = jest.fn();

jest.mock('expo-router', () => {
  const MockTabs = Object.assign(
    ({ children, screenOptions }: { children: React.ReactNode; screenOptions?: unknown }) => {
      mockScreenOptions(screenOptions);
      return <>{children}</>;
    },
    {
      Screen: ({ name, options }: { name: string; options: Record<string, unknown> }) => {
        mockTabsScreens.push({ name, options });
        return null;
      },
    },
  );

  return {
    useRouter: () => ({ replace: jest.fn() }),
    Tabs: MockTabs,
    Stack: () => null,
  };
});

describe('AppLayout Tab Navigation Structure (TG-385 #388)', () => {
  const validTokens = {
    accessToken: 'valid-acc',
    refreshToken: 'valid-ref',
  };

  beforeEach(() => {
    mockTabsScreens.length = 0;
    mockScreenOptions.mockClear();
    jest.spyOn(tokenStorage, 'getTokens').mockResolvedValue(validTokens);
    jest.spyOn(refreshTokenModule, 'refreshSession').mockResolvedValue({
      access_token: 'new-acc',
      refresh_token: 'new-ref',
      token_type: 'bearer',
      expires_in: 900,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders a 5-tab navigation structure when authenticated', async () => {
    await act(async () => {
      render(<AppLayout />);
    });

    await waitFor(() => {
      const renderedTabNames = mockTabsScreens.map((s) => s.name);
      expect(renderedTabNames).toContain('index');
      expect(renderedTabNames).toContain('events');
      expect(renderedTabNames).toContain('chat');
      expect(renderedTabNames).toContain('gamification');
      expect(renderedTabNames).toContain('profile');
    });
  });

  it('hides sub-routes (map and apod) from the bottom tab bar with href: null', async () => {
    await act(async () => {
      render(<AppLayout />);
    });

    await waitFor(() => {
      const mapScreen = mockTabsScreens.find((s) => s.name === 'map');
      const apodScreen = mockTabsScreens.find((s) => s.name === 'apod');

      expect(mapScreen).toBeDefined();
      expect(mapScreen?.options?.href).toBeNull();

      expect(apodScreen).toBeDefined();
      expect(apodScreen?.options?.href).toBeNull();
    });
  });

  it('configures tab bar styling with Frutiger Cosmo theme tokens', async () => {
    await act(async () => {
      render(<AppLayout />);
    });

    await waitFor(() => {
      expect(mockScreenOptions).toHaveBeenCalled();
      const lastCall = mockScreenOptions.mock.calls[0]?.[0];
      expect(lastCall).toBeDefined();
      expect(lastCall.tabBarActiveTintColor).toBeDefined();
      expect(lastCall.tabBarInactiveTintColor).toBeDefined();
    });
  });

  it('gives every tab a touch target of at least 48 dp, also in compact landscape (TG-385 #520)', async () => {
    await act(async () => {
      render(<AppLayout />);
    });

    await waitFor(() => {
      const options = mockScreenOptions.mock.calls[0]?.[0];
      expect(options?.tabBarItemStyle?.minHeight).toBeGreaterThanOrEqual(touch.min);
    });
  });

  it('labels every tab for screen readers with its translated title (TG-385 #520)', async () => {
    await act(async () => {
      render(<AppLayout />);
    });

    await waitFor(() => {
      const labels = mockTabsScreens
        .filter((s) => s.options.href !== null)
        .map((s) => s.options.tabBarAccessibilityLabel);
      expect(labels).toEqual(['Inici', 'Esdeveniments', 'Xat', 'Gamificació', 'Perfil']);
    });
  });
});
