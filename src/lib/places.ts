import type { Place } from './types';

/**
 * Base URL of the self-hosted Express backend.
 * - If VITE_API_BASE_URL is set, it is used directly.
 * - If it is set to an empty string, requests go to the same origin (the Vite
 *   dev-server proxy forwards /api to localhost:4000). This is what makes the
 *   app work through an HTTPS tunnel on a phone.
 * - If it is not defined at all, localhost:4000 is used.
 */
const configuredBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
const API_BASE = (configuredBase ?? 'http://localhost:4000').replace(/\/$/, '');

async function handleResponse(res: Response) {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchPlaces(): Promise<Place[]> {
  const res = await fetch(`${API_BASE}/api/places`);
  return handleResponse(res);
}

export async function insertPlace(
  place: Omit<Place, 'id' | 'created_at' | 'is_user_submitted'>,
): Promise<Place> {
  const res = await fetch(`${API_BASE}/api/places`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...place, is_user_submitted: true }),
  });
  return handleResponse(res);
}

export async function deletePlace(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/places/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
}