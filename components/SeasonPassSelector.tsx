import { useState, useCallback, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, ScrollView, Pressable, Alert } from 'react-native';
import { Image } from 'expo-image';
import { ChevronDown, Plus, Check, Pencil, Trash2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { AppColors } from '@/constants/appColors';
import { useSeasonPass } from '@/providers/SeasonPassProvider';
import { getTeamTheme } from '@/constants/teamThemes';

export default function SeasonPassSelector() {
  const router = useRouter();
  const { seasonPasses, activeSeasonPass, switchSeasonPass, deleteSeasonPass } = useSeasonPass();

  // version marker helps detect stale JS bundle
  useEffect(() => {
    console.log('[Selector] SeasonPassSelector v3 rendered, passes count:', seasonPasses.length);
  }, [seasonPasses.length]);
  const [isOpen, setIsOpen] = useState(false);
  // which pass is currently highlighted in modal
  const [selectedPassId, setSelectedPassId] = useState<string | null>(null);

  const handleSelect = useCallback(async (passId: string) => {
    console.log('[Selector] Switching to pass:', passId);
    await switchSeasonPass(passId);
    setIsOpen(false);
  }, [switchSeasonPass]);

  // when modal opens we want to highlight the current pass
  useEffect(() => {
    if (isOpen && activeSeasonPass) {
      setSelectedPassId(activeSeasonPass.id);
    }
  }, [isOpen, activeSeasonPass]);

  const handleAddNew = useCallback(() => {
    setIsOpen(false);
    router.push('/setup' as any);
  }, [router]);

  const handleEdit = useCallback((passId: string) => {
    setIsOpen(false);
    router.push({ pathname: '/edit-pass' as any, params: { passId } });
  }, [router]);

  const handleDelete = useCallback((passId: string) => {
    Alert.alert(
      'Delete Season Pass',
      'Are you sure you want to delete this season pass? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const count = await deleteSeasonPass(passId);
              if (count === 0) {
                // if no passes remain, push to setup
                router.replace('/setup' as any);
              }
            } catch (e) {
              console.error('[Selector] deleteSeasonPass error', e);
            }
          },
        },
      ],
    );
  }, [deleteSeasonPass, router]);

  if (!activeSeasonPass) return null;

  return (
    <>
      <TouchableOpacity style={styles.selector} onPress={() => setIsOpen(true)} activeOpacity={0.8}>
        {activeSeasonPass.teamLogoUrl ? (
          <Image source={{ uri: activeSeasonPass.teamLogoUrl }} style={styles.teamLogo} contentFit="contain" />
        ) : (
          <View style={[styles.teamLogo, styles.logoPlaceholder]} />
        )}
        <View style={styles.selectorInfo}>
          <Text style={styles.teamName} numberOfLines={1}>{activeSeasonPass.teamName}</Text>
          <Text style={styles.seasonLabel}>{activeSeasonPass.seasonLabel}</Text>
        </View>
        <ChevronDown size={20} color={AppColors.white} />
      </TouchableOpacity>

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setIsOpen(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Season Passes</Text>
              <TouchableOpacity onPress={() => setIsOpen(false)} style={styles.doneButton}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
            >
              {seasonPasses.map(pass => {
                const passTheme = getTeamTheme(pass.teamId);
                const isSelected = pass.id === selectedPassId;
                return (
                  <TouchableOpacity
                    key={pass.id}
                    style={[styles.card, isSelected && { borderColor: passTheme.primary }]}
                    onPress={() => setSelectedPassId(pass.id)}
                    activeOpacity={0.7}
                  >
                    {pass.teamLogoUrl ? (
                      <Image source={{ uri: pass.teamLogoUrl }} style={styles.cardLogo} contentFit="contain" />
                    ) : (
                      <View style={[styles.cardLogo, styles.logoPlaceholder]} />
                    )}
                    <Text style={styles.cardName} numberOfLines={1}>{pass.teamName}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.card, styles.addCard]}
                onPress={handleAddNew}
                activeOpacity={0.7}
              >
                <Plus size={24} color={AppColors.accent} />
                <Text style={styles.cardName}>Add</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.actionRow}>
              <TouchableOpacity
                disabled={!selectedPassId || selectedPassId === activeSeasonPass?.id}
                onPress={() => selectedPassId && handleEdit(selectedPassId)}
                style={styles.actionButton}
                activeOpacity={0.7}
              >
                <Pencil size={18} color={AppColors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                disabled={!selectedPassId}
                onPress={() => selectedPassId && handleDelete(selectedPassId)}
                style={styles.actionButton}
                activeOpacity={0.7}
              >
                <Trash2 size={18} color={AppColors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity
                disabled={!selectedPassId}
                onPress={() => selectedPassId && handleSelect(selectedPassId)}
                style={styles.actionButton}
                activeOpacity={0.7}
              >
                <Check size={18} color={AppColors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  teamLogo: {
    width: 32,
    height: 32,
  },
  logoPlaceholder: {
    backgroundColor: AppColors.gray,
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  selectorInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.white,
  },
  seasonLabel: {
    fontSize: 12,
    color: AppColors.gold,
    fontWeight: '600',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: AppColors.white,
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: AppColors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  passesList: {
    maxHeight: 300,
  },
  passItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: AppColors.gray,
    overflow: 'hidden',
  },
  passSelectArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteButton: {
    width: 40,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(0,0,0,0.06)',
  },
  passColorDot: {
    width: 4,
    height: 32,
    borderRadius: 2,
    marginRight: 10,
  },
  editButton: {
    width: 40,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(0,0,0,0.06)',
  },
  passLogo: {
    width: 44,
    height: 44,
    marginRight: 12,
  },
  passInfo: {
    flex: 1,
  },
  passTeamName: {
    fontSize: 16,
    fontWeight: '700',
    color: AppColors.textPrimary,
  },
  passSeason: {
    fontSize: 13,
    color: AppColors.textSecondary,
    fontWeight: '500',
  },
  checkIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AppColors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.accent,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    gap: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: AppColors.white,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  doneButton: {
    padding: 6,
  },
  doneText: {
    fontSize: 16,
    color: AppColors.accent,
    fontWeight: '600',
  },
  horizontalList: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  card: {
    width: 100,
    alignItems: 'center',
    marginHorizontal: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardLogo: {
    width: 48,
    height: 48,
    marginBottom: 6,
  },
  cardName: {
    fontSize: 12,
    textAlign: 'center',
    color: AppColors.textPrimary,
  },
  addCard: {
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  actionButton: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
});
