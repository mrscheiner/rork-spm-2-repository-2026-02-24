import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { FileText, Plus, Users, RefreshCw, Table, Trash2, Download, Upload, History } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { AppColors } from "@/constants/appColors";
import { useSeasonPass } from "@/providers/SeasonPassProvider";
import { APP_VERSION } from "@/constants/appVersion";
import { Image } from 'expo-image';
import { buildGradientFromPass } from "@/constants/teamThemes";

export default function SettingsScreen() {
  const router = useRouter();
  const {
    seasonPasses,
    activeSeasonPass,
    deleteSeasonPass,
    activeSeasonPassId,
    resyncSchedule,
    isLoadingSchedule,
    lastScheduleError,
    exportAsJSON,
    exportAsCSV,
    importFromJSONBackup,
    importFromCSVBackup,
    lastBackupTime,
    lastBackupStatus,
    backupError,
    backupConfirmationMessage,
    retryBackup,
  } = useSeasonPass();

  const [isResyncing, setIsResyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isRetryingBackup, setIsRetryingBackup] = useState(false);

  const handleAddSeasonPass = useCallback(() => {
    router.push('/setup' as any);
  }, [router]);

  const handleResyncSchedule = useCallback(async () => {
    if (!activeSeasonPassId || isResyncing) return;

    Alert.alert(
      'Resync Schedule',
      `This will refresh the HOME game schedule for ${activeSeasonPass?.teamName}. Your sales data will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resync',
          onPress: async () => {
            setIsResyncing(true);
            const timeoutPromise = new Promise<{ success: boolean; error?: string }>((resolve) => {
              setTimeout(() => resolve({ success: false, error: 'Request timed out. Please try again.' }), 30000);
            });
            try {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch { /* ignore */ }
              const result = await Promise.race([resyncSchedule(activeSeasonPassId), timeoutPromise]);
              if (result.success) {
                try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* ignore */ }
                Alert.alert('Success', 'Schedule has been refreshed.');
              } else {
                try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch { /* ignore */ }
                Alert.alert('Schedule Unavailable', result.error || 'Could not refresh schedule. Please try again later.');
              }
            } catch (error) {
              console.error('[Settings] Resync error:', error);
              Alert.alert('Error', 'Failed to refresh schedule. Please try again.');
            } finally {
              setIsResyncing(false);
            }
          },
        },
      ],
    );
  }, [activeSeasonPassId, activeSeasonPass, resyncSchedule, isResyncing]);

  const handleDeleteCurrentPass = useCallback(async () => {
    if (!activeSeasonPass || !activeSeasonPassId) return;
    try {
      const updatedCount = await deleteSeasonPass(activeSeasonPassId);
      if (updatedCount !== null && updatedCount === 0) {
        router.replace('/setup' as any);
      }
    } catch (err) {
      console.error('[Settings] deleteSeasonPass error:', err);
    }
  }, [activeSeasonPass, activeSeasonPassId, deleteSeasonPass, router]);

  // ============ SIMPLIFIED EXPORT HANDLERS ============
  const handleExportJSON = useCallback(async () => {
    setIsExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const success = await exportAsJSON();
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', 'JSON backup file saved. You can use this to restore all your data later.');
      } else {
        Alert.alert('Error', 'Failed to export JSON.');
      }
    } catch (error) {
      console.error('[Settings] Export JSON error:', error);
      Alert.alert('Error', 'Failed to export JSON.');
    } finally {
      setIsExporting(false);
    }
  }, [exportAsJSON]);

  const handleExportCSV = useCallback(async () => {
    setIsExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const success = await exportAsCSV();
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', 'CSV file saved and data copied to clipboard.');
      } else {
        Alert.alert('Error', 'Failed to export CSV.');
      }
    } catch (error) {
      console.error('[Settings] Export CSV error:', error);
      Alert.alert('Error', 'Failed to export CSV.');
    } finally {
      setIsExporting(false);
    }
  }, [exportAsCSV]);

  // ============ SIMPLIFIED IMPORT HANDLERS ============
  const handleImportJSON = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) return;

      setIsImporting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const asset = res.assets[0];
      let content: string;

      if (Platform.OS === 'web') {
        const response = await fetch(asset.uri);
        content = await response.text();
      } else {
        content = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      const result = await importFromJSONBackup(content);
      
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', result.message);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Import Failed', result.message);
      }
    } catch (error: any) {
      console.error('[Settings] Import JSON error:', error);
      Alert.alert('Error', 'Could not read file: ' + (error.message || 'Unknown error'));
    } finally {
      setIsImporting(false);
    }
  }, [importFromJSONBackup]);

  const handleImportCSV = useCallback(async () => {
    if (!activeSeasonPassId) {
      Alert.alert('No Season Pass', 'Please create or select a season pass before importing CSV sales data.');
      return;
    }

    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) return;

      setIsImporting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const asset = res.assets[0];
      let content: string;

      if (Platform.OS === 'web') {
        const response = await fetch(asset.uri);
        content = await response.text();
      } else {
        content = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      const result = await importFromCSVBackup(content);
      
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', result.message);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Import Failed', result.message);
      }
    } catch (error: any) {
      console.error('[Settings] Import CSV error:', error);
      Alert.alert('Error', 'Could not read file: ' + (error.message || 'Unknown error'));
    } finally {
      setIsImporting(false);
    }
  }, [activeSeasonPassId, importFromCSVBackup]);

  const handleRetryBackup = useCallback(async () => {
    setIsRetryingBackup(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const result = await retryBackup();
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Backup Failed', result.error || 'Could not save backup. Please try again.');
      }
    } catch (error) {
      console.error('[Settings] Retry backup error:', error);
      Alert.alert('Error', 'Failed to retry backup.');
    } finally {
      setIsRetryingBackup(false);
    }
  }, [retryBackup]);

  const gradientColors = buildGradientFromPass(activeSeasonPass);

  return (
    <View style={styles.outerWrapper}>
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
            style={styles.settingsHeader}
          >
            <Text style={styles.settingsHeaderTitle}>Settings</Text>
            <Text style={styles.settingsHeaderSubtitle}>
              {activeSeasonPass?.teamName || 'Season Pass Manager'}
            </Text>
          </LinearGradient>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SEASON PASSES</Text>

            <TouchableOpacity style={styles.settingCard} onPress={handleAddSeasonPass}>
              <View style={[styles.iconContainer, { backgroundColor: '#E8F5E9' }]}>
                <Plus size={24} color="#4CAF50" />
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>Add Season Pass</Text>
                <Text style={styles.settingDescription}>Create a new season pass for another team</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.settingCard}>
              <View style={[styles.iconContainer, { backgroundColor: '#E3F2FD' }]}>
                <Users size={24} color="#2196F3" />
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>Active Passes: {seasonPasses.length}</Text>
                <Text style={styles.settingDescription}>
                  {seasonPasses.map((p) => p.teamName).join(', ') || 'None'}
                </Text>
              </View>
            </View>

            {activeSeasonPass && (
              <>
                <TouchableOpacity
                  style={[
                    styles.settingCard,
                    (isResyncing || isLoadingSchedule) && styles.settingCardDisabled,
                  ]}
                  onPress={handleResyncSchedule}
                  disabled={isResyncing || isLoadingSchedule}
                >
                  <View style={[styles.iconContainer, { backgroundColor: '#FFF3E0' }]}>
                    {isResyncing || isLoadingSchedule ? (
                      <ActivityIndicator size="small" color="#FF9800" />
                    ) : (
                      <RefreshCw size={24} color="#FF9800" />
                    )}
                  </View>
                  <View style={styles.settingContent}>
                    <Text style={styles.settingTitle}>
                      Resync {activeSeasonPass.teamName} Schedule
                    </Text>
                    <Text style={styles.settingDescription}>
                      {isResyncing
                        ? `Refreshing ${activeSeasonPass.teamName} schedule...`
                        : 'Refresh HOME game schedule'}
                    </Text>
                  </View>
                </TouchableOpacity>

                {!!lastScheduleError && !isResyncing && !isLoadingSchedule && (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorBannerText}>{lastScheduleError}</Text>
                  </View>
                )}
              </>
            )}
          </View>

          {/* ============ SIMPLIFIED BACKUP/RESTORE ============ */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>BACKUP (EXPORT)</Text>
            <Text style={styles.sectionSubtitle}>Save your data to restore later</Text>

            <TouchableOpacity
              style={[styles.settingCard, isExporting && styles.settingCardDisabled]}
              onPress={handleExportJSON}
              disabled={isExporting}
            >
              <View style={[styles.iconContainer, { backgroundColor: '#E3F2FD' }]}>
                {isExporting ? (
                  <ActivityIndicator size="small" color="#1976D2" />
                ) : (
                  <Download size={24} color="#1976D2" />
                )}
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>Export JSON (Full Backup)</Text>
                <Text style={styles.settingDescription}>
                  Saves everything: passes, games, sales, settings
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingCard, isExporting && styles.settingCardDisabled]}
              onPress={handleExportCSV}
              disabled={isExporting}
            >
              <View style={[styles.iconContainer, { backgroundColor: '#E8F5E9' }]}>
                {isExporting ? (
                  <ActivityIndicator size="small" color="#4CAF50" />
                ) : (
                  <Table size={24} color="#4CAF50" />
                )}
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>Export CSV (Sales Data)</Text>
                <Text style={styles.settingDescription}>
                  Spreadsheet format for Excel/Sheets
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>RESTORE (IMPORT)</Text>
            <Text style={styles.sectionSubtitle}>Load data from a backup file</Text>

            <TouchableOpacity
              style={[styles.settingCard, isImporting && styles.settingCardDisabled]}
              onPress={handleImportJSON}
              disabled={isImporting}
            >
              <View style={[styles.iconContainer, { backgroundColor: '#E3F2FD' }]}>
                {isImporting ? (
                  <ActivityIndicator size="small" color="#1976D2" />
                ) : (
                  <Upload size={24} color="#1976D2" />
                )}
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>Import JSON (Full Restore)</Text>
                <Text style={styles.settingDescription}>
                  Restores everything from a JSON backup
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingCard, (isImporting || !activeSeasonPassId) && styles.settingCardDisabled]}
              onPress={handleImportCSV}
              disabled={isImporting || !activeSeasonPassId}
            >
              <View style={[styles.iconContainer, { backgroundColor: '#E8F5E9' }]}>
                {isImporting ? (
                  <ActivityIndicator size="small" color="#4CAF50" />
                ) : (
                  <FileText size={24} color="#4CAF50" />
                )}
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>Import CSV (Sales Only)</Text>
                <Text style={styles.settingDescription}>
                  {activeSeasonPassId 
                    ? 'Adds sales to current season pass' 
                    : 'Create a season pass first'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>HISTORY</Text>
            <TouchableOpacity
              style={styles.settingCard}
              onPress={() => router.push('/rewind' as any)}
            >
              <View style={[styles.iconContainer, { backgroundColor: '#E3F2FD' }]}>
                <History size={24} color="#1976D2" />
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>Rewind Changes</Text>
                <Text style={styles.settingDescription}>
                  View and restore previous states
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.dangerZone}>
            <Text style={styles.dangerZoneTitle}>MANAGE</Text>
            {activeSeasonPass && (
              <TouchableOpacity style={styles.dangerCard} onPress={handleDeleteCurrentPass}>
                <View style={[styles.iconContainer, { backgroundColor: '#FFEBEE' }]}>
                  <Trash2 size={24} color="#D32F2F" />
                </View>
                <View style={styles.settingContent}>
                  <Text style={[styles.settingTitle, { color: AppColors.accent }]}>
                    Delete Current Season Pass
                  </Text>
                  <Text style={styles.settingDescription}>
                    Remove {activeSeasonPass.teamName} {activeSeasonPass.seasonLabel}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

        </ScrollView>

        {!!backupConfirmationMessage && (
          <View style={styles.backupToast}>
            <Text style={styles.backupToastText}>{backupConfirmationMessage}</Text>
          </View>
        )}

        <View style={styles.versionContainer}>
          <Image
            source={{
              uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/7mf3piipeptxq49889fh3',
            }}
            style={styles.footerLogo}
            contentFit="contain"
          />
          <Text style={styles.versionLabel}>Season Pass Manager • {APP_VERSION}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrapper: {
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
  settingsHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    marginBottom: 12,
  },
  settingsHeaderTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: AppColors.white,
    marginBottom: 2,
  },
  settingsHeaderSubtitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: AppColors.gold,
  },
  section: {
    marginBottom: 18,
    paddingHorizontal: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: AppColors.textLight,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: AppColors.textSecondary,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  settingCard: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: AppColors.textPrimary,
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 12,
    color: AppColors.textSecondary,
    fontWeight: '500' as const,
  },
  settingCardDisabled: {
    opacity: 0.6,
  },
  dangerZone: {
    marginTop: 8,
    marginBottom: 18,
    paddingHorizontal: 14,
  },
  dangerZoneTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: AppColors.textLight,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  dangerCard: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 12,
  },
  errorBanner: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  errorBannerText: {
    fontSize: 13,
    color: '#E65100',
    fontWeight: '500' as const,
    lineHeight: 18,
  },
  versionContainer: {
    alignItems: 'center' as const,
    paddingVertical: 12,
  },
  versionLabel: {
    fontSize: 12,
    color: AppColors.textLight,
    textAlign: 'center' as const,
    marginBottom: 6,
  },
  footerLogo: {
    width: 120,
    height: 72,
    marginBottom: 8,
  },
  backupStatusCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
    marginHorizontal: 14,
  },
  backupStatusSuccess: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  backupStatusFailed: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#EF9A9A',
  },
  backupStatusContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
    gap: 12,
  },
  backupStatusText: {
    flex: 1,
  },
  backupStatusTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  backupStatusTitleSuccess: {
    color: '#2E7D32',
  },
  backupStatusTitleFailed: {
    color: '#C62828',
  },
  backupStatusTime: {
    fontSize: 12,
    color: '#558B2F',
    marginTop: 2,
  },
  backupStatusError: {
    fontSize: 12,
    color: '#C62828',
    marginTop: 2,
  },
  retryButton: {
    backgroundColor: '#FFCDD2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 12,
  },
  retryButtonText: {
    color: '#C62828',
    fontSize: 14,
    fontWeight: '600' as const,
  },
  backupToast: {
    position: 'absolute' as const,
    bottom: 80,
    left: 20,
    right: 20,
    backgroundColor: '#2E7D32',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  backupToastText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600' as const,
  },
});
