import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { DEFAULT_APPEARANCE, getAppearance, saveAppearance } from '../services/appearance';
import { AppearanceAsset, AppearanceFontStyle, AppearanceSettings, AppearanceTextSize } from '../types/appearance';
import { COLORS } from '../constants/theme';

export type ColorScheme = {
  background: string;
  card: string;
  text: string;
  textSecondary: string;
  lightGrey: string;
  mediumGrey: string;
  white: string;
  black: string;
  border: string;
};

type AppearanceContextValue = {
  appearance: AppearanceSettings;
  colors: ColorScheme;
  isDark: boolean;
  globalFont: string;
  globalFontSize: number;
  setHighlightColor: (color: string) => void;
  setFontStyle: (style: AppearanceFontStyle) => void;
  setTextSize: (size: AppearanceTextSize) => void;
  setDarkMode: (enabled: boolean) => void;
  setSkin: (skin: AppearanceSettings['skin']) => void;
  setDefaultIcon: (asset: AppearanceAsset | undefined) => void;
  addAsset: (asset: AppearanceAsset) => Promise<void>;
};

const getColorScheme = (darkMode: boolean): ColorScheme => {
  if (darkMode) {
    return {
      background: '#000000',
      card: '#1A1A1A',
      text: '#FFFFFF',
      textSecondary: '#AAAAAA',
      lightGrey: '#2A2A2A',
      mediumGrey: '#666666',
      white: '#FFFFFF',
      black: '#FFFFFF', // Inverted: white borders/text on dark
      border: '#FFFFFF',
    };
  }
  return {
    background: COLORS.background,
    card: COLORS.white,
    text: COLORS.text,
    textSecondary: COLORS.textSecondary,
    lightGrey: COLORS.lightGrey,
    mediumGrey: COLORS.mediumGrey,
    white: COLORS.white,
    black: COLORS.black,
    border: COLORS.black,
  };
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

const fontFamilyForStyle = (style: AppearanceFontStyle) => {
  if (style === 'coder') return Platform.OS === 'ios' ? 'Courier New' : 'monospace';
  if (style === 'journal') return Platform.OS === 'ios' ? 'Times New Roman' : 'serif';
  if (style === 'jetbrainsMono' || style === 'spaceMono') {
    return Platform.OS === 'ios' ? 'Courier New' : 'monospace';
  }
  if (style === 'playfairDisplay' || style === 'cormorantGaramond') {
    return Platform.OS === 'ios' ? 'Georgia' : 'serif';
  }
  if (style === 'merriweather') {
    return Platform.OS === 'ios' ? 'Times New Roman' : 'serif';
  }
  if (style === 'cinzel') {
    return Platform.OS === 'ios' ? 'Palatino' : 'serif';
  }
  if (style === 'bebasNeue') {
    return Platform.OS === 'ios' ? 'Impact' : 'sans-serif-condensed';
  }
  if (style === 'sora') {
    return Platform.OS === 'ios' ? 'Avenir Next' : 'sans-serif-medium';
  }
  return 'System'; // Default sans-serif
};

const getScaleForSize = (size: AppearanceTextSize) => {
    switch (size) {
        case 'small': return 14;
        case 'large': return 18;
        case 'medium':
        default: return 16;
    }
};

export const AppearanceProvider = ({ children }: { children: React.ReactNode }) => {
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);

  useEffect(() => {
    const load = async () => {
      const data = await getAppearance();
      // If dark mode is enabled but highlight color is still black (default), set it to white
      if (data.darkMode && data.highlightColor === '#000000') {
        const updated = { ...data, highlightColor: '#FFFFFF' };
        await saveAppearance(updated);
        setAppearance(updated);
      } else {
        setAppearance(data);
      }
    };
    load();
  }, []);

  // Compute global font/size values for consumers to use via the context
  const globalFont = useMemo(() => fontFamilyForStyle(appearance.fontStyle), [appearance.fontStyle]);
  const globalFontSize = useMemo(() => getScaleForSize(appearance.textSize || 'medium'), [appearance.textSize]);

  const updateAppearance = useCallback((updates: Partial<AppearanceSettings>) => {
    setAppearance((prev) => {
      const next = { ...prev, ...updates };
      saveAppearance(next);
      return next;
    });
  }, []);

  const addAsset = useCallback(async (asset: AppearanceAsset) => {
    setAppearance((prev) => {
      const next = { ...prev, assets: [asset, ...prev.assets.filter((i) => i.id !== asset.id)] };
      saveAppearance(next);
      return next;
    });
  }, []);

  const setDarkMode = useCallback((enabled: boolean) => {
    setAppearance((prev) => {
      // Only change highlight color if it's the default color for the current mode
      // Preserve custom colors when toggling dark mode
      let newHighlightColor = prev.highlightColor;
      
      if (enabled) {
        // When enabling dark mode, only change to white if current color is black (default for light mode)
        if (prev.highlightColor === '#000000') {
          newHighlightColor = '#FFFFFF';
        }
      } else {
        // When disabling dark mode, only change to black if current color is white (default for dark mode)
        if (prev.highlightColor === '#FFFFFF') {
          newHighlightColor = '#000000';
        }
      }
      
      const next = { ...prev, darkMode: enabled, highlightColor: newHighlightColor };
      saveAppearance(next);
      return next;
    });
  }, []);

  const colors = useMemo(() => getColorScheme(appearance.darkMode), [appearance.darkMode]);

  const value = useMemo(
    () => ({
      appearance,
      colors,
      isDark: appearance.darkMode,
      globalFont,
      globalFontSize,
      setHighlightColor: (color: string) => updateAppearance({ highlightColor: color }),
      setFontStyle: (style: AppearanceFontStyle) => updateAppearance({ fontStyle: style }),
      setTextSize: (size: AppearanceTextSize) => updateAppearance({ textSize: size }),
      setDarkMode,
      setSkin: (skin: AppearanceSettings['skin']) => updateAppearance({ skin }),
      setDefaultIcon: (asset: AppearanceAsset | undefined) =>
        updateAppearance({ defaultIcon: asset }),
      addAsset,
    }),
    [appearance, colors, globalFont, globalFontSize, updateAppearance, addAsset, setDarkMode]
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
};

export const useAppearance = () => {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used within AppearanceProvider');
  return ctx;
};
