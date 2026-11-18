import type { Icon } from 'phosphor-react-native';
import { Chats, House, Planet, Trophy, User } from 'phosphor-react-native';

export type TabRouteName = 'index' | 'events' | 'chat' | 'gamification' | 'profile';
export type HiddenRouteName = 'map' | 'apod' | 'quiz';

export interface TabItem {
  name: TabRouteName;
  titleKey: string;
  icon: Icon;
  testID?: string;
}

export const TAB_CONFIG: readonly TabItem[] = [
  {
    name: 'index',
    titleKey: 'nav.home',
    icon: House,
    testID: 'tab-home',
  },
  {
    name: 'events',
    titleKey: 'nav.events',
    icon: Planet,
    testID: 'tab-events',
  },
  {
    name: 'chat',
    titleKey: 'nav.chat',
    icon: Chats,
    testID: 'tab-chat',
  },
  {
    name: 'gamification',
    titleKey: 'nav.gamification',
    icon: Trophy,
    testID: 'tab-gamification',
  },
  {
    name: 'profile',
    titleKey: 'nav.profile',
    icon: User,
    testID: 'tab-profile',
  },
] as const;

export const HIDDEN_ROUTES: readonly HiddenRouteName[] = ['map', 'apod', 'quiz'] as const;
