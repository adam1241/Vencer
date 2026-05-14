import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../../src/constants/theme';
import { useAppearance } from '../../src/context/appearance';
import { ThemedText as Text } from '../../src/components/ThemedText';
import { Star, Zap, Target, Calendar, BarChart3 } from 'lucide-react-native';

const FREE_FEATURES = [
  { icon: Target, text: 'Up to 3 active goals' },
  { icon: Calendar, text: 'Basic AI strategy' },
  { icon: Zap, text: 'Daily routine tracking' },
  { icon: BarChart3, text: 'Basic streaks and points' },
];

const PRO_FEATURES = [
  { icon: Target, text: 'Unlimited goals' },
  { icon: Calendar, text: 'Detailed AI plans (daily + weekly + monthly)' },
  { icon: Zap, text: 'Auto-adjustments after streaks' },
  { icon: BarChart3, text: 'Advanced insights and trends' },
  { icon: Star, text: 'Priority AI refreshes' },
];

export default function UpgradeScreen() {
  const { appearance, colors } = useAppearance();
  const highlightColor = appearance.highlightColor || (appearance.darkMode ? COLORS.white : COLORS.black);
  const isLightTone = (color: string) => {
    const value = color.replace('#', '');
    if (value.length !== 6) return false;
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return ((r * 299) + (g * 587) + (b * 114)) / 1000 >= 170;
  };
  const activeTextColor = appearance.darkMode
    ? colors.white
    : isLightTone(highlightColor)
      ? '#1F2937'
      : colors.white;

  const renderFeature = (item: { icon: any; text: string }, isPro: boolean) => {
    const Icon = item.icon;
    return (
      <View key={item.text} style={styles.featureItem}>
        <Icon 
          size={16} 
          color={isPro 
            ? (highlightColor === '#FFFFFF' || highlightColor === '#ffffff' ? '#1F2937' : colors.white) 
            : colors.textSecondary 
          } 
        />
        <Text style={[
          styles.featureText, 
          { color: isPro 
            ? (highlightColor === '#FFFFFF' || highlightColor === '#ffffff' ? '#1F2937' : 'rgba(255,255,255,0.8)') 
            : colors.textSecondary 
          }
        ]}>
          {item.text}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.header, { color: highlightColor }]}>Vencer Pro.</Text>
        <Text style={[styles.subheader, { color: colors.textSecondary }]}>
          Unlock advanced planning, unlimited goals, and deeper insights.
        </Text>
        <Text style={[styles.noteText, { color: colors.textSecondary }]}>
          Note: Vencer Pro features are available in this testing build, so you do not need to switch anything here for now.
        </Text>

        {/* Free Plan */}
        <View style={styles.section}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.lightGrey }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.planTitle, { color: colors.text }]}>Free</Text>
              <Text style={[styles.price, { color: colors.text }]}>$0</Text>
            </View>
            {FREE_FEATURES.map((item) => renderFeature(item, false))}
          </View>
        </View>

        {/* Pro Plan */}
        <View style={styles.section}>
          <View style={[styles.card, styles.proCard, { 
            backgroundColor: appearance.darkMode && (highlightColor === '#FFFFFF' || highlightColor === '#ffffff') 
              ? '#6B7280' // gray for white highlight in dark mode
              : highlightColor, 
            borderColor: appearance.darkMode && (highlightColor === '#FFFFFF' || highlightColor === '#ffffff') 
              ? '#6B7280' 
              : highlightColor 
          }]}>
            <View style={styles.cardHeader}>
              <View style={styles.proBadge}>
                <Star size={12} color={activeTextColor} />
                <Text style={[styles.proBadgeText, { color: activeTextColor }]}>
                  MOST POPULAR
                </Text>
              </View>
              <Text style={[styles.planTitle, styles.proTitle, { 
                color: activeTextColor
              }]}>
                Pro
              </Text>
              <Text style={[styles.price, { color: activeTextColor }]}>
                $4.99<Text style={styles.pricePeriod}>/month</Text>
              </Text>
            </View>
            {PRO_FEATURES.map((item) => renderFeature(item, true))}
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            Cancel anytime. No questions asked.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: SIZES.padding,
    paddingBottom: 40,
  },
  header: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 20,
  },
  subheader: {
    fontSize: 14,
    marginBottom: 10,
    lineHeight: 20,
  },
  noteText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 22,
  },
  section: {
    marginBottom: 24,
  },
  card: {
    borderRadius: SIZES.radius,
    borderWidth: 2,
    padding: 20,
  },
  proCard: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  cardHeader: {
    marginBottom: 20,
  },
  planTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  proTitle: {
    fontSize: 28,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  proBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  price: {
    fontSize: 32,
    fontWeight: '800',
  },
  pricePeriod: {
    fontSize: 16,
    fontWeight: '500',
    opacity: 0.7,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  featureText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
    paddingVertical: 20,
  },
  footerText: {
    fontSize: 12,
    textAlign: 'center',
  },
});
