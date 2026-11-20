export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteStep {
  /** Human-readable instruction in Russian. */
  instruction: string;
  /** Street name, if the router knows it. */
  street: string | null;
  /** Distance until the next manoeuvre, in metres. */
  distance: number;
  /** Normalised manoeuvre type: turn, arrive, depart, ... */
  type: string;
  modifier: string | null;
  /** Coordinate of the manoeuvre on the route. */
  location: [number, number] | null;
}

export interface RouteResult {
  /** Ordered polyline coordinates following roads */
  coordinates: [number, number][];
  /** Distance in metres */
  distance: number;
  /** Walking duration in seconds */
  duration: number;
  snapped: boolean;
  /** Turn-by-turn instructions */
  steps: RouteStep[];
}

const WALK_SPEED_MS = 1.3; // ~4.7 km/h

/** Decodes a Google/Valhalla encoded polyline (precision 1e6). */
function decodePolyline(encoded: string): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([lat / 1e6, lng / 1e6]);
  }
  return coordinates;
}

function cleanInstruction(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\.$/, '').trim();
}

/** Valhalla manoeuvre type → our coarse type. */
function normaliseType(type: number): string {
  if (type === 4 || type === 5 || type === 6) return 'arrive';
  if (type === 1 || type === 2 || type === 3) return 'depart';
  if (type === 26 || type === 27) return 'roundabout';
  return 'turn';
}

/** Pedestrian routing through Valhalla (public OSM server). */
async function fetchValhalla(points: RoutePoint[]): Promise<RouteResult | null> {
  try {
    const res = await fetch('https://valhalla1.openstreetmap.de/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: points.map((p) => ({ lat: p.lat, lon: p.lng })),
        costing: 'pedestrian',
        units: 'kilometers',
        directions_options: { language: 'ru-RU' },
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const trip = json?.trip;
    if (!trip?.legs?.length) return null;

    const coordinates: [number, number][] = [];
    const steps: RouteStep[] = [];

    for (const leg of trip.legs) {
      const shape = decodePolyline(leg.shape ?? '');
      if (shape.length === 0) continue;

      for (const maneuver of leg.maneuvers ?? []) {
        const distance = Number(maneuver.length ?? 0) * 1000;
        const type = normaliseType(Number(maneuver.type ?? 0));
        const location = shape[maneuver.begin_shape_index] ?? null;

        if (distance < 8 && type !== 'arrive') continue;
        if (type !== 'arrive' && type !== 'depart' && distance < 12) continue;

        steps.push({
          instruction: cleanInstruction(String(maneuver.instruction ?? 'Продолжайте движение')),
          street: maneuver.street_names?.[0] ?? null,
          distance,
          type,
          modifier: null,
          location,
        });
      }

      if (coordinates.length > 0) shape.shift(); // drop duplicated junction point
      coordinates.push(...shape);
    }

    if (coordinates.length < 2) return null;

    return {
      coordinates,
      distance: Math.round(Number(trip.summary?.length ?? 0) * 1000),
      duration: Math.round(Number(trip.summary?.time ?? 0)) || Math.round(
        (Number(trip.summary?.length ?? 0) * 1000) / WALK_SPEED_MS,
      ),
      snapped: true,
      steps,
    };
  } catch {
    return null;
  }
}

const MODIFIER_TEXT: Record<string, string> = {
  left: 'Поверните налево',
  right: 'Поверните направо',
  'slight left': 'Плавно поверните налево',
  'slight right': 'Плавно поверните направо',
  'sharp left': 'Резко поверните налево',
  'sharp right': 'Резко поверните направо',
  straight: 'Продолжайте движение прямо',
  uturn: 'Развернитесь',
};

function osrmInstruction(type: string, modifier: string | undefined, name: string | undefined): string {
  const where = name ? ` по ${name}` : '';
  switch (type) {
    case 'depart':
      return name ? `Начните движение по ${name}` : 'Начните движение';
    case 'arrive':
      return 'Вы на месте';
    case 'roundabout':
    case 'rotary':
      return 'Войдите на круговое движение';
    case 'fork':
      return modifier?.includes('left') ? 'Держитесь левее' : 'Держитесь правее';
    case 'end of road':
      return modifier?.includes('left')
        ? 'Поверните налево в конце дороги'
        : 'Поверните направо в конце дороги';
    case 'new name':
      return `Продолжайте движение${where}`;
    case 'continue':
      if (modifier?.includes('left')) return `Продолжайте левее${where}`;
      if (modifier?.includes('right')) return `Продолжайте правее${where}`;
      return `Продолжайте движение${where}`;
    case 'turn':
      return MODIFIER_TEXT[modifier ?? ''] ?? 'Поверните';
    default:
      return MODIFIER_TEXT[modifier ?? ''] ?? `Продолжайте движение${where}`;
  }
}

/** Fallback routing via the public OSRM demo server. */
async function fetchOsrm(points: RoutePoint[]): Promise<RouteResult | null> {
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.code !== 'Ok' || !json.routes?.length) return null;
    const route = json.routes[0];

    const steps: RouteStep[] = [];
    for (const leg of route.legs ?? []) {
      for (const step of leg.steps ?? []) {
        const maneuver = step?.maneuver;
        if (!maneuver) continue;
        const type = String(maneuver.type ?? '');
        const distance = Number(step.distance ?? 0);
        if (distance < 3 && type !== 'arrive') continue;

        const street = typeof step.name === 'string' && step.name ? step.name : null;
        const instruction = osrmInstruction(type, maneuver.modifier, street ?? undefined);
        const location = Array.isArray(maneuver.location)
          ? ([maneuver.location[1], maneuver.location[0]] as [number, number])
          : null;

        const previous = steps[steps.length - 1];
        if (previous && previous.instruction === instruction && previous.street === street) {
          previous.distance += distance;
          continue;
        }

        steps.push({
          instruction,
          street,
          distance,
          type: type === 'arrive' ? 'arrive' : type === 'depart' ? 'depart' : 'turn',
          modifier: maneuver.modifier ?? null,
          location,
        });
      }
    }

    return {
      coordinates: route.geometry.coordinates.map(
        (c: [number, number]) => [c[1], c[0]] as [number, number],
      ),
      distance: route.distance,
      duration: Math.round(route.distance / WALK_SPEED_MS),
      snapped: true,
      steps,
    };
  } catch {
    return null;
  }
}

