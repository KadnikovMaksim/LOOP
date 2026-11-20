import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  CircleMarker,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchRoute, formatDistance, formatDuration, straightLineDistance, buildRouteMetrics, projectOnRoute, nearestVertexIndex, bearingAlongRoute, type RouteResult } from '@/lib/routing';
import { CARTO_TILE_URL, CARTO_ATTRIBUTION } from '@/lib/mapTiles';
import { FitBounds } from './FitBounds';
import { PlaceMarker, endpointIcon } from './PlaceMarker';
import type { Place } from '@/lib/types';
import { MapPin, Route as RouteIcon, Clock, Footprints, X, LocateFixed, Loader2, Navigation, Layers, ChevronDown, Navigation2 } from 'lucide-react';

/** Fallback centre (Saratov) when GPS/IP lookup is unavailable. */
const DEFAULT_CENTER: [number, number] = [51.5336, 46.0343];

interface MapViewProps {
  places: Place[];
  selectedPlace: Place | null;
  onSelectPlace: (place: Place) => void;
  routePlaces: Place[];
  /** When adding a route stop, next click adds to route */
  pickMode: 'A' | 'B' | 'waypoint' | null;
  onMapPick: (lat: number, lng: number) => void;
  onCancelPick: () => void;
  /** Guided navigation mode, controlled by the page. */
  navigating: boolean;
  startingNavigation?: boolean;
  onStartNavigation: () => void;
  onStopNavigation: () => void;
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Flies the map to a target coordinate whenever the target changes. */
function FlyTo({ target, zoom }: { target: [number, number] | null; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    if (!target) return;
    map.flyTo(target, zoom, { duration: 1.1 });
  }, [map, target, zoom]);

  return null;
}

/** Keeps the map centred on the user while navigation is active. */
function FollowUser({
  position,
  enabled,
}: {
  position: [number, number] | null;
  enabled: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || !position) return;
    map.panTo(position, { animate: true, duration: 0.4 });
  }, [map, enabled, position]);

  return null;
}

type TurnDirection = 'left' | 'right' | 'straight' | 'uturn' | 'arrive';

function turnDirection(text: string): TurnDirection {
  if (/прибыл|на месте/i.test(text)) return 'arrive';
  if (/разверн/i.test(text)) return 'uturn';
  if (/налево|левее/i.test(text)) return 'left';
  if (/направо|правее/i.test(text)) return 'right';
  return 'straight';
}

/** Big turn arrow shown in the navigation banner while the user is standing still. */
function TurnArrow({ direction, size = 30 }: { direction: TurnDirection; size?: number }) {
  if (direction === 'arrive') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 21V4" />
        <path d="M5 4h13l-2.5 4L18 12H5" />
      </svg>
    );
  }

  const rotation =
    direction === 'left' ? -90 : direction === 'right' ? 90 : direction === 'uturn' ? 180 : 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `rotate(${rotation}deg)`, transition: 'transform .2s ease' }}
    >
      <path d="M12 20V6" />
      <path d="m6 12 6-6 6 6" />
    </svg>
  );
}

/** Round heading arrow drawn at the user's position on the map. */
function headingIcon(bearing: number): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="nav-arrow" style="transform: rotate(${bearing}deg);">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20V6"/><path d="m6 12 6-6 6 6"/>
      </svg>
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

/** Continuous GPS tracking used by the "Пойдём" navigation mode. */function useWatchLocation(enabled: boolean) {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [error, setError] = useState<'denied' | 'unavailable' | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('unavailable');
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition([pos.coords.latitude, pos.coords.longitude]);
        setError(null);
      },
      (err) => {
        setError(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );

    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return { watchPosition: position, watchError: error };
}

/** Fits the map to all loaded places when `trigger` changes. */function FitToPlaces({ places, trigger }: { places: Place[]; trigger: number }) {
  const map = useMap();

  useEffect(() => {
    if (trigger === 0 || places.length === 0) return;
    const points = places.map((p) => [p.lat, p.lng] as [number, number]);
    if (points.length === 1) {
      map.flyTo(points[0], 15, { duration: 1 });
    } else {
      map.fitBounds(points, { padding: [48, 48], maxZoom: 15 });
    }
  }, [map, places, trigger]);

  return null;
}

interface IpLocation {
  lat: number;
  lng: number;
  city: string | null;
}

