import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppearanceFontStyle } from '../types/appearance';
import { getAppearance, saveAppearance } from './appearance';

export type ShopCategory = 'themes' | 'fonts' | 'effects' | 'special';
export type ShopTab = 'all' | ShopCategory;
export type PackPreviewStyle = 'gradient' | 'solid' | 'font' | 'effect' | 'special';

export type ShopPack = {
  id: string;
  category: ShopCategory;
  name: string;
  price: number;
  description: string;
  preview: string;
  includes: string[];
  previewStyle: PackPreviewStyle;
  highlightColor?: string;
  accentColor?: string;
  previewColors?: string[];
  fontStyle?: AppearanceFontStyle;
  previewLabel?: string;
  sampleText?: string;
};

export type ShopState = {
  purchasedPackIds: string[];
  archivedPackIds: string[];
  activePackIds: Partial<Record<ShopCategory, string>>;
  spentCoins: number;
};

const SHOP_STATE_KEY = 'ziel_shop_state';
const SHOP_BREAK_DATES_KEY = 'ziel_shop_break_dates';
const THEME_SORT_ORDER = [
  'theme_sage',
  'theme_moss_light',
  'theme_dusty_rose',
  'theme_blush',
  'theme_terracotta',
  'theme_clay_rose',
  'theme_teal_mist',
  'theme_sand',
  'theme_vanilla_sand',
  'theme_soft_periwinkle',
  'theme_frost',
  'theme_mist_blue',
  'theme_indigo_glow',
  'theme_slate_blue',
  'theme_oat',
  'theme_mocha',
  'theme_ocean_calm',
  'theme_ocean_steel',
  'theme_harbor_deep',
  'theme_petrol_blue',
  'theme_midnight_indigo',
  'theme_midnight_fade',
  'theme_slate_night',
  'theme_ink_ocean',
] as const;

export const SHOP_CATEGORIES: { id: ShopTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'themes', label: 'Themes' },
  { id: 'fonts', label: 'Fonts' },
  { id: 'effects', label: 'Effects' },
  { id: 'special', label: 'Special' },
];

