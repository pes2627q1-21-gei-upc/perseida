import type { TFunction } from 'i18next';
import { Books, Coffee, MapPin } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type Theme, useTheme } from '../../../shared/theme';
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
  const theme = useTheme();
  const { colors, iconSizes } = theme;
  const styles = createStyles(theme);
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
      <View style={styles.text}>
        <Text style={styles.name}>{point.name}</Text>
        <View style={styles.line}>
          <Text style={styles.detail}>{type}</Text>
          <Text style={styles.detail}>·</Text>
          <Text style={styles.detail}>{distance}</Text>
        </View>
        {point.address ? <Text style={styles.detail}>{point.address}</Text> : null}
        <View style={styles.line}>
          {chips.map((chip) => (
            <View key={chip} style={styles.chip}>
              <Text style={styles.chipText}>{chip}</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );

  if (!onChoose) {
    return (
      <View accessible accessibilityLabel={label} style={styles.row}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onChoose}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : styles.idle]}
    >
      {content}
    </Pressable>
  );
}

// Purely visual styles, all from theme tokens. They are left out of mutation testing on
// purpose: a changed padding or colour is not behaviour a unit test should pin down
// (convencions/testing.md, «Mutation testing»). Behaviour stays in the JSX above.
// Stryker disable all
function createStyles({ colors, radii, spacing, typography }: Theme) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    idle: { opacity: 1 },
    pressed: { opacity: 0.7 },
    text: { flex: 1, gap: spacing.xs },
    line: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    name: { ...typography.bodyStrong, color: colors.text.primary },
    detail: { ...typography.caption, color: colors.text.secondary },
    chip: {
      borderWidth: 1,
      borderRadius: radii.pill,
      borderColor: colors.surface.glassBorder,
      backgroundColor: colors.surface.onGlass,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    chipText: { ...typography.caption, color: colors.text.primary },
  });
}
// Stryker restore all
