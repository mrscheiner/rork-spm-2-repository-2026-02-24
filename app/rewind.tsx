import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { History, RotateCcw, Clock, Database, ChevronRight, ChevronLeft, Ticket } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { useSeasonPass, RewindBackup } from '@/providers/SeasonPassProvider';
import { useEvents, EventsRewindBackup } from '@/providers/EventsProvider';
import { AppColors } from '@/constants/appColors';

type CombinedBackup = {
  type: 'seasonpass' | 'events';
  id: string;
  timestamp: string;
  label: string;
  count: number;
  countLabel: string;
  original: RewindBackup | EventsRewindBackup;
};

export default function RewindScreen() {
  const router = useRouter();
  const { rewindBackups, revertToBackup, activeSeasonPass } = useSeasonPass();
  const { eventsRewindBackups, revertEventsToBackup } = useEvents();
  const [isReverting, setIsReverting] = useState<string | null>(null);

  const teamPrimaryColor = activeSeasonPass?.teamPrimaryColor || AppColors.primary;

  // Combine and sort all backups by timestamp
  const combinedBackups: CombinedBackup[] = [
    ...rewindBackups.map(b => ({
      type: 'seasonpass' as const,
      id: b.id,
      timestamp: b.timestamp,
      label: b.label,
      count: b.salesCount,
      countLabel: `${b.salesCount} sales`,
      original: b,
    })),
    ...eventsRewindBackups.map(b => ({
      type: 'events' as const,
      id: b.id,
      timestamp: b.timestamp,
      label: b.label,
      count: b.eventCount,
      countLabel: `${b.eventCount} events`,
      original: b,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const handleRevert = useCallback(async (backup: CombinedBackup) => {
    const isEvent = backup.type === 'events';
    const typeLabel = isEvent ? 'Events' : 'Season Pass';
    
    Alert.alert(
      'Rewind to this point?',
      `This will restore your ${typeLabel} data to: "${backup.label}" (${backup.countLabel}).\n\nYour current data will be saved as a new rewind point before reverting.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rewind',
          style: 'destructive',
          onPress: async () => {
            setIsReverting(backup.id);
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              
              let result;
              if (isEvent) {
                result = await revertEventsToBackup(backup.id);
              } else {
                result = await revertToBackup(backup.id);
              }
              
              if (result.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('Success', `${typeLabel} data has been restored to the selected point.`);
              } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert('Error', result.error || 'Failed to revert. Please try again.');
              }
            } catch (e) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Error', 'An unexpected error occurred.');
            } finally {
              setIsReverting(null);
            }
          },
        },
      ],
    );
  }, [revertToBackup, revertEventsToBackup]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ChevronLeft size={24} color={AppColors.textPrimary} />
          <Text style={styles.backButtonText}>Settings</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <View style={styles.headerIcon}>
            <History size={28} color={teamPrimaryColor} />
          </View>
          <Text style={styles.headerTitle}>Rewind</Text>
          <Text style={styles.headerSubtitle}>Restore to a previous point</Text>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {combinedBackups.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Clock size={48} color={AppColors.iconGray} />
            </View>
            <Text style={styles.emptyTitle}>No Rewind Points</Text>
            <Text style={styles.emptyText}>
              Rewind points are automatically created when you add sales, remove sales, import data, or make changes to events.
              {'\n\n'}
              Make a change to create your first rewind point.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionInfo}>
              Last {combinedBackups.length} change{combinedBackups.length !== 1 ? 's' : ''} saved. 
              Tap any point to restore your data to that state.
            </Text>
            
            {combinedBackups.map((backup, index) => (
              <TouchableOpacity
                key={backup.id}
                style={[
                  styles.backupCard,
                  index === 0 && styles.backupCardLatest,
                  isReverting === backup.id && styles.backupCardDisabled,
                ]}
                onPress={() => handleRevert(backup)}
                disabled={isReverting !== null}
              >
                <View style={[styles.backupIconContainer, { backgroundColor: index === 0 ? `${teamPrimaryColor}20` : '#F3F4F6' }]}>
                  {isReverting === backup.id ? (
                    <ActivityIndicator size="small" color={teamPrimaryColor} />
                  ) : (
                    <RotateCcw size={20} color={index === 0 ? teamPrimaryColor : AppColors.iconGray} />
                  )}
                </View>
                
                <View style={styles.backupContent}>
                  <View style={styles.backupHeader}>
                    <Text style={[styles.backupLabel, index === 0 && { color: teamPrimaryColor }]} numberOfLines={1}>
                      {backup.label}
                    </Text>
                    <View style={styles.badgeRow}>
                      <View style={[styles.typeBadge, { backgroundColor: backup.type === 'events' ? '#E8F5E9' : '#E3F2FD' }]}>
                        {backup.type === 'events' ? (
                          <Ticket size={10} color="#4CAF50" />
                        ) : (
                          <Database size={10} color="#1976D2" />
                        )}
                        <Text style={[styles.typeBadgeText, { color: backup.type === 'events' ? '#4CAF50' : '#1976D2' }]}>
                          {backup.type === 'events' ? 'Events' : 'Sales'}
                        </Text>
                      </View>
                      {index === 0 && (
                        <View style={[styles.latestBadge, { backgroundColor: teamPrimaryColor }]}>
                          <Text style={styles.latestBadgeText}>Latest</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  
                  <View style={styles.backupMeta}>
                    <View style={styles.metaItem}>
                      {backup.type === 'events' ? (
                        <Ticket size={12} color={AppColors.textSecondary} />
                      ) : (
                        <Database size={12} color={AppColors.textSecondary} />
                      )}
                      <Text style={styles.metaText}>{backup.countLabel}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Clock size={12} color={AppColors.textSecondary} />
                      <Text style={styles.metaText}>{formatDate(backup.timestamp)}</Text>
                    </View>
                  </View>
                </View>
                
                <ChevronRight size={20} color={AppColors.iconGray} />
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.background,
  },
  header: {
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: AppColors.white,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginLeft: -8,
  },
  backButtonText: {
    fontSize: 17,
    color: AppColors.textPrimary,
    marginLeft: 4,
  },
  headerContent: {
    alignItems: 'center',
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: AppColors.textPrimary,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: AppColors.textSecondary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionInfo: {
    fontSize: 13,
    color: AppColors.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: AppColors.textPrimary,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: AppColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  backupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  backupCardLatest: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  backupCardDisabled: {
    opacity: 0.6,
  },
  backupIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  backupContent: {
    flex: 1,
  },
  backupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  backupLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: AppColors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  latestBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  latestBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  backupMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: AppColors.textSecondary,
  },
});
