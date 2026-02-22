import { Tabs, useRouter } from "expo-router";
import { Home, Calendar, TrendingUp, Ticket, Settings, CheckCircle, AlertCircle } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { View, ActivityIndicator, StyleSheet, Text, Platform, Animated } from "react-native";

import { AppColors } from "@/constants/appColors";
import { useAppTheme } from "../../components/AppThemeProvider";
import { useSeasonPass } from "@/providers/SeasonPassProvider";

export default function TabLayout() {
  const { theme } = useAppTheme();
  const router = useRouter();
  const { isLoading, needsSetup, activeSeasonPass, backupConfirmationMessage, lastBackupStatus, lastBackupTime } = useSeasonPass();
  console.log('[TabLayout] render - isLoading:', isLoading, 'needsSetup:', needsSetup, 'activePass:', activeSeasonPass?.teamName);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isLoading && needsSetup) {
      console.log('[TabLayout] Redirecting to setup...');
      router.replace('/setup' as any);
    }
  }, [isLoading, needsSetup, router]);

  useEffect(() => {
    if (backupConfirmationMessage) {
      console.log('[TabLayout] Showing backup toast:', backupConfirmationMessage);
      Animated.sequence([
        Animated.timing(toastOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.delay(2500),
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [backupConfirmationMessage, toastOpacity]);

  const shouldShowToast = !!backupConfirmationMessage && !!lastBackupStatus;
  const BackupToast = shouldShowToast ? (
    <Animated.View 
      style={[
        styles.backupToast, 
        { 
          opacity: toastOpacity,
          backgroundColor: lastBackupStatus === 'success' ? '#10B981' : '#EF4444',
        }
      ]} 
      pointerEvents="none"
    >
      {lastBackupStatus === 'success' ? (
        <CheckCircle size={16} color="#FFFFFF" />
      ) : (
        <AlertCircle size={16} color="#FFFFFF" />
      )}
      <Text style={styles.backupToastText}>
        {backupConfirmationMessage 
          ? String(backupConfirmationMessage).replace(/ \d+$/, '') 
          : (lastBackupStatus === 'success' ? 'Backup saved' : 'Backup failed')}
      </Text>
      {!!lastBackupTime && lastBackupStatus === 'success' ? (
        <Text style={styles.backupToastTime}>{`• ${lastBackupTime}`}</Text>
      ) : null}
    </Animated.View>
  ) : null;
  return (
    <>
      {Platform.OS === 'web' && (
        <View style={styles.webWrapper}>
          <View style={styles.webBanner}>
            <Text style={styles.webBannerText}>
              Viewing web preview — for native mobile testing scan the QR in the Expo Go app.
            </Text>
          </View>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Tabs screenOptions={{ headerShown: false }}>
          <Tabs.Screen
            name="index"
            options={{
              title: "Home",
              tabBarIcon: ({ color, size }) => <Home color={color} size={size} />, 
            }}
          />
          <Tabs.Screen
            name="schedule"
            options={{
              title: "Schedule",
              tabBarIcon: ({ color, size }) => <Calendar color={color} size={size} />, 
            }}
          />
          <Tabs.Screen
            name="analytics"
            options={{
              title: "Analytics",
              tabBarIcon: ({ color, size }) => <TrendingUp color={color} size={size} />, 
            }}
          />
          <Tabs.Screen
            name="events"
            options={{
              title: "Events",
              tabBarIcon: ({ color, size }) => <Ticket color={color} size={size} />, 
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: "Settings",
              tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />, 
            }}
          />
        </Tabs>
      </View>
      {BackupToast}
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: AppColors.background,
  },
  webWrapper: {
    flex: 1,
    maxWidth: 420,
    marginHorizontal: 'auto',
    backgroundColor: AppColors.background,
  },
  webBanner: {
    backgroundColor: '#FFF4E5',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  webBannerText: {
    fontSize: 13,
    color: '#664E14',
    textAlign: 'center',
  },
  backupToast: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 9999,
  },
  backupToastText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  backupToastTime: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: 'rgba(255, 255, 255, 0.85)',
  },
});
