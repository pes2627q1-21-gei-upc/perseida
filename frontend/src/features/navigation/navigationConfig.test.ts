import { House, Planet, Chats, Trophy, User } from 'phosphor-react-native';

import { HIDDEN_ROUTES, TAB_CONFIG } from './navigationConfig';

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

  it('defines hidden sub-routes that must not appear in tab bar', () => {
    expect(HIDDEN_ROUTES).toContain('map');
    expect(HIDDEN_ROUTES).toContain('apod');
  });
});
