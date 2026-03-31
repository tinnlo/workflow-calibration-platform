const BASE = 'https://calibration-platform.example/problems'

/** Build a RFC 7807 Problem Details object. */
export function problem(
  type: string,
  title: string,
  status: number,
  detail: string,
  instance?: string
) {
  return { type: `${BASE}/${type}`, title, status, detail, ...(instance ? { instance } : {}) }
}
