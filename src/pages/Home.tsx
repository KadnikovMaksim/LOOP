import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Plus,
  MapPin,
  X,
  Circle,
  Flag,
  ListOrdered,
  Loader2,
  Sparkles,
  Settings2,
  Zap,
  Trees,
  Landmark,
  Flame,
  Timer,
} from 'lucide-react';
import MapView from '@/components/MapView';
import PlaceDetail from '@/components/PlaceDetail';
import { fetchPlaces, API_BASE } from '@/lib/places';
import { categoryConfig } from '@/lib/categories';
import { pickStopsAlongRoute, estimateWalkingSeconds } from '@/lib/routeBuilder';
import { straightLineDistance } from '@/lib/routing';
import type { Place } from '@/lib/types';

const INTEREST_CATEGORIES = ['museum', 'monument', 'park', 'scenic', 'cafe'];

/** Custom map points and "my location" exist only for the route, not as places. */
function isRouteOnlyPlace(place: Place): boolean {
  return place.id.startsWith('custom-') || place.id.startsWith('me-');
}

const PRESETS = [
  {
    id: 'fast',
    label: 'Быстрый',
    icon: Zap,
    weights: { monument: 1, museum: 1, park: 1 },
    corridor: 300,
    extra: 200,
    ratio: 1.3,
  },
  {
    id: 'optimal',
    label: 'Оптимальный',
    icon: Sparkles,
    weights: { monument: 1, museum: 1, park: 1 },
    corridor: 600,
    extra: 350,
    ratio: 1.5,
  },
  {
    id: 'parks',
    label: 'Парки',
    icon: Trees,
    weights: { park: 2 },
    corridor: 900,
    extra: 450,
    ratio: 1.7,
  },
  {
    id: 'museums',
    label: 'Музеи',
    icon: Landmark,
    weights: { museum: 2, monument: 1 },
    corridor: 900,
    extra: 450,
    ratio: 1.7,
  },
  {
    id: 'max',
    label: 'Максимум',
    icon: Flame,
    weights: { monument: 2, museum: 2, park: 2, scenic: 1, cafe: 1 },
    corridor: 1200,
    extra: 600,
    ratio: 1.9,
  },
] as const;

type PresetId = (typeof PRESETS)[number]['id'];

