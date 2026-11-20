import L from 'leaflet';
import { useMemo } from 'react';
import { Marker } from 'react-leaflet';
import { categoryConfig } from '@/lib/categories';
import { categoryGlyph } from '@/lib/markerIcons';
import type { Place } from '@/lib/types';

/** Small map-style pin: coloured circle with a category glyph. */
function pinHtml(bgClass: string, glyph: string, size: number): string {
  return `
    <div class="route-pin ${bgClass} text-white shadow" style="width:${size}px;height:${size}px;">
      ${glyph}
    </div>`;
}

export function endpointIcon(letter: 'A' | 'B'): L.DivIcon {
  const size = 22;
  return L.divIcon({
    className: '',
    html: `<div class="endpoint-pin bg-forest-700 text-white shadow" style="width:${size}px;height:${size}px;">${letter}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function PlaceMarker({
  place,
  selected,
  onSelect,
}: {
  place: Place;
  selected: boolean;
  onSelect: (place: Place) => void;
}) {
  const icon = useMemo(() => {
    if (place.is_user_submitted) {
      const size = 18;
      return L.divIcon({
        className: '',
        html: `<div class="route-pin bg-forest-600 text-white shadow" style="width:${size}px;height:${size}px;border-radius:6px 6px 6px 2px;">
          ${categoryGlyph('camera', 10)}
        </div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
    }
    const cfg = categoryConfig(place.category);
    const size = 18;
    return L.divIcon({
      className: '',
      html: pinHtml(cfg.pin, categoryGlyph(place.category, 10), size),
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }, [place.category, place.is_user_submitted]);

  return (
    <Marker
      position={[place.lat, place.lng]}
      icon={selected ? selectedIcon(place) : icon}
      eventHandlers={{ click: () => onSelect(place) }}
    />
  );
}

function selectedIcon(place: Place): L.DivIcon {
  const size = 22;
  const glyph = categoryGlyph(place.is_user_submitted ? 'camera' : place.category, 12);
  return L.divIcon({
    className: '',
    html: `<div class="route-pin ring-2 ring-forest-700 ring-offset-1 ${
      place.is_user_submitted ? 'bg-forest-600' : categoryConfig(place.category).pin
    } text-white shadow-lg" style="width:${size}px;height:${size}px;${
      place.is_user_submitted ? 'border-radius:6px 6px 6px 2px;' : ''
    }">${glyph}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}