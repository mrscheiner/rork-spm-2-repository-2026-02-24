import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, Modal, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Plus, Trash2, X, MapPin, Calendar, Ticket } from "lucide-react-native";
import { useMemo, useCallback, useState } from "react";
import * as Haptics from 'expo-haptics';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { AppColors } from "@/constants/appColors";
import { useSeasonPass } from "@/providers/SeasonPassProvider";
import { useEvents } from "@/providers/EventsProvider";
import { StandaloneEvent } from "@/constants/types";
import AppFooter from "@/components/AppFooter";
import { useAppTheme } from "@/components/AppThemeProvider";

interface EventFormData {
  eventName: string;
  venue: string;
  location: string;
  eventDate: Date;
  section: string;
  row: string;
  seats: string;
  pricePaid: string;
  priceSold: string;
  status: 'Pending' | 'Paid';
  notes: string;
}

const initialFormData: EventFormData = {
  eventName: '',
  venue: '',
  location: '',
  eventDate: new Date(),
  section: '',
  row: '',
  seats: '',
  pricePaid: '',
  priceSold: '',
  status: 'Pending',
  notes: '',
};

function EventsScreen() {
  const { activeSeasonPass } = useSeasonPass();
  const { events, addEvent, updateEvent, deleteEvent, isLoading } = useEvents();
  const { theme } = useAppTheme();
  const teamPrimaryColor = theme.primary;
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<StandaloneEvent | null>(null);
  const [formData, setFormData] = useState<EventFormData>(initialFormData);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const summary = useMemo(() => {
    let totalPaid = 0;
    let totalSold = 0;
    let pendingCount = 0;
    let paidCount = 0;

    events.forEach(event => {
      totalPaid += event.pricePaid;
      if (event.priceSold) {
        totalSold += event.priceSold;
      }
      if (event.status === 'Pending') pendingCount++;
      else paidCount++;
    });

    return {
      totalPaid,
      totalSold,
      profitLoss: totalSold - totalPaid,
      pendingCount,
      paidCount,
    };
  }, [events]);

  const parseSeatCount = (seats: string): number => {
    if (!seats) return 1;
    // Handle ranges like "1-4" or "24-25"
    const rangeMatch = seats.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      return Math.abs(end - start) + 1;
    }
    // Handle comma-separated like "1, 2, 3"
    const commaSplit = seats.split(/[,"]+/).filter(s => /\d+/.test(s));
    if (commaSplit.length > 1) return commaSplit.length;
    return 1;
  };

  const handleOpenAdd = useCallback(() => {
    setEditingEvent(null);
    setFormData(initialFormData);
    setShowAddModal(true);
  }, []);

  const handleOpenEdit = useCallback((event: StandaloneEvent) => {
    setEditingEvent(event);
    setFormData({
      eventName: event.eventName,
      venue: event.venue,
      location: event.location,
      eventDate: new Date(event.eventDate),
      section: event.section,
      row: event.row,
      seats: event.seats,
      pricePaid: event.pricePaid.toString(),
      priceSold: event.priceSold?.toString() || '',
      status: event.status,
      notes: event.notes || '',
    });
    setShowAddModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowAddModal(false);
    setEditingEvent(null);
    setFormData(initialFormData);
  }, []);

  const handleSave = useCallback(async () => {
    // Validation
    if (!formData.eventName.trim()) {
      Alert.alert('Required', 'Please enter an event name');
      return;
    }
    if (!formData.location.trim()) {
      Alert.alert('Required', 'Please enter a location');
      return;
    }
    if (!formData.pricePaid.trim()) {
      Alert.alert('Required', 'Please enter the price paid');
      return;
    }

    const pricePaid = parseFloat(formData.pricePaid) || 0;
    const priceSold = formData.priceSold ? parseFloat(formData.priceSold) : null;
    const seatCount = parseSeatCount(formData.seats);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      if (editingEvent) {
        await updateEvent(editingEvent.id, {
          eventName: formData.eventName.trim(),
          venue: formData.venue.trim(),
          location: formData.location.trim(),
          eventDate: formData.eventDate.toISOString(),
          section: formData.section.trim(),
          row: formData.row.trim(),
          seats: formData.seats.trim(),
          seatCount,
          pricePaid,
          priceSold,
          status: formData.status,
          notes: formData.notes.trim(),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', 'Event updated!');
      } else {
        await addEvent({
          eventName: formData.eventName.trim(),
          venue: formData.venue.trim(),
          location: formData.location.trim(),
          eventDate: formData.eventDate.toISOString(),
          section: formData.section.trim(),
          row: formData.row.trim(),
          seats: formData.seats.trim(),
          seatCount,
          pricePaid,
          priceSold,
          status: formData.status,
          notes: formData.notes.trim(),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', 'Event added!');
      }
      handleCloseModal();
    } catch (error) {
      Alert.alert('Error', 'Failed to save event');
    }
  }, [formData, editingEvent, addEvent, updateEvent, handleCloseModal]);

  const handleDeleteEvent = useCallback((event: StandaloneEvent) => {
    Alert.alert(
      'Delete Event',
      `Are you sure you want to delete "${event.eventName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await deleteEvent(event.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  }, [deleteEvent]);

  const formatEventDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={[...theme.gradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientTop}
      />
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <LinearGradient
            colors={[...theme.gradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <Text style={styles.headerTitle}>Events</Text>
            <Text style={styles.headerSubtitle}>Track your event tickets</Text>
            <Text style={styles.headerNote}>Concerts, shows, sports & more</Text>
          </LinearGradient>

          <View style={styles.summaryCards}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Cost</Text>
              <Text style={[styles.summaryValue, { color: AppColors.accent }]}>${summary.totalPaid.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Revenue</Text>
              <Text style={[styles.summaryValue, { color: AppColors.success }]}>${summary.totalSold.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Net</Text>
              <Text style={[styles.summaryValue, { color: summary.profitLoss >= 0 ? AppColors.success : AppColors.accent }]}>
                {summary.profitLoss >= 0 ? '+' : ''}${summary.profitLoss.toFixed(2)}
              </Text>
            </View>
          </View>

          <View style={styles.eventsSection}>
            <View style={styles.eventsSectionHeader}>
              <Text style={styles.eventsTitle}>All Events ({events.length})</Text>
              <TouchableOpacity 
                style={[styles.addButton, { backgroundColor: teamPrimaryColor }]}
                onPress={handleOpenAdd}
              >
                <Plus size={20} color={AppColors.white} />
                <Text style={styles.addButtonText}>Add Event</Text>
              </TouchableOpacity>
            </View>

            {events.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ticket size={48} color={AppColors.iconGray} style={{ marginBottom: 16 }} />
                <Text style={styles.emptyText}>No events yet</Text>
                <Text style={styles.emptySubtext}>
                  Add events like concerts, shows, or other tickets to track your ticket sales
                </Text>
              </View>
            ) : (
              events.map((event) => (
                <TouchableOpacity 
                  key={event.id} 
                  style={styles.eventCard}
                  onPress={() => handleOpenEdit(event)}
                  activeOpacity={0.7}
                >
                  <View style={styles.eventHeader}>
                    <View style={styles.eventTitleRow}>
                      <Text style={styles.eventName} numberOfLines={1}>{event.eventName}</Text>
                      <View style={[
                        styles.statusBadge, 
                        { backgroundColor: event.status === 'Paid' ? AppColors.success : '#FFA726' }
                      ]}>
                        <Text style={styles.statusText}>{event.status}</Text>
                      </View>
                    </View>
                    <TouchableOpacity 
                      style={styles.deleteButton}
                      onPress={() => handleDeleteEvent(event)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Trash2 size={18} color={AppColors.accent} />
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.eventMeta}>
                    <View style={styles.eventMetaRow}>
                      <Calendar size={14} color={AppColors.textSecondary} />
                      <Text style={styles.eventMetaText}>{formatEventDate(event.eventDate)}</Text>
                    </View>
                    <View style={styles.eventMetaRow}>
                      <MapPin size={14} color={AppColors.textSecondary} />
                      <Text style={styles.eventMetaText} numberOfLines={1}>
                        {event.venue ? `${event.venue}, ` : ''}{event.location}
                      </Text>
                    </View>
                  </View>

                  {(event.section || event.row || event.seats) && (
                    <View style={styles.seatInfo}>
                      <Ticket size={14} color={AppColors.textSecondary} />
                      <Text style={styles.seatInfoText}>
                        {[
                          event.section && `Sec ${event.section}`,
                          event.row && `Row ${event.row}`,
                          event.seats && `Seat${event.seatCount > 1 ? 's' : ''} ${event.seats}`,
                        ].filter(Boolean).join(' • ')}
                      </Text>
                    </View>
                  )}

                  <View style={styles.eventPricing}>
                    <View style={styles.priceItem}>
                      <Text style={styles.priceLabel}>Paid</Text>
                      <Text style={[styles.priceValue, { color: AppColors.accent }]}>
                        ${event.pricePaid.toFixed(2)}
                      </Text>
                    </View>
                    <View style={styles.priceItem}>
                      <Text style={styles.priceLabel}>Sold</Text>
                      <Text style={[styles.priceValue, { color: event.priceSold ? AppColors.success : AppColors.textLight }]}>
                        {event.priceSold ? `$${event.priceSold.toFixed(2)}` : '—'}
                      </Text>
                    </View>
                    <View style={styles.priceItem}>
                      <Text style={styles.priceLabel}>Net</Text>
                      <Text style={[
                        styles.priceValue, 
                        { color: event.priceSold 
                          ? (event.priceSold - event.pricePaid >= 0 ? AppColors.success : AppColors.accent)
                          : AppColors.textLight 
                        }
                      ]}>
                        {event.priceSold 
                          ? `${event.priceSold - event.pricePaid >= 0 ? '+' : ''}$${(event.priceSold - event.pricePaid).toFixed(2)}`
                          : '—'
                        }
                      </Text>
                    </View>
                  </View>

                  {event.notes && (
                    <Text style={styles.eventNotes} numberOfLines={2}>{event.notes}</Text>
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>

          <AppFooter />
        </ScrollView>
      </SafeAreaView>

      {/* Add/Edit Event Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseModal}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <SafeAreaView style={styles.modalSafeArea} edges={['top']}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={handleCloseModal} style={styles.modalCloseButton}>
                <X size={24} color={AppColors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {editingEvent ? 'Edit Event' : 'Add Event'}
              </Text>
              <TouchableOpacity onPress={handleSave} style={styles.modalSaveButton}>
                <Text style={[styles.modalSaveText, { color: teamPrimaryColor }]}>Save</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {/* Event Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Event Name *</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.eventName}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, eventName: text }))}
                  placeholder="e.g., Taylor Swift, Super Bowl, etc."
                  placeholderTextColor={AppColors.textLight}
                />
              </View>

              {/* Venue */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Venue</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.venue}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, venue: text }))}
                  placeholder="e.g., Hard Rock Stadium"
                  placeholderTextColor={AppColors.textLight}
                />
              </View>

              {/* Location */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Location *</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.location}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, location: text }))}
                  placeholder="e.g., Miami, FL"
                  placeholderTextColor={AppColors.textLight}
                />
              </View>

              {/* Event Date */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Event Date *</Text>
                <TouchableOpacity 
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Calendar size={20} color={AppColors.textSecondary} />
                  <Text style={styles.dateButtonText}>
                    {formData.eventDate.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={formData.eventDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event: DateTimePickerEvent, date?: Date) => {
                      setShowDatePicker(Platform.OS === 'ios');
                      if (date) {
                        setFormData(prev => ({ ...prev, eventDate: date }));
                      }
                    }}
                  />
                )}
              </View>

              {/* Seat Info */}
              <Text style={styles.sectionHeader}>Seat Information</Text>
              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Section</Text>
                  <TextInput
                    style={styles.textInput}
                    value={formData.section}
                    onChangeText={(text) => setFormData(prev => ({ ...prev, section: text }))}
                    placeholder="e.g., 101"
                    placeholderTextColor={AppColors.textLight}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Row</Text>
                  <TextInput
                    style={styles.textInput}
                    value={formData.row}
                    onChangeText={(text) => setFormData(prev => ({ ...prev, row: text }))}
                    placeholder="e.g., A"
                    placeholderTextColor={AppColors.textLight}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Seat(s)</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.seats}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, seats: text }))}
                  placeholder="e.g., 1-2 or 5, 6, 7"
                  placeholderTextColor={AppColors.textLight}
                />
              </View>

              {/* Pricing */}
              <Text style={styles.sectionHeader}>Pricing</Text>
              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Price Paid *</Text>
                  <View style={styles.priceInputWrapper}>
                    <Text style={styles.currencySymbol}>$</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={formData.pricePaid}
                      onChangeText={(text) => setFormData(prev => ({ ...prev, pricePaid: text.replace(/[^0-9.]/g, '') }))}
                      placeholder="0.00"
                      placeholderTextColor={AppColors.textLight}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Price Sold</Text>
                  <View style={styles.priceInputWrapper}>
                    <Text style={styles.currencySymbol}>$</Text>
                    <TextInput
                      style={styles.priceInput}
                      value={formData.priceSold}
                      onChangeText={(text) => setFormData(prev => ({ ...prev, priceSold: text.replace(/[^0-9.]/g, '') }))}
                      placeholder="0.00"
                      placeholderTextColor={AppColors.textLight}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              </View>

              {/* Status */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Payment Status</Text>
                <View style={styles.statusToggle}>
                  <TouchableOpacity
                    style={[
                      styles.statusOption,
                      formData.status === 'Pending' && styles.statusOptionActive,
                      formData.status === 'Pending' && { backgroundColor: '#FFA726' },
                    ]}
                    onPress={() => setFormData(prev => ({ ...prev, status: 'Pending' }))}
                  >
                    <Text style={[
                      styles.statusOptionText,
                      formData.status === 'Pending' && styles.statusOptionTextActive,
                    ]}>Pending</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.statusOption,
                      formData.status === 'Paid' && styles.statusOptionActive,
                      formData.status === 'Paid' && { backgroundColor: AppColors.success },
                    ]}
                    onPress={() => setFormData(prev => ({ ...prev, status: 'Paid' }))}
                  >
                    <Text style={[
                      styles.statusOptionText,
                      formData.status === 'Paid' && styles.statusOptionTextActive,
                    ]}>Paid</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Notes */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Notes</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={formData.notes}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, notes: text }))}
                  placeholder="Any additional notes..."
                  placeholderTextColor={AppColors.textLight}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              <View style={{ height: 40 }} />
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
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
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: AppColors.white,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: AppColors.gold,
  },
  headerNote: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  summaryCards: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    marginTop: -16,
    gap: 6,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: AppColors.white,
    borderRadius: 10,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryLabel: {
    fontSize: 11,
    color: AppColors.textSecondary,
    marginBottom: 4,
    fontWeight: '600' as const,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
  eventsSection: {
    padding: 14,
  },
  eventsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  eventsTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: AppColors.textPrimary,
  },
  addButton: {
    backgroundColor: AppColors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: AppColors.white,
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
    lineHeight: 20,
  },
  eventCard: {
    backgroundColor: AppColors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  eventTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 8,
  },
  eventName: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: AppColors.textPrimary,
    flex: 1,
  },
  deleteButton: {
    padding: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: AppColors.white,
  },
  eventMeta: {
    gap: 4,
    marginBottom: 10,
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventMetaText: {
    fontSize: 13,
    color: AppColors.textSecondary,
    flex: 1,
  },
  seatInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F5F5F7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  seatInfoText: {
    fontSize: 13,
    color: AppColors.textSecondary,
    fontWeight: '500' as const,
  },
  eventPricing: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
    paddingTop: 12,
  },
  priceItem: {
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 11,
    color: AppColors.textLight,
    marginBottom: 2,
    fontWeight: '500' as const,
  },
  priceValue: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
  eventNotes: {
    fontSize: 12,
    color: AppColors.textLight,
    fontStyle: 'italic',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: AppColors.background,
  },
  modalSafeArea: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: AppColors.white,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: AppColors.textPrimary,
  },
  modalSaveButton: {
    padding: 4,
  },
  modalSaveText: {
    fontSize: 17,
    fontWeight: '600' as const,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: AppColors.textSecondary,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: AppColors.white,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: AppColors.textPrimary,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: AppColors.textPrimary,
    marginTop: 8,
    marginBottom: 12,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  dateButton: {
    backgroundColor: AppColors.white,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateButtonText: {
    fontSize: 16,
    color: AppColors.textPrimary,
  },
  priceInputWrapper: {
    backgroundColor: AppColors.white,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySymbol: {
    fontSize: 16,
    color: AppColors.textSecondary,
    marginRight: 4,
  },
  priceInput: {
    flex: 1,
    fontSize: 16,
    color: AppColors.textPrimary,
    padding: 0,
  },
  statusToggle: {
    flexDirection: 'row',
    gap: 12,
  },
  statusOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: AppColors.white,
    borderWidth: 1,
    borderColor: AppColors.border,
    alignItems: 'center',
  },
  statusOptionActive: {
    borderWidth: 0,
  },
  statusOptionText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: AppColors.textSecondary,
  },
  statusOptionTextActive: {
    color: AppColors.white,
  },
});

export default EventsScreen;
