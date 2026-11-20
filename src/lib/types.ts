import type { Category } from './categories';

export interface Place {
  id: string;
  title: string;
  description: string;
  category: Category | string;
  lat: number;
  lng: number;
  image_url: string | null;
  is_user_submitted: boolean;
  created_at: string;
  /** Present for places imported from OpenStreetMap. */
  osm_id?: string | null;
  address?: string | null;
  source?: 'osm' | 'manual' | null;
  wikipedia?: string | null;
  wikidata?: string | null;
}

export interface RouteStop {
  place: Place;
  /** 'A' or 'B' endpoints, or intermediate waypoint index */
  role: 'A' | 'B' | 'waypoint';
}
