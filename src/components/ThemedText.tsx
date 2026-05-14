import React, { useMemo } from 'react';
import { Text as RNText, TextProps, StyleSheet, Platform } from 'react-native';
import { useAppearance } from '../context/appearance';
import { AppearanceFontStyle, AppearanceTextSize } from '../types/appearance';

const getFontFamily = (style: AppearanceFontStyle) => {
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
  return 'System';
};

const getScaleFactor = (size: AppearanceTextSize) => {
    switch (size) {
        case 'small': return 0.85;
        case 'large': return 1.15;
        case 'medium':
        default: return 1.0;
    }
};

export const ThemedText = (props: TextProps) => {
  const { appearance } = useAppearance();
  const { style, ...otherProps } = props;

  const fontFamily = getFontFamily(appearance.fontStyle);
  const scale = getScaleFactor(appearance.textSize || 'medium');

  const flattenedStyle = useMemo(() => StyleSheet.flatten(style) || {}, [style]);
  
  // Calculate scaled font size
  let fontSize = 16; // Default
  if (flattenedStyle.fontSize) {
      fontSize = flattenedStyle.fontSize;
  }
  const scaledSize = fontSize * scale;

  return (
    <RNText
      {...otherProps}
      style={[
        style,
        { 
            fontFamily, 
            fontSize: scaledSize 
        }
      ]}
    />
  );
};
