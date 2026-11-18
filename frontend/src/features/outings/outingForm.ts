import { z } from 'zod';

import type { Outing, OutingChanges, OutingDraft } from './api/outings';

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;

const HOUR_MS = 60 * 60 * 1000;

export interface OutingLocation {
  latitude: number;
  longitude: number;
}

/** What the form edits. The location is null until the person chooses one. */
export interface OutingFormValues {
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  location: OutingLocation | null;
  eventId: string | null;
}

const sameDates = (a: OutingFormValues, b: OutingFormValues) =>
  a.startsAt.getTime() === b.startsAt.getTime() && a.endsAt.getTime() === b.endsAt.getTime();

/**
 * Validation of convenience (instant feedback, no network); the valid one is the backend's.
 * The messages are i18n keys, the same texts the API codes have. Like the backend, the start
 * is only checked against the present when it is a new outing or a date changes: an outing
 * that has already started can still be edited.
 */
export function outingFormSchema(initial?: OutingFormValues) {
  return z
    .object({
      title: z.string(),
      description: z.string(),
      startsAt: z.date(),
      endsAt: z.date(),
      location: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
      eventId: z.string().nullable(),
    })
    .superRefine((values, context) => {
      const issue = (path: string, message: string) =>
        context.addIssue({ code: 'custom', path: [path], message });

      const title = values.title.trim();
      if (title.length === 0) issue('title', 'errors.OUTING_TITLE_EMPTY');
      else if (title.length > TITLE_MAX) issue('title', 'errors.OUTING_TITLE_TOO_LONG');
      if (values.description.trim().length > DESCRIPTION_MAX) {
        issue('description', 'errors.OUTING_DESCRIPTION_TOO_LONG');
      }
      if (values.endsAt < values.startsAt) issue('endsAt', 'errors.OUTING_ENDS_BEFORE_START');
      const datesChanged = !initial || !sameDates(values as OutingFormValues, initial);
      if (datesChanged && values.startsAt.getTime() < Date.now()) {
        issue('startsAt', 'errors.OUTING_STARTS_IN_PAST');
      }
      if (!values.location) issue('location', 'outings.form.locationRequired');
    });
}

/** A new outing: starts in an hour and lasts two, with the event it was opened from, if any. */
export function newOutingValues(eventId: string | null = null): OutingFormValues {
  const startsAt = new Date(Date.now() + HOUR_MS);
  return {
    title: '',
    description: '',
    startsAt,
    endsAt: new Date(startsAt.getTime() + 2 * HOUR_MS),
    location: null,
    eventId,
  };
}

export function outingToValues(outing: Outing): OutingFormValues {
  return {
    title: outing.title,
    description: outing.description,
    startsAt: new Date(outing.starts_at),
    endsAt: new Date(outing.ends_at),
    location: { ...outing.location },
    eventId: outing.event_id,
  };
}

function chosenLocation(values: OutingFormValues): OutingLocation {
  if (!values.location) throw new Error('location is required');
  return values.location;
}

/** Body of the creation. */
export function toDraft(values: OutingFormValues): OutingDraft {
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    starts_at: values.startsAt.toISOString(),
    ends_at: values.endsAt.toISOString(),
    location: chosenLocation(values),
    event_id: values.eventId,
  };
}

/** Body of the edition: only what changed, so an unchanged date is never checked again. */
export function toChanges(values: OutingFormValues, initial: OutingFormValues): OutingChanges {
  const location = chosenLocation(values);
  const changes: OutingChanges = {};
  const title = values.title.trim();
  const description = values.description.trim();
  if (title !== initial.title) changes.title = title;
  if (description !== initial.description) changes.description = description;
  if (!sameDates(values, initial)) {
    changes.starts_at = values.startsAt.toISOString();
    changes.ends_at = values.endsAt.toISOString();
  }
  if (
    location.latitude !== initial.location?.latitude ||
    location.longitude !== initial.location?.longitude
  ) {
    changes.location = location;
  }
  if (values.eventId !== initial.eventId) changes.event_id = values.eventId;
  return changes;
}

const DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * A place typed as two numbers, or null if either is not a plain number inside its range. A
 * comma is accepted as the decimal separator, since many keyboards only have that one.
 */
export function parseCoordinates(latitude: string, longitude: string): OutingLocation | null {
  const [lat, lon] = [latitude, longitude].map((text) => text.trim().replace(',', '.'));
  if (!DECIMAL.test(lat) || !DECIMAL.test(lon)) return null;
  const place = { latitude: Number(lat), longitude: Number(lon) };
  const inRange = Math.abs(place.latitude) <= 90 && Math.abs(place.longitude) <= 180;
  return inRange ? place : null;
}
