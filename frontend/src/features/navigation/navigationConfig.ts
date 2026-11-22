import type { Icon } from 'phosphor-react-native';
import { Chats, House, Planet, Trophy, User } from 'phosphor-react-native';

export type TabRouteName = 'index' | 'events' | 'chat' | 'gamification' | 'profile';
export type HiddenRouteName = 'map' | 'apod' | 'quiz';

export interface TabItem {
  name: TabRouteName;
  titleKey: string;
  /**
   * A shorter visible label for the bar, for a title that does not fit under the icon at 360 px.
   * The title stays the accessible name and the heading of the screen.
   */
  shortTitleKey?: string;
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
    shortTitleKey: 'nav.short.events',
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
    shortTitleKey: 'nav.short.gamification',
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

/**
 * Hidden routes inside a folder of the (app) group with no layout of its own (TG-352): declared
 * apart from HIDDEN_ROUTES, which are the files and the folders with a layout.
 */
export const HIDDEN_NESTED_ROUTES: readonly string[] = ['meeting-points/[eventId]'] as const;
