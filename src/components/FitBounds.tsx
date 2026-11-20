import L from 'leaflet';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Fits the map bounds to the given points whenever they change.
 * Pass null to skip.
 */
export function FitBounds({ points }: { points: [number, number][] | null }) {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 15);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16 });
  }, [map, points]);

  return null;
}
