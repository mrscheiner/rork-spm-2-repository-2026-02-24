import { StyleSheet, Text, View, ScrollView, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, Animated, AccessibilityInfo } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Search, X, Check, DollarSign } from "lucide-react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import * as Haptics from 'expo-haptics';

import { AppColors } from "@/constants/appColors";
import { useSeasonPass } from "@/providers/SeasonPassProvider";
import { Game, SaleRecord, SeatPair } from "@/constants/types";
import { parseSeatsCount } from '@/lib/seats';
import { NHL_TEAMS } from "@/constants/leagues";
import AppFooter from "@/components/AppFooter";
import { buildGradientFromPass } from "@/constants/teamThemes";

const TEAM_ALIASES: Record<string, string> = {
  'blackhawks': 'chi',
  'chicago': 'chi',
  'flyers': 'phi',
  'philadelphia': 'phi',
  'hurricanes': 'car',
  'carolina': 'car',
  'capitals': 'wsh',
  'washington': 'wsh',
  'caps': 'wsh',
  'lightning': 'tbl',
  'tampa': 'tbl',
  'tampa bay': 'tbl',
  'kings': 'lak',
  'la kings': 'lak',
  'los angeles': 'lak',
  'la': 'lak',
  'bruins': 'bos',
  'boston': 'bos',
  'utah': 'ari',
  'mammoth': 'ari',
  'utah mammoth': 'ari',
  'utah hockey club': 'ari',
  'panthers': 'fla',
  'florida': 'fla',
  'maple leafs': 'tor',
  'leafs': 'tor',
  'toronto': 'tor',
  'rangers': 'nyr',
  'islanders': 'nyi',
  'devils': 'njd',
  'sabres': 'buf',
  'buffalo': 'buf',
  'senators': 'ott',
  'ottawa': 'ott',
  'canadiens': 'mtl',
  'montreal': 'mtl',
  'habs': 'mtl',
  'penguins': 'pit',
  'pittsburgh': 'pit',
  'pens': 'pit',
  'blue jackets': 'cbj',
  'columbus': 'cbj',
  'red wings': 'det',
  'detroit': 'det',
  'predators': 'nsh',
  'nashville': 'nsh',
  'preds': 'nsh',
  'jets': 'wpg',
  'winnipeg': 'wpg',
  'wild': 'min',
  'minnesota': 'min',
  'blues': 'stl',
  'st. louis': 'stl',
  'st louis': 'stl',
  'stars': 'dal',
  'dallas': 'dal',
  'avalanche': 'col',
  'colorado': 'col',
  'avs': 'col',
  'coyotes': 'ari',
  'arizona': 'ari',
  'flames': 'cgy',
  'calgary': 'cgy',
  'oilers': 'edm',
  'edmonton': 'edm',
  'canucks': 'van',
  'vancouver': 'van',
  'golden knights': 'vgk',
  'knights': 'vgk',
  'vegas': 'vgk',
  'kraken': 'sea',
  'seattle': 'sea',
  'sharks': 'sjs',
  'san jose': 'sjs',
  'ducks': 'ana',
  'anaheim': 'ana',
};

function getOpponentLogo(opponentName: string, storedLogo?: string): string | undefined {
  if (!opponentName) return storedLogo;
  const cleanName = opponentName.replace(/^vs\s+/i, '').trim().toLowerCase();
  
  // Check aliases first - ESPN CDN logos are more reliable
  const aliasId = TEAM_ALIASES[cleanName];
  if (aliasId) {
    const team = NHL_TEAMS.find(t => t.id === aliasId);
    if (team) return team.logoUrl;
  }
  
  // Check each word against aliases
  const words = cleanName.split(/\s+/);
  for (const word of words) {
    const wordAliasId = TEAM_ALIASES[word];
    if (wordAliasId) {
      const team = NHL_TEAMS.find(t => t.id === wordAliasId);
      if (team) return team.logoUrl;
    }
  }
  
  // Try exact name match
  let team = NHL_TEAMS.find(t => t.name.toLowerCase() === cleanName);
  if (team) return team.logoUrl;
  
  // Try matching by team nickname (last word)
  team = NHL_TEAMS.find(t => {
    const teamNickname = t.name.toLowerCase().split(' ').pop() || '';
    return cleanName.includes(teamNickname) || teamNickname.includes(cleanName);
  });
  if (team) return team.logoUrl;
  
  // Try matching by city
  team = NHL_TEAMS.find(t => {
    const cityLower = t.city.toLowerCase();
    return cleanName.includes(cityLower) || cityLower.includes(cleanName);
  });
  if (team) return team.logoUrl;
  
  // Last resort: use stored logo
  return storedLogo;
}

