import * as Location from 'expo-location';
import { Crosshair } from 'phosphor-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { type MapCamera, WORLD_CENTER, WORLD_ZOOM } from '../../../shared/map/mapTiles';
import { useTheme } from '../../../shared/theme';
import { QuietButton } from '../../../shared/ui';
import { formatCoordinate } from '../formatOuting';
import { type OutingLocation, parseCoordinates } from '../outingForm';
import { LocationMap } from './LocationMap';
import { TextField } from './TextField';

/** The map opens this close to a place that is already chosen, and to the device's location. */
const PLACE_ZOOM = 13;
const MAP_HEIGHT = 280;

interface Props {
  /** The chosen place; null until the person chooses one. */
  value: OutingLocation | null;
  onChange: (location: OutingLocation) => void;
  /** Already translated message of the field. */
  error?: string;
}

function startOf(value: OutingLocation | null): MapCamera {
  return value
    ? { ...value, zoom: PLACE_ZOOM }
    : { latitude: WORLD_CENTER[0], longitude: WORLD_CENTER[1], zoom: WORLD_ZOOM };
}

/**
 * Where the outing meets (TG-629): move the map until the reticle is over the place and choose
 * it, use the location of the device, or type the coordinates. The map is not the only way,
 * for people who cannot drag it (WCAG 2.5.7). Moving the map is not choosing: the value
 * only changes when the person chooses.
 */
export function LocationField({ value, onChange, error }: Props) {
  const { t, i18n } = useTranslation();
  const { colors, radii, spacing, typography } = useTheme();
  const [start, setStart] = useState(() => startOf(value));
  const [center, setCenter] = useState(start);
  const [locating, setLocating] = useState(false);
  const [denied, setDenied] = useState(false);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [invalidCoordinates, setInvalidCoordinates] = useState(false);

  async function locateMe() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setDenied(true);
        return;
      }
      const { coords } = await Location.getCurrentPositionAsync({});
      const place = { latitude: coords.latitude, longitude: coords.longitude };
      setDenied(false);
      setStart({ ...place, zoom: PLACE_ZOOM });
      onChange(place);
    } catch {
      setDenied(true);
    } finally {
      setLocating(false);
    }
  }

  function chooseCoordinates() {
    const place = parseCoordinates(latitude, longitude);
    setInvalidCoordinates(place === null);
    if (!place) return;
    setStart({ ...place, zoom: PLACE_ZOOM });
    onChange(place);
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[typography.bodyStrong, { color: colors.text.primary }]}>
        {t('outings.detail.where')}
      </Text>
      <Text style={[typography.caption, { color: colors.text.secondary }]}>
        {t('outings.picker.hint')}
      </Text>
      <View style={[styles.map, { height: MAP_HEIGHT, borderRadius: radii.md }]}>
        <LocationMap start={start} label={t('outings.picker.label')} onCameraChange={setCenter} />
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, styles.reticle]}
        >
          <Crosshair size={32} color={colors.accentGlow} />
        </View>
      </View>
      {value ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[typography.body, { color: colors.text.primary }]}
        >
          {t('outings.picker.chosen', {
            latitude: formatCoordinate(value.latitude, i18n.language),
            longitude: formatCoordinate(value.longitude, i18n.language),
          })}
        </Text>
      ) : null}
      <View style={[styles.buttons, { gap: spacing.sm }]}>
        <QuietButton
          label={t('outings.picker.choose')}
          onPress={() => onChange({ latitude: center.latitude, longitude: center.longitude })}
        />
        <QuietButton
          label={t('outings.picker.useMine')}
          busy={locating}
          onPress={() => void locateMe()}
        />
      </View>
      <View style={[styles.buttons, { gap: spacing.sm }]}>
        <View style={styles.coordinate}>
          <TextField
            label={t('outings.picker.latitude')}
            value={latitude}
            onChangeText={setLatitude}
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={styles.coordinate}>
          <TextField
            label={t('outings.picker.longitude')}
            value={longitude}
            onChangeText={setLongitude}
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>
      <QuietButton label={t('outings.picker.useCoordinates')} onPress={chooseCoordinates} />
      {invalidCoordinates ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: colors.state.danger }]}
        >
          {t('outings.picker.invalidCoordinates')}
        </Text>
      ) : null}
      {denied ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: colors.state.danger }]}
        >
          {t('outings.picker.denied')}
        </Text>
      ) : null}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, { color: colors.state.danger }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { overflow: 'hidden' },
  // The reticle sits on the middle of the map, which is the place that is chosen.
  reticle: { alignItems: 'center', justifyContent: 'center' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap' },
  coordinate: { flex: 1, minWidth: 140 },
});
