import AsyncStorage from '@react-native-async-storage/async-storage';
import { OnboardingProfile } from '../types/goal';

const STORAGE_KEY = 'ziel_onboarding_profile';

export const saveOnboardingProfile = async (profile: OnboardingProfile) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.error('Failed to save onboarding profile', error);
  }
};

export const getOnboardingProfile = async (): Promise<OnboardingProfile | null> => {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('Failed to load onboarding profile', error);
    return null;
  }
};
