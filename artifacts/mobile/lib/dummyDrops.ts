/**
 * Dummy drops — shown when the live feed is empty so the design is always
 * visible. Stored here so both the feed screen and the detail screen can
 * share the same objects without duplicating data.
 */
import type { Drop } from '@/contexts/AppContext';

const DUMMY_CHEF_1 = {
  id: 'dummy-chef',
  name: 'Chef Marcus Baird',
  handle: '@marcusbaird',
  rating: 4.9,
  totalDrops: 24,
  successfulDrops: 23,
  isVerified: true,
  cuisine: 'Creole',
  region: 'Port of Spain',
  points: 3840,
  rank: 1,
};

const DUMMY_CHEF_2 = {
  id: 'dummy-chef-2',
  name: 'Chef Anika Charles',
  handle: '@anikacharles',
  rating: 4.8,
  totalDrops: 18,
  successfulDrops: 17,
  isVerified: true,
  cuisine: 'Caribbean',
  region: 'San Fernando',
  points: 2910,
  rank: 2,
};

export const DUMMY_DROP_HERO: Drop = {
  id: 'dummy-hero',
  title: 'Seared Duck Breast with Mango Chutney',
  description:
    'Pan-seared duck with crispy skin, warm mango & scotch bonnet chutney, ' +
    'served over pea purée and roasted yam. A Friday Food Club signature — ' +
    'every plate made to order, no shortcuts.',
  chef: DUMMY_CHEF_1,
  price: 110,
  inventory: 12,
  minOrders: 6,
  currentOrders: 8,
  remaining: 4,
  expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
  cuisine: 'Creole',
  mealSlot: 'Dinner',
  imageIndex: 1,
  imageUrl: null,
  tags: ['Signature', 'Seasonal'],
  status: 'ACTIVE',
  soldOut: false,
  pickupLocation: 'The Alley, Ariapita Avenue, Woodbrook',
};

export const DUMMY_DROP_CARD: Drop = {
  id: 'dummy-card',
  title: 'Jerk Chicken & Festival with Pepper Sauce',
  description:
    'Slow-marinated overnight jerk chicken, golden fried festival dumplings, ' +
    'and Anika\'s legendary roasted pepper sauce. Pure Caribbean comfort food ' +
    'done at a level you won\'t find anywhere else.',
  chef: DUMMY_CHEF_2,
  price: 85,
  inventory: 10,
  minOrders: 5,
  currentOrders: 3,
  remaining: 7,
  expiresAt: new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString(),
  cuisine: 'Caribbean',
  mealSlot: 'Lunch',
  imageIndex: 2,
  imageUrl: null,
  tags: ['Fan Favourite'],
  status: 'ACTIVE',
  soldOut: false,
  pickupLocation: 'San Fernando Craft Market, Library Corner',
};

/** Keyed by drop ID for fast lookup in the detail screen. */
export const DUMMY_DROPS: Record<string, Drop> = {
  [DUMMY_DROP_HERO.id]: DUMMY_DROP_HERO,
  [DUMMY_DROP_CARD.id]: DUMMY_DROP_CARD,
};
