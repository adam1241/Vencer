import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { COLORS } from '../src/constants/theme';
import { AppearanceProvider } from '../src/context/appearance';
import { useEffect } from 'react';

export default function Layout() {
  useEffect(() => {
    const initNotifications = async () => {
      try {
        const { initializeNotifications } = await import('../src/services/notifications');
        await initializeNotifications();
      } catch (e) {
        console.log('Notifications not available:', e);
      }
    };

    const initLocalAi = async () => {
      try {
        const { initializeLocalAI } = await import('../src/services/aiService');
        await initializeLocalAI();
      } catch (e) {
        console.log('Local Gemma not ready yet:', e);
      }
    };

    initLocalAi();
    initNotifications();
  }, []);

  return (
    <AppearanceProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <StatusBar style="dark" backgroundColor={COLORS.background} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: COLORS.background },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="onboarding-plan" />
          <Stack.Screen name="auth" />
          <Stack.Screen name="vision-setup" />
          <Stack.Screen name="strategy-review" />
          <Stack.Screen name="plan-complete" />
          <Stack.Screen name="(main)" />
          <Stack.Screen name="goal-details" />
          <Stack.Screen name="manual-goal" />
        </Stack>
      </GestureHandlerRootView>
    </AppearanceProvider>
  );
}
