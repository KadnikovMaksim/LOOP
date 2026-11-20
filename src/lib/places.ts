import type { Place } from './types';

/**
 * Base URL of the self-hosted Express backend.
 * Falls back to localhost so the app works out of the box.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');

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