/** Route through ordered waypoints: Valhalla pedestrian first, OSRM as fallback. */
export async function fetchRoute(points: RoutePoint[]): Promise<RouteResult | null> {
  if (points.length < 2) return null;
  const valhalla = await fetchValhalla(points);
  if (valhalla) return valhalla;
  return fetchOsrm(points);
}

/** Cumulative distances (metres) along a polyline. */
export function buildRouteMetrics(
  coordinates: [number, number][],
): { cumulative: number[]; total: number } {
  const cumulative = [0];
  let total = 0;
  for (let i = 1; i < coordinates.length; i += 1) {
    total += haversine(
      { lat: coordinates[i - 1][0], lng: coordinates[i - 1][1] },
      { lat: coordinates[i][0], lng: coordinates[i][1] },
    );
    cumulative.push(total);
  }
  return { cumulative, total };
}

/** Projects a point onto the polyline and reports progress + deviation. */
export function projectOnRoute(
  coordinates: [number, number][],
  cumulative: number[],
  point: { lat: number; lng: number },
): { travelled: number; offRoute: number } {
  if (coordinates.length < 2) return { travelled: 0, offRoute: 0 };

  let bestDistance = Number.POSITIVE_INFINITY;
  let bestTravelled = 0;

  for (let i = 1; i < coordinates.length; i += 1) {
    const [lat1, lng1] = coordinates[i - 1];
    const [lat2, lng2] = coordinates[i];

    const midLat = ((lat1 + lat2) / 2) * (Math.PI / 180);
    const scale = Math.cos(midLat);
    const ax = lng1 * 111320 * scale;
    const ay = lat1 * 110540;
    const bx = lng2 * 111320 * scale;
    const by = lat2 * 110540;
    const px = point.lng * 111320 * scale;
    const py = point.lat * 110540;

    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    let t = lengthSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const distance = Math.hypot(px - cx, py - cy);

    if (distance < bestDistance) {
      bestDistance = distance;
      const segmentLength = haversine(
        { lat: lat1, lng: lng1 },
        { lat: lat2, lng: lng2 },
      );
      bestTravelled = cumulative[i - 1] + t * segmentLength;
    }
  }

  return { travelled: bestTravelled, offRoute: bestDistance };
}

/** Compass bearing (degrees, 0 = north) of the route segment nearest to a point. */
export function bearingAlongRoute(
  coordinates: [number, number][],
  point: { lat: number; lng: number },
): number {
  if (coordinates.length < 2) return 0;

  let bestDistance = Number.POSITIVE_INFINITY;
  let bearing = 0;

  for (let i = 1; i < coordinates.length; i += 1) {
    const [lat1, lng1] = coordinates[i - 1];
    const [lat2, lng2] = coordinates[i];

    const midLat = ((lat1 + lat2) / 2) * (Math.PI / 180);
    const scale = Math.cos(midLat);
    const ax = lng1 * 111320 * scale;
    const ay = lat1 * 110540;
    const bx = lng2 * 111320 * scale;
    const by = lat2 * 110540;
    const px = point.lng * 111320 * scale;
    const py = point.lat * 110540;

    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    let t = lengthSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const distance = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (distance < bestDistance) {
      bestDistance = distance;
      bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
    }
  }

  return (bearing + 360) % 360;
}

/** Index of the polyline vertex closest to a point. */export function nearestVertexIndex(
  coordinates: [number, number][],
  point: { lat: number; lng: number },
): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < coordinates.length; i += 1) {
    const d = haversine(
      { lat: coordinates[i][0], lng: coordinates[i][1] },
      point,
    );
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

/** Straight-line fallback: distance in metres using haversine. */
export function straightLineDistance(a: RoutePoint, b: RoutePoint): number {
  return haversine(a, b);
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

export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} м`;
  return `${(metres / 1000).toFixed(1)} км`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} мин`;
  return `${Math.floor(mins / 60)} ч ${mins % 60} мин`;
}