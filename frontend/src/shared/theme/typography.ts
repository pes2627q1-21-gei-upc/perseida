import type { TextStyle } from 'react-native';

// Families and scale from tokens.md (ADR-0020). Only weights 400/500/600/700.
export const fontFamilies = {
  roundedMedium: 'MPLUSRounded1c_500Medium',
  roundedBold: 'MPLUSRounded1c_700Bold',
  sansRegular: 'OpenSans_400Regular',
  sansSemiBold: 'OpenSans_600SemiBold',
} as const;

type TypographyRole = 'caption' | 'body' | 'bodyStrong' | 'title' | 'headline' | 'display';

export const typography: Record<TypographyRole, TextStyle> = {
  caption: { fontFamily: fontFamilies.sansRegular, fontSize: 12, lineHeight: 18 },
  body: { fontFamily: fontFamilies.sansRegular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fontFamilies.sansSemiBold, fontSize: 16, lineHeight: 24 },
  title: { fontFamily: fontFamilies.roundedBold, fontSize: 20, lineHeight: 28 },
  headline: { fontFamily: fontFamilies.roundedBold, fontSize: 26, lineHeight: 34 },
  display: { fontFamily: fontFamilies.roundedBold, fontSize: 44, lineHeight: 52 },
};
