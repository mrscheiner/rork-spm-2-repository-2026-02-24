import { useState, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ChevronLeft, Plus, Trash2, Check, Users, User } from 'lucide-react-native';

import { AppColors } from '@/constants/appColors';
import { League, Team, SeatPair } from '@/constants/types';
import { LEAGUES, getTeamsByLeague } from '@/constants/leagues';
import { useSeasonPass } from '@/providers/SeasonPassProvider';

type SetupStep = 'league' | 'team' | 'season' | 'seats' | 'confirm';

export default function SetupScreen() {
  const router = useRouter();
  const { createSeasonPass, seasonPasses } = useSeasonPass();

  const [step, setStep] = useState<SetupStep>('league');
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [seasonLabel, setSeasonLabel] = useState('2025-2026');
  const [seatPairs, setSeatPairs] = useState<SeatPair[]>([]);
  const [currentSection, setCurrentSection] = useState('');
  const [currentRow, setCurrentRow] = useState('');
  const [currentSeats, setCurrentSeats] = useState('');
  const [currentCost, setCurrentCost] = useState('');
  const [seatEntryMode, setSeatEntryMode] = useState<'paired' | 'individual'>('paired');
  const [isCreating, setIsCreating] = useState(false);

  const parsedSeatCount = useMemo(() => {
    if (!currentSeats.trim()) return 0;
    const normalized = currentSeats.replace(/\s+/g, '').replace(/-/g, ',');
    const parts = normalized.split(',').filter(Boolean);
    if (parts.length === 2) {
      const a = parseInt(parts[0], 10);
      const b = parseInt(parts[1], 10);
      if (!isNaN(a) && !isNaN(b) && b >= a) {
        return b - a + 1;
      }
    }
    return parts.filter(p => !isNaN(parseInt(p, 10))).length;
  }, [currentSeats]);

  // Auto-switch to Individual mode when >2 seats are entered
  const isModeLockedToIndividual = parsedSeatCount > 2;
  
  // Effect to auto-switch mode when seat count exceeds 2
  const handleSeatsChange = useCallback((text: string) => {
    setCurrentSeats(text);
    // Parse the seat count from the new text
    const normalized = text.replace(/\s+/g, '').replace(/-/g, ',');
    const parts = normalized.split(',').filter(Boolean);
    let count = 0;
    if (parts.length === 2) {
      const a = parseInt(parts[0], 10);
      const b = parseInt(parts[1], 10);
      if (!isNaN(a) && !isNaN(b) && b >= a) {
        count = b - a + 1;
      }
    } else {
      count = parts.filter(p => !isNaN(parseInt(p, 10))).length;
    }
    // Auto-switch to Individual if >2 seats
    if (count > 2 && seatEntryMode === 'paired') {
      setSeatEntryMode('individual');
    }
  }, [seatEntryMode]);

  const canGoBack = seasonPasses.length > 0 || step !== 'league';

  const handleBack = useCallback(() => {
    if (step === 'league' && seasonPasses.length > 0) {
      router.back();
    } else if (step === 'team') {
      setStep('league');
      setSelectedTeam(null);
    } else if (step === 'season') {
      setStep('team');
    } else if (step === 'seats') {
      setStep('season');
    } else if (step === 'confirm') {
      setStep('seats');
    }
  }, [step, seasonPasses, router]);

  const handleSelectLeague = useCallback((league: League) => {
    console.log('[Setup] Selected league:', league.name);
    setSelectedLeague(league);
    setSelectedTeam(null);
    setStep('team');
  }, []);

  const handleSelectTeam = useCallback((team: Team) => {
    console.log('[Setup] Selected team:', team.name);
    setSelectedTeam(team);
    setStep('season');
  }, []);

  const handleSeasonNext = useCallback(() => {
    if (seasonLabel.trim()) {
      setStep('seats');
    }
  }, [seasonLabel]);

  const handleAddSeatPair = useCallback(() => {
    if (currentSection.trim() && currentRow.trim() && currentSeats.trim()) {
      if (seatEntryMode === 'paired' && parsedSeatCount !== 2) {
        Alert.alert(
          'Invalid Seat Count',
          'Paired mode requires exactly 2 seats (e.g., "1-2" or "24-25"). For more than 2 seats, use Individual mode.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      if (seatEntryMode === 'individual' && parsedSeatCount < 1) {
        Alert.alert(
          'Invalid Seat Entry',
          'Please enter at least one valid seat number.',
          [{ text: 'OK' }]
        );
        return;
      }

      const newPair: SeatPair = {
        id: `seat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        section: currentSection.trim(),
        row: currentRow.trim(),
        seats: currentSeats.trim(),
        seasonCost: parseFloat(currentCost) || 0,
      };
      setSeatPairs(prev => [...prev, newPair]);
      setCurrentSection('');
      setCurrentRow('');
      setCurrentSeats('');
      setCurrentCost('');
      console.log('[Setup] Added seat entry:', newPair, 'mode:', seatEntryMode, 'seatCount:', parsedSeatCount);
    }
  }, [currentSection, currentRow, currentSeats, currentCost, seatEntryMode, parsedSeatCount]);

  const handleRemoveSeatPair = useCallback((id: string) => {
    setSeatPairs(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleSeatsNext = useCallback(() => {
    if (seatPairs.length > 0) {
      setStep('confirm');
    } else {
      Alert.alert('Add Seats', 'Please add at least one seat pair to continue.');
    }
  }, [seatPairs]);

  const handleConfirm = useCallback(async () => {
    if (!selectedLeague || !selectedTeam) return;

    setIsCreating(true);
    try {
      console.log('[Setup] Creating season pass...');
      await createSeasonPass(selectedLeague, selectedTeam, seasonLabel, seatPairs);
      console.log('[Setup] Season pass created successfully');
      router.replace('/(tabs)');
    } catch (error) {
      console.error('[Setup] Error creating season pass:', error);
      Alert.alert('Error', 'Failed to create season pass. Please try again.');
    } finally {
      setIsCreating(false);
    }
  }, [selectedLeague, selectedTeam, seasonLabel, seatPairs, createSeasonPass, router]);

  const handleCancel = useCallback(() => {
    setStep('league');
    setSelectedLeague(null);
    setSelectedTeam(null);
    setSeasonLabel('2025-2026');
    setSeatPairs([]);
  }, []);

  const teams = selectedLeague ? getTeamsByLeague(selectedLeague.id) : [];

  const renderLeagueStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.brandingHeader}>
        <Image 
          source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/4ova8g9grto8ehefm7bwe' }} 
          style={styles.appLogo} 
          contentFit="contain" 
        />
      </View>
      <Text style={styles.stepTitle}>Choose Your League</Text>
      <Text style={styles.stepSubtitle}>Select the league for your season tickets</Text>
      <View style={styles.leagueGrid}>
        {LEAGUES.map(league => (
          <TouchableOpacity
            key={league.id}
            style={styles.leagueCard}
            onPress={() => handleSelectLeague(league)}
            activeOpacity={0.7}
          >
            {league.logoUrl ? (
              <Image source={{ uri: league.logoUrl }} style={styles.leagueLogo} contentFit="contain" />
            ) : (
              <View style={[styles.leagueLogo, styles.logoPlaceholder]} />
            )}
            <Text style={styles.leagueName}>{league.shortName}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderTeamStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Choose Your Team</Text>
      <Text style={styles.stepSubtitle}>{selectedLeague?.name}</Text>
      <ScrollView style={styles.teamScrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.teamGrid}>
          {teams.map(team => (
            <TouchableOpacity
              key={team.id}
              style={[styles.teamCard, { borderColor: team.primaryColor }]}
              onPress={() => handleSelectTeam(team)}
              activeOpacity={0.7}
            >
              {team.logoUrl ? (
                <Image source={{ uri: team.logoUrl }} style={styles.teamLogo} contentFit="contain" />
              ) : (
                <View style={[styles.teamLogo, styles.logoPlaceholder]} />
              )}
              <Text style={styles.teamName} numberOfLines={2}>{team.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  const renderSeasonStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Season Label</Text>
      <Text style={styles.stepSubtitle}>Enter the season year (e.g., 2025-2026)</Text>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          value={seasonLabel}
          onChangeText={setSeasonLabel}
          placeholder="2025-2026"
          placeholderTextColor={AppColors.textLight}
        />
      </View>
      <TouchableOpacity
        style={[styles.nextButton, !seasonLabel.trim() && styles.nextButtonDisabled]}
        onPress={handleSeasonNext}
        disabled={!seasonLabel.trim()}
      >
        <Text style={styles.nextButtonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSeatsStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Add Your Seats</Text>
      <Text style={styles.stepSubtitle}>Enter your season ticket seat information</Text>

      <View style={styles.seatModeSelector}>
        <TouchableOpacity
          style={[
            styles.seatModeOption,
            seatEntryMode === 'paired' && styles.seatModeOptionActive,
            isModeLockedToIndividual && styles.seatModeOptionDisabled
          ]}
          onPress={() => !isModeLockedToIndividual && setSeatEntryMode('paired')}
          disabled={isModeLockedToIndividual}
        >
          <Users size={20} color={seatEntryMode === 'paired' ? AppColors.white : (isModeLockedToIndividual ? AppColors.textLight : AppColors.textSecondary)} />
          <Text style={[
            styles.seatModeText,
            seatEntryMode === 'paired' && styles.seatModeTextActive,
            isModeLockedToIndividual && styles.seatModeTextDisabled
          ]}>Paired (2 seats)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.seatModeOption,
            seatEntryMode === 'individual' && styles.seatModeOptionActive
          ]}
          onPress={() => setSeatEntryMode('individual')}
        >
          <User size={20} color={seatEntryMode === 'individual' ? AppColors.white : AppColors.textSecondary} />
          <Text style={[
            styles.seatModeText,
            seatEntryMode === 'individual' && styles.seatModeTextActive
          ]}>Individual (any qty)</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.seatModeHint}>
        {isModeLockedToIndividual
          ? 'Paired mode unavailable for >2 seats. Using Individual mode.'
          : seatEntryMode === 'paired' 
            ? 'Use for exactly 2 adjacent seats (e.g., "1-2")'
            : 'Use for 1, 3, or more seats (e.g., "5" or "1-4")'}
      </Text>

      <View style={styles.seatInputs}>
        <View style={styles.inputRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Section</Text>
            <TextInput
              style={styles.smallInput}
              value={currentSection}
              onChangeText={setCurrentSection}
              placeholder="308"
              placeholderTextColor={AppColors.textLight}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Row</Text>
            <TextInput
              style={styles.smallInput}
              value={currentRow}
              onChangeText={setCurrentRow}
              placeholder="8"
              placeholderTextColor={AppColors.textLight}
            />
          </View>
        </View>
        <View style={styles.inputRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Seats</Text>
            <TextInput
              style={styles.smallInput}
              value={currentSeats}
              onChangeText={handleSeatsChange}
              placeholder={seatEntryMode === 'paired' ? "1-2" : "1-4 or 5"}
              placeholderTextColor={AppColors.textLight}
            />
            {currentSeats.trim() && (
              <Text style={styles.seatCountIndicator}>
                {parsedSeatCount} seat{parsedSeatCount !== 1 ? 's' : ''}
              </Text>
            )}
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Season Cost</Text>
            <TextInput
              style={styles.smallInput}
              value={currentCost}
              onChangeText={setCurrentCost}
              placeholder="5000"
              placeholderTextColor={AppColors.textLight}
              keyboardType="numeric"
            />
          </View>
        </View>
        <TouchableOpacity
          style={[styles.addSeatButton, (!currentSection.trim() || !currentRow.trim() || !currentSeats.trim()) && styles.addSeatButtonDisabled]}
          onPress={handleAddSeatPair}
          disabled={!currentSection.trim() || !currentRow.trim() || !currentSeats.trim()}
        >
          <Plus size={20} color={AppColors.white} />
          <Text style={styles.addSeatButtonText}>
            {seatEntryMode === 'paired' ? 'Add Seat Pair' : 'Add Seats'}
          </Text>
        </TouchableOpacity>
      </View>

      {seatPairs.length > 0 && (
        <View style={styles.seatPairsList}>
          <Text style={styles.seatPairsTitle}>Added Seats ({seatPairs.length})</Text>
          {seatPairs.map(pair => (
            <View key={pair.id} style={styles.seatPairItem}>
              <View style={styles.seatPairInfo}>
                <Text style={styles.seatPairText}>
                  Sec {pair.section} • Row {pair.row} • Seats {pair.seats}
                </Text>
                {pair.seasonCost > 0 && (
                  <Text style={styles.seatPairCost}>${pair.seasonCost.toLocaleString()}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => handleRemoveSeatPair(pair.id)}>
                <Trash2 size={20} color={AppColors.accent} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[styles.nextButton, seatPairs.length === 0 && styles.nextButtonDisabled]}
        onPress={handleSeatsNext}
        disabled={seatPairs.length === 0}
      >
        <Text style={styles.nextButtonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );

  const renderConfirmStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Confirm Season Pass</Text>
      <Text style={styles.stepSubtitle}>Review your season pass details</Text>

      <View style={styles.confirmCard}>
        <View style={styles.confirmHeader}>
          {selectedTeam?.logoUrl ? (
            <Image source={{ uri: selectedTeam.logoUrl }} style={styles.confirmLogo} contentFit="contain" />
          ) : (
            <View style={[styles.confirmLogo, styles.logoPlaceholder]} />
          )}
          <View style={styles.confirmTeamInfo}>
            <Text style={styles.confirmTeamName}>{selectedTeam?.name}</Text>
            <Text style={styles.confirmSeason}>{seasonLabel} Season</Text>
          </View>
        </View>

        <View style={styles.confirmDivider} />

        <Text style={styles.confirmSectionTitle}>Seat Pairs</Text>
        {seatPairs.map(pair => (
          <View key={pair.id} style={styles.confirmSeatItem}>
            <Text style={styles.confirmSeatText}>
              Section {pair.section} • Row {pair.row} • Seats {pair.seats}
            </Text>
            {pair.seasonCost > 0 && (
              <Text style={styles.confirmSeatCost}>${pair.seasonCost.toLocaleString()}</Text>
            )}
          </View>
        ))}
      </View>

      <View style={styles.confirmButtons}>
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelButtonText}>Start Over</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmButton, isCreating && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={isCreating}
        >
          <Check size={20} color={AppColors.white} />
          <Text style={styles.confirmButtonText}>{isCreating ? 'Creating...' : 'Confirm'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.wrapper}>
      <SafeAreaView edges={['top']} style={styles.container}>
        {canGoBack && (
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <ChevronLeft size={24} color={AppColors.white} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        )}

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {step === 'league' && renderLeagueStep()}
          {step === 'team' && renderTeamStep()}
          {step === 'season' && renderSeasonStep()}
          {step === 'seats' && renderSeatsStep()}
          {step === 'confirm' && renderConfirmStep()}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: AppColors.primary,
  },
  container: {
    flex: 1,
    backgroundColor: AppColors.background,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  stepContainer: {
    padding: 20,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: AppColors.textPrimary,
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 16,
    color: AppColors.textSecondary,
    marginBottom: 24,
    fontWeight: '500',
  },
  leagueGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  leagueCard: {
    width: '47%',
    backgroundColor: AppColors.white,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  leagueLogo: {
    width: 80,
    height: 80,
    marginBottom: 12,
  },
  logoPlaceholder: {
    backgroundColor: AppColors.gray,
    borderRadius: 8,
  },
  brandingHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  appLogo: {
    width: 200,
    height: 120,
  },
  leagueName: {
    fontSize: 18,
    fontWeight: '700',
    color: AppColors.textPrimary,
  },
  teamScrollView: {
    flex: 1,
    maxHeight: 500,
  },
  teamGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  teamCard: {
    width: '30%',
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderLeftWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  teamLogo: {
    width: 50,
    height: 50,
    marginBottom: 8,
  },
  teamName: {
    fontSize: 11,
    fontWeight: '600',
    color: AppColors.textPrimary,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 20,
  },
  textInput: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: AppColors.textPrimary,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  nextButton: {
    backgroundColor: AppColors.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  nextButtonDisabled: {
    backgroundColor: AppColors.textLight,
  },
  nextButtonText: {
    color: AppColors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  seatInputs: {
    backgroundColor: AppColors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: AppColors.textSecondary,
    marginBottom: 6,
  },
  smallInput: {
    backgroundColor: AppColors.gray,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: AppColors.textPrimary,
    fontWeight: '600',
  },
  addSeatButton: {
    backgroundColor: AppColors.primary,
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addSeatButtonDisabled: {
    backgroundColor: AppColors.textLight,
  },
  addSeatButtonText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  seatModeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  seatModeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AppColors.gray,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  seatModeOptionActive: {
    backgroundColor: AppColors.primary,
  },
  seatModeText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: AppColors.textSecondary,
  },
  seatModeTextActive: {
    color: AppColors.white,
  },
  seatModeOptionDisabled: {
    opacity: 0.5,
  },
  seatModeTextDisabled: {
    color: AppColors.textLight,
  },
  seatModeHint: {
    fontSize: 12,
    color: AppColors.textLight,
    marginBottom: 16,
    textAlign: 'center',
  },
  seatCountIndicator: {
    fontSize: 11,
    color: AppColors.accent,
    fontWeight: '600' as const,
    marginTop: 4,
  },
  seatPairsList: {
    marginBottom: 20,
  },
  seatPairsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: AppColors.textPrimary,
    marginBottom: 12,
  },
  seatPairItem: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  seatPairInfo: {
    flex: 1,
  },
  seatPairText: {
    fontSize: 16,
    fontWeight: '600',
    color: AppColors.textPrimary,
  },
  seatPairCost: {
    fontSize: 14,
    color: AppColors.textSecondary,
    marginTop: 4,
  },
  confirmCard: {
    backgroundColor: AppColors.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  confirmLogo: {
    width: 70,
    height: 70,
    marginRight: 16,
  },
  confirmTeamInfo: {
    flex: 1,
  },
  confirmTeamName: {
    fontSize: 22,
    fontWeight: '700',
    color: AppColors.textPrimary,
    marginBottom: 4,
  },
  confirmSeason: {
    fontSize: 16,
    color: AppColors.gold,
    fontWeight: '600',
  },
  confirmDivider: {
    height: 1,
    backgroundColor: AppColors.border,
    marginVertical: 16,
  },
  confirmSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.textSecondary,
    marginBottom: 12,
  },
  confirmSeatItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.gray,
  },
  confirmSeatText: {
    fontSize: 15,
    fontWeight: '600',
    color: AppColors.textPrimary,
  },
  confirmSeatCost: {
    fontSize: 15,
    fontWeight: '700',
    color: AppColors.accent,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: AppColors.gray,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: AppColors.textSecondary,
    fontSize: 16,
    fontWeight: '700',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: AppColors.success,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmButtonDisabled: {
    backgroundColor: AppColors.textLight,
  },
  confirmButtonText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
