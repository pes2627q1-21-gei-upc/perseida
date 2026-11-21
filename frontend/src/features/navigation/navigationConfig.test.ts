import { House, Planet, Chats, Trophy, User } from 'phosphor-react-native';

import { HIDDEN_ROUTES, TAB_CONFIG } from './navigationConfig';

// Node modules without @types/node in the app's tsconfig (same as GoogleLogo.test.tsx).
const { existsSync, readdirSync } = jest.requireActual<{
  existsSync: (path: string) => boolean;
  readdirSync: (path: string) => string[];
}>('fs');
const { resolve } = jest.requireActual<{ resolve: (...parts: string[]) => string }>('path');

describe('navigationConfig (TG-385 #388)', () => {
  it('defines 5 main tabs in the expected order', () => {
    expect(TAB_CONFIG.map((t) => t.name)).toEqual([
      'index',
      'events',
      'chat',
      'gamification',
      'profile',
    ]);
  });

  it('associates each tab with an i18n label key and phosphor icon', () => {
    expect(TAB_CONFIG).toEqual([
      expect.objectContaining({ name: 'index', titleKey: 'nav.home', icon: House }),
      expect.objectContaining({ name: 'events', titleKey: 'nav.events', icon: Planet }),
      expect.objectContaining({ name: 'chat', titleKey: 'nav.chat', icon: Chats }),
      expect.objectContaining({ name: 'gamification', titleKey: 'nav.gamification', icon: Trophy }),
      expect.objectContaining({ name: 'profile', titleKey: 'nav.profile', icon: User }),
    ]);
  });

  it('gives a short visible label only to the tabs whose title does not fit under the icon (TG-469)', () => {
    expect(TAB_CONFIG.map((t) => [t.name, t.shortTitleKey])).toEqual([
      ['index', undefined],
      ['events', 'nav.short.events'],
      ['chat', undefined],
      ['gamification', 'nav.short.gamification'],
      ['profile', undefined],
    ]);
  });

  it('defines hidden sub-routes that must not appear in tab bar', () => {
    expect(HIDDEN_ROUTES).toContain('map');
    expect(HIDDEN_ROUTES).toContain('apod');
  });

  it('declares every route of the (app) group as a tab or as a hidden route', () => {
    // A route left out of both would show up as an extra, untranslated tab (TG-61 added /quiz).
    // A route is a file, or a folder with its own layout (chat/, TG-469).
    const group = resolve('src/app/(app)');
    const routes = readdirSync(group)
      .filter(
        (entry) =>
          (entry.endsWith('.tsx') && !entry.startsWith('_')) ||
          existsSync(resolve(group, entry, '_layout.tsx')),
      )
      .map((entry) => entry.replace(/\.tsx$/, ''));
    const declared: readonly string[] = [...TAB_CONFIG.map((t) => t.name), ...HIDDEN_ROUTES];

    expect([...routes].sort()).toEqual([...declared].sort());
  });
});
