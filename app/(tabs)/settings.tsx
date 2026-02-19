import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { FileText, Shield, Mail, Plus, Users, RefreshCw, Table, CheckCircle, AlertCircle, Key, Trash2, Wrench } from "lucide-react-native";
import FileImportBox from "@/components/FileImportBox";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import * as Haptics from 'expo-haptics';

import { AppColors } from "@/constants/appColors";
import { STORAGE_PREFIX } from "@/constants/storage";
import { useSeasonPass } from "@/providers/SeasonPassProvider";
import { APP_VERSION } from "@/constants/appVersion";
import { Image } from 'expo-image';
import DeveloperSettings from "@/components/DeveloperSettings";
import { buildGradientFromPass } from "@/constants/teamThemes";

const DEV_TAP_THRESHOLD = 5;

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
    exportAsExcel,
    exportAsCSV,
    emailBackup,
    importSalesFromFileData,
    lastBackupTime,
    lastBackupStatus,
    backupError,
    backupConfirmationMessage,
    retryBackup,
  } = useSeasonPass();

  const [isResyncing, setIsResyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [includeLogos, setIncludeLogos] = useState(false);
  const [isRetryingBackup, setIsRetryingBackup] = useState(false);
  const [showDevTools, setShowDevTools] = useState(__DEV__);
  const devTapCount = useRef(0);
  const devTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleAddSeasonPass = useCallback(() => {
    router.push('/setup' as any);
  }, [router]);

  const handleResyncSchedule = useCallback(async () => {
    if (!activeSeasonPassId || isResyncing) return;

    Alert.alert(
      'Resync Schedule',
      `This will fetch the latest HOME games from ESPN for ${activeSeasonPass?.teamName}. Your sales data will be preserved.`,
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
                Alert.alert('Success', 'Schedule has been updated with the latest HOME games.');
              } else {
                try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch { /* ignore */ }
                Alert.alert('Schedule Unavailable', result.error || 'Could not fetch schedule. Please try again later.');
              }
            } catch (error) {
              console.error('[Settings] Resync error:', error);
              Alert.alert('Error', 'Failed to resync schedule. Please try again.');
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

  const handleExportCSV = useCallback(async () => {
    setIsExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const success = await exportAsCSV();
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', 'Sales data copied to clipboard as CSV.');
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

  const handleExportExcel = useCallback(async () => {
    setIsExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const success = await exportAsExcel();
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', 'Excel file exported successfully.');
      } else {
        Alert.alert('Error', 'Failed to export Excel.');
      }
    } catch (error) {
      console.error('[Settings] Export Excel error:', error);
      Alert.alert('Error', 'Failed to export Excel.');
    } finally {
      setIsExporting(false);
    }
  }, [exportAsExcel]);

  const handleEmailBackup = useCallback(async () => {
    setIsExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await emailBackup(includeLogos);
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('[Settings] Email backup error:', error);
      Alert.alert('Error', 'Failed to prepare email backup.');
    } finally {
      setIsExporting(false);
    }
  }, [emailBackup, includeLogos]);

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

  const handleVersionTap = useCallback(() => {
    devTapCount.current += 1;
    if (devTapTimer.current) clearTimeout(devTapTimer.current);
    devTapTimer.current = setTimeout(() => { devTapCount.current = 0; }, 2000);

    if (devTapCount.current >= DEV_TAP_THRESHOLD) {
      devTapCount.current = 0;
      setShowDevTools((prev) => {
        const next = !prev;
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch { /* ignore */ }
        Alert.alert(next ? 'Developer Tools Enabled' : 'Developer Tools Hidden');
        return next;
      });
    }
  }, []);

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
            <Text style={styles.sectionTitle}>SYNC KEY</Text>
            <TouchableOpacity
              style={styles.settingCard}
              onPress={() => {
                Alert.alert('Sync Key', 'Enter your sync key to enable cloud sync between devices.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'OK' },
                ]);
              }}
            >
              <View style={[styles.iconContainer, { backgroundColor: '#E3F2FD' }]}>
                <Key size={24} color="#1976D2" />
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>Set Sync Key</Text>
                <Text style={styles.settingDescription}>Enter your sync key to enable cloud sync</Text>
              </View>
            </TouchableOpacity>
          </View>

          {!!lastBackupStatus && (
            <View
              style={[
                styles.backupStatusCard,
                lastBackupStatus === 'success' ? styles.backupStatusSuccess : styles.backupStatusFailed,
              ]}
            >
              <View style={styles.backupStatusContent}>
                {lastBackupStatus === 'success' ? (
                  <CheckCircle size={20} color="#2E7D32" />
                ) : (
                  <AlertCircle size={20} color="#C62828" />
                )}
                <View style={styles.backupStatusText}>
                  <Text
                    style={[
                      styles.backupStatusTitle,
                      lastBackupStatus === 'success'
                        ? styles.backupStatusTitleSuccess
                        : styles.backupStatusTitleFailed,
                    ]}
                  >
                    {lastBackupStatus === 'success' ? 'Backup saved' : 'Backup failed'}
                  </Text>
                  {!!lastBackupTime && lastBackupStatus === 'success' && (
                    <Text style={styles.backupStatusTime}>{lastBackupTime}</Text>
                  )}
                  {!!backupError && lastBackupStatus === 'failed' && (
                    <Text style={styles.backupStatusError}>{backupError}</Text>
                  )}
                </View>
              </View>
              {lastBackupStatus === 'failed' && (
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={handleRetryBackup}
                  disabled={isRetryingBackup}
                >
                  {isRetryingBackup ? (
                    <ActivityIndicator size="small" color="#C62828" />
                  ) : (
                    <Text style={styles.retryButtonText}>Retry</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

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
              <View style={[styles.iconContainer, { backgroundColor: '#FCE4EC' }]}>
                <Shield size={24} color="#C2185B" />
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>Embed Logos in Backup (Offline Restore)</Text>
                <Text style={styles.settingDescription}>
                  {includeLogos
                    ? 'ON: embeds team & opponent logos inside backup.'
                    : 'OFF: saves logo links; logos re-download when online.'}
                </Text>
              </View>
              <View style={{ justifyContent: 'center' }}>
                <Switch value={includeLogos} onValueChange={setIncludeLogos} />
              </View>
            </View>

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
                        ? `Fetching latest ${activeSeasonPass.teamName} games...`
                        : 'Update HOME games from ESPN/Ticketmaster'}
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

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>IMPORT DATA</Text>
            <FileImportBox
              onImport={importSalesFromFileData}
              activePassId={activeSeasonPassId}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>EXPORT DATA</Text>

            <TouchableOpacity
              style={[styles.settingCard, isExporting && styles.settingCardDisabled]}
              onPress={handleExportCSV}
              disabled={isExporting}
            >
              <View style={[styles.iconContainer, { backgroundColor: '#E8F5E9' }]}>
                {isExporting ? (
                  <ActivityIndicator size="small" color="#4CAF50" />
                ) : (
                  <FileText size={24} color="#4CAF50" />
                )}
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>Export as Excel</Text>
                <Text style={styles.settingDescription}>Download sales data as .xlsx workbook</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingCard, isExporting && styles.settingCardDisabled]}
              onPress={handleExportExcel}
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
                <Text style={styles.settingTitle}>Export as CSV</Text>
                <Text style={styles.settingDescription}>
                  Copy sales data as CSV to clipboard
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingCard, isExporting && styles.settingCardDisabled]}
              onPress={handleEmailBackup}
              disabled={isExporting}
            >
              <View style={[styles.iconContainer, { backgroundColor: '#FFF3E0' }]}>
                {isExporting ? (
                  <ActivityIndicator size="small" color="#FF9800" />
                ) : (
                  <Mail size={24} color="#FF9800" />
                )}
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>Email Backup</Text>
                <Text style={styles.settingDescription}>
                  Send complete backup with all data and code
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

          {showDevTools && <DeveloperSettings />}

          {!showDevTools && (
            <TouchableOpacity
              style={styles.showDevButton}
              onPress={() => {
                if (__DEV__) {
                  setShowDevTools(true);
                } else {
                  Alert.alert('Developer Tools', 'Tap the version label 5 times to unlock.');
                }
              }}
            >
              <Wrench size={16} color={AppColors.textLight} />
              <Text style={styles.showDevButtonText}>Developer Tools</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {!!backupConfirmationMessage && (
          <View style={styles.backupToast}>
            <Text style={styles.backupToastText}>{backupConfirmationMessage}</Text>
          </View>
        )}

        <TouchableOpacity onPress={handleVersionTap} activeOpacity={0.7}>
          <View style={styles.versionContainer}>
            <Image
              source={{
                uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/7mf3piipeptxq49889fh3',
              }}
              style={styles.footerLogo}
              contentFit="contain"
            />
            <Text style={styles.versionLabel}>Season Pass Manager • {APP_VERSION}</Text>
            <Text style={styles.storagePrefixLabel} testID="storage-prefix-text">
              {`STORAGE PREFIX: ${STORAGE_PREFIX}`}
            </Text>
          </View>
        </TouchableOpacity>
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
  showDevButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingVertical: 12,
    marginBottom: 8,
  },
  showDevButtonText: {
    fontSize: 13,
    color: AppColors.textLight,
    fontWeight: '600' as const,
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
  storagePrefixLabel: {
    fontSize: 11,
    color: AppColors.textLight,
    textAlign: 'center' as const,
    opacity: 0.8,
    marginBottom: 12,
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
