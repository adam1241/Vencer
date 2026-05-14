import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { getStrategies } from '../src/services/storage';
import { getOnboardingProfile } from '../src/services/onboarding';

export default function Index() {
  const [redirectPath, setRedirectPath] = useState<string | null>(null);

  useEffect(() => {
    const checkState = async () => {
      const [strategies, profile] = await Promise.all([
        getStrategies(),
        getOnboardingProfile()
      ]);

      // If user has goals, go straight to dashboard
      if (strategies.length > 0) {
        setRedirectPath('/(main)/home');
        return;
      }

      // If user has completed onboarding (has profile) but no goals, 
      // likely they cleared goals or just finished onboarding. Go to home.
      // Or maybe creator? User said "if not he goes to the dashboard".
      if (profile) {
        setRedirectPath('/(main)/home');
        return;
      }

      // First time user (no profile, no goals)
      setRedirectPath('/onboarding');
    };

    checkState();
  }, []);

  if (!redirectPath) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  return <Redirect href={redirectPath as any} />;
}
