export type AppearanceFontStyle =
  | 'modern'
  | 'coder'
  | 'journal'
  | 'jetbrainsMono'
  | 'playfairDisplay'
  | 'merriweather'
  | 'cinzel'
  | 'bebasNeue'
  | 'sora'
  | 'spaceMono'
  | 'cormorantGaramond';
export type AppearanceTextSize = 'small' | 'medium' | 'large';

export type AppearanceAsset = {
  id: string;
  type: 'emoji' | 'image';
  value: string;
};

export type AppearanceSettings = {
  skin: 'noir';
  highlightColor: string;
  fontStyle: AppearanceFontStyle;
  textSize: AppearanceTextSize;
  darkMode: boolean;
  assets: AppearanceAsset[];
  defaultIcon?: AppearanceAsset;
};
