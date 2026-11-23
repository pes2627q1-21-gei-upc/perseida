// Simulated meeting points for the meeting points tests (TG-352). Same shape as
// MeetingPointResponse of the API. Synthetic data: no real place nor real person.

import type { MeetingPoint } from '../src/features/meeting-points/api/meetingPoints';

/** The example of Spotwise: every attribute is known. */
export const spotwiseLibrary = {
  id: 12,
  name: "Biblioteca d'exemple Sagrada Família",
  type: 'library',
  address: "Carrer d'Exemple, 1, 08025 Barcelona",
  location: { latitude: 41.4045, longitude: 2.1712 },
  wifi: true,
  silence_level: 'murmur',
  plugs: 'many',
  group_friendly: true,
  distance_m: 290,
  open_now: true,
} satisfies MeetingPoint;

/** A cafe nobody has voted yet: no wifi, no address and every vote unknown. */
export const unvotedCafe = {
  id: 13,
  name: "Cafeteria d'exemple",
  type: 'cafe',
  address: '',
  location: { latitude: 41.41, longitude: 2.18 },
  wifi: false,
  silence_level: null,
  plugs: null,
  group_friendly: null,
  distance_m: 1140,
  open_now: null,
} satisfies MeetingPoint;

/** Some other kind of space, with the other values of the votes. */
export const otherSpace = {
  id: 14,
  name: "Espai d'exemple",
  type: 'other',
  address: "Plaça d'Exemple, 2, 08013 Barcelona",
  location: { latitude: 41.4, longitude: 2.17 },
  wifi: false,
  silence_level: 'silent',
  plugs: 'none',
  group_friendly: false,
  distance_m: 640,
  open_now: false,
} satisfies MeetingPoint;
