// Simulated outings for the outings tests (TG-629). Same shape as OutingResponse of the API.

export const myOuting = {
  id: '01a19288-a3f6-7576-a37b-8929dd7f4001',
  title: 'Perseides al Montsec',
  description: 'Portem mantes i te.',
  starts_at: '2099-08-12T20:00:00Z',
  ends_at: '2099-08-13T02:00:00Z',
  location: { latitude: 42.05, longitude: 0.73 },
  place: null,
  event_id: '01a19288-a3f6-7576-a37b-8929dd7f497f',
  author: {
    id: '01a19288-a3f6-7576-a37b-8929dd7f0001',
    display_name: 'Raquel',
    avatar_url: null,
  },
  created_at: '2099-07-01T10:00:00Z',
  updated_at: '2099-07-01T10:00:00Z',
} as const;

export const otherOuting = {
  ...myOuting,
  id: '01a19288-a3f6-7576-a37b-8929dd7f4002',
  title: 'Nit de Leonides',
  description: '',
  event_id: null,
  author: {
    id: '01a19288-a3f6-7576-a37b-8929dd7f0002',
    display_name: null,
    avatar_url: null,
  },
} as const;

/** An outing that meets at a recommended local (TG-661). Synthetic data. */
export const libraryOuting = {
  ...myOuting,
  id: '01a19288-a3f6-7576-a37b-8929dd7f4003',
  title: 'Estudi sota les estrelles',
  location: { latitude: 41.3815, longitude: 2.169 },
  place: { name: 'Biblioteca Sant Pau - Santa Creu', address: 'Carrer del Carme, 47' },
} as const;