/** Approximate city-level location from the public IP, used when GPS is blocked. */
async function lookupIpLocation(): Promise<IpLocation | null> {
  const providers: Array<() => Promise<IpLocation | null>> = [
    async () => {
      const res = await fetch('https://ipwho.is/');
      if (!res.ok) return null;
      const d = await res.json();
      if (!d?.success) return null;
      return { lat: Number(d.latitude), lng: Number(d.longitude), city: d.city || null };
    },
    async () => {
      const res = await fetch('https://ipapi.co/json/');
      if (!res.ok) return null;
      const d = await res.json();
      return {
        lat: Number(d.latitude),
        lng: Number(d.longitude),
        city: typeof d.city === 'string' && d.city ? d.city : null,
      };
    },
  ];

  for (const provider of providers) {
    try {
      const result = await provider();
      if (result && Number.isFinite(result.lat) && Number.isFinite(result.lng)) return result;
    } catch {
      /* try the next provider */
    }
  }
  return null;
}

function useUserLocation() {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [source, setSource] = useState<'gps' | 'ip' | null>(null);
  const [ipCity, setIpCity] = useState<string | null>(null);
  const [status, setStatus] = useState<'locating' | 'granted' | 'denied'>('locating');
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const applyFix = (pos: GeolocationPosition) => {
      if (cancelled) return;
      setPosition([pos.coords.latitude, pos.coords.longitude]);
      setSource('gps');
      setIpCity(null);
      setStatus('granted');
    };

    // GPS blocked or unavailable → fall back to an approximate IP location.
    const fallbackToIp = async () => {
      const ip = await lookupIpLocation();
      if (cancelled) return;
      if (ip) {
        setPosition([ip.lat, ip.lng]);
        setSource('ip');
        setIpCity(ip.city);
        setStatus('granted');
      } else {
        setStatus('denied');
      }
    };

    setStatus('locating');

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      void fallbackToIp();
      return () => {
        cancelled = true;
      };
    }

    navigator.geolocation.getCurrentPosition(
      applyFix,
      (err) => {
        if (cancelled) return;
        // A timeout often just means "no precise fix yet" — retry cheaply first.
        if (err.code === err.TIMEOUT) {
          retryTimer = setTimeout(() => {
            if (cancelled) return;
            navigator.geolocation.getCurrentPosition(
              applyFix,
              () => void fallbackToIp(),
              { enableHighAccuracy: false, timeout: 20000, maximumAge: 10 * 60 * 1000 },
            );
          }, 200);
          return;
        }
        void fallbackToIp();
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60 * 1000 },
    );

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [requestId]);

  const retry = useCallback(() => {
    setStatus('locating');
    setRequestId((n) => n + 1);
  }, []);

  return { position, source, ipCity, status, retry };
}