interface StatusBadgeProps {
  isPaid: boolean;
}

function StatusBadge({ isPaid }: StatusBadgeProps) {
  const scaleAnim = useRef(new Animated.Value(isPaid ? 0.90 : 1)).current;
  const opacityAnim = useRef(new Animated.Value(isPaid ? 0.70 : 1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const prevIsPaid = useRef(isPaid);
  const hasAnimatedPaid = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
      scaleAnim.setValue(1);
      return;
    }

    if (isPaid) {
      if (!hasAnimatedPaid.current || prevIsPaid.current !== isPaid) {
        hasAnimatedPaid.current = true;
        scaleAnim.setValue(0.90);
        opacityAnim.setValue(0.70);
        Animated.parallel([
          Animated.sequence([
            Animated.timing(scaleAnim, {
              toValue: 1.10,
              duration: 160,
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 1,
              duration: 160,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 320,
            useNativeDriver: true,
          }),
        ]).start();
      }
    } else {
      hasAnimatedPaid.current = false;
      scaleAnim.setValue(1);
      opacityAnim.setValue(1);
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(scaleAnim, {
              toValue: 1.08,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0.85,
              duration: 600,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(scaleAnim, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
    prevIsPaid.current = isPaid;
  }, [isPaid, reduceMotion, scaleAnim, opacityAnim]);

  return (
    <Animated.View
      style={[
        isPaid ? styles.paidBadge : styles.pendingBadge,
        {
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <Text style={styles.badgeText}>{isPaid ? 'Paid' : 'Pending'}</Text>
    </Animated.View>
  );
}

interface ComputedGame extends Game {
  isPast: boolean;
  ticketsTotal: number;
  ticketsSold: number;
  ticketsAvailable: number;
  allPaid: boolean;
}

export default function ScheduleScreen() {
  const { activeSeasonPass, addSaleRecord, removeSaleRecord } = useSeasonPass();
  const [selectedFilter, setSelectedFilter] = useState<string>('All Games');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Create a stable hash of salesData to trigger recalculation when sales change
  const salesDataHash = useMemo(() => {
    if (!activeSeasonPass?.salesData) return '';
    return JSON.stringify(activeSeasonPass.salesData);
  }, [activeSeasonPass?.salesData]);
  const [selectedGame, setSelectedGame] = useState<ComputedGame | null>(null);
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});
  const [editingStatuses, setEditingStatuses] = useState<Record<string, 'Pending' | 'Paid'>>({});

  const computedGames = useMemo((): ComputedGame[] => {
    if (!activeSeasonPass) return [];
    
    const now = Date.now();
    const seatPairIds = activeSeasonPass.seatPairs.map(p => p.id);
    const ticketsPerGame = activeSeasonPass.seatPairs.reduce((acc, p) => acc + parseSeatsCount(p.seats), 0);
    
    console.log('[Schedule] Computing games - ticketsPerGame:', ticketsPerGame, 'seatPairs:', activeSeasonPass.seatPairs.length, 'salesDataHash length:', salesDataHash.length);
    
    return (activeSeasonPass.games || []).map(game => {
      const gameDate = game.dateTimeISO ? new Date(game.dateTimeISO).getTime() : new Date(game.date).getTime();
      const isPast = gameDate < now;
      
      const pairsForGame = activeSeasonPass.salesData[game.id] || {};
      const salesCount = Object.keys(pairsForGame).length;
      
      const ticketsSold = Object.values(pairsForGame).reduce((acc, sale) => {
        if (!sale) return acc;
        const sc = typeof sale.seatCount === 'number' && sale.seatCount > 0 
          ? sale.seatCount 
          : parseSeatsCount(sale?.seats) || 2;
        return acc + sc;
      }, 0);
      const ticketsAvailable = Math.max(0, ticketsPerGame - ticketsSold);
      
      if (salesCount > 0) {
        console.log('[Schedule] Game', game.gameNumber, game.opponent, '- sales:', salesCount, 'sold:', ticketsSold, 'available:', ticketsAvailable);
      }
      
      const allPaid = seatPairIds.every(pairId => {
        const sale = pairsForGame[pairId];
        return sale && (sale.paymentStatus === 'Paid' || sale.paymentStatus.toLowerCase() === 'paid');
      });
      
      return {
        ...game,
        isPast,
        ticketsTotal: ticketsPerGame,
        ticketsSold,
        ticketsAvailable,
        allPaid,
      };
    });
  }, [activeSeasonPass, salesDataHash]);

  const filteredGames = useMemo((): ComputedGame[] => {
    let games = computedGames;
    
    if (selectedFilter !== 'All Games') {
      games = games.filter(g => g.type === selectedFilter);
    }
    
    if (searchQuery.trim()) {
      const queryRaw = searchQuery.trim();
      const query = queryRaw.toLowerCase();

      games = games.filter(g => {
        // match opponent, date, time, or game number
        if (g.opponent && g.opponent.toLowerCase().includes(query)) return true;
        if (g.date && g.date.toLowerCase().includes(query)) return true;
        if (g.time && g.time.toLowerCase().includes(query)) return true;
        if (g.gameNumber && String(g.gameNumber).toLowerCase().includes(query)) return true;

        // match against sales for this game (section, row, seats, or price)
        const salesForGame = activeSeasonPass?.salesData?.[g.id] || {};
        for (const saleRaw of Object.values(salesForGame)) {
          const sale: any = saleRaw as any;
          if (!sale) continue;
          if (sale.section && String(sale.section).toLowerCase().includes(query)) return true;
          if (sale.row && String(sale.row).toLowerCase().includes(query)) return true;
          if (sale.seats && String(sale.seats).toLowerCase().includes(query)) return true;

          // Numeric price matching: allow queries like "1.11" or "$1.11" to match price 1.11
          const price = Number(sale.price);
          if (!isNaN(price)) {
            // normalize query to numeric if possible
            const numericQuery = parseFloat(queryRaw.replace(/[^0-9.\-\.]/g, ''));
            if (!isNaN(numericQuery) && Math.abs(numericQuery - price) < 0.0001) return true;
            // string compare to two-decimal representation
            if (String(price.toFixed(2)).toLowerCase().includes(query)) return true;
            if ((`$${price.toFixed(2)}`).toLowerCase().includes(query)) return true;
          }

          // fallback: check sale object stringified (catches irregular formats and currency symbols)
          try {
            const saleStr = JSON.stringify(sale).toLowerCase();
            if (saleStr.includes(query)) return true;
          } catch {
            // ignore stringify errors
          }
        }

        return false;
      });
    }
    
    console.log('[Schedule] Rendering games:', games.length, 'activeSeasonPassId:', activeSeasonPass?.id, 'raw games count:', activeSeasonPass?.games?.length);
    return games;
  }, [computedGames, selectedFilter, searchQuery, activeSeasonPass]);

  const teamPrimaryColor = activeSeasonPass?.teamPrimaryColor || AppColors.primary;
  const gradientColors = useMemo(() => {
    return buildGradientFromPass(activeSeasonPass);
  }, [activeSeasonPass]);

  const openGameDetail = useCallback((game: ComputedGame) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedGame(game);
    
    const prices: Record<string, string> = {};
    const statuses: Record<string, 'Pending' | 'Paid'> = {};
    
    activeSeasonPass?.seatPairs.forEach(pair => {
      const existingSale = activeSeasonPass.salesData[game.id]?.[pair.id];
      if (existingSale) {
        prices[pair.id] = existingSale.price.toString();
        statuses[pair.id] = existingSale.paymentStatus === 'Paid' ? 'Paid' : 'Pending';
      } else {
        prices[pair.id] = '';
        statuses[pair.id] = 'Pending';
      }
    });
    
    setEditingPrices(prices);
    setEditingStatuses(statuses);
  }, [activeSeasonPass]);

  const closeGameDetail = useCallback(() => {
    setSelectedGame(null);
    setEditingPrices({});
    setEditingStatuses({});
  }, []);

  const togglePaymentStatus = useCallback((pairId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingStatuses(prev => ({
      ...prev,
      [pairId]: prev[pairId] === 'Paid' ? 'Pending' : 'Paid'
    }));
  }, []);

  const saveSaleRecord = useCallback(async (pair: SeatPair) => {
    if (!activeSeasonPass || !selectedGame) return;
    
    const priceStr = editingPrices[pair.id] || '0';
    const price = parseFloat(priceStr) || 0;
    const status = editingStatuses[pair.id] || 'Pending';
    
    const saleRecord: SaleRecord = {
      id: `${selectedGame.id}_${pair.id}`,
      gameId: selectedGame.id,
      pairId: pair.id,
      section: pair.section,
      row: pair.row,
      seats: pair.seats,
      seatCount: parseSeatsCount(pair.seats),
      price,
      paymentStatus: status,
      soldDate: new Date().toISOString(),
    };
    
    await addSaleRecord(activeSeasonPass.id, selectedGame.id, saleRecord);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    console.log('[Schedule] Saved sale record:', saleRecord);
  }, [activeSeasonPass, selectedGame, editingPrices, editingStatuses, addSaleRecord]);

  const saveAllAndClose = useCallback(async () => {
    if (!activeSeasonPass || !selectedGame) return;
    
    for (const pair of activeSeasonPass.seatPairs) {
      const priceStr = editingPrices[pair.id];
      if (priceStr !== undefined && priceStr !== '') {
        await saveSaleRecord(pair);
      } else if (priceStr === '') {
        // If user cleared the price for an existing sale, remove that sale record
        const existingSale = activeSeasonPass.salesData?.[selectedGame.id]?.[pair.id];
        if (existingSale) {
          await removeSaleRecord(activeSeasonPass.id, selectedGame.id, pair.id);
        }
      }
    }
    
    closeGameDetail();
  }, [activeSeasonPass, selectedGame, editingPrices, saveSaleRecord, closeGameDetail, removeSaleRecord]);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Search size={20} color={AppColors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search"
              placeholderTextColor={AppColors.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.filterContainer}
          contentContainerStyle={styles.filterContent}
        >
          {['All Games', 'Preseason', 'Regular', 'Playoff'].map(filter => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterButton, 
                selectedFilter === filter && [styles.filterButtonActive, { backgroundColor: teamPrimaryColor }]
              ]}
              onPress={() => setSelectedFilter(filter)}
            >
              <Text style={[styles.filterText, selectedFilter === filter && styles.filterTextActive]}>
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.gamesList}>
          {filteredGames.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No games found</Text>
              <Text style={styles.emptySubtext}>
                {activeSeasonPass?.games?.length === 0 
                  ? 'Schedule will be loaded for your team'
                  : 'Try adjusting your filters'}
              </Text>
            </View>
          ) : (
            filteredGames.map((game) => (
              <TouchableOpacity 
                key={game.id} 
                style={[
                  styles.gameCard,
                  game.isPast && styles.gameCardPast
                ]}
                onPress={() => openGameDetail(game)}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={[...gradientColors]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.gameCardGradient}
                >
                  {game.isPast && <View style={styles.pastOverlay} />}
                  <View style={styles.dateBox}>
                    <Text style={styles.dateMonth}>
                      {game.month}
                    </Text>
                    <Text style={styles.dateDay}>{game.day}</Text>
                  </View>

                  <View style={styles.gameInfo}>
                    <View style={styles.gameHeader}>
                      {getOpponentLogo(game.opponent, game.opponentLogo) ? (
                        <Image
                          source={{ uri: getOpponentLogo(game.opponent, game.opponentLogo) }}
                          style={[styles.opponentLogo, game.isPast && styles.logoPast]}
                          contentFit="contain"
                        />
                      ) : (
                        <View style={[styles.opponentLogo, styles.logoPlaceholder]} />
                      )}
                      {!!game.gameNumber && (
                        <View style={styles.gameNumberBadge}>
                          <Text style={styles.gameNumberText}>#{game.gameNumber}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.opponent}>{game.opponent}</Text>
                    <Text style={styles.gameTime}>{game.time}</Text>
                    <View style={styles.ticketStatusRow}>
                      <Text style={styles.ticketStatus}>
                        {game.ticketsAvailable === 0 
                          ? 'No seats available' 
                          : `${game.ticketsAvailable} seats available`}
                      </Text>
                      <StatusBadge isPaid={game.allPaid} />
                    </View>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))
          )}
        </View>

        <AppFooter />
      </ScrollView>

      <Modal
        visible={selectedGame !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeGameDetail}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <SafeAreaView style={styles.modalSafeArea}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={closeGameDetail} style={styles.modalCloseBtn}>
                <X size={24} color={AppColors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Game Sales</Text>
              <TouchableOpacity onPress={saveAllAndClose} style={styles.modalSaveBtn}>
                <Check size={24} color={teamPrimaryColor} />
              </TouchableOpacity>
            </View>

            {selectedGame && (
              <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
                <View style={styles.gameDetailHeader}>
                  {getOpponentLogo(selectedGame.opponent, selectedGame.opponentLogo) ? (
                    <Image
                      source={{ uri: getOpponentLogo(selectedGame.opponent, selectedGame.opponentLogo) }}
                      style={styles.modalOpponentLogo}
                      contentFit="contain"
                    />
                  ) : (
                    <View style={[styles.modalOpponentLogo, styles.logoPlaceholder]} />
                  )}
                  <View style={styles.gameDetailInfo}>
                    <Text style={styles.modalOpponent}>{selectedGame.opponent}</Text>
                    <Text style={styles.modalDate}>{selectedGame.month} {selectedGame.day} • {selectedGame.time}</Text>
                    {!!selectedGame.gameNumber && (
                      <View style={[styles.modalGameBadge, { backgroundColor: teamPrimaryColor }]}>
                        <Text style={styles.modalGameBadgeText}>Game #{selectedGame.gameNumber}</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.seatPairsSection}>
                  <Text style={styles.sectionTitle}>Seat Pairs</Text>
                  {activeSeasonPass?.seatPairs.map((pair) => {
                    const existingSale = activeSeasonPass.salesData[selectedGame.id]?.[pair.id];
                    const currentStatus = editingStatuses[pair.id] || 'Pending';
                    const isPaid = currentStatus === 'Paid';
                    
                    return (
                      <View key={pair.id} style={styles.seatPairCard}>
                        <View style={styles.seatPairHeader}>
                          <Text style={styles.seatPairLabel}>
                            Sec {pair.section} • Row {pair.row} • Seats {pair.seats}
                          </Text>
                          <TouchableOpacity
                            style={[styles.statusToggle, isPaid ? styles.statusPaid : styles.statusPending]}
                            onPress={() => togglePaymentStatus(pair.id)}
                          >
                            <Text style={styles.statusToggleText}>{isPaid ? 'Paid' : 'Pending'}</Text>
                          </TouchableOpacity>
                        </View>
                        
                        <View style={styles.priceInputRow}>
                          <View style={styles.priceInputContainer}>
                            <DollarSign size={18} color={AppColors.textSecondary} />
                            <TextInput
                              style={styles.priceInput}
                              placeholder="0.00"
                              placeholderTextColor={AppColors.textLight}
                              keyboardType="decimal-pad"
                              value={editingPrices[pair.id] || ''}
                              onChangeText={(text) => setEditingPrices(prev => ({ ...prev, [pair.id]: text }))}
                            />
                          </View>
                          <TouchableOpacity
                            style={[styles.saveBtn, { backgroundColor: teamPrimaryColor }]}
                            onPress={() => saveSaleRecord(pair)}
                          >
                            <Check size={18} color={AppColors.white} />
                          </TouchableOpacity>
                        </View>
                        
                        {existingSale && (
                          <Text style={styles.lastSavedText}>
                            Last saved: ${existingSale.price.toFixed(2)} • {existingSale.paymentStatus}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.background,
  },
  scrollView: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: AppColors.white,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.gray,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: AppColors.textPrimary,
  },
  filterContainer: {
    backgroundColor: AppColors.white,
    paddingBottom: 12,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: AppColors.gray,
  },
  filterButtonActive: {
    backgroundColor: AppColors.accent,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: AppColors.textSecondary,
  },
  filterTextActive: {
    color: AppColors.white,
  },
  gamesList: {
    padding: 12,
    gap: 10,
  },
  emptyCard: {
    backgroundColor: AppColors.white,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: AppColors.textPrimary,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: AppColors.textSecondary,
    textAlign: 'center',
  },
  gameCard: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  gameCardGradient: {
    flexDirection: 'row',
    padding: 10,
    gap: 10,
    borderRadius: 12,
  },
  dateBox: {
    width: 46,
    height: 46,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateMonth: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.85)',
  },
  dateDay: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
  gameInfo: {
    flex: 1,
  },
  gameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  opponentLogo: {
    width: 24,
    height: 24,
  },
  gameNumberBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  gameNumberText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
  opponent: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#FFFFFF',
    marginBottom: 1,
  },
  gameTime: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 4,
    fontWeight: '500' as const,
  },
  ticketStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ticketStatus: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500' as const,
    flex: 1,
  },
  paidBadge: {
    backgroundColor: '#00C853',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.10)',
  },
  pendingBadge: {
    backgroundColor: '#E53935',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  gameCardPast: {
    opacity: 0.9,
  },
  pastOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 14,
  },
  logoPast: {
    opacity: 0.95,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: AppColors.white,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: AppColors.background,
  },
  modalSafeArea: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: AppColors.white,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  modalCloseBtn: {
    padding: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: AppColors.textPrimary,
  },
  modalSaveBtn: {
    padding: 8,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  gameDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  modalOpponentLogo: {
    width: 52,
    height: 52,
  },
  logoPlaceholder: {
    backgroundColor: AppColors.gray,
    borderRadius: 8,
  },
  gameDetailInfo: {
    flex: 1,
  },
  modalOpponent: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: AppColors.textPrimary,
    marginBottom: 3,
  },
  modalDate: {
    fontSize: 14,
    color: AppColors.textSecondary,
    marginBottom: 6,
  },
  modalGameBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  modalGameBadgeText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: AppColors.white,
  },
  seatPairsSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: AppColors.textPrimary,
    marginBottom: 4,
  },
  seatPairCard: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  seatPairHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seatPairLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: AppColors.textPrimary,
    flex: 1,
  },
  statusToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusPaid: {
    backgroundColor: '#00C853',
  },
  statusPending: {
    backgroundColor: '#E53935',
  },
  statusToggleText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: AppColors.white,
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  priceInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.gray,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  priceInput: {
    flex: 1,
    fontSize: 14,
    color: AppColors.textPrimary,
  },
  saveBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lastSavedText: {
    fontSize: 12,
    color: AppColors.textLight,
    marginTop: 8,
  },
});
