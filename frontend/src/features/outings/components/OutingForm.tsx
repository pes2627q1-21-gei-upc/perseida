import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { errorMessage, isAppError } from '../../../shared/errors';
import { useTheme } from '../../../shared/theme';
import { GelButton, QuietButton } from '../../../shared/ui';
import { type OutingFormValues, outingFormSchema } from '../outingForm';
import { DateTimeField } from './DateTimeField';
import { LocationField } from './LocationField';

/** The field each business code of the server is about; the rest are not about one field. */
const FIELD_OF_CODE: Record<string, keyof OutingFormValues> = {
  OUTING_TITLE_EMPTY: 'title',
  OUTING_TITLE_TOO_LONG: 'title',
  OUTING_DESCRIPTION_TOO_LONG: 'description',
  OUTING_STARTS_IN_PAST: 'startsAt',
  OUTING_ENDS_BEFORE_START: 'endsAt',
};

/** Any error that is not about one field: announced as an alert under the button. */
interface FormFailure {
  code: string;
  retryable: boolean;
}

interface Props {
  initial: OutingFormValues;
  /** Editing an outing: the start is only checked against the present if a date changes. */
  editing?: boolean;
  /** Sends the values. A rejection keeps what was typed and shows the error. */
  onSubmit: (values: OutingFormValues) => Promise<unknown>;
}

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur: () => void;
  multiline?: boolean;
  /** Already translated message of the field. */
  error?: string;
}

function TextField({ label, value, onChangeText, onBlur, multiline, error }: TextFieldProps) {
  const { colors, radii, spacing, touch, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  const highlighted = focused || Boolean(error);

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.bodyStrong, { color: colors.text.primary }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        // The error goes in the hint, so it is read when the field gets the focus.
        accessibilityHint={error}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onBlur();
        }}
        style={[
          typography.body,
          styles.input,
          {
            minHeight: multiline ? touch.min * 2 : touch.min,
            padding: spacing.md,
            borderRadius: radii.md,
            color: colors.text.primary,
            backgroundColor: colors.surface.glass,
            borderColor: highlighted ? colors.focusRing : colors.surface.glassBorder,
            borderWidth: highlighted ? 2 : 1,
          },
        ]}
      />
      <Text
        accessibilityLiveRegion="polite"
        style={[typography.caption, { color: colors.state.danger }]}
      >
        {error ?? ''}
      </Text>
    </View>
  );
}

/**
 * Create or edit an outing (TG-629): title, description, start, end and place. Validation of
 * convenience runs in the form with no network; the server stays the real check and its
 * business codes land next to their field. Whatever is not about one field is announced as an
 * alert. The event the outing is linked to cannot be chosen here, only removed.
 */
export function OutingForm({ initial, editing = false, onSubmit }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const schema = useMemo(() => outingFormSchema(editing ? initial : undefined), [editing, initial]);
  const { control, handleSubmit, setError, setValue, formState } = useForm<OutingFormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial,
  });
  const eventId = useWatch({ control, name: 'eventId' });
  const { errors } = formState;
  const message = (key?: string) => (key ? t(key) : undefined);

  const submit = handleSubmit(async (values) => {
    setFailure(null);
    try {
      await onSubmit(values);
    } catch (error) {
      const field = isAppError(error) ? FIELD_OF_CODE[error.code] : undefined;
      if (isAppError(error) && field) {
        setError(field, { message: `errors.${error.code}` });
      } else if (isAppError(error)) {
        setFailure({ code: error.code, retryable: error.retryable });
      } else {
        setFailure({ code: 'GENERIC_FINAL', retryable: false });
      }
    }
  });

  return (
    <View style={{ gap: spacing.md }}>
      <Controller
        control={control}
        name="title"
        render={({ field }) => (
          <TextField
            label={t('outings.form.title')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={message(errors.title?.message)}
          />
        )}
      />
      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <TextField
            multiline
            label={t('outings.form.description')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={message(errors.description?.message)}
          />
        )}
      />
      <Controller
        control={control}
        name="startsAt"
        render={({ field }) => (
          <DateTimeField
            label={t('outings.form.startsAt')}
            value={field.value}
            onChange={field.onChange}
            error={message(errors.startsAt?.message)}
          />
        )}
      />
      <Controller
        control={control}
        name="endsAt"
        render={({ field }) => (
          <DateTimeField
            label={t('outings.form.endsAt')}
            value={field.value}
            onChange={field.onChange}
            error={message(errors.endsAt?.message)}
          />
        )}
      />
      <Controller
        control={control}
        name="location"
        render={({ field }) => (
          <LocationField
            value={field.value}
            onChange={field.onChange}
            error={message(errors.location?.message)}
          />
        )}
      />
      {eventId ? (
        <View style={[styles.row, { gap: spacing.md }]}>
          <Text style={[typography.body, styles.grow, { color: colors.text.primary }]}>
            {t('outings.form.linkedEvent')}
          </Text>
          <QuietButton
            label={t('outings.form.removeEvent')}
            onPress={() => setValue('eventId', null)}
          />
        </View>
      ) : null}
      <View style={styles.actions}>
        <GelButton
          label={t('outings.form.save')}
          onPress={() => void submit()}
          busy={formState.isSubmitting}
        />
      </View>
      {failure ? (
        <Text accessibilityRole="alert" style={[typography.body, { color: colors.state.danger }]}>
          {errorMessage(t, failure.code, failure.retryable)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  actions: { alignItems: 'flex-end' },
});
