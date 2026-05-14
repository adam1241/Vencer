import React, { useMemo, useState } from 'react';
import {
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { COLORS, SIZES } from '../../src/constants/theme';
import { EffectPreviewLoop } from '../../src/components/CompletionEffectOverlay';
import { ThemedText as Text } from '../../src/components/ThemedText';
import { useAppearance } from '../../src/context/appearance';
import {
  SHOP_CATEGORIES,
  ShopCategory,
  ShopPack,
  ShopState,
  ShopTab,
  activatePack,
  archivePurchasedPack,
  getAvailableCoins,
  getPacksForCategory,
  getShopState,
  purchasePack,
} from '../../src/services/shop';
import { getTotalCoinsCollected } from '../../src/services/coins';
import { getDailyLog } from '../../src/services/storage';

type PurchaseModalState =
  | { type: 'success'; pack: ShopPack }
  | { type: 'insufficient'; pack: ShopPack }
  | null;

const fontFamilyForStyle = (style?: ShopPack['fontStyle']) => {
  if (style === 'coder' || style === 'jetbrainsMono' || style === 'spaceMono') {
    return Platform.OS === 'ios' ? 'Courier New' : 'monospace';
  }
  if (style === 'journal') return Platform.OS === 'ios' ? 'Times New Roman' : 'serif';
  if (style === 'playfairDisplay' || style === 'cormorantGaramond' || style === 'merriweather' || style === 'cinzel') {
    return Platform.OS === 'ios' ? 'Georgia' : 'serif';
  }
  if (style === 'bebasNeue') return Platform.OS === 'ios' ? 'Impact' : 'sans-serif-condensed';
  if (style === 'sora') return Platform.OS === 'ios' ? 'Avenir Next' : 'sans-serif-medium';
  return undefined;
};

export default function ShopScreen() {
  const { appearance, colors, setFontStyle, setHighlightColor } = useAppearance();
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
      ? COLORS.black
      : colors.white;
  const highlightTitleStyle = !appearance.darkMode && isLightTone(highlightColor)
    ? {
        textShadowColor: 'rgba(0,0,0,0.35)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 1.2,
      }
    : null;
  const [selectedTab, setSelectedTab] = useState<ShopTab>('all');
  const [selectedPack, setSelectedPack] = useState<ShopPack | null>(null);
  const [purchaseModal, setPurchaseModal] = useState<PurchaseModalState>(null);
  const [shopState, setShopState] = useState<ShopState | null>(null);
  const [totalCoinsEarned, setTotalCoinsEarned] = useState(0);
  const [explodingPackId, setExplodingPackId] = useState<string | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      const load = async () => {
        const [nextShopState, dailyLog] = await Promise.all([getShopState(), getDailyLog()]);
        setShopState(nextShopState);
        setTotalCoinsEarned(getTotalCoinsCollected(dailyLog));
      };
      load();
    }, [])
  );

  const availableCoins = useMemo(() => {
    return getAvailableCoins(
      totalCoinsEarned,
      shopState || { purchasedPackIds: [], archivedPackIds: [], activePackIds: {}, spentCoins: 0 },
    );
  }, [shopState, totalCoinsEarned]);

  const isOwned = (packId: string) => Boolean(shopState?.purchasedPackIds.includes(packId));
  const isActive = (pack: ShopPack) => shopState?.activePackIds[pack.category] === pack.id;

  const visiblePacks = useMemo(() => {
    if (selectedTab === 'all') {
      return SHOP_CATEGORIES
        .filter((category) => category.id !== 'all')
        .flatMap((category) => getPacksForCategory(category.id as ShopCategory))
        .filter((pack) => !isOwned(pack.id));
    }
    return getPacksForCategory(selectedTab).filter((pack) => !isOwned(pack.id));
  }, [selectedTab, shopState]);

  const getActionLabel = (pack: ShopPack) => {
    if (isOwned(pack.id)) {
      return isActive(pack) ? 'Active' : 'Owned';
    }
    return `${pack.price} Coins`;
  };

  const handleBuyPress = async (pack: ShopPack) => {
    if (isOwned(pack.id)) {
      setSelectedPack(pack);
      return;
    }

    if (availableCoins < pack.price) {
      setPurchaseModal({ type: 'insufficient', pack });
      return;
    }

    setExplodingPackId(pack.id);
    setSelectedPack(null);
    setTimeout(async () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const nextState = await purchasePack(pack.id);
      setShopState(nextState);
      setExplodingPackId(null);
      setPurchaseModal({ type: 'success', pack });
    }, 240);
  };

  const handleUseNow = async (pack: ShopPack) => {
    if (pack.highlightColor) {
      setHighlightColor(pack.highlightColor);
    }
    if (pack.fontStyle) {
      setFontStyle(pack.fontStyle);
    }
    if (pack.category === 'themes' || pack.category === 'fonts' || pack.category === 'effects' || pack.id === 'special_focus_boost') {
      const nextState = await activatePack(pack.id);
      setShopState(nextState);
    } else {
      const nextState = await archivePurchasedPack(pack.id);
      setShopState(nextState);
    }
    setPurchaseModal(null);
    setSelectedPack(null);
  };

  const handleKeepInSettings = async (pack: ShopPack) => {
    const nextState = await archivePurchasedPack(pack.id);
    setShopState(nextState);
    setPurchaseModal(null);
    setSelectedPack(null);
  };

  const renderPackPreview = (pack: ShopPack) => {
    if (pack.previewStyle === 'gradient' || pack.previewStyle === 'solid') {
      return (
        <View style={[styles.previewPanel, { backgroundColor: colors.background }]}>
          <View style={styles.themeSwatches}>
            {(pack.previewColors || [highlightColor, colors.card, colors.textSecondary]).map((color, index) => (
              <View
                key={`${pack.id}-${color}-${index}`}
                style={[
                  styles.themeSwatch,
                  {
                    backgroundColor: color,
                    flex: index === 1 ? 1.4 : 1,
                  },
                ]}
              />
            ))}
          </View>
        </View>
      );
    }

    if (pack.previewStyle === 'font') {
      return (
        <View style={[styles.previewPanel, { backgroundColor: colors.background }]}>
          <Text
            style={[
              styles.fontPreview,
              {
                color: colors.text,
                fontFamily: fontFamilyForStyle(pack.fontStyle),
              },
            ]}
          >
            {pack.sampleText || pack.name}
          </Text>
        </View>
      );
    }

    if (pack.previewStyle === 'effect') {
      return (
        <View style={[styles.previewPanel, { backgroundColor: colors.background }]}>
          <EffectPreviewLoop effectId={pack.id} color={highlightColor} size={86} />
          <Text style={[styles.previewCaption, { color: colors.textSecondary }]}>{pack.previewLabel}</Text>
        </View>
      );
    }

    return (
      <View style={[styles.previewPanel, { backgroundColor: colors.background }]}>
        <View style={[styles.specialTag, { borderColor: colors.border }]}>
          <Text style={[styles.specialTagText, { color: colors.text }]}>{pack.previewLabel}</Text>
        </View>
      </View>
    );
  };

  const renderPackCard = (pack: ShopPack) => {
    const owned = isOwned(pack.id);
    const active = isActive(pack);
    const buttonText = getActionLabel(pack);
    return (
      <TouchableOpacity
        key={pack.id}
        style={[
          styles.packCard,
          { backgroundColor: colors.card, borderColor: colors.border },
          explodingPackId === pack.id && styles.packCardExploding,
        ]}
        onPress={() => setSelectedPack(pack)}
        activeOpacity={0.9}
      >
        <View style={styles.packTopRow}>
          <Text style={[styles.packCategory, { color: colors.textSecondary }]}>
            {pack.category.toUpperCase()}
          </Text>
          {active ? (
            <Text style={[styles.packCategory, { color: highlightColor }]}>ACTIVE</Text>
          ) : null}
        </View>

        <Text style={[styles.packName, { color: colors.text }]}>{pack.name}</Text>
        <Text style={[styles.packPreview, { color: colors.textSecondary }]}>{pack.preview}</Text>

        {renderPackPreview(pack)}

        <TouchableOpacity
          style={[
            styles.priceButton,
            {
              backgroundColor: owned ? colors.card : highlightColor,
              borderColor: owned ? colors.border : highlightColor,
            },
          ]}
          onPress={() => handleBuyPress(pack)}
        >
          <Text
            style={[
              styles.priceButtonText,
              {
                color: owned ? colors.text : activeTextColor,
              },
            ]}
          >
            {buttonText}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.header, { color: highlightColor }, highlightTitleStyle]}>{'Welcome to\nShop.'}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Spend your coins on styles, upgrades, and useful advantages.
            </Text>
          </View>
          <View style={styles.coinsInline}>
            <Text style={styles.coinEmoji}>🪙</Text>
            <Text style={[styles.coinValue, { color: colors.text }]}>{availableCoins}</Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {SHOP_CATEGORIES.map((category) => {
            const active = selectedTab === category.id;
            return (
              <TouchableOpacity
                key={category.id}
                style={[
                  styles.tabPill,
                  {
                    borderColor: active ? highlightColor : colors.border,
                    backgroundColor: active ? highlightColor : colors.card,
                  },
                ]}
                onPress={() => setSelectedTab(category.id)}
              >
                <Text
                  style={[
                    styles.tabPillText,
                    {
                      color: active ? activeTextColor : colors.text,
                    },
                  ]}
                >
                  {category.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={[styles.helperLine, { color: colors.textSecondary }]}>
          Purchased packs are added to Settings and can be activated anytime.
        </Text>

        <View style={styles.packList}>
          {visiblePacks.map(renderPackCard)}
        </View>
      </ScrollView>

      <Modal visible={!!selectedPack} transparent animationType="fade" onRequestClose={() => setSelectedPack(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {selectedPack ? (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Buy Pack</Text>
                <Text style={[styles.modalPackName, { color: colors.text }]}>{selectedPack.name}</Text>
                <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
                  {selectedPack.description}
                </Text>
                <Text style={[styles.modalSectionLabel, { color: colors.textSecondary }]}>Unlocks</Text>
                {selectedPack.includes.map((item) => (
                  <Text key={item} style={[styles.modalInclude, { color: colors.text }]}>
                    {item}
                  </Text>
                ))}
                <Text style={[styles.modalCost, { color: highlightColor }]}>
                  Cost: {selectedPack.price} Coins
                </Text>
                <View style={styles.modalActions}>
                  {isOwned(selectedPack.id) ? (
                    <>
                      <TouchableOpacity
                        style={[styles.modalButton, { borderColor: colors.border, backgroundColor: colors.card }]}
                        onPress={() => handleKeepInSettings(selectedPack)}
                      >
                        <Text style={[styles.modalButtonText, { color: colors.text }]}>Send to Settings</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modalButton, { backgroundColor: highlightColor }]}
                        onPress={() => handleUseNow(selectedPack)}
                      >
                        <Text style={[styles.modalButtonText, { color: activeTextColor }]}>
                          Use It Now
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={[styles.modalButton, { borderColor: colors.border, backgroundColor: colors.card }]}
                        onPress={() => setSelectedPack(null)}
                      >
                        <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modalButton, { backgroundColor: highlightColor }]}
                        onPress={() => handleBuyPress(selectedPack)}
                      >
                        <Text style={[styles.modalButtonText, { color: activeTextColor }]}>
                          Buy for {selectedPack.price} Coins
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={!!purchaseModal} transparent animationType="fade" onRequestClose={() => setPurchaseModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {purchaseModal?.type === 'success' ? (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Pack Purchased</Text>
                <Text style={[styles.modalPackName, { color: colors.text }]}>{purchaseModal.pack.name}</Text>
                <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
                  {purchaseModal.pack.name} has been added to Settings. You can activate it anytime from there.
                </Text>
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalButton, { borderColor: colors.border, backgroundColor: colors.card }]}
                    onPress={() => handleKeepInSettings(purchaseModal.pack)}
                  >
                    <Text style={[styles.modalButtonText, { color: colors.text }]}>Send to Settings</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, { backgroundColor: highlightColor }]}
                    onPress={() => handleUseNow(purchaseModal.pack)}
                  >
                    <Text style={[styles.modalButtonText, { color: activeTextColor }]}>
                      Use It Now
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : purchaseModal?.type === 'insufficient' ? (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Not Enough Coins</Text>
                <Text style={[styles.modalPackName, { color: colors.text }]}>{purchaseModal.pack.name}</Text>
                <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
                  You need more coins for this pack. Complete plans and tasks to earn more.
                </Text>
                <TouchableOpacity
                  style={[styles.singleButton, { backgroundColor: highlightColor }]}
                  onPress={() => setPurchaseModal(null)}
                >
                  <Text style={[styles.modalButtonText, { color: activeTextColor }]}>
                    Continue
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: SIZES.padding,
    paddingBottom: 100,
    gap: 18,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginTop: 20,
  },
  header: {
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
    maxWidth: 260,
  },
  coinsInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  coinEmoji: {
    fontSize: 18,
  },
  coinValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  tabsRow: {
    gap: 10,
    paddingRight: 12,
  },
  tabPill: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tabPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  helperLine: {
    fontSize: 13,
    lineHeight: 18,
  },
  packList: {
    gap: 12,
  },
  packCard: {
    borderWidth: 2,
    borderRadius: 22,
    padding: 16,
    gap: 10,
  },
  packCardExploding: {
    opacity: 0.2,
    transform: [{ scale: 0.94 }],
  },
  packTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  packCategory: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  packName: {
    fontSize: 18,
    fontWeight: '800',
  },
  packPreview: {
    fontSize: 13,
    lineHeight: 18,
  },
  previewPanel: {
    borderRadius: 18,
    padding: 14,
    minHeight: 78,
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeSwatches: {
    flexDirection: 'row',
    gap: 8,
    height: 50,
    width: '100%',
  },
  themeSwatch: {
    borderRadius: 14,
    height: '100%',
  },
  fontPreview: {
    fontSize: 24,
    fontWeight: '700',
  },
  effectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 10,
  },
  effectDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
  },
  effectRing: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 2,
  },
  previewCaption: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '700',
  },
  specialTag: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'center',
  },
  specialTagText: {
    fontSize: 13,
    fontWeight: '700',
  },
  priceButton: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  priceButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderWidth: 2,
    borderRadius: 24,
    padding: 22,
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  modalPackName: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  modalInclude: {
    fontSize: 14,
    lineHeight: 19,
  },
  modalCost: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  singleButton: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
});
