import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppearanceAsset, AppearanceSettings } from '../types/appearance';

const STORAGE_KEY = 'ziel_appearance';

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  skin: 'noir',
  highlightColor: '#000000',
  fontStyle: 'modern',
  textSize: 'large',
  darkMode: false,
  assets: [],
};

export const getAppearance = async (): Promise<AppearanceSettings> => {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    if (!value) return DEFAULT_APPEARANCE;
    return { ...DEFAULT_APPEARANCE, ...JSON.parse(value) };
  } catch (error) {
    console.error('Failed to load appearance', error);
    return DEFAULT_APPEARANCE;
  }
};

export const saveAppearance = async (settings: AppearanceSettings) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save appearance', error);
  }
};

export const addAppearanceAsset = async (
  settings: AppearanceSettings,
  asset: AppearanceAsset
) => {
  const next = {
    ...settings,
    assets: [asset, ...settings.assets.filter((item) => item.id !== asset.id)],
  };
  await saveAppearance(next);
  return next;
};
