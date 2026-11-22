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

  const content = (
    <>
      {/* Decorative: the type reaches screen readers as text. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon size={iconSizes.md} color={colors.text.primary} weight="duotone" />
      </View>
      <View style={[styles.text, { gap: spacing.xs }]}>
        <Text style={[typography.bodyStrong, { color: colors.text.primary }]}>{point.name}</Text>
        <View style={[styles.wrap, { gap: spacing.xs }]}>
          <Text style={[typography.caption, { color: colors.text.secondary }]}>{type}</Text>
          <Text style={[typography.caption, { color: colors.text.secondary }]}>·</Text>
          <Text style={[typography.caption, { color: colors.text.secondary }]}>{distance}</Text>
        </View>
        {point.address ? (
          <Text style={[typography.caption, { color: colors.text.secondary }]}>
            {point.address}
          </Text>
        ) : null}
        {chips.length > 0 && (
          <View style={[styles.wrap, { gap: spacing.xs }]}>
            {chips.map((chip) => (
              <View
                key={chip}
                style={[
                  styles.chip,
                  {
                    borderRadius: radii.pill,
                    borderColor: colors.surface.glassBorder,
                    backgroundColor: colors.surface.onGlass,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xs,
                  },
                ]}
              >
                <Text style={[typography.caption, { color: colors.text.primary }]}>{chip}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </>
  );

  if (!onChoose) {
    return (
      <View accessible accessibilityLabel={label} style={[styles.row, { gap: spacing.md }]}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onChoose}
      style={({ pressed }) => [styles.row, { gap: spacing.md, opacity: pressed ? 0.7 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  text: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { borderWidth: 1 },
});
