import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { errorMessage, isAppError } from '../../../shared/errors';
import { useTheme } from '../../../shared/theme';
import { GelButton } from '../../../shared/ui';
import { type OutingFormValues, outingFormSchema } from '../outingForm';
import { DateTimeField } from './DateTimeField';
import { EventField } from './EventField';
import { LocationField } from './LocationField';
import { TextField } from './TextField';

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

/**
 * Create or edit an outing (TG-629): title, description, start, end and place. Validation of
 * convenience runs in the form with no network; the server stays the real check and its
 * business codes land next to their field. Whatever is not about one field is announced as an
 * alert. The event the outing is linked to is chosen among the active and upcoming ones.
 */
export function OutingForm({ initial, editing = false, onSubmit }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const schema = useMemo(() => outingFormSchema(editing ? initial : undefined), [editing, initial]);
  const { control, handleSubmit, setError, formState } = useForm<OutingFormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial,
  });
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
      <Controller
        control={control}
        name="eventId"
        render={({ field }) => <EventField value={field.value} onChange={field.onChange} />}
      />
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
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  actions: { alignItems: 'flex-end' },
});
