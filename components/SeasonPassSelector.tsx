import { useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { ChevronDown, Plus, Check, Pencil } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { AppColors } from '@/constants/appColors';
import { useAppTheme } from './AppThemeProvider';
import { useSeasonPass } from '@/providers/SeasonPassProvider';
import { getTeamTheme } from '@/constants/teamThemes';

export default function SeasonPassSelector() {
    const insets = typeof useSafeAreaInsets === 'function' ? useSafeAreaInsets() : { bottom: 0 };
  const { theme, setTheme } = useAppTheme();
  const router = useRouter();
  const { seasonPasses, activeSeasonPass, switchSeasonPass } = useSeasonPass();
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = useCallback(async (passId: string) => {
    console.log('[Selector] Switching to pass:', passId);
    await switchSeasonPass(passId);
    const selectedPass = seasonPasses.find(p => p.id === passId);
    if (selectedPass) {
      const teamTheme = getTeamTheme(selectedPass.teamId);
      setTheme(teamTheme);
    }
    setIsOpen(false);
  }, [switchSeasonPass, seasonPasses, setTheme]);

  const handleAddNew = useCallback(() => {
    setIsOpen(false);
    router.push('/setup' as any);
  }, [router]);

  const handleEdit = useCallback((passId: string) => {
    setIsOpen(false);
    router.push({ pathname: '/edit-pass' as any, params: { passId } });
  }, [router]);

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
          <View style={[styles.modalContent, { flexDirection: 'column', alignItems: 'stretch' }]}> 
            <Text style={styles.modalTitle}>Season Passes</Text>
            <FlatList
              data={seasonPasses}
              keyExtractor={pass => pass.id}
              renderItem={({ item: pass }) => {
                const passTheme = getTeamTheme(pass.teamId);
                const isActive = pass.id === activeSeasonPass.id;
                return (
                  <View style={[styles.passItem, isActive && { backgroundColor: passTheme.primary }]}> 
                    <TouchableOpacity
                      style={styles.passSelectArea}
                      onPress={() => handleSelect(pass.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.passColorDot, { backgroundColor: passTheme.primary }]} />
                      {pass.teamLogoUrl ? (
                        <Image source={{ uri: pass.teamLogoUrl }} style={styles.passLogo} contentFit="contain" />
                      ) : (
                        <View style={[styles.passLogo, styles.logoPlaceholder]} />
                      )}
                      <View style={styles.passInfo}>
                        <Text style={[styles.passTeamName, isActive && { color: passTheme.textOnPrimary }]}>{pass.teamName}</Text>
                        <Text style={[styles.passSeason, isActive && { color: passTheme.textOnPrimary, opacity: 0.8 }]}>{pass.seasonLabel}</Text>
                      </View>
                      {isActive && (
                        <View style={styles.checkIcon}>
                          <Check size={18} color={AppColors.white} />
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.editButton, isActive && { backgroundColor: 'rgba(255,255,255,0.2)' }]}
                      onPress={() => handleEdit(pass.id)}
                      activeOpacity={0.7}
                    >
                      <Pencil size={16} color={isActive ? passTheme.textOnPrimary : AppColors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                );
              }}
              style={[styles.passesList, { flexGrow: 1, maxHeight: '60%' }]}
              contentContainerStyle={{ paddingBottom: (insets.bottom || 0) + 72 }}
              showsVerticalScrollIndicator={false}
              snapToInterval={52}
              decelerationRate="fast"
              pagingEnabled
            />
            <TouchableOpacity style={styles.addButton} onPress={handleAddNew}>
              <Plus size={20} color={AppColors.white} />
              <Text style={styles.addButtonText}>Add Season Pass</Text>
            </TouchableOpacity>
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
    borderRadius: 8,
    marginBottom: 2,
    backgroundColor: AppColors.gray,
    overflow: 'hidden',
    minHeight: 48,
    paddingVertical: 4,
  },
  passSelectArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  passColorDot: {
    width: 3,
    height: 24,
    borderRadius: 2,
    marginRight: 6,
  },
  editButton: {
    width: 32,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(0,0,0,0.06)',
  },
  passLogo: {
    width: 24,
    height: 24,
    marginRight: 6,
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
});