export const SHOP_PACKS: ShopPack[] = [
  {
    id: 'theme_midnight_fade',
    category: 'themes',
    name: 'Midnight Ink',
    price: 260,
    description: 'A deep navy-black for serious focus.',
    preview: 'Quiet, dark, and minimal.',
    includes: ['Midnight Ink highlight'],
    previewStyle: 'solid',
    highlightColor: '#0F172A',
    previewColors: ['#0F172A'],
  },
  {
    id: 'theme_slate_night',
    category: 'themes',
    name: 'Slate Night',
    price: 260,
    description: 'A calm dark slate for softer night work.',
    preview: 'Muted and premium without looking flat.',
    includes: ['Slate Night highlight'],
    previewStyle: 'solid',
    highlightColor: '#1E293B',
    previewColors: ['#1E293B'],
  },
  {
    id: 'theme_ocean_calm',
    category: 'themes',
    name: 'Ocean Calm',
    price: 280,
    description: 'A cool blue-steel tone with steady focus energy.',
    preview: 'Balanced and composed.',
    includes: ['Ocean Calm highlight'],
    previewStyle: 'solid',
    highlightColor: '#2C5364',
    previewColors: ['#2C5364'],
  },
  {
    id: 'theme_ocean_steel',
    category: 'themes',
    name: 'Ocean Steel',
    price: 280,
    description: 'A slightly brighter steel-blue tone for clean focus.',
    preview: 'Modern and composed.',
    includes: ['Ocean Steel highlight'],
    previewStyle: 'solid',
    highlightColor: '#356173',
    previewColors: ['#356173'],
  },
  {
    id: 'theme_harbor_deep',
    category: 'themes',
    name: 'Harbor Deep',
    price: 280,
    description: 'A deeper muted blue for cinematic calm.',
    preview: 'Dark, still, and focused.',
    includes: ['Harbor Deep highlight'],
    previewStyle: 'solid',
    highlightColor: '#203A43',
    previewColors: ['#203A43'],
  },
  {
    id: 'theme_ink_ocean',
    category: 'themes',
    name: 'Ink Ocean',
    price: 280,
    description: 'A near-black ocean tone for immersive focus.',
    preview: 'Minimal and serious.',
    includes: ['Ink Ocean highlight'],
    previewStyle: 'solid',
    highlightColor: '#0F2027',
    previewColors: ['#0F2027'],
  },
  {
    id: 'theme_slate_blue',
    category: 'themes',
    name: 'Slate Blue',
    price: 260,
    description: 'A gray-blue tone that feels calm, intelligent, and subtle.',
    preview: 'Modern muted blue that stands apart from the defaults.',
    includes: ['Slate Blue highlight'],
    previewStyle: 'solid',
    highlightColor: '#5B6C8F',
    previewColors: ['#5B6C8F'],
  },
  {
    id: 'theme_soft_periwinkle',
    category: 'themes',
    name: 'Soft Periwinkle',
    price: 240,
    description: 'A pale blue-violet with a very light premium feel.',
    preview: 'Soft, airy, and distinctive.',
    includes: ['Soft Periwinkle highlight'],
    previewStyle: 'solid',
    highlightColor: '#C7D2FE',
    previewColors: ['#C7D2FE'],
  },
  {
    id: 'theme_frost',
    category: 'themes',
    name: 'Frost',
    price: 260,
    description: 'Clean, premium, and airy without becoming plain white.',
    preview: 'Soft icy light tone with a richer edge.',
    includes: ['Frost highlight'],
    previewStyle: 'solid',
    highlightColor: '#E8EEF2',
    previewColors: ['#E8EEF2'],
  },
  {
    id: 'theme_mist_blue',
    category: 'themes',
    name: 'Mist Blue',
    price: 240,
    description: 'A cool soft blue-gray that stays very clean.',
    preview: 'Light, controlled, and calm.',
    includes: ['Mist Blue highlight'],
    previewStyle: 'solid',
    highlightColor: '#B6C7D6',
    previewColors: ['#B6C7D6'],
  },
  {
    id: 'theme_mocha',
    category: 'themes',
    name: 'Mocha',
    price: 280,
    description: 'Warm, grounded, and unexpectedly elegant.',
    preview: 'A mature soft-brown highlight that feels calm.',
    includes: ['Mocha highlight'],
    previewStyle: 'solid',
    highlightColor: '#7B5E57',
    previewColors: ['#7B5E57'],
  },
  {
    id: 'theme_oat',
    category: 'themes',
    name: 'Oat',
    price: 240,
    description: 'A warm beige-brown with a softer, lighter tone.',
    preview: 'Natural and understated.',
    includes: ['Oat highlight'],
    previewStyle: 'solid',
    highlightColor: '#D6C1B6',
    previewColors: ['#D6C1B6'],
  },
  {
    id: 'theme_dusty_rose',
    category: 'themes',
    name: 'Dusty Rose',
    price: 280,
    description: 'Soft, personal, and calm without becoming flashy.',
    preview: 'Muted rose tones with a gentle identity.',
    includes: ['Dusty Rose highlight'],
    previewStyle: 'solid',
    highlightColor: '#C08497',
    previewColors: ['#C08497'],
  },
  {
    id: 'theme_blush',
    category: 'themes',
    name: 'Blush',
    price: 240,
    description: 'A soft pastel pink for a lighter calm mood.',
    preview: 'Gentle and airy.',
    includes: ['Blush highlight'],
    previewStyle: 'solid',
    highlightColor: '#FBCFE8',
    previewColors: ['#FBCFE8'],
  },
  {
    id: 'theme_petrol_blue',
    category: 'themes',
    name: 'Petrol Blue',
    price: 300,
    description: 'Deep focus energy with elegant blue-green depth.',
    preview: 'Stable, serious, and quietly premium.',
    includes: ['Petrol Blue highlight'],
    previewStyle: 'solid',
    highlightColor: '#1F3A3D',
    previewColors: ['#1F3A3D'],
  },
  {
    id: 'theme_teal_mist',
    category: 'themes',
    name: 'Teal Mist',
    price: 250,
    description: 'A lighter teal tone with a cleaner modern look.',
    preview: 'Fresh without being bright.',
    includes: ['Teal Mist highlight'],
    previewStyle: 'solid',
    highlightColor: '#7DD3C7',
    previewColors: ['#7DD3C7'],
  },
  {
    id: 'theme_sand',
    category: 'themes',
    name: 'Sand',
    price: 260,
    description: 'Warm and natural with a relaxed minimalist feel.',
    preview: 'Neutral warm tones for lighter planning moods.',
    includes: ['Sand highlight'],
    previewStyle: 'solid',
    highlightColor: '#D6C6A8',
    previewColors: ['#D6C6A8'],
  },
  {
    id: 'theme_vanilla_sand',
    category: 'themes',
    name: 'Vanilla Sand',
    price: 240,
    description: 'A very light warm neutral for a softer minimal screen.',
    preview: 'Clean and natural.',
    includes: ['Vanilla Sand highlight'],
    previewStyle: 'solid',
    highlightColor: '#F5E9D4',
    previewColors: ['#F5E9D4'],
  },
  {
    id: 'theme_midnight_indigo',
    category: 'themes',
    name: 'Midnight Indigo',
    price: 320,
    description: 'Deep, serious, and immersive for night work.',
    preview: 'Almost-black indigo with a focused accent edge.',
    includes: ['Midnight Indigo highlight'],
    previewStyle: 'solid',
    highlightColor: '#1A1F36',
    previewColors: ['#1A1F36'],
  },
  {
    id: 'theme_indigo_glow',
    category: 'themes',
    name: 'Indigo Glow',
    price: 250,
    description: 'A brighter cool indigo for a softer futuristic tone.',
    preview: 'Clean and luminous.',
    includes: ['Indigo Glow highlight'],
    previewStyle: 'solid',
    highlightColor: '#A5B4FC',
    previewColors: ['#A5B4FC'],
  },
  {
    id: 'theme_sage',
    category: 'themes',
    name: 'Sage',
    price: 280,
    description: 'Muted green for calm, balance, and clarity.',
    preview: 'A softer green that feels rare and grounded.',
    includes: ['Sage highlight'],
    previewStyle: 'solid',
    highlightColor: '#9CAF88',
    previewColors: ['#9CAF88'],
  },
  {
    id: 'theme_moss_light',
    category: 'themes',
    name: 'Moss Light',
    price: 240,
    description: 'A pale herbal green for a softer quiet mode.',
    preview: 'Relaxed and airy.',
    includes: ['Moss Light highlight'],
    previewStyle: 'solid',
    highlightColor: '#E6F0DC',
    previewColors: ['#E6F0DC'],
  },
  {
    id: 'theme_terracotta',
    category: 'themes',
    name: 'Terracotta',
    price: 290,
    description: 'Earthy, warm, and subtly energetic.',
    preview: 'Soft orange-brown with a calm grounded feel.',
    includes: ['Terracotta highlight'],
    previewStyle: 'solid',
    highlightColor: '#C97B63',
    previewColors: ['#C97B63'],
  },
  {
    id: 'theme_clay_rose',
    category: 'themes',
    name: 'Clay Rose',
    price: 240,
    description: 'A lighter terracotta-rose tone for a softer warm UI.',
    preview: 'Warm and quiet.',
    includes: ['Clay Rose highlight'],
    previewStyle: 'solid',
    highlightColor: '#F2C4B2',
    previewColors: ['#F2C4B2'],
  },
  {
    id: 'font_jetbrains_mono',
    category: 'fonts',
    name: 'JetBrains Mono',
    price: 240,
    description: 'A clean developer and terminal-inspired font feel.',
    preview: 'Sharp coding energy without losing clarity.',
    includes: ['JetBrains Mono style'],
    previewStyle: 'font',
    fontStyle: 'jetbrainsMono',
    sampleText: 'Code with calm',
  },
  {
    id: 'font_playfair_display',
    category: 'fonts',
    name: 'Playfair Display',
    price: 260,
    description: 'Elegant high-contrast serif luxury vibes.',
    preview: 'Refined and dramatic for premium headings.',
    includes: ['Playfair Display style'],
    previewStyle: 'font',
    fontStyle: 'playfairDisplay',
    sampleText: 'Elegant focus',
  },
  {
    id: 'font_merriweather',
    category: 'fonts',
    name: 'Merriweather',
    price: 240,
    description: 'Readable editorial serif with a classic tone.',
    preview: 'Comfortable reading with a timeless voice.',
    includes: ['Merriweather style'],
    previewStyle: 'font',
    fontStyle: 'merriweather',
    sampleText: 'Calm reading',
  },
  {
    id: 'font_cinzel',
    category: 'fonts',
    name: 'Cinzel',
    price: 280,
    description: 'Roman inscription drama with a bold ceremonial feel.',
    preview: 'Strong title energy with a classical edge.',
    includes: ['Cinzel style'],
    previewStyle: 'font',
    fontStyle: 'cinzel',
    sampleText: 'Built to rise',
  },
  {
    id: 'font_bebas_neue',
    category: 'fonts',
    name: 'Bebas Neue',
    price: 260,
    description: 'Tall, condensed, and bold for strong interface impact.',
    preview: 'A louder heading style with clean structure.',
    includes: ['Bebas Neue style'],
    previewStyle: 'font',
    fontStyle: 'bebasNeue',
    sampleText: 'MOVE FORWARD',
  },
  {
    id: 'font_sora',
    category: 'fonts',
    name: 'Sora',
    price: 250,
    description: 'Futuristic, geometric, and clean.',
    preview: 'Modern tech feel with a softer shape language.',
    includes: ['Sora style'],
    previewStyle: 'font',
    fontStyle: 'sora',
    sampleText: 'Future focus',
  },
  {
    id: 'font_space_mono',
    category: 'fonts',
    name: 'Space Mono',
    price: 240,
    description: 'Spaced-out coding aesthetic with more personality.',
    preview: 'Monospace but more stylized and expressive.',
    includes: ['Space Mono style'],
    previewStyle: 'font',
    fontStyle: 'spaceMono',
    sampleText: 'Orbit and build',
  },
  {
    id: 'font_cormorant_garamond',
    category: 'fonts',
    name: 'Cormorant Garamond',
    price: 270,
    description: 'Soft artistic serif elegance with a lighter hand.',
    preview: 'A gentler literary tone for reflective screens.',
    includes: ['Cormorant Garamond style'],
    previewStyle: 'font',
    fontStyle: 'cormorantGaramond',
    sampleText: 'Quiet intention',
  },
  {
    id: 'effect_confetti_burst',
    category: 'effects',
    name: 'Confetti Burst',
    price: 280,
    description: 'A celebratory burst when a task is completed.',
    preview: 'Bright completion energy.',
    includes: ['Confetti finish animation'],
    previewStyle: 'effect',
    previewLabel: 'Burst',
  },
  {
    id: 'effect_ripple_finish',
    category: 'effects',
    name: 'Ripple Finish',
    price: 320,
    description: 'A calmer ring ripple that expands softly on completion.',
    preview: 'Minimal motion for a quieter finish.',
    includes: ['Ripple completion animation'],
    previewStyle: 'effect',
    previewLabel: 'Ripple',
  },
  {
    id: 'effect_star_trail',
    category: 'effects',
    name: 'Star Trail',
    price: 360,
    description: 'A star-like trail effect for rewards and finishes.',
    preview: 'A more magical reward feel.',
    includes: ['Star trail completion animation'],
    previewStyle: 'effect',
    previewLabel: 'Stars',
  },
  {
    id: 'effect_orbit_pulse',
    category: 'effects',
    name: 'Orbit Pulse',
    price: 340,
    description: 'Small orbiting pulses for a cleaner futuristic finish.',
    preview: 'Looping orbital motion around the reward point.',
    includes: ['Orbit pulse animation'],
    previewStyle: 'effect',
    previewLabel: 'Orbit',
  },
  {
    id: 'effect_flash_bloom',
    category: 'effects',
    name: 'Flash Bloom',
    price: 360,
    description: 'A quick bloom flash that feels energetic but clean.',
    preview: 'Soft burst bloom with strong feedback.',
    includes: ['Bloom flash animation'],
    previewStyle: 'effect',
    previewLabel: 'Bloom',
  },
  {
    id: 'effect_spark_rain',
    category: 'effects',
    name: 'Spark Rain',
    price: 380,
    description: 'Tiny falling sparks for a rewarding finish.',
    preview: 'A softer celebratory spark shower.',
    includes: ['Spark rain animation'],
    previewStyle: 'effect',
    previewLabel: 'Rain',
  },
  {
    id: 'effect_echo_wave',
    category: 'effects',
    name: 'Echo Wave',
    price: 340,
    description: 'Layered soft rings that echo outward on completion.',
    preview: 'A calmer multi-wave finish.',
    includes: ['Echo wave animation'],
    previewStyle: 'effect',
    previewLabel: 'Echo',
  },
  {
    id: 'effect_comet_arc',
    category: 'effects',
    name: 'Comet Arc',
    price: 360,
    description: 'Small light points sweep upward in a curved arc.',
    preview: 'A quick upward motion with a reward feel.',
    includes: ['Comet arc animation'],
    previewStyle: 'effect',
    previewLabel: 'Comet',
  },
  {
    id: 'effect_diamond_pop',
    category: 'effects',
    name: 'Diamond Pop',
    price: 350,
    description: 'Sharp diamond particles burst outward for a cleaner pop.',
    preview: 'A crisp geometric finish.',
    includes: ['Diamond pop animation'],
    previewStyle: 'effect',
    previewLabel: 'Diamond',
  },
  {
    id: 'effect_halo_drift',
    category: 'effects',
    name: 'Halo Drift',
    price: 370,
    description: 'Soft halos drift upward for a lighter premium finish.',
    preview: 'Gentle floating rings.',
    includes: ['Halo drift animation'],
    previewStyle: 'effect',
    previewLabel: 'Halo',
  },
  {
    id: 'special_streak_shield',
    category: 'special',
    name: 'Streak Shield',
    price: 650,
    description: 'Protect today and keep the streak alive once when needed.',
    preview: 'Protect a rough day.',
    includes: ['Protect today once'],
    previewStyle: 'special',
    previewLabel: 'Protect today',
  },
  {
    id: 'special_second_chance',
    category: 'special',
    name: 'Second Chance',
    price: 500,
    description: 'Restore one missed task from yesterday into today.',
    preview: 'Bring back one missed task.',
    includes: ['Restore one missed task'],
    previewStyle: 'special',
    previewLabel: 'Restore task',
  },
  {
    id: 'special_focus_boost',
    category: 'special',
    name: 'Focus Boost',
    price: 700,
    description: 'Enable a 1.5x coin multiplier on task rewards while active.',
    preview: 'Boost today’s rewards.',
    includes: ['1.5x reward multiplier'],
    previewStyle: 'special',
    previewLabel: '1.5x rewards',
  },
  {
    id: 'special_time_extension',
    category: 'special',
    name: 'Time Extension',
    price: 800,
    description: 'Shift every active deadline forward by 3 days.',
    preview: 'Buy a little breathing room.',
    includes: ['Add 3 days to deadlines'],
    previewStyle: 'special',
    previewLabel: '+3 days',
  },
  {
    id: 'special_break_1d',
    category: 'special',
    name: '1 Day Break',
    price: 500,
    description: 'Mark today as fully complete and take a short real break.',
    preview: 'One day fully covered.',
    includes: ['1 day automatic completion'],
    previewStyle: 'special',
    previewLabel: '1 day break',
  },
  {
    id: 'special_break_3d',
    category: 'special',
    name: '3 Day Break',
    price: 1200,
    description: 'Cover the next 3 days as fully complete in your progress view.',
    preview: 'Three days fully covered.',
    includes: ['3 day automatic completion'],
    previewStyle: 'special',
    previewLabel: '3 day break',
  },
  {
    id: 'special_break_7d',
    category: 'special',
    name: '1 Week Break',
    price: 2000,
    description: 'Cover the next 7 days as fully complete in your progress view.',
    preview: 'One week fully covered.',
    includes: ['7 day automatic completion'],
    previewStyle: 'special',
    previewLabel: '1 week break',
  },
  {
    id: 'special_break_30d',
    category: 'special',
    name: '1 Month Break',
    price: 7000,
    description: 'Cover the next 30 days as fully complete in your progress view.',
    preview: 'A full month fully covered.',
    includes: ['30 day automatic completion'],
    previewStyle: 'special',
    previewLabel: '1 month break',
  },
];

