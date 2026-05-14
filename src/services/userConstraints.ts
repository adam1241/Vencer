import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserConstraints } from '../types/goal';

const STORAGE_KEY = 'ziel_user_constraints';

export const saveUserConstraints = async (constraints: UserConstraints) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(constraints));
  } catch (error) {
    console.error('Failed to save user constraints', error);
  }
};

export const getUserConstraints = async (): Promise<UserConstraints | null> => {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('Failed to fetch user constraints', error);
    return null;
  }
};
