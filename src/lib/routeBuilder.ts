import type { Place } from './types';

export interface StopSelectionOptions {
  /** Weight per category: 0 = off, 1 = normal, 2 = prefer more of it. */
  weights: Record<string, number>;
  /** Maximum number of intermediate stops. */
  maxStops: number;
  /** Maximum distance (metres) from the A→B line for a place to count as "on the way". */
  maxDetourMeters: number;
  /** Maximum extra walking distance (metres) a single stop may add. Prevents zig-zag. */
  maxExtraPerStopMeters: number;
  /** Optional time budget for the whole walk, in minutes. */
  maxDurationMinutes?: number;
  /** Max ratio of the actual walking path to the straight A→B line. Prevents big loops. */
  maxTotalRatio?: number;
}

interface Projected {
  place: Place;
  t: number;
  perpendicular: number;
}

const EARTH_LAT_M = 110540;
const EARTH_LNG_M = 111320;

/** Picks places near the A→B line, honouring per-category weights. */
export function pickStopsAlongRoute(
  places: Place[],
  a: Place,
  b: Place,
  {
    weights,
    maxStops,
    maxDetourMeters,
    maxExtraPerStopMeters,
    maxDurationMinutes,
    maxTotalRatio = 1.8,
  }: StopSelectionOptions,
): Place[] {
  if (maxStops <= 0) return [];

  const midLat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const lngScale = Math.cos(midLat);

  const toXY = (lat: number, lng: number) => ({
    x: (lng - a.lng) * EARTH_LNG_M * lngScale,
    y: (lat - a.lat) * EARTH_LAT_M,
  });

  const end = toXY(b.lat, b.lng);
  const lengthSq = end.x * end.x + end.y * end.y;
  if (lengthSq === 0) return [];

  const distance = (p: Place, q: Place) => {
    const px = toXY(p.lat, p.lng);
    const qx = toXY(q.lat, q.lng);
    return Math.hypot(px.x - qx.x, px.y - qx.y);
  };

  const candidates: Projected[] = [];

  for (const place of places) {
    if (place.id === a.id || place.id === b.id) continue;
    if ((weights[place.category] ?? 0) <= 0) continue;

    const p = toXY(place.lat, place.lng);
    const t = (p.x * end.x + p.y * end.y) / lengthSq;
    if (t <= 0.03 || t >= 0.97) continue; // too close to the endpoints

    const perpendicular = Math.abs(p.x * end.y - p.y * end.x) / Math.sqrt(lengthSq);
    if (perpendicular > maxDetourMeters) continue;

    candidates.push({ place, t, perpendicular });
  }

  if (candidates.length === 0) return [];

  /** Evenly picks up to `count` candidates along the route, preferring those closer to the line. */
  function spread(pool: Projected[], count: number): Projected[] {
    if (count <= 0 || pool.length === 0) return [];
    const result: Projected[] = [];
    const buckets = new Map<number, Projected>();
    for (const candidate of pool) {
      const bucket = Math.min(count - 1, Math.floor(candidate.t * count));
      const current = buckets.get(bucket);
      if (!current || candidate.perpendicular < current.perpendicular) {
        buckets.set(bucket, candidate);
      }
    }
    for (const candidate of buckets.values()) result.push(candidate);
    return result;
  }

  const chosen = new Map<string, Projected>();

  // 1) Quota per category: weight 2 gets twice as many stops as weight 1.
  const activeCategories = Object.entries(weights).filter(([, w]) => w > 0);
  const totalWeight = activeCategories.reduce((sum, [, w]) => sum + w, 0) || 1;

  for (const [category, weight] of activeCategories) {
    const pool = candidates.filter((c) => c.place.category === category);
    if (pool.length === 0) continue;
    const quota = Math.max(1, Math.round((maxStops * weight) / totalWeight));
    for (const candidate of spread(pool, quota)) {
      if (chosen.size >= maxStops) break;
      chosen.set(candidate.place.id, candidate);
    }
  }

  // 2) Fill any remaining slots with evenly spread stops from all categories.
  if (chosen.size < maxStops) {
    const rest = candidates.filter((c) => !chosen.has(c.place.id));
    for (const candidate of spread(rest, maxStops - chosen.size)) {
      if (chosen.size >= maxStops) break;
      chosen.set(candidate.place.id, candidate);
    }
  }

  // 3) Trim to maxStops while keeping the stops spread along the route.
  let selected = [...chosen.values()].sort((x, y) => x.t - y.t);
  if (selected.length > maxStops) {
    const step = selected.length / maxStops;
    selected = Array.from({ length: maxStops }, (_, i) => selected[Math.floor(i * step)]);
  }

  // 4) Drop stops that add too much walking or exceed the time budget.
  //    This is what prevents zig-zag routes and keeps the walk within the chosen time.
  const WALK_SPEED_MS = (4.5 * 1000) / 3600;
  const STREET_FACTOR = 1.5;
  const budgetSeconds = maxDurationMinutes ? maxDurationMinutes * 60 : Number.POSITIVE_INFINITY;

  let totalSeconds = (distance(a, b) * STREET_FACTOR) / WALK_SPEED_MS;

  const kept: Projected[] = [];
  let previous: Place = a;
  for (const candidate of selected) {
    const extra =
      distance(previous, candidate.place) +
      distance(candidate.place, b) -
      distance(previous, b);
    const extraSeconds = (extra * STREET_FACTOR) / WALK_SPEED_MS;
    if (extra <= maxExtraPerStopMeters && totalSeconds + extraSeconds <= budgetSeconds) {
      kept.push(candidate);
      previous = candidate.place;
      totalSeconds += extraSeconds;
    }
  }

  // 5) Hard loop guard: the walk may not be much longer than the direct line.
  //    Remove the stops that add the most extra distance until it fits.
  const pathLength = (stops: Place[]) => {
    let metres = 0;
    let previous = a;
    for (const stop of stops) {
      metres += distance(previous, stop);
      previous = stop;
    }
    return metres + distance(previous, b);
  };

  let path = pathLength(kept.map((c) => c.place));
  const maxPath = distance(a, b) * maxTotalRatio;

  while (kept.length > 0 && path > maxPath) {
    let worstIndex = -1;
    let worstReduction = -1;

    for (let i = 0; i < kept.length; i += 1) {
      const before = i === 0 ? a : kept[i - 1].place;
      const after = i === kept.length - 1 ? b : kept[i + 1].place;
      const reduction =
        distance(before, kept[i].place) +
        distance(kept[i].place, after) -
        distance(before, after);
      if (reduction > worstReduction) {
        worstReduction = reduction;
        worstIndex = i;
      }
    }

    if (worstIndex < 0) break;
    kept.splice(worstIndex, 1);
    path -= worstReduction;
  }

  return kept.map((c) => c.place);
}

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough walking time for A → stops → B, including a street-network factor. */
export function estimateWalkingSeconds(
  a: { lat: number; lng: number },
  stops: { lat: number; lng: number }[],
  b: { lat: number; lng: number },
  speedKmh = 4.5,
  streetFactor = 1.5,
): number {
  let metres = 0;
  let previous = a;
  for (const stop of stops) {
    metres += haversine(previous, stop);
    previous = stop;
  }
  metres += haversine(previous, b);
  return (metres * streetFactor) / ((speedKmh * 1000) / 3600);
}