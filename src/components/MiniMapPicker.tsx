import { useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Crosshair } from 'lucide-react';
import { CARTO_TILE_URL, CARTO_ATTRIBUTION } from '@/lib/mapTiles';

const pin = L.divIcon({
  className: '',
  html: `<div class="route-pin bg-forest-600 text-white shadow-md"></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

interface MiniMapPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

function ClickSetter({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MiniMapPicker({ lat, lng, onChange }: MiniMapPickerProps) {
  const [center] = useState<[number, number]>([50.0875, 14.4214]);

  return (
    <div className="relative h-56 w-full overflow-hidden rounded-xl border border-stone-200">
      <MapContainer
        center={center}
        zoom={13}
        className="h-full w-full"
        zoomControl={false}
      >
        <TileLayer
          attribution={CARTO_ATTRIBUTION}
          url={CARTO_TILE_URL}
          subdomains={['a', 'b', 'c', 'd']}
          maxZoom={20}
        />
        <ClickSetter onChange={onChange} />
        {lat !== null && lng !== null && <Marker position={[lat, lng]} icon={pin} />}
      </MapContainer>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] flex items-center justify-center bg-gradient-to-t from-black/50 to-transparent pb-2 pt-6">
        <span className="flex items-center gap-1.5 text-xs font-medium text-white">
          <Crosshair className="h-3.5 w-3.5" />
          Tap the map to drop your pin
        </span>
      </div>
    </div>
  );
}
