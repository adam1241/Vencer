import { Tabs, useRouter } from 'expo-router';
import { Home, BarChart2, Settings, Plus, ShoppingBag } from 'lucide-react-native';
import { COLORS } from '../../src/constants/theme';
import { Pressable, StyleSheet, View, Platform } from 'react-native';
import { useAppearance } from '../../src/context/appearance';

export default function MainLayout() {
  const router = useRouter();
  const { appearance, colors } = useAppearance();
  const highlightColor = appearance.highlightColor || (appearance.darkMode ? COLORS.white : COLORS.black);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.lightGrey,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 10,
        },
        tabBarActiveTintColor: highlightColor,
        tabBarInactiveTintColor: colors.mediumGrey,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Home color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          tabBarIcon: ({ color, size }) => (
            <BarChart2 color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="creator"
        options={{
          tabBarButton: (props) => (
            <Pressable
              accessibilityState={props.accessibilityState}
              accessibilityLabel={props.accessibilityLabel}
              accessibilityHint={props.accessibilityHint}
              testID={props.testID}
              onLongPress={props.onLongPress}
              style={styles.plusButtonContainer}
              onPress={() => router.push('/(main)/creator')}
            >
              <View style={[styles.plusButton, { backgroundColor: highlightColor, borderColor: colors.card }]}>
                  <Plus color={(highlightColor === '#FFFFFF' || highlightColor === '#ffffff') ? COLORS.black : colors.white} size={28} strokeWidth={3} />
              </View>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="goals"
        options={{
          tabBarIcon: ({ color, size }) => (
            <ShoppingBag color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="manage-goals"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ color, size }) => (
            <Settings color={color} size={size} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="focus-mode"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="upgrade"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="progress_new"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  plusButtonContainer: {
    top: -20,
    justifyContent: 'center',
    alignItems: 'center',
    // Center logic depends on tab width, but flex behavior usually handles it.
    // Ensure pointerEvents don't block clicks
    zIndex: 10,
  },
  plusButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    // backgroundColor set inline
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: COLORS.white,
    shadowColor: "#000",
    shadowOffset: {
        width: 0,
        height: 4,
    },
    shadowOpacity: 0.30,
    shadowRadius: 4.65,
    elevation: 8,
  },
});
