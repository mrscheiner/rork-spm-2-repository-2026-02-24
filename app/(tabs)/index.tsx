import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DollarSign, Ticket, TrendingUp, Calendar, X, ChevronRight } from "lucide-react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useState, useCallback } from "react";

import { AppColors } from "@/constants/appColors";
import { useSeasonPass } from "@/providers/SeasonPassProvider";
import SeasonPassSelector from "@/components/SeasonPassSelector";
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
  
  // Check aliases first
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

export default function DashboardScreen() {
  const { activeSeasonPass, calculateStats } = useSeasonPass();
  const [showAllSales, setShowAllSales] = useState(false);

  // Group sales by game, sorted by game date (most recent first)
  const groupedSales = useMemo(() => {
    if (!activeSeasonPass) return [];
    
    const gameGroups: {
      gameId: string;
      gameNumber: string;
      opponent: string;
      opponentLogo?: string;
      gameDate: string;
      gameDateISO: string;
      sales: {
        id: string;
        section: string;
        row: string;
        seats: string;
        price: number;
        soldDate: string;
        soldDateFormatted: string;
        status: 'Pending' | 'Per Seat' | 'Paid';
      }[];
      totalPrice: number;
    }[] = [];

    Object.entries(activeSeasonPass.salesData).forEach(([gameId, gameSales]) => {
      const game = (activeSeasonPass.games || []).find(g => g.id === gameId);
      // Don't skip sales if game not found - show them with fallback info
      
      const salesList = Object.values(gameSales).map(sale => {
        const soldDateObj = new Date(sale.soldDate);
        const soldDateFormatted = soldDateObj.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        return {
          id: sale.id,
          section: sale.section,
          row: sale.row,
          seats: sale.seats,
          price: sale.price,
          soldDate: sale.soldDate,
          soldDateFormatted,
          status: sale.paymentStatus,
        };
      });

      const totalPrice = salesList.reduce((sum, s) => sum + s.price, 0);
      
      // Get game info with fallbacks
      const opponentName = game?.opponent?.replace(/^vs\s+/, '') || 'Unknown';
      const gameNumberDisplay = game?.gameNumber?.toString() || gameId;
      
      // Always try ESPN CDN logos first, then fall back to stored logo
      const opponentLogo = getOpponentLogo(opponentName, game?.opponentLogo);
      
      gameGroups.push({
        gameId,
        gameNumber: gameNumberDisplay,
        opponent: opponentName,
        opponentLogo,
        gameDate: game?.date || 'TBD',
        gameDateISO: game?.dateTimeISO || game?.date || new Date().toISOString(),
        sales: salesList,
        totalPrice,
      });
    });

    // Sort by game date (most recent game first)
    gameGroups.sort((a, b) => {
      const dateA = new Date(a.gameDateISO).getTime();
      const dateB = new Date(b.gameDateISO).getTime();
      return dateB - dateA;
    });

    return gameGroups;
  }, [activeSeasonPass]);

  // Flat list for backward compatibility with recent sales display
  const allSales = useMemo(() => {
    const flat: {
      id: string;
      gameNumber: string;
      opponent: string;
      opponentLogo?: string;
      section: string;
      row: string;
      seats: string;
      price: number;
      soldDate: string;
      soldDateFormatted: string;
      status: 'Pending' | 'Per Seat' | 'Paid';
    }[] = [];

    groupedSales.forEach(group => {
      group.sales.forEach(sale => {
        flat.push({
          id: sale.id,
          gameNumber: group.gameNumber,
          opponent: group.opponent,
          opponentLogo: group.opponentLogo,
          section: sale.section,
          row: sale.row,
          seats: sale.seats,
          price: sale.price,
          soldDate: sale.soldDate,
          soldDateFormatted: sale.soldDateFormatted,
          status: sale.status,
        });
      });
    });

    return flat;
  }, [groupedSales]);

  const recentSales = useMemo(() => {
    return allSales.slice(0, 5);
  }, [allSales]);

  const openAllSales = useCallback(() => {
    setShowAllSales(true);
  }, []);

  const closeAllSales = useCallback(() => {
    setShowAllSales(false);
  }, []);

  const teamPrimaryColor = activeSeasonPass?.teamPrimaryColor || AppColors.primary;
  const gradientColors = useMemo(() => {
    return buildGradientFromPass(activeSeasonPass);
  }, [activeSeasonPass]);

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={[...gradientColors]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientTop}
      />
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <LinearGradient
            colors={[...gradientColors]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <SeasonPassSelector />
            <View style={styles.headerInfo}>
              <Text style={styles.teamName}>{activeSeasonPass?.teamName || 'No Team'}</Text>
              <Text style={styles.season}>{activeSeasonPass?.seasonLabel || ''} Season</Text>
            </View>
          </LinearGradient>

          <View style={styles.statsGrid}>
            <View style={[styles.statCard, styles.revenueCard]}>
              <View style={styles.statIcon}>
                <DollarSign size={24} color={AppColors.accent} />
              </View>
              <Text style={styles.statLabel}>Total Revenue</Text>
              <Text style={styles.statValue}>${calculateStats.totalRevenue.toFixed(2)}</Text>
              <Text style={styles.statSubtext}>{calculateStats.ticketsSold} seats sold</Text>
            </View>

            <TouchableOpacity 
              style={[styles.statCard, styles.ticketsCard]}
              onPress={openAllSales}
              activeOpacity={0.7}
            >
              <View style={styles.statIcon}>
                <Ticket size={24} color={AppColors.gold} />
              </View>
              <Text style={styles.statLabel}>Seats Sold</Text>
              <Text style={styles.statValue}>{calculateStats.ticketsSold}</Text>
              <Text style={styles.statSubtext}>of {calculateStats.totalTickets} total seats</Text>
              <View style={styles.viewDetailsHint}>
                <Text style={styles.viewDetailsText}>View Details</Text>
                <ChevronRight size={16} color={AppColors.textLight} />
              </View>
            </TouchableOpacity>

            <View style={[styles.statCard, styles.avgCard]}>
              <View style={styles.statIcon}>
                <TrendingUp size={24} color={teamPrimaryColor} />
              </View>
              <Text style={styles.statLabel}>Avg Price</Text>
              <Text style={styles.statValue}>${calculateStats.avgPrice.toFixed(2)}</Text>
              <Text style={styles.statSubtext}>per seat</Text>
            </View>

            <View style={[styles.statCard, styles.pendingCard]}>
              <View style={styles.statIcon}>
                <Calendar size={24} color={AppColors.gold} />
              </View>
              <Text style={styles.statLabel}>Pending</Text>
              <Text style={styles.statValue}>{calculateStats.pendingPayments}</Text>
              <Text style={styles.statSubtext}>payments</Text>
            </View>
          </View>

          <View style={styles.recentSection}>
            <View style={styles.recentHeader}>
              <Text style={styles.recentTitle}>Recent Sales</Text>
              <TouchableOpacity onPress={openAllSales}>
                <Text style={styles.viewAll}>View All ({allSales.length})</Text>
              </TouchableOpacity>
            </View>

            {recentSales.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No sales recorded yet</Text>
                <Text style={styles.emptySubtext}>Your recent ticket sales will appear here</Text>
              </View>
            ) : (
              recentSales.map((sale) => (
                <View key={sale.id} style={styles.saleCard}>
                  <View style={styles.saleHeader}>
                    <Text style={styles.gameNumber}>Game {sale.gameNumber} •</Text>
                  </View>
                  <View style={styles.saleContent}>
                    {sale.opponentLogo ? (
                      <Image
                        source={{ uri: sale.opponentLogo }}
                        style={styles.teamLogo}
                        contentFit="contain"
                      />
                    ) : (
                      <View style={[styles.teamLogo, styles.logoPlaceholder]} />
                    )}
                    <View style={styles.saleDetails}>
                      <Text style={styles.opponent}>{sale.opponent}</Text>
                      <Text style={styles.seatInfo}>
                        Section {sale.section} • Row {sale.row} • Seats {sale.seats}
                      </Text>
                      <Text style={styles.soldDate}>Sold: {sale.soldDateFormatted}</Text>
                    </View>
                    <View style={styles.priceSection}>
                      <Text style={styles.price}>${sale.price.toFixed(2)}</Text>
                      <View style={[styles.statusBadge, sale.status === 'Pending' ? styles.pendingBadge : styles.perSeatBadge]}>
                        <Text style={styles.statusText}>{sale.status}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>

          <AppFooter />
        </ScrollView>

        <Modal
          visible={showAllSales}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={closeAllSales}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>All Sales ({allSales.length})</Text>
              <TouchableOpacity onPress={closeAllSales} style={styles.modalCloseBtn}>
                <X size={24} color={AppColors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {groupedSales.length === 0 ? (
                <View style={styles.modalEmptyCard}>
                  <Text style={styles.emptyText}>No sales recorded yet</Text>
                  <Text style={styles.emptySubtext}>Your ticket sales will appear here</Text>
                </View>
              ) : (
                groupedSales.map((group, groupIndex) => (
                  <View key={group.gameId} style={styles.modalGameGroup}>
                    <View style={styles.modalGameHeader}>
                      <View style={styles.modalGameIndex}>
                        <Text style={styles.gameIndexText}>{group.gameNumber}</Text>
                      </View>
                      {group.opponentLogo ? (
                        <Image
                          source={{ uri: group.opponentLogo }}
                          style={styles.modalGroupLogo}
                          contentFit="contain"
                        />
                      ) : (
                        <View style={[styles.modalGroupLogo, styles.logoPlaceholder]} />
                      )}
                      <View style={styles.modalGameInfo}>
                        <Text style={styles.modalGameLabel}>Game #{group.gameNumber}</Text>
                        <Text style={styles.modalGameOpponent}>{group.opponent}</Text>
                        <Text style={styles.modalGameDate}>{group.gameDate}</Text>
                      </View>
                      <View style={styles.modalGroupTotal}>
                        <Text style={[styles.modalGroupPrice, { color: teamPrimaryColor }]}>${group.totalPrice.toFixed(2)}</Text>
                        <Text style={styles.modalGroupCount}>{group.sales.length} sale{group.sales.length !== 1 ? 's' : ''}</Text>
                      </View>
                    </View>
                    <View style={styles.modalSalesContainer}>
                      {group.sales.map((sale) => (
                        <View key={sale.id} style={styles.modalSaleRow}>
                          <View style={styles.modalSaleRowInfo}>
                            <Text style={styles.modalSaleRowSeats}>
                              Sec {sale.section} • Row {sale.row} • Seats {sale.seats}
                            </Text>
                            <Text style={styles.modalSaleRowDate}>Sold: {sale.soldDateFormatted}</Text>
                          </View>
                          <View style={styles.modalSaleRowPrice}>
                            <Text style={styles.modalSaleRowAmount}>${sale.price.toFixed(2)}</Text>
                            <View style={[styles.modalMiniStatusBadge, sale.status === 'Pending' ? styles.pendingBadge : styles.perSeatBadge]}>
                              <Text style={styles.miniStatusText}>{sale.status}</Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ))
              )}
              <View style={styles.modalFooter} />
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: AppColors.background,
  },
  gradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 18,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  headerInfo: {
    marginTop: 6,
  },
  teamName: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: AppColors.white,
    marginBottom: 2,
  },
  season: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: AppColors.gold,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    marginTop: -10,
    gap: 8,
  },
  statCard: {
    backgroundColor: AppColors.white,
    borderRadius: 10,
    padding: 10,
    width: '47%',
    borderLeftWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  revenueCard: {
    borderLeftColor: AppColors.accent,
  },
  ticketsCard: {
    borderLeftColor: AppColors.gold,
  },
  avgCard: {
    borderLeftColor: AppColors.accent,
  },
  pendingCard: {
    borderLeftColor: AppColors.gold,
  },
  statIcon: {
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: AppColors.textSecondary,
    marginBottom: 1,
    fontWeight: '500' as const,
  },
  statValue: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: AppColors.textPrimary,
    marginBottom: 1,
  },
  statSubtext: {
    fontSize: 10,
    color: AppColors.textLight,
    fontWeight: '500' as const,
  },
  recentSection: {
    padding: 10,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recentTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: AppColors.textPrimary,
  },
  viewAll: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: AppColors.accent,
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
  saleCard: {
    backgroundColor: AppColors.white,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  saleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  gameNumber: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: AppColors.accent,
  },
  saleContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teamLogo: {
    width: 36,
    height: 36,
    marginRight: 10,
  },
  logoPlaceholder: {
    backgroundColor: AppColors.gray,
    width: 36,
    height: 36,
    borderRadius: 6,
    marginRight: 10,
  },
  saleDetails: {
    flex: 1,
  },
  opponent: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: AppColors.textPrimary,
    marginBottom: 1,
  },
  seatInfo: {
    fontSize: 11,
    color: AppColors.textSecondary,
    marginBottom: 1,
    fontWeight: '500' as const,
  },
  soldDate: {
    fontSize: 10,
    color: AppColors.textLight,
    fontWeight: '500' as const,
  },
  priceSection: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: AppColors.accent,
    marginBottom: 3,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },
  pendingBadge: {
    backgroundColor: AppColors.accent,
  },
  perSeatBadge: {
    backgroundColor: AppColors.success,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: AppColors.white,
  },
  viewDetailsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 2,
  },
  viewDetailsText: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: AppColors.textLight,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: AppColors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: AppColors.white,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: AppColors.textPrimary,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  modalEmptyCard: {
    backgroundColor: AppColors.white,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginTop: 20,
  },
  modalGameGroup: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  modalGameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: AppColors.gray,
  },
  modalGameIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AppColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  gameIndexText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: AppColors.white,
  },
  modalGroupLogo: {
    width: 40,
    height: 40,
    marginRight: 10,
  },
  modalGameInfo: {
    flex: 1,
  },
  modalGameLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: AppColors.accent,
    marginBottom: 1,
  },
  modalGameOpponent: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: AppColors.textPrimary,
  },
  modalGameDate: {
    fontSize: 12,
    color: AppColors.textSecondary,
    marginTop: 2,
  },
  modalGroupTotal: {
    alignItems: 'flex-end',
  },
  modalGroupPrice: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
  modalGroupCount: {
    fontSize: 11,
    color: AppColors.textSecondary,
    marginTop: 2,
  },
  modalSalesContainer: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  modalSaleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.gray,
  },
  modalSaleRowInfo: {
    flex: 1,
  },
  modalSaleRowSeats: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: AppColors.textPrimary,
  },
  modalSaleRowDate: {
    fontSize: 11,
    color: AppColors.textLight,
    marginTop: 2,
  },
  modalSaleRowPrice: {
    alignItems: 'flex-end',
  },
  modalSaleRowAmount: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: AppColors.textPrimary,
    marginBottom: 3,
  },
  modalMiniStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  miniStatusText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: AppColors.white,
  },
  modalTeamLogo: {
    width: 30,
    height: 30,
    marginRight: 8,
  },
  modalFooter: {
    height: 40,
  },
});
