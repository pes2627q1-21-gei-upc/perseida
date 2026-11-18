import { CircleIcon, RadioButton } from 'phosphor-react-native';
import { Pressable, Text } from 'react-native';

import { useTheme } from '../../../shared/theme';

interface Props {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}

/**
 * One option of the question, announced as a radio button (TG-61, criterion 9). The
 * selection shows with a filled icon and a thicker rim, not only with colour.
 */
export function QuizOption({ label, selected, disabled, onPress }: Props) {
  const { colors, iconSizes, radii, spacing, touch, typography } = useTheme();
  const Icon = selected ? RadioButton : CircleIcon;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: touch.min,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radii.md,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.text.primary : colors.surface.glassBorder,
        // Stryker disable next-line all: visual only, the border and the icon tell the selection
        backgroundColor: pressed || selected ? colors.surface.onGlass : 'transparent',
      })}
    >
      <Icon
        size={iconSizes.md}
        color={colors.text.primary}
        weight={selected ? 'fill' : 'regular'}
      />
      <Text style={[typography.body, { color: colors.text.primary, flexShrink: 1 }]}>{label}</Text>
    </Pressable>
  );
}
