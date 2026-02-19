import { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Plus, Trash2, Save } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';

import { AppColors } from '@/constants/appColors';
import { SeatPair } from '@/constants/types';
import { useSeasonPass } from '@/providers/SeasonPassProvider';
import { buildGradientFromPass, getTeamTheme } from '@/constants/teamThemes';
import { LinearGradient } from 'expo-linear-gradient';

export default function EditPassScreen() {
  const router = useRouter();
  const { passId } = useLocalSearchParams<{ passId: string }>();
  const { seasonPasses, updateSeasonPass, addSeatPair, removeSeatPair } = useSeasonPass();

  const pass = useMemo(() => {
    if (!passId) return null;
    return seasonPasses.find(p => p.id === passId) || null;
  }, [passId, seasonPasses]);

  const [seasonLabel, setSeasonLabel] = useState(pass?.seasonLabel || '');
  const [editedPairs, setEditedPairs] = useState<Record<string, { seasonCost: string }>>(
    () => {
      const map: Record<string, { seasonCost: string }> = {};
      (pass?.seatPairs || []).forEach(p => {
        map[p.id] = { seasonCost: String(p.seasonCost || 0) };
      });
      return map;
    }
  );

  const [newSection, setNewSection] = useState('');
  const [newRow, setNewRow] = useState('');
  const [newSeats, setNewSeats] = useState('');
  const [newCost, setNewCost] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const gradientColors = useMemo(() => buildGradientFromPass(pass), [pass]);
  const theme = useMemo(() => getTeamTheme(pass?.teamId), [pass?.teamId]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleSave = useCallback(async () => {
    if (!pass || !passId) return;

    setIsSaving(true);
    try {
      const updatedSeatPairs = pass.seatPairs.map(p => ({
        ...p,
        seasonCost: parseFloat(editedPairs[p.id]?.seasonCost || '0') || p.seasonCost,
      }));

      await updateSeasonPass(passId, {
        seasonLabel: seasonLabel.trim() || pass.seasonLabel,
        seatPairs: updatedSeatPairs,
      });

      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* */ }
      Alert.alert('Saved', 'Season pass updated successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('[EditPass] Save error:', error);
      Alert.alert('Error', 'Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  }, [pass, passId, seasonLabel, editedPairs, updateSeasonPass, router]);

  const handleAddSeat = useCallback(async () => {
    if (!passId || !newSection.trim() || !newRow.trim() || !newSeats.trim()) return;

    const newPair: SeatPair = {
      id: `seat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      section: newSection.trim(),
      row: newRow.trim(),
      seats: newSeats.trim(),
      seasonCost: parseFloat(newCost) || 0,
    };

    try {
      await addSeatPair(passId, newPair);
      setNewSection('');
      setNewRow('');
      setNewSeats('');
      setNewCost('');
      setEditedPairs(prev => ({
        ...prev,
        [newPair.id]: { seasonCost: String(newPair.seasonCost) },
      }));
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { /* */ }
      console.log('[EditPass] Added seat pair:', newPair.id);
    } catch (error) {
      console.error('[EditPass] Add seat error:', error);
      Alert.alert('Error', 'Failed to add seat pair.');
    }
  }, [passId, newSection, newRow, newSeats, newCost, addSeatPair]);

  const handleRemoveSeat = useCallback(async (seatId: string) => {
    if (!passId) return;

    Alert.alert(
      'Remove Seat',
      'Are you sure you want to remove this seat? Sales data for this seat will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeSeatPair(passId, seatId);
              setEditedPairs(prev => {
                const updated = { ...prev };
                delete updated[seatId];
                return updated;
              });
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { /* */ }
            } catch (error) {
              console.error('[EditPass] Remove seat error:', error);
              Alert.alert('Error', 'Failed to remove seat.');
            }
          },
        },
      ]
    );
  }, [passId, removeSeatPair]);

  if (!pass) {
    return (
      <View style={styles.wrapper}>
        <SafeAreaView edges={['top']} style={styles.errorContainer}>
          <Text style={styles.errorText}>Season pass not found.</Text>
          <TouchableOpacity style={styles.errorButton} onPress={handleBack}>
            <Text style={styles.errorButtonText}>Go Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={[...gradientColors]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientTop}
      />
      <SafeAreaView edges={['top']} style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
          keyboardVerticalOffset={0}
        >
          <LinearGradient
            colors={[...gradientColors]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <ChevronLeft size={24} color={theme.textOnPrimary} />
              <Text style={[styles.backText, { color: theme.textOnPrimary }]}>Back</Text>
            </TouchableOpacity>
            <View style={styles.headerContent}>
              {pass.teamLogoUrl ? (
                <Image source={{ uri: pass.teamLogoUrl }} style={styles.headerLogo} contentFit="contain" />
              ) : null}
              <View style={styles.headerInfo}>
                <Text style={[styles.headerTitle, { color: theme.textOnPrimary }]}>Edit Season Pass</Text>
                <Text style={[styles.headerSubtitle, { color: theme.textOnPrimary, opacity: 0.85 }]}>{pass.teamName}</Text>
              </View>
            </View>
          </LinearGradient>

          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>SEASON INFO</Text>
              <View style={styles.card}>
                <Text style={styles.inputLabel}>Season Label</Text>
                <TextInput
                  style={styles.textInput}
                  value={seasonLabel}
                  onChangeText={setSeasonLabel}
                  placeholder="2025-2026"
                  placeholderTextColor={AppColors.textLight}
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>SEAT PAIRS ({pass.seatPairs.length})</Text>
              {pass.seatPairs.map(pair => (
                <View key={pair.id} style={styles.seatCard}>
                  <View style={styles.seatInfo}>
                    <View style={[styles.seatColorBar, { backgroundColor: theme.primary }]} />
                    <View style={styles.seatDetails}>
                      <Text style={styles.seatLabel}>
                        Sec {pair.section} · Row {pair.row} · Seats {pair.seats}
                      </Text>
                      <View style={styles.costRow}>
                        <Text style={styles.costLabel}>Season Cost</Text>
                        <View style={styles.costInputContainer}>
                          <Text style={styles.dollarSign}>$</Text>
                          <TextInput
                            style={styles.costInput}
                            value={editedPairs[pair.id]?.seasonCost || ''}
                            onChangeText={(text) =>
                              setEditedPairs(prev => ({
                                ...prev,
                                [pair.id]: { seasonCost: text },
                              }))
                            }
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                            placeholderTextColor={AppColors.textLight}
                          />
                        </View>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveSeat(pair.id)}
                  >
                    <Trash2 size={18} color="#D32F2F" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>ADD NEW SEAT</Text>
              <View style={styles.card}>
                <View style={styles.inputRow}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Section</Text>
                    <TextInput
                      style={styles.smallInput}
                      value={newSection}
                      onChangeText={setNewSection}
                      placeholder="308"
                      placeholderTextColor={AppColors.textLight}
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Row</Text>
                    <TextInput
                      style={styles.smallInput}
                      value={newRow}
                      onChangeText={setNewRow}
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
                      value={newSeats}
                      onChangeText={setNewSeats}
                      placeholder="1-2"
                      placeholderTextColor={AppColors.textLight}
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Season Cost</Text>
                    <TextInput
                      style={styles.smallInput}
                      value={newCost}
                      onChangeText={setNewCost}
                      placeholder="5000"
                      placeholderTextColor={AppColors.textLight}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                <TouchableOpacity
                  style={[
                    styles.addButton,
                    { backgroundColor: theme.primary },
                    (!newSection.trim() || !newRow.trim() || !newSeats.trim()) && styles.buttonDisabled,
                  ]}
                  onPress={handleAddSeat}
                  disabled={!newSection.trim() || !newRow.trim() || !newSeats.trim()}
                >
                  <Plus size={20} color={theme.textOnPrimary} />
                  <Text style={[styles.addButtonText, { color: theme.textOnPrimary }]}>Add Seat Pair</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.saveSection}>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: theme.primary }, isSaving && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={isSaving}
              >
                <Save size={20} color={theme.textOnPrimary} />
                <Text style={[styles.saveButtonText, { color: theme.textOnPrimary }]}>
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.bottomPadding} />
          </ScrollView>
        </KeyboardAvoidingView>
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
  keyboardView: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: AppColors.textPrimary,
    marginBottom: 16,
  },
  errorButton: {
    backgroundColor: AppColors.accent,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  errorButtonText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  backButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    marginBottom: 4,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginLeft: 4,
  },
  headerContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  headerLogo: {
    width: 44,
    height: 44,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  section: {
    marginTop: 16,
    paddingHorizontal: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: AppColors.textLight,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  seatCard: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  seatInfo: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
  },
  seatColorBar: {
    width: 4,
    borderRadius: 2,
    marginRight: 12,
  },
  seatDetails: {
    flex: 1,
  },
  seatLabel: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: AppColors.textPrimary,
    marginBottom: 8,
  },
  costRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  costLabel: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: AppColors.textSecondary,
  },
  costInputContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: AppColors.gray,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 120,
  },
  dollarSign: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: AppColors.textSecondary,
    marginRight: 4,
  },
  costInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600' as const,
    color: AppColors.textPrimary,
    padding: 0,
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFEBEE',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginLeft: 8,
  },
  inputRow: {
    flexDirection: 'row' as const,
    gap: 12,
    marginBottom: 12,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: AppColors.textSecondary,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: AppColors.gray,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: AppColors.textPrimary,
    fontWeight: '600' as const,
  },
  smallInput: {
    backgroundColor: AppColors.gray,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: AppColors.textPrimary,
    fontWeight: '600' as const,
  },
  addButton: {
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  saveSection: {
    marginTop: 24,
    paddingHorizontal: 14,
  },
  saveButton: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '700' as const,
  },
  bottomPadding: {
    height: 40,
  },
});