/** Reverse-geocodes a GPS fix into a city name using OpenStreetMap Nominatim. */
function useCityName(position: [number, number] | null) {
  const [city, setCity] = useState<string | null>(null);

  useEffect(() => {
    if (!position) {
      setCity(null);
      return;
    }
    const [lat, lng] = position;
    const controller = new AbortController();

    fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ru`,
      { signal: controller.signal, headers: { Accept: 'application/json' } },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        const a = (data.address ?? {}) as Record<string, string>;
        const name =
          a.city || a.town || a.village || a.municipality || a.city_district || a.county || a.state || null;
        setCity(name ?? (typeof data.display_name === 'string' ? data.display_name.split(',')[0] : null));
      })
      .catch(() => {
        /* geocoding is best-effort */
      });

    return () => controller.abort();
  }, [position]);

  return city;
}

export default function MapView({
  places,
  selectedPlace,
  onSelectPlace,
  routePlaces,
  pickMode,
  onMapPick,
  onCancelPick,
  navigating,
  startingNavigation = false,
  onStartNavigation,
  onStopNavigation,
}: MapViewProps) {
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [fitAllTrigger, setFitAllTrigger] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const lastFixRef = useRef<{ pos: [number, number]; t: number } | null>(null);

  const { position: userPosition, source, ipCity, status: locationStatus, retry: retryLocation } =
    useUserLocation();
  const geocodedCity = useCityName(source === 'gps' ? userPosition : null);
  const city = source === 'ip' ? ipCity : geocodedCity;

  const routePoints = useMemo(
    () => routePlaces.map((p) => ({ lat: p.lat, lng: p.lng })),
    [routePlaces],
  );

  useEffect(() => {
    if (routePoints.length < 2) {
      setRoute(null);
      setRouteError(null);
      return;
    }
    let cancelled = false;
    setRouteLoading(true);
    setRouteError(null);
    fetchRoute(routePoints).then((result) => {
      if (cancelled) return;
      setRoute(result);
      setRouteError(result ? null : 'Не удалось построить пешеходный маршрут между этими точками.');
      setRouteLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [routePoints]);

  const straightDistance = useMemo(() => {
    if (routePoints.length < 2) return 0;
    return routePoints.slice(1).reduce(
      (sum, p, i) => sum + straightLineDistance(routePoints[i], p),
      0,
    );
  }, [routePoints]);

  const bounds: [number, number][] | null = useMemo(() => {
    if (routePlaces.length >= 2) return routePlaces.map((p) => [p.lat, p.lng] as [number, number]);
    return null;
  }, [routePlaces]);

  const a = routePlaces[0];
  const b = routePlaces[routePlaces.length - 1];
  const waypoints = routePlaces.slice(1, -1);

  const { watchPosition, watchError } = useWatchLocation(navigating);

  const navigation = useMemo(() => {
    if (!navigating || !route) return null;

    const { cumulative, total } = buildRouteMetrics(route.coordinates);
    const progress = watchPosition
      ? projectOnRoute(route.coordinates, cumulative, {
          lat: watchPosition[0],
          lng: watchPosition[1],
        })
      : { travelled: 0, offRoute: 0 };

    const stepDistances = route.steps.map((step) => {
      if (!step.location) return null;
      const index = nearestVertexIndex(route.coordinates, {
        lat: step.location[0],
        lng: step.location[1],
      });
      return cumulative[index] ?? null;
    });

    let nextIndex = -1;
    for (let i = 0; i < stepDistances.length; i += 1) {
      const value = stepDistances[i];
      if (value !== null && value > progress.travelled + 6) {
        nextIndex = i;
        break;
      }
    }
    if (nextIndex === -1) {
      for (let i = stepDistances.length - 1; i >= 0; i -= 1) {
        if (stepDistances[i] !== null) {
          nextIndex = i;
          break;
        }
      }
    }

    const step = nextIndex >= 0 ? route.steps[nextIndex] : null;
    const stepAt = nextIndex >= 0 ? stepDistances[nextIndex] : null;
    const distanceToNext = stepAt != null ? Math.max(0, stepAt - progress.travelled) : 0;

    return {
      instruction:
        step?.instruction ??
        (route.steps.length ? route.steps[0].instruction : 'Следуйте по маршруту'),
      distanceToNext,
      remaining: Math.max(0, total - progress.travelled),
      offRoute: progress.offRoute,
    };
  }, [navigating, route, watchPosition]);

  const heading = useMemo(() => {
    if (!navigating || !route || !watchPosition) return 0;
    return bearingAlongRoute(route.coordinates, {
      lat: watchPosition[0],
      lng: watchPosition[1],
    });
  }, [navigating, route, watchPosition]);

  // Detect whether the user is actually walking (arrow hides while moving).
  useEffect(() => {
    if (!navigating) {
      lastFixRef.current = null;
      setMoving(false);
      return;
    }
    if (!watchPosition) return;

    const now = Date.now();
    const last = lastFixRef.current;
    if (!last) {
      lastFixRef.current = { pos: watchPosition, t: now };
      return;
    }

    const metres = straightLineDistance(
      { lat: last.pos[0], lng: last.pos[1] },
      { lat: watchPosition[0], lng: watchPosition[1] },
    );
    const seconds = (now - last.t) / 1000;

    if (metres >= 2 && seconds > 0) {
      lastFixRef.current = { pos: watchPosition, t: now };
      setMoving(metres / seconds > 0.8);
    }
  }, [watchPosition, navigating]);

  // Bring the arrow back when the user stops.
  useEffect(() => {
    if (!moving) return;
    const timer = setTimeout(() => setMoving(false), 6000);
    return () => clearTimeout(timer);
  }, [moving, watchPosition]);

  const direction = navigation ? turnDirection(navigation.instruction) : 'straight';

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={13}
        className="h-full w-full z-0"
        zoomControl={false}
      >
        <TileLayer
          attribution={CARTO_ATTRIBUTION}
          url={CARTO_TILE_URL}
          subdomains={['a', 'b', 'c', 'd']}
          maxZoom={20}
        />
        <ClickHandler onPick={onMapPick} />
        <FlyTo target={navigating ? null : userPosition} zoom={source === 'ip' ? 12 : 15} />
        <FollowUser position={watchPosition} enabled={navigating} />
        <FitToPlaces places={places} trigger={fitAllTrigger} />
        <FitBounds points={bounds} />

        {route && route.snapped ? (
          <Polyline
            key="route-solid"
            positions={route.coordinates}
            pathOptions={{ color: '#2d5a3d', weight: 4, opacity: 0.85, dashArray: undefined }}
          />
        ) : null}

        {a && <Marker position={[a.lat, a.lng]} icon={endpointIcon('A')} />}
        {b && routePlaces.length > 1 && <Marker position={[b.lat, b.lng]} icon={endpointIcon('B')} />}
        {waypoints.map((p) => (
          <PlaceMarker key={`wp-${p.id}`} place={p} selected={selectedPlace?.id === p.id} onSelect={onSelectPlace} />
        ))}

        {places
          .filter((p) => !routePlaces.some((rp) => rp.id === p.id))
          .map((p) => (
            <PlaceMarker key={p.id} place={p} selected={selectedPlace?.id === p.id} onSelect={onSelectPlace} />
          ))}

        {navigating && watchPosition ? (
          <Marker position={watchPosition} icon={headingIcon(heading)} zIndexOffset={1200} />
        ) : watchPosition || (userPosition && source === 'gps') ? (
          <>
            <CircleMarker
              center={watchPosition ?? (userPosition as [number, number])}
              radius={42}
              pathOptions={{ color: '#2563eb', weight: 1, fillColor: '#2563eb', fillOpacity: 0.1 }}
            />
            <CircleMarker
              center={watchPosition ?? (userPosition as [number, number])}
              radius={8}
              pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}
            />
          </>
        ) : null}
      </MapContainer>

      {/* My location button + current city */}
      <div className="absolute right-4 top-20 z-[1000] flex flex-col items-end gap-2 lg:top-4">
        <button
          onClick={retryLocation}
          className="flex items-center gap-2 rounded-full bg-white/95 px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-lg backdrop-blur transition hover:bg-white"
          title="Центрировать карту на моём местоположении"
        >
          {locationStatus === 'locating' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-forest-600" /> Определяю…
            </>
          ) : (
            <>
              <LocateFixed className="h-4 w-4 text-forest-700" /> Моё местоположение
            </>
          )}
        </button>

        {places.length > 0 && (
          <button
            onClick={() => setFitAllTrigger((n) => n + 1)}
            className="flex items-center gap-2 rounded-full bg-white/95 px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-lg backdrop-blur transition hover:bg-white"
            title="Показать все места на карте"
          >
            <Layers className="h-4 w-4 text-forest-700" /> Все места · {places.length}
          </button>
        )}

        {locationStatus === 'granted' && city && (
          <span className="flex items-center gap-1.5 rounded-full bg-forest-700/95 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg">
            <Navigation className="h-3.5 w-3.5" /> {city}
          </span>
        )}

        {locationStatus === 'granted' && source === 'ip' && (
          <span className="max-w-[16rem] rounded-xl bg-stone-900/80 px-3 py-1.5 text-[11px] text-white shadow-lg">
            Приблизительно, по IP. Разрешите геолокацию для точности.
          </span>
        )}

        {locationStatus === 'denied' && (
          <span className="max-w-[16rem] rounded-xl bg-amber-50/95 px-3.5 py-2 text-xs text-amber-900 shadow-lg">
            Не удалось определить местоположение. Разрешите доступ к геолокации в браузере и нажмите кнопку ещё раз.
          </span>
        )}
      </div>

      {pickMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 rounded-full bg-forest-700 px-5 py-2.5 text-white shadow-lg">
          <MapPin className="h-4 w-4" />
          <span className="text-sm font-medium">
            {pickMode === 'waypoint'
              ? 'Нажмите на карту, чтобы добавить остановку'
              : `Нажмите на карту, чтобы поставить точку ${pickMode}`}
          </span>
          <button onClick={onCancelPick} className="rounded-full p-1 hover:bg-white/20" aria-label="Cancel">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {navigating && (
        <div className="absolute inset-x-3 top-3 z-[1200] mx-auto max-w-md overflow-hidden rounded-2xl bg-forest-800 text-white shadow-2xl">
          <div className="flex items-start gap-3 p-4">
            <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15">
              {moving ? <Navigation2 className="h-5 w-5" /> : <TurnArrow direction={direction} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-forest-200">
                {navigation ? `через ${formatDistance(navigation.distanceToNext)}` : 'Навигация'}
              </p>
              <p className="text-[15px] font-bold leading-snug">
                {navigation?.instruction ?? 'Определяю положение…'}
              </p>
              {navigation && (
                <p className="mt-1 text-xs text-forest-200">
                  Осталось {formatDistance(navigation.remaining)} ·{' '}
                  {formatDuration(navigation.remaining / 1.3)}
                  {navigation.offRoute > 60 ? ' · вы отклонились от маршрута' : ''}
                </p>
              )}
            </div>
            <button
              onClick={onStopNavigation}
              className="rounded-full bg-white/15 p-2 transition hover:bg-white/25"
              aria-label="Завершить навигацию"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {watchError && (
            <p className="bg-amber-400/20 px-4 py-2 text-[11px] text-amber-100">
              {watchError === 'denied'
                ? 'Нет доступа к геолокации. Разрешите его в браузере и нажмите «Пойдём» снова.'
                : 'GPS недоступен — ведение по маршруту ограничено.'}
            </p>
          )}
        </div>
      )}

      {routePlaces.length >= 1 && route && !navigating && (
        <button
          onClick={onStartNavigation}
          disabled={startingNavigation}
          className="absolute bottom-6 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-full bg-forest-700 px-6 py-3 text-sm font-bold text-white shadow-xl transition hover:bg-forest-800 disabled:opacity-70"
        >
          {startingNavigation ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Определяю…
            </>
          ) : (
            <>
              <Navigation2 className="h-5 w-5" /> Пойдём
            </>
          )}
        </button>
      )}

      {routePlaces.length >= 2 && !navigating && (
        <div className="absolute bottom-6 left-6 z-[1000] hidden w-80 rounded-2xl bg-white/95 shadow-xl ring-1 ring-stone-200/70 backdrop-blur md:block lg:left-[25rem]">
          <div className="px-4 pb-3 pt-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-forest-800">
                <RouteIcon className="h-4 w-4" />
                <span className="text-sm font-semibold">Ваш маршрут</span>
              </div>
              {waypoints.length > 0 && (
                <span className="rounded-full bg-forest-50 px-2 py-0.5 text-[11px] font-semibold text-forest-700">
                  {waypoints.length} ост.
                </span>
              )}
            </div>

            <div className="mt-1.5 flex items-center gap-4 text-sm text-stone-600">
              <span className="flex items-center gap-1.5">
                <Footprints className="h-4 w-4 text-forest-600" />
                {routeLoading
                  ? 'Ищу путь…'
                  : route
                    ? formatDistance(route.distance)
                    : formatDistance(straightDistance)}
              </span>
              {route && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-forest-600" />
                  {formatDuration(route.duration)}
                </span>
              )}
            </div>

            {route?.steps && route.steps.length > 0 && (
              <div className="mt-2.5 rounded-xl bg-forest-50 px-3 py-2">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-forest-600">
                  <Navigation2 className="h-3 w-3" /> Далее
                </p>
                <p className="mt-0.5 text-[13px] font-semibold leading-snug text-forest-900">
                  {route.steps[0].instruction}
                </p>
                <p className="text-[11px] text-forest-700">
                  через {formatDistance(route.steps[0].distance)}
                </p>
              </div>
            )}

            {route?.steps && route.steps.length > 1 && (
              <button
                onClick={() => setNavOpen((v) => !v)}
                className="mt-2 flex w-full items-center justify-between rounded-lg px-1 py-1 text-[11px] font-semibold text-stone-500 transition hover:text-forest-700"
              >
                Все шаги ({route.steps.length})
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${navOpen ? 'rotate-180' : ''}`}
                />
              </button>
            )}

            {navOpen && route?.steps && (
              <ol className="mt-1 max-h-56 space-y-2 overflow-y-auto pr-1">
                {route.steps.map((step, i) => (
                  <li key={`${step.instruction}-${i}`} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-forest-600" />
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium leading-snug text-stone-700">
                        {step.instruction}
                      </p>
                      <p className="text-[11px] text-stone-400">
                        {step.type === 'arrive'
                          ? 'финиш'
                          : `через ${formatDistance(step.distance)}`}
                        {step.street && step.type !== 'arrive' ? ` · ${step.street}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {routeError && !routeLoading && (
              <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-800">
                {routeError} Попробуйте уменьшить число остановок или выбрать точки ближе друг к другу.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}