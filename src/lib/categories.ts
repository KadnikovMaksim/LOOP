import type { LucideIcon } from 'lucide-react';
import { Landmark, Mountain, Coffee, Gem, Camera, Trees } from 'lucide-react';

export type Category = 'monument' | 'scenic' | 'cafe' | 'hidden_gem' | 'park' | 'museum';

export interface CategoryConfig {
  label: string;
  icon: LucideIcon;
  /** tailwind classes for badges */
  badge: string;
  /** tailwind background for map pin */
  pin: string;
}

export const CATEGORIES: Record<Category, CategoryConfig> = {
  monument: {
    label: 'Памятник',
    icon: Landmark,
    badge: 'bg-amber-100 text-amber-900',
    pin: 'bg-amber-500',
  },
  scenic: {
    label: 'Смотровая',
    icon: Mountain,
    badge: 'bg-sky-100 text-sky-900',
    pin: 'bg-sky-500',
  },
  cafe: {
    label: 'Кафе',
    icon: Coffee,
    badge: 'bg-rose-100 text-rose-900',
    pin: 'bg-rose-500',
  },
  hidden_gem: {
    label: 'Скрытое место',
    icon: Gem,
    badge: 'bg-emerald-100 text-emerald-900',
    pin: 'bg-emerald-500',
  },
  museum: {
    label: 'Музей',
    icon: Landmark,
    badge: 'bg-indigo-100 text-indigo-900',
    pin: 'bg-indigo-500',
  },
  park: {
    label: 'Парк',
    icon: Trees,
    badge: 'bg-green-100 text-green-900',
    pin: 'bg-green-600',
  },
};

export const USER_SUBMITTED_ICON = Camera;

export const CATEGORY_LIST: Category[] = ['monument', 'museum', 'park', 'scenic', 'cafe', 'hidden_gem'];

export function categoryConfig(category: string): CategoryConfig {
  return CATEGORIES[category as Category] ?? CATEGORIES.hidden_gem;
}
