import { X, MapPin, Camera, Navigation } from 'lucide-react';
import { categoryConfig } from '@/lib/categories';
import type { Place } from '@/lib/types';

interface PlaceDetailProps {
  place: Place;
  onClose: () => void;
  onAddToRoute: (place: Place) => void;
  inRoute: boolean;
}

export default function PlaceDetail({ place, onClose, onAddToRoute, inRoute }: PlaceDetailProps) {
  const cfg = categoryConfig(place.category);
  const Icon = place.is_user_submitted ? Camera : cfg.icon;

  return (
    <div className="absolute inset-0 z-[1100] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="relative h-56 w-full bg-stone-100">
          {place.image_url ? (
            <img
              src={place.image_url}
              alt={place.title}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-forest-50">
              <Icon className="h-14 w-14 text-forest-300" />
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-stone-700 shadow-md transition hover:bg-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[45vh] overflow-y-auto px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cfg.badge}`}>
              <Icon className="h-3.5 w-3.5" />
              {cfg.label}
            </span>
            {place.is_user_submitted && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-forest-100 px-3 py-1 text-xs font-semibold text-forest-800">
                <Camera className="h-3.5 w-3.5" />
                От сообщества
              </span>
            )}
          </div>

          <h2 className="mt-3 text-2xl font-bold text-stone-900">{place.title}</h2>

          <p className="mt-3 leading-relaxed text-stone-600">{place.description}</p>

          {place.address && (
            <div className="mt-4 flex items-start gap-2 text-sm text-stone-500">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-forest-600" />
              <span>{place.address}</span>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 text-sm text-stone-500">
            <MapPin className="h-4 w-4 text-forest-600" />
            <span>
              {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
            </span>
          </div>

          {place.source === 'osm' && (
            <p className="mt-3 text-xs text-stone-400">
              Данные: OpenStreetMap contributors (ODbL)
            </p>
          )}
        </div>

        <div className="border-t border-stone-100 px-6 py-4">
          <button
            onClick={() => onAddToRoute(place)}
            disabled={inRoute}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
              inRoute
                ? 'cursor-default bg-forest-50 text-forest-600'
                : 'bg-forest-700 text-white hover:bg-forest-800'
            }`}
          >
            <Navigation className="h-4 w-4" />
            {inRoute ? 'Уже в маршруте' : 'Добавить в маршрут'}
          </button>
        </div>
      </div>
    </div>
  );
}
