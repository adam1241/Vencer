import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SIZES } from '../src/constants/theme';
import { CheckCircle } from 'lucide-react-native';

export default function PlanCompleteScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <CheckCircle size={80} color={COLORS.black} strokeWidth={2.5} />
        </View>
        <Text style={styles.title}>Plan Ready</Text>
        <Text style={styles.subtitle}>
          Everything is prepared. Your first week is ready, your coin rewards are set, and you can start from home.
        </Text>

        <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/(main)/home')}>
          <Text style={styles.primaryButtonText}>Go To Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.outlineButton} onPress={() => router.replace('/auth')}>
          <Text style={styles.outlineButtonText}>Sign in / Sign up</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    padding: SIZES.padding * 1.8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.black,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginBottom: 40,
    textAlign: 'center',
  },
  primaryButton: {
    borderWidth: 3,
    borderColor: COLORS.black,
    backgroundColor: COLORS.black,
    borderRadius: 22,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
  },
  primaryButtonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 16,
  },
  outlineButton: {
    borderWidth: 3,
    borderColor: COLORS.black,
    borderRadius: 22,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
  },
  outlineButtonText: {
    color: COLORS.black,
    fontWeight: '700',
    fontSize: 16,
  },
});