function sortShopPacks(packs: ShopPack[]) {
  const themeOrder = new Map<string, number>(THEME_SORT_ORDER.map((id, index) => [id, index]));
  return [...packs].sort((a, b) => {
    if (a.category === 'themes' && b.category === 'themes') {
      return (themeOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (themeOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER);
    }
    return 0;
  });
}

const DEFAULT_SHOP_STATE: ShopState = {
  purchasedPackIds: [],
  archivedPackIds: [],
  activePackIds: {},
  spentCoins: 0,
};

export async function getShopState(): Promise<ShopState> {
  try {
    const raw = await AsyncStorage.getItem(SHOP_STATE_KEY);
    if (!raw) return DEFAULT_SHOP_STATE;
    const parsed = JSON.parse(raw) as Partial<ShopState>;
    return {
      ...DEFAULT_SHOP_STATE,
      ...parsed,
      purchasedPackIds: Array.isArray(parsed?.purchasedPackIds) ? parsed.purchasedPackIds : [],
      archivedPackIds: Array.isArray(parsed?.archivedPackIds) ? parsed.archivedPackIds : [],
      activePackIds: parsed?.activePackIds || {},
      spentCoins: Number(parsed?.spentCoins) || 0,
    };
  } catch (error) {
    console.log('[shop] Failed to load state:', (error as Error).message);
    return DEFAULT_SHOP_STATE;
  }
}

export async function saveShopState(state: ShopState) {
  await AsyncStorage.setItem(SHOP_STATE_KEY, JSON.stringify(state));
}

export async function getBreakDates(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SHOP_BREAK_DATES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch (error) {
    console.log('[shop] Failed to load break dates:', (error as Error).message);
    return [];
  }
}

export async function saveBreakDates(dates: string[]) {
  await AsyncStorage.setItem(SHOP_BREAK_DATES_KEY, JSON.stringify(Array.from(new Set(dates)).sort()));
}

export function getBreakPackDays(packId: string) {
  if (packId === 'special_break_1d') return 1;
  if (packId === 'special_break_3d') return 3;
  if (packId === 'special_break_7d') return 7;
  if (packId === 'special_break_30d') return 30;
  return 0;
}

export async function applyBreakPack(packId: string, startDateKey: string) {
  const days = getBreakPackDays(packId);
  if (!days) return getBreakDates();

  const start = new Date(`${startDateKey}T00:00:00`);
  const nextDates = Array.from({ length: days }).map((_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    return date.toISOString().slice(0, 10);
  });

  const current = await getBreakDates();
  const merged = Array.from(new Set([...current, ...nextDates])).sort();
  await saveBreakDates(merged);
  return merged;
}

export function isBreakDate(dateKey: string, breakDates: string[] | Set<string>) {
  if (Array.isArray(breakDates)) {
    return breakDates.includes(dateKey);
  }
  return breakDates.has(dateKey);
}

export function getShopPackById(packId: string) {
  return SHOP_PACKS.find((pack) => pack.id === packId) || null;
}

export function getPacksForCategory(category: ShopCategory) {
  return sortShopPacks(SHOP_PACKS.filter((pack) => pack.category === category));
}

export function getAvailableCoins(totalCoinsCollected: number, shopState: ShopState) {
  return Math.max(0, totalCoinsCollected - (Number(shopState.spentCoins) || 0));
}

export function getPurchasedPacks(shopState: ShopState) {
  return sortShopPacks(SHOP_PACKS.filter((pack) => shopState.purchasedPackIds.includes(pack.id)));
}

export function getPurchasedPacksByCategory(shopState: ShopState, category: ShopCategory) {
  return getPurchasedPacks(shopState).filter((pack) => pack.category === category);
}

export function getUnlockedThemePacks(shopState: ShopState) {
  return getPurchasedPacksByCategory(shopState, 'themes').filter((pack) => pack.highlightColor);
}

export function getUnlockedFontPacks(shopState: ShopState) {
  return getPurchasedPacksByCategory(shopState, 'fonts').filter((pack) => pack.fontStyle);
}

export function getUnlockedEffectPacks(shopState: ShopState) {
  return getPurchasedPacksByCategory(shopState, 'effects');
}

export function getUnlockedSpecialPacks(shopState: ShopState) {
  return getPurchasedPacksByCategory(shopState, 'special');
}

export function getActiveEffectPack(shopState: ShopState | null) {
  const activeId = shopState?.activePackIds.effects;
  return activeId ? getShopPackById(activeId) : null;
}

export function getActiveSpecialPack(shopState: ShopState | null) {
  const activeId = shopState?.activePackIds.special;
  return activeId ? getShopPackById(activeId) : null;
}

export function getCoinMultiplier(shopState: ShopState | null) {
  return shopState?.activePackIds.special === 'special_focus_boost' ? 1.5 : 1;
}

export async function purchasePack(packId: string) {
  const pack = getShopPackById(packId);
  if (!pack) throw new Error('Pack not found.');

  const current = await getShopState();
  if (current.purchasedPackIds.includes(packId)) {
    return current;
  }

  const next: ShopState = {
    ...current,
    purchasedPackIds: [...current.purchasedPackIds, packId],
    archivedPackIds: [...current.archivedPackIds, packId],
    spentCoins: current.spentCoins + pack.price,
  };
  await saveShopState(next);
  return next;
}

export async function archivePurchasedPack(packId: string) {
  const current = await getShopState();
  if (current.archivedPackIds.includes(packId)) return current;
  const next: ShopState = {
    ...current,
    archivedPackIds: [...current.archivedPackIds, packId],
  };
  await saveShopState(next);
  return next;
}

export async function activatePack(packId: string) {
  const pack = getShopPackById(packId);
  if (!pack) throw new Error('Pack not found.');

  const current = await getShopState();
  const next: ShopState = {
    ...current,
    activePackIds: {
      ...current.activePackIds,
      [pack.category]: pack.id,
    },
    archivedPackIds: current.archivedPackIds.filter((id) => id !== packId),
  };

  if (pack.category === 'themes' || pack.category === 'fonts') {
    const appearance = await getAppearance();
    const nextAppearance = { ...appearance };
    if (pack.highlightColor) nextAppearance.highlightColor = pack.highlightColor;
    if (pack.fontStyle) nextAppearance.fontStyle = pack.fontStyle;
    await saveAppearance(nextAppearance);
  }

  await saveShopState(next);
  return next;
}

export async function deactivateCategory(category: ShopCategory) {
  const current = await getShopState();
  const nextActive = { ...current.activePackIds };
  delete nextActive[category];
  const next: ShopState = {
    ...current,
    activePackIds: nextActive,
  };
  await saveShopState(next);
  return next;
}
