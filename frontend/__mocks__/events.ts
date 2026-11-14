// Simulated events for the events map tests (TG-52). Same shape as the backend fixtures
// (backend/tests/fixtures/events/) and the event contract.

export const launchEvent = {
  id: '01a19288-a3f6-7576-a37b-8926ca81b8fe',
  title: 'Falcon 9 Block 5 | Starlink Group 10-12',
  summary: 'A batch of Starlink satellites launched from Cape Canaveral SLC-40.',
  category: 'launch',
  starts_at: '2026-11-03T21:15:00Z',
  ends_at: '2026-11-03T23:45:00Z',
  location: { latitude: 28.5618, longitude: -80.577 },
  source_url: 'https://ll.thespacedevs.com/2.3.0/launches/00000000-0000-4000-8000-000000000000/',
} as const;

export const lunarEvent = {
  id: '01a19288-a3f6-7576-a37b-89276502d574',
  title: 'Full Moon',
  summary: 'The Moon is fully illuminated as seen from Earth.',
  category: 'lunar',
  starts_at: '2026-11-24T14:53:00Z',
  ends_at: '2026-11-24T14:53:00Z',
  location: null,
  source_url: null,
} as const;

export const meteorShowerEvent = {
  id: '01a19288-a3f6-7576-a37b-8929dd7f497f',
  title: 'Leonids',
  summary: 'Meteor shower whose radiant lies in the constellation Leo.',
  category: 'meteor_shower',
  starts_at: '2026-11-06T00:00:00Z',
  ends_at: '2026-11-30T23:59:59Z',
  location: null,
  source_url: null,
} as const;

export const solarEvent = {
  id: '01a19288-a3f6-7576-a37b-892803b0d593',
  title: 'Total Solar Eclipse of 2 August 2027',
  summary: 'The Moon completely covers the Sun along a narrow path on Earth.',
  category: 'solar',
  starts_at: '2027-08-02T00:00:00Z',
  ends_at: '2027-08-02T23:59:59Z',
  location: null,
  source_url: 'https://aa.usno.navy.mil/api/eclipses/solar/year?year=2027',
} as const;
