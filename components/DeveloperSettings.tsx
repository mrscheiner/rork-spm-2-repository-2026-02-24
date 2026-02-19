import { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import {
  Shield,
  Folder,
  Trash2,
  Table,
  Eraser,
  Database,
  Key,
} from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { AppColors } from '@/constants/appColors';
import { resetAllData, STORAGE_PREFIX } from '@/constants/storage';
import { useSeasonPass } from '@/providers/SeasonPassProvider';
import { CANONICAL_DATA_VERSION } from '@/constants/canonicalData';
import { resetToCanonicalData } from '@/lib/canonicalBootstrap';

export default function DeveloperSettings() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    activeSeasonPass,
    activeSeasonPassId,
    debugFetchLogosFromEspnForPass,
    createRecoveryCode,
    prepareBackupPackage,
    clearAllData,
    reloadFromStorage,
  } = useSeasonPass();

  const [isExporting, setIsExporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isCanonicalResetting, setIsCanonicalResetting] = useState(false);
  const includeLogos = false;

  const handleFetchEspnLogos = useCallback(async () => {
    if (!activeSeasonPassId) return;
    try {
      const res: any = await debugFetchLogosFromEspnForPass(activeSeasonPassId);
      console.log('[DevSettings] debugFetchLogosFromEspnForPass result:', res);
      if (res && res.success) {
        const msg = res.changed
          ? `Updated ${res.details.length} games (logos applied where matched).`
          : 'No logos resolved automatically.';
        Alert.alert('ESPN Logo Debug', msg);
      } else {
        Alert.alert('ESPN Logo Debug', `Failed: ${res?.error || 'unknown'}`);
      }
    } catch (e) {
      console.error('[DevSettings] handleFetchEspnLogos error:', e);
      Alert.alert('Error', 'Failed to fetch logos from ESPN. Check logs.');
    }
  }, [activeSeasonPassId, debugFetchLogosFromEspnForPass]);

  const handleGenerateRecoveryCode = useCallback(async () => {
    setIsExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const code = await createRecoveryCode(includeLogos);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Recovery Code Generated',
        `Your recovery code has been copied to clipboard.\n\nCode length: ${code.length} characters\n\nSave this code somewhere safe to restore your data later.`,
        [{ text: 'OK' }],
      );
    } catch (error) {
      console.error('[DevSettings] Generate recovery code error:', error);
      Alert.alert('Error', 'Failed to generate recovery code.');
    } finally {
      setIsExporting(false);
    }
  }, [createRecoveryCode, includeLogos]);

  const handleClearCache = useCallback(() => {
    if (isClearingCache) return;
    Alert.alert(
      'Clear App Cache',
      'This will clear cached/temporary data and force a fresh reload. Your season passes and sales data are NOT affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: async () => {
            setIsClearingCache(true);
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              queryClient.clear();
              await queryClient.invalidateQueries();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Cache Cleared', 'App cache has been cleared.');
            } catch (e) {
              console.error('[DevSettings] Clear cache error:', e);
              Alert.alert('Error', 'Failed to clear cache.');
            } finally {
              setIsClearingCache(false);
            }
          },
        },
      ],
    );
  }, [isClearingCache, queryClient]);

  const handleClearAllData = useCallback(() => {
    if (isResetting) return;
    Alert.alert(
      'Reset All Data',
      'This will remove all Season Pass Manager v2 stored data from this device. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setIsResetting(true);
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              await resetAllData();
              await clearAllData();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.replace('/setup' as any);
            } catch (e) {
              console.error('[DevSettings] resetAllData error:', e);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Error', 'Failed to reset app data. Please try again.');
            } finally {
              setIsResetting(false);
            }
          },
        },
      ],
    );
  }, [clearAllData, isResetting, router]);

  const handleResetToCanonical = useCallback(() => {
    if (isCanonicalResetting) return;
    Alert.alert(
      'Reset to Canonical Data',
      `This will erase all local data and restore the default dataset (v${CANONICAL_DATA_VERSION}). This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setIsCanonicalResetting(true);
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              const success = await resetToCanonicalData();
              if (success) {
                console.log('[DevSettings] Canonical reset succeeded, reloading data...');
                await reloadFromStorage();
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('Success', 'App data has been reset to the canonical dataset.');
              } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert('Error', 'Failed to reset to canonical data.');
              }
            } catch (e) {
              console.error('[DevSettings] Canonical reset error:', e);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Error', 'Failed to reset to canonical data.');
            } finally {
              setIsCanonicalResetting(false);
            }
          },
        },
      ],
    );
  }, [isCanonicalResetting, reloadFromStorage]);

  return (
    <>
      <View style={styles.section}>
        <View style={styles.devBadge}>
          <Key size={14} color="#F59E0B" />
          <Text style={styles.devBadgeText}>DEVELOPER TOOLS</Text>
        </View>

        <TouchableOpacity
          style={[styles.devCard, isCanonicalResetting && styles.cardDisabled]}
          onPress={handleResetToCanonical}
          disabled={isCanonicalResetting}
          testID="devSettings.resetToCanonical"
        >
          <View style={[styles.iconContainer, { backgroundColor: '#DBEAFE' }]}>
            {isCanonicalResetting ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <Database size={24} color="#2563EB" />
            )}
          </View>
          <View style={styles.settingContent}>
            <Text style={styles.settingTitle}>Reset to Canonical Data</Text>
            <Text style={styles.settingDescription}>
              Wipe local storage & re-seed from bundled dataset v{CANONICAL_DATA_VERSION}
            </Text>
          </View>
        </TouchableOpacity>

        {activeSeasonPass && (
          <TouchableOpacity
            style={styles.devCard}
            onPress={handleFetchEspnLogos}
            disabled={!activeSeasonPassId}
          >
            <View style={[styles.iconContainer, { backgroundColor: '#E1F5FE' }]}>
              <Table size={24} color="#0288D1" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>Attempt ESPN Logos</Text>
              <Text style={styles.settingDescription}>
                Try to resolve missing opponent logos using ESPN team data
              </Text>
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.devCard, isExporting && styles.cardDisabled]}
          onPress={handleGenerateRecoveryCode}
          disabled={isExporting}
        >
          <View style={[styles.iconContainer, { backgroundColor: '#FFEBEE' }]}>
            {isExporting ? (
              <ActivityIndicator size="small" color="#EF5350" />
            ) : (
              <Shield size={24} color="#EF5350" />
            )}
          </View>
          <View style={styles.settingContent}>
            <Text style={styles.settingTitle}>Generate Recovery Code</Text>
            <Text style={styles.settingDescription}>Create a backup code to restore your app</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.devCard, isExporting && styles.cardDisabled]}
          onPress={() => {
            Alert.alert('Export Master Files', 'Choose how you want to send the master clone files', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Messages',
                onPress: async () => {
                  setIsExporting(true);
                  try {
                    const pkg = await prepareBackupPackage(includeLogos);
                    if (pkg.success) {
                      if (pkg.fileUri) {
                        const messageText = `Here's the Rork Master Clone backup (${new Date().toISOString().split('T')[0]}). Import into the app: Settings → Import Data.`;
                        try {
                          await Share.share({
                            message: messageText,
                            url: pkg.fileUri,
                            title: 'Season Pass Backup',
                          } as any);
                        } catch {
                          try {
                            await Sharing.shareAsync(pkg.fileUri);
                          } catch {
                            Alert.alert('Error', 'Failed to share backup via Messages.');
                          }
                        }
                      } else if (pkg.isWeb) {
                        Alert.alert('Downloaded', 'Files downloaded to your browser.');
                      } else {
                        Alert.alert('Saved', `Backup saved to: ${pkg.folderUri || 'Documents'}`);
                      }
                    } else {
                      Alert.alert('Error', 'Failed to prepare package.');
                    }
                  } finally {
                    setIsExporting(false);
                  }
                },
              },
              {
                text: 'Save to Files',
                onPress: async () => {
                  setIsExporting(true);
                  try {
                    const pkg = await prepareBackupPackage(includeLogos);
                    if (pkg.success) {
                      Alert.alert('Saved', `Backup saved to: ${pkg.folderUri || 'Downloads'}`);
                    } else {
                      Alert.alert('Error', 'Failed to save backup.');
                    }
                  } finally {
                    setIsExporting(false);
                  }
                },
              },
            ]);
          }}
          disabled={isExporting}
        >
          <View style={[styles.iconContainer, { backgroundColor: '#E3F2FD' }]}>
            {isExporting ? (
              <ActivityIndicator size="small" color="#2196F3" />
            ) : (
              <Folder size={24} color="#2196F3" />
            )}
          </View>
          <View style={styles.settingContent}>
            <Text style={styles.settingTitle}>Export Backup to Folder</Text>
            <Text style={styles.settingDescription}>Save backup files to any folder you choose</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.dangerZone}>
        <Text style={styles.dangerZoneTitle}>DANGER ZONE</Text>

        <TouchableOpacity
          style={[styles.clearCacheCard, isClearingCache && styles.cardDisabled]}
          onPress={handleClearCache}
          disabled={isClearingCache}
          testID="devSettings.clearCache"
        >
          <View style={[styles.iconContainer, { backgroundColor: '#FFF3E0' }]}>
            {isClearingCache ? (
              <ActivityIndicator size="small" color="#E65100" />
            ) : (
              <Eraser size={24} color="#E65100" />
            )}
          </View>
          <View style={styles.settingContent}>
            <Text style={[styles.settingTitle, { color: '#E65100' }]}>
              {isClearingCache ? 'Clearing…' : 'Clear App Cache'}
            </Text>
            <Text style={styles.settingDescription}>
              Clears temporary data only — your passes & sales are safe
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dangerCard, isResetting && styles.cardDisabled]}
          onPress={handleClearAllData}
          disabled={isResetting}
          testID="devSettings.resetAllData"
        >
          <View style={[styles.iconContainer, { backgroundColor: '#FFEBEE' }]}>
            <Trash2 size={24} color="#D32F2F" />
          </View>
          <View style={styles.settingContent}>
            <Text style={[styles.settingTitle, { color: AppColors.accent }]}>
              {isResetting ? 'Resetting…' : 'Reset All Data'}
            </Text>
            <Text style={styles.settingDescription}>
              Remove all Season Pass v2 data from this device
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.devInfoCard}>
        <Text style={styles.devInfoLabel}>Canonical Data Version</Text>
        <Text style={styles.devInfoValue}>{CANONICAL_DATA_VERSION}</Text>
        <Text style={styles.devInfoLabel}>Storage Prefix</Text>
        <Text style={styles.devInfoValue}>{STORAGE_PREFIX}</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 18,
    paddingHorizontal: 14,
  },
  devBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  devBadgeText: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: '#92400E',
    letterSpacing: 1,
  },
  devCard: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
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
  cardDisabled: {
    opacity: 0.6,
  },
  dangerZone: {
    marginTop: 8,
    marginBottom: 20,
    paddingHorizontal: 14,
  },
  dangerZoneTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: AppColors.textLight,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  clearCacheCard: {
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    borderWidth: 1,
    borderColor: '#FFE0B2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 12,
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
  devInfoCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  devInfoLabel: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: '#92400E',
    letterSpacing: 0.5,
    marginBottom: 2,
    marginTop: 6,
  },
  devInfoValue: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#78350F',
    marginBottom: 4,
  },
});
