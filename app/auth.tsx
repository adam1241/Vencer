import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, SIZES } from '../src/constants/theme';
import { supabase } from '../src/services/supabase';
import { upsertProfile } from '../src/services/profile';
import { getStrategies } from '../src/services/storage';

export default function AuthScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setSessionEmail(data.session.user.email || null);
      }
    };
    init();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session) {
          setSessionEmail(session.user.email || null);
          if (event === 'SIGNED_IN') {
            await upsertProfile({ email: session.user.email });
            const strategies = await getStrategies();
            router.replace(strategies.length ? '/(main)/home' : '/vision-setup');
          }
        } else {
          setSessionEmail(null);
        }
      }
    );

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  const handleAuth = async () => {
    if (!email || !password || (isSigningUp && !fullName.trim())) {
      Alert.alert('Missing info', 'Please fill in all required fields.');
      return;
    }
    setLoading(true);
    try {
      if (isSigningUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        await upsertProfile({ email, fullName: fullName.trim() });
        Alert.alert('Check your email', 'Confirm your email to finish signup.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e: any) {
      Alert.alert('Auth error', e.message || 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {sessionEmail ? (
          <View style={styles.sessionCard}>
            <Text style={styles.sessionTitle}>Continue as</Text>
            <Text style={styles.sessionEmail}>{sessionEmail}</Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={async () => {
                const strategies = await getStrategies();
                router.replace(strategies.length ? '/(main)/home' : '/vision-setup');
              }}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.outlineButton}
              onPress={async () => {
                await supabase.auth.signOut();
                setSessionEmail(null);
              }}
            >
              <Text style={styles.outlineButtonText}>Use another account</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.header}>
          <Text style={styles.title}>{isSigningUp ? 'Create account' : 'Sign in'}</Text>
          <Text style={styles.subtitle}>
            {isSigningUp ? 'Start building with Vencer.' : 'Welcome back to Vencer.'}
          </Text>
        </View>

        <View style={styles.form}>
          {isSigningUp ? (
            <TextInput
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor={COLORS.mediumGrey}
              value={fullName}
              onChangeText={setFullName}
            />
          ) : null}
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={COLORS.mediumGrey}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={COLORS.mediumGrey}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity style={styles.primaryButton} onPress={handleAuth} disabled={loading}>
            <Text style={styles.primaryButtonText}>
              {loading ? 'Please wait...' : isSigningUp ? 'Sign Up' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.outlineButton}
            onPress={() => setIsSigningUp((prev) => !prev)}
          >
            <Text style={styles.outlineButtonText}>
              {isSigningUp ? 'Already have an account? Sign in' : 'New here? Create account'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
    padding: SIZES.padding * 1.5,
    justifyContent: 'center',
  },
  sessionCard: {
    borderWidth: 3,
    borderColor: COLORS.black,
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
  },
  sessionTitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  sessionEmail: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 12,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.black,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  form: {
    gap: 16,
  },
  input: {
    borderWidth: 3,
    borderColor: COLORS.black,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: COLORS.black,
  },
  primaryButton: {
    borderWidth: 3,
    borderColor: COLORS.black,
    borderRadius: 22,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: COLORS.black,
    marginTop: 12,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  outlineButton: {
    borderWidth: 3,
    borderColor: COLORS.black,
    borderRadius: 22,
    paddingVertical: 12,
    alignItems: 'center',
  },
  outlineButtonText: {
    color: COLORS.black,
    fontSize: 14,
    fontWeight: '700',
  },
});
