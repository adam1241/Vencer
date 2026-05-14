import { supabase } from './supabase';
import { Profile } from '../types/goal';

export const getProfile = async (): Promise<Profile | null> => {
  const user = await supabase.auth.getUser();
  if (!user.data.user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.data.user.id)
    .single();

  if (error) {
    console.error('Profile fetch error', error);
    return null;
  }

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    avatarUrl: data.avatar_url,
    isPremium: data.is_premium,
  };
};

export const upsertProfile = async (profile: Partial<Profile>) => {
  const user = await supabase.auth.getUser();
  if (!user.data.user) return;

  const { error } = await supabase.from('profiles').upsert({
    id: user.data.user.id,
    email: profile.email ?? user.data.user.email,
    full_name: profile.fullName,
    avatar_url: profile.avatarUrl,
    is_premium: profile.isPremium ?? false,
  });

  if (error) {
    console.error('Profile update error', error);
  }
};