function formatMinutes(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} мин`;
  return `${Math.floor(mins / 60)} ч ${mins % 60} мин`;
}

export default function Home() {
  const location = useLocation();
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Place | null>(null);
  const [routeIds, setRouteIds] = useState<string[]>([]);
  const [pickMode, setPickMode] = useState<'A' | 'B' | 'waypoint' | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [presetId, setPresetId] = useState<PresetId>('optimal');
  const [weights, setWeights] = useState<Record<string, number>>({ ...PRESETS[1].weights });
  const [corridor, setCorridor] = useState<number>(PRESETS[1].corridor);
  const [extraPerStop, setExtraPerStop] = useState<number>(PRESETS[1].extra);
  const [maxRatio, setMaxRatio] = useState<number>(PRESETS[1].ratio);
  const [minutes, setMinutes] = useState(60);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [startingNavigation, setStartingNavigation] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchPlaces()
      .then(setPlaces)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      })
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const focusId = (location.state as { focusPlaceId?: string } | null)?.focusPlaceId;
  useEffect(() => {
    if (focusId && places.length > 0) {
      const p = places.find((pl) => pl.id === focusId);
      if (p) setSelected(p);
    }
  }, [focusId, places]);

  const routePlaces = useMemo(
    () =>
      routeIds
        .map((id) => places.find((p) => p.id === id))
        .filter((p): p is Place => Boolean(p)),
    [routeIds, places],
  );

  const addToRoute = useCallback(
    (place: Place) => {
      setRouteIds((prev) => {
        if (prev.includes(place.id)) return prev;
        if (prev.length === 0) return [place.id];
        if (prev.length === 1) return [prev[0], place.id];
        return [...prev.slice(0, -1), place.id, prev[prev.length - 1]];
      });
      if (routeIds.length === 0) {
        setNotice('Точка назначения выбрана. Нажмите «Пойдём» — старт будет с вашего местоположения.');
      }
      setSelected(null);
    },
    [routeIds.length],
  );

  function removeFromRoute(place: Place) {
    setRouteIds((prev) => prev.filter((id) => id !== place.id));
    if (isRouteOnlyPlace(place)) {
      setPlaces((prev) => prev.filter((p) => p.id !== place.id));
    }
  }

  function clearRoute() {
    setRouteIds([]);
    setNavigating(false);
    setNotice(null);
    setPlaces((prev) => prev.filter((p) => !isRouteOnlyPlace(p)));
  }

  function handleMapPick(lat: number, lng: number) {
    if (!pickMode) return;
    const place: Place = {
      id: `custom-${Date.now()}`,
      title: pickMode === 'A' ? 'Начало маршрута' : pickMode === 'B' ? 'Конец маршрута' : 'Остановка',
      description: 'Точка на карте',
      category: 'hidden_gem',
      lat,
      lng,
      image_url: null,
      is_user_submitted: false,
      created_at: '',
    };
    setPlaces((prev) => [...prev, place]);
    setRouteIds((prev) => {
      if (prev.length === 0) return [place.id];
      if (prev.length === 1) return pickMode === 'A' ? [place.id, prev[0]] : [prev[0], place.id];
      if (pickMode === 'A') return [place.id, ...prev.slice(1)];
      if (pickMode === 'B') return [...prev.slice(0, -1), place.id];
      return [...prev.slice(0, -1), place.id, prev[prev.length - 1]];
    });
    setPickMode(null);
  }

  const routeStart = routePlaces[0];
  const routeEnd = routePlaces[routePlaces.length - 1];

  const pickForRoute = useCallback(
    (start: Place, end: Place, pool: Place[], extraCap = Number.POSITIVE_INFINITY) => {
      const direct = straightLineDistance(start, end);
      // Don't cram a stop every 100 m: roughly one stop per 350 m of the direct line.
      const densityCap = Math.max(2, Math.min(10, Math.round(direct / 350)));
      const cap = Math.min(densityCap, extraCap);
      if (cap < 1) return [];
      return pickStopsAlongRoute(pool, start, end, {
        weights,
        maxStops: cap,
        maxDetourMeters: corridor,
        maxExtraPerStopMeters: extraPerStop,
        maxDurationMinutes: minutes,
        maxTotalRatio: maxRatio,
      });
    },
    [weights, corridor, extraPerStop, minutes, maxRatio],
  );

  const buildRoute = useCallback(() => {
    if (!routeStart) {
      setNotice('Поставьте точку B — куда идём.');
      return;
    }
    if (routeStart.id === routeEnd.id) {
      setNotice('Точка назначения выбрана. Нажмите «Пойдём» — старт будет с вашего местоположения.');
      return;
    }
    const active = Object.values(weights).some((w) => w > 0);
    if (!active) {
      setNotice('Выберите хотя бы одну категорию в настройках.');
      return;
    }

    const directSeconds = estimateWalkingSeconds(routeStart, [], routeEnd);
    const budgetSeconds = minutes * 60;

    // If even the direct walk is longer than the chosen time, never force detours.
    if (directSeconds > budgetSeconds) {
      setRouteIds([routeStart.id, routeEnd.id]);
      setNotice(
        `Дорога A→B сама занимает ~${formatMinutes(directSeconds)}, это больше ${minutes} мин. ` +
          'Остановки не добавляю — увеличьте время или сократите маршрут.',
      );
      return;
    }

    // Roughly 12 minutes per stop including the walk to it.
    const timeCap = Math.floor((budgetSeconds - directSeconds) / (12 * 60));
    const picked = timeCap > 0 ? pickForRoute(routeStart, routeEnd, places, timeCap) : [];

    if (picked.length === 0) {
      setRouteIds([routeStart.id, routeEnd.id]);
      setNotice(
        `Маршрут A→B занимает ~${formatMinutes(directSeconds)}. ` +
          'Для остановок нужно больше времени или другой радиус.',
      );
      return;
    }
    setRouteIds([routeStart.id, ...picked.map((p) => p.id), routeEnd.id]);
    setNotice(null);
  }, [routeStart, routeEnd, weights, minutes, places, pickForRoute]);

  /**
   * Starts guided navigation from the user's current position to point B.
   * Replaces point A with a fresh GPS fix and rebuilds the stops along the way.
   */
  async function startNavigation() {
    setNotice(null);

    const destination =
      routePlaces.length >= 2 ? routePlaces[routePlaces.length - 1] : routePlaces[0];

    if (!destination) {
      setNotice('Поставьте точку B — куда идём.');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setNotice('Браузер не поддерживает геолокацию.');
      return;
    }

    setStartingNavigation(true);
    try {
      const [lat, lng] = await new Promise<[number, number]>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
          reject,
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
        );
      });

      const me: Place = {
        id: `me-${Date.now()}`,
        title: 'Моё местоположение',
        description: 'Текущее местоположение',
        category: 'hidden_gem',
        lat,
        lng,
        image_url: null,
        is_user_submitted: false,
        created_at: '',
      };

      const pool = [...places, me];
      setPlaces(pool);

      const direct = straightLineDistance(me, destination);
      const stops = direct > 250 ? pickForRoute(me, destination, pool) : [];

      setRouteIds([me.id, ...stops.map((s) => s.id), destination.id]);
      setNavigating(true);
    } catch {
      setNotice('Не удалось определить местоположение. Разрешите геолокацию в браузере.');
    } finally {
      setStartingNavigation(false);
    }
  }

  // Rebuild automatically when the time budget, preset or settings change.
  const buildRef = useRef(buildRoute);
  buildRef.current = buildRoute;
  const routeIdsRef = useRef(routeIds);
  routeIdsRef.current = routeIds;
  const navigatingRef = useRef(navigating);
  navigatingRef.current = navigating;

  useEffect(() => {
    if (navigatingRef.current) return;
    if (routeIdsRef.current.length < 2) return;
    const timer = setTimeout(() => buildRef.current(), 350);
    return () => clearTimeout(timer);
  }, [minutes, presetId, settingsVersion]);

  function applyPreset(id: PresetId) {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPresetId(id);
    setWeights({ ...preset.weights });
    setCorridor(preset.corridor);
    setExtraPerStop(preset.extra);
    setMaxRatio(preset.ratio);
    setSettingsVersion((v) => v + 1);
    setNotice(null);
  }

  function setWeight(category: string, weight: number) {
    setWeights((prev) => ({ ...prev, [category]: weight }));
    setSettingsVersion((v) => v + 1);
  }

  const estimate = useMemo(() => {
    if (!routeStart || !routeEnd || routeStart.id === routeEnd.id) return null;
    const middle = routePlaces.slice(1, -1);
    return estimateWalkingSeconds(routeStart, middle, routeEnd);
  }, [routePlaces, routeStart, routeEnd]);

  const routeSidebar = (
    <div className="flex h-full flex-col bg-stone-50">
      <div className="flex items-center justify-between border-b border-stone-200/70 px-5 py-4">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-stone-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-forest-700 text-white">
            <ListOrdered className="h-4 w-4" />
          </span>
          Маршрут
        </h2>
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
            settingsOpen
              ? 'bg-forest-700 text-white'
              : 'bg-white text-stone-500 ring-1 ring-stone-200 hover:text-forest-700'
          }`}
          aria-label="Настройки маршрута"
          title="Настройки маршрута"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPickMode(pickMode === 'A' ? null : 'A')}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                pickMode === 'A'
                  ? 'bg-forest-700 text-white shadow-sm'
                  : 'bg-white text-forest-800 ring-1 ring-stone-200 hover:ring-forest-300'
              }`}
            >
              <Circle className="h-3.5 w-3.5" /> Точка A
            </button>
            <button
              onClick={() => setPickMode(pickMode === 'B' ? null : 'B')}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                pickMode === 'B'
                  ? 'bg-forest-700 text-white shadow-sm'
                  : 'bg-white text-forest-800 ring-1 ring-stone-200 hover:ring-forest-300'
              }`}
            >
              <Flag className="h-3.5 w-3.5" /> Точка B
            </button>
          </div>

          {/* Presets */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => {
              const Icon = preset.icon;
              const active = presetId === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'bg-forest-700 text-white shadow-sm'
                      : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:text-forest-800'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Time budget */}
          <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-500">
                <Timer className="h-3.5 w-3.5" /> Время прогулки
              </span>
              <span className="text-lg font-bold tabular-nums text-forest-800">{minutes} мин</span>
            </div>
            <input
              type="range"
              min={15}
              max={240}
              step={5}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="mt-2 w-full accent-forest-700"
            />
            <div className="mt-1 flex items-center justify-between text-[11px] text-stone-400">
              <span>15 мин</span>
              <span>
                {estimate ? `сейчас ≈ ${formatMinutes(estimate)}` : 'поставьте A и B'}
              </span>
              <span>4 ч</span>
            </div>
          </div>

          <button
            onClick={buildRoute}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold transition ${
              routePlaces.length < 2
                ? 'cursor-not-allowed bg-stone-200/70 text-stone-400'
                : 'bg-forest-700 text-white shadow-sm hover:bg-forest-800'
            }`}
          >
            <Sparkles className="h-4 w-4" /> Построить маршрут
          </button>
          {notice && <p className="mt-2 text-xs text-amber-700">{notice}</p>}
          <p className="mt-2 text-[11px] leading-snug text-stone-400">
            «Пойдём» на карте построит маршрут от вашего текущего местоположения до точки B.
          </p>

          {/* Settings drawer */}
          {settingsOpen && (
            <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                Что учитывать
              </p>
              <div className="mt-3 space-y-2">
                {INTEREST_CATEGORIES.map((cat) => {
                  const weight = weights[cat] ?? 0;
                  const cfg = categoryConfig(cat);
                  return (
                    <div key={cat} className="flex items-center justify-between gap-2">
                      <span
                        className={`flex items-center gap-1.5 text-xs font-medium ${
                          weight > 0 ? 'text-stone-800' : 'text-stone-400'
                        }`}
                      >
                        <cfg.icon className="h-3.5 w-3.5" />
                        {cfg.label}
                      </span>
                      <div className="flex overflow-hidden rounded-lg ring-1 ring-stone-200">
                        {[0, 1, 2].map((w) => {
                          const isSelected = weight === w;
                          return (
                            <button
                              key={w}
                              onClick={() => setWeight(cat, w)}
                              className={`h-7 w-8 text-[11px] font-semibold transition ${
                                isSelected
                                  ? w > 0
                                    ? 'bg-forest-700 text-white'
                                    : 'bg-stone-200 text-stone-600'
                                  : 'bg-white text-stone-400 hover:bg-stone-50'
                              }`}
                            >
                              {w === 0 ? '—' : w}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <label className="mt-4 flex items-center justify-between text-xs font-medium text-stone-600">
                <span>Насколько в сторону</span>
                <span className="font-bold text-forest-700">{corridor} м</span>
              </label>
              <input
                type="range"
                min={300}
                max={2000}
                step={100}
                value={corridor}
                onChange={(e) => {
                  setCorridor(Number(e.target.value));
                  setSettingsVersion((v) => v + 1);
                }}
                className="mt-1 w-full accent-forest-700"
              />
            </div>
          )}
        </div>

        {/* Stops */}
        <div className="px-5 py-4">
          {routePlaces.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center">
              <MapPin className="mx-auto h-6 w-6 text-stone-300" />
              <p className="mt-2 text-sm text-stone-500">
                Поставьте A и B, выберите интересы — маршрут пройдёт через достопримечательности по пути.
              </p>
            </div>
          ) : (
            <ol className="space-y-2">
              {routePlaces.map((p, i) => {
                const isEndpoint = i === 0 || i === routePlaces.length - 1;
                const cfg = categoryConfig(p.category);
                return (
                  <li
                    key={p.id}
                    className="group flex items-center gap-2.5 rounded-2xl bg-white p-2 pr-1.5 shadow-sm ring-1 ring-stone-200/70"
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold ${
                        isEndpoint ? 'bg-forest-700 text-white' : 'bg-forest-50 text-forest-800'
                      }`}
                    >
                      {routePlaces.length === 1 ? 'B' : isEndpoint ? (i === 0 ? 'A' : 'B') : i}
                    </span>
                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => setSelected(p)}
                        className="block w-full truncate text-left text-[13px] font-semibold text-stone-800 hover:text-forest-700"
                      >
                        {p.title}
                      </button>
                      <p className="flex items-center gap-1 text-[11px] text-stone-400">
                        <cfg.icon className="h-3 w-3" />
                        {routePlaces.length === 1
                          ? 'Финиш'
                          : isEndpoint
                            ? i === 0
                              ? 'Старт'
                              : 'Финиш'
                            : cfg.label}
                      </p>
                    </div>
                    <button
                      onClick={() => removeFromRoute(p)}
                      className="rounded-full p-1.5 text-stone-300 transition hover:bg-red-50 hover:text-red-500"
                      aria-label={`Убрать ${p.title}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}

          {routePlaces.length > 0 && (
            <button
              onClick={() => setPickMode(pickMode === 'waypoint' ? null : 'waypoint')}
              className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                pickMode === 'waypoint'
                  ? 'border-forest-700 bg-forest-700 text-white'
                  : 'border-stone-200 text-forest-800 hover:border-forest-400 hover:bg-forest-50'
              }`}
            >
              <Plus className="h-3.5 w-3.5" /> Добавить остановку с карты
            </button>
          )}
        </div>
      </div>

      {routePlaces.length >= 1 && (
        <div className="border-t border-stone-200/70 px-5 py-3">
          <button
            onClick={clearRoute}
            className="w-full rounded-xl px-3 py-2 text-xs font-medium text-stone-500 transition hover:bg-white hover:text-red-600"
          >
            Очистить маршрут
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full">
      <div className="h-full w-full">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-forest-600" />
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center px-6">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-card ring-1 ring-stone-200/70">
              <p className="text-lg font-semibold text-stone-900">Не удалось загрузить места</p>
              <p className="mt-2 text-sm text-stone-600">
                Похоже, бэкенд не запущен. В папке{' '}
                <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">server</code> выполните:
              </p>
              <pre className="mt-2 rounded-xl bg-stone-900 px-3 py-2 text-left text-xs text-stone-100">
{`npm install
npm start`}
              </pre>
              <p className="mt-3 text-xs text-stone-400">
                Проверка:{' '}
                <a
                  href={`${API_BASE || window.location.origin}/api/health`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-forest-700"
                >
                  {`${API_BASE || window.location.origin}/api/health`}
                </a>
              </p>
              <button
                onClick={() => setReloadKey((k) => k + 1)}
                className="mt-4 w-full rounded-xl bg-forest-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-forest-800"
              >
                Повторить
              </button>
              <p className="mt-2 break-words text-[11px] text-red-500">{error}</p>
            </div>
          </div>
        ) : (
          <MapView
            places={places}
            selectedPlace={selected}
            onSelectPlace={setSelected}
            routePlaces={routePlaces}
            pickMode={pickMode}
            onMapPick={handleMapPick}
            onCancelPick={() => setPickMode(null)}
            navigating={navigating}
            startingNavigation={startingNavigation}
            onStartNavigation={startNavigation}
            onStopNavigation={() => setNavigating(false)}
          />
        )}
      </div>

      {/* Desktop sidebar */}
      <aside className="absolute bottom-6 left-6 top-6 z-[1000] hidden w-[22rem] overflow-hidden rounded-3xl bg-stone-50/95 shadow-xl ring-1 ring-stone-200/60 backdrop-blur lg:block">
        {routeSidebar}
      </aside>

      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="absolute right-4 top-4 z-[1000] flex items-center gap-2 rounded-full bg-forest-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg lg:hidden"
      >
        <ListOrdered className="h-4 w-4" />
        Маршрут
        {routePlaces.length > 0 && (
          <span className="rounded-full bg-white/20 px-2 text-xs">{routePlaces.length}</span>
        )}
      </button>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="absolute inset-0 z-[1050] lg:hidden">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[22rem] max-w-[88%] bg-stone-50 shadow-2xl">
            {routeSidebar}
          </div>
        </div>
      )}

      {selected && (
        <PlaceDetail
          place={selected}
          onClose={() => setSelected(null)}
          onAddToRoute={addToRoute}
          inRoute={routeIds.includes(selected.id)}
        />
      )}
    </div>
  );
}