// Simulated API responses for the APOD tests (TG-117). Same shape as the provisional contract.

export const apodImage = {
  date: '2026-10-13',
  title: 'The Orion Nebula',
  explanation: 'A stellar nursery about 1,300 light-years away.',
  media_type: 'image',
  url: 'https://apod.nasa.gov/apod/image/orion.jpg',
  copyright: 'Jane Doe',
} as const;

export const apodVideo = {
  date: '2026-10-14',
  title: 'A Total Solar Eclipse',
  explanation: 'Time-lapse of totality.',
  media_type: 'video',
  url: 'https://www.youtube.com/embed/abc123',
} as const;

export function problem(status: number, code: string, extra: Record<string, unknown> = {}) {
  return {
    type: 'about:blank',
    title: 'Error',
    status,
    detail: 'technical detail that must not reach the user',
    instance: '/api/apod',
    code,
    correlation_id: '5c0e0b8e-6d57-4f7b-9d0e-0d6a1f6f4c11',
    ...extra,
  };
}

export function jsonResponse(body: unknown, status = 200, contentType = 'application/json') {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  });
}

export function problemResponse(status: number, code: string, extra: Record<string, unknown> = {}) {
  return jsonResponse(problem(status, code, extra), status, 'application/problem+json');
}
