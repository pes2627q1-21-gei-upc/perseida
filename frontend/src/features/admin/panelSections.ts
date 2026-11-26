/** A section of the admin panel: a card on the home that opens its page. */
export interface PanelSection {
  /** Route of the section, under /panel. */
  href: string;
  /** i18n key of the name of the section. */
  titleKey: string;
}

/**
 * Sections of the panel. Empty on purpose: each user story adds its own entry here (and its
 * route in `src/app/(admin)/panel/`): users (TG-78), supervision and metrics (TG-79) and
 * reports (TG-80).
 */
export const PANEL_SECTIONS: readonly PanelSection[] = [];
