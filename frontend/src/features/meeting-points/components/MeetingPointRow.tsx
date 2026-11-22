import type { TFunction } from 'i18next';
import { Books, Coffee, MapPin } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../../shared/theme';
import type { MeetingPoint } from '../api/meetingPoints';
import { formatDistance } from '../formatMeetingPoint';

interface Props {
  point: MeetingPoint;
  /** Makes the row a button that picks the point. */
  onChoose?: () => void;
}

const TYPE_ICONS = { library: Books, cafe: Coffee, other: MapPin } as const;

/**
 * Texts of the chips of the attributes that are known: wifi only when there is, silence and
 * plugs when someone voted them, and groups either way when someone voted it.
 */
function attributeChips(point: MeetingPoint, t: TFunction): string[] {
  const chips: string[] = [];
  if (point.wifi) chips.push(t('meetingPoints.attribute.wifi'));
  if (point.silence_level) {
    chips.push(t(`meetingPoints.attribute.silence.${point.silence_level}`));
  }
  if (point.plugs) chips.push(t(`meetingPoints.attribute.plugs.${point.plugs}`));
  if (point.group_friendly !== null) {
    chips.push(
      t(
        point.group_friendly
          ? 'meetingPoints.attribute.groupFriendly'
          : 'meetingPoints.attribute.notGroupFriendly',
      ),
    );
  }
  return chips;
}

/**
 * One meeting point (TG-352): the icon of its type, name, type and distance, address and the
 * chips of what is known of it. Read as a single item that says all of it; it goes on glass.
 */
export function MeetingPointRow({ point, onChoose }: Props) {
  const { t, i18n } = useTranslation();
  const { colors, iconSizes, radii, spacing, typography } = useTheme();
  const Icon = TYPE_ICONS[point.type];
  const type = t(`meetingPoints.type.${point.type}`);
  const distance = formatDistance(point.distance_m, i18n.language);
  const chips = attributeChips(point, t);
  const name = onChoose ? t('meetingPoints.choose', { name: point.name }) : point.name;
  const label = [name, type, distance, point.address, ...chips].filter(Boolean).join(', ');

  // Visual only: layout and colours of the row, not seen by the tests nor mutated.
  // Stryker disable all
  const look = {
    text: [styles.text, { gap: spacing.xs }],
    line: [styles.wrap, { gap: spacing.xs }],
    name: [typography.bodyStrong, { color: colors.text.primary }],
    detail: [typography.caption, { color: colors.text.secondary }],
    chip: [
      styles.chip,
      {
        borderRadius: radii.pill,
        borderColor: colors.surface.glassBorder,
        backgroundColor: colors.surface.onGlass,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
      },
    ],
    chipText: [typography.caption, { color: colors.text.primary }],
    row: [styles.row, { gap: spacing.md }],
    pressable: ({ pressed }: { pressed: boolean }) => [
      styles.row,
      { gap: spacing.md, opacity: pressed ? 0.7 : 1 },
    ],
  };
  // Stryker restore all

  const content = (
    <>
      {/* Decorative: the type reaches screen readers as text. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon size={iconSizes.md} color={colors.text.primary} weight="duotone" />
      </View>
      <View style={look.text}>
        <Text style={look.name}>{point.name}</Text>
        <View style={look.line}>
          <Text style={look.detail}>{type}</Text>
          <Text style={look.detail}>·</Text>
          <Text style={look.detail}>{distance}</Text>
        </View>
        {point.address ? <Text style={look.detail}>{point.address}</Text> : null}
        <View style={look.line}>
          {chips.map((chip) => (
            <View key={chip} style={look.chip}>
              <Text style={look.chipText}>{chip}</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );

  if (!onChoose) {
    return (
      <View accessible accessibilityLabel={label} style={look.row}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onChoose}
      style={look.pressable}
    >
      {content}
    </Pressable>
  );
}

// Visual styles, not mutated.
// Stryker disable all
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  text: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { borderWidth: 1 },
});
