import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StandaloneEvent } from '@/constants/types';

const EVENTS_STORAGE_KEY = 'standalone_events_v1';
const EVENTS_REWIND_KEY = 'events_rewind_backups_v1';
const MAX_REWIND_BACKUPS = 10;

export interface EventsRewindBackup {
  id: string;
  timestamp: string;
  label: string;
  eventCount: number;
  events: StandaloneEvent[];
}

interface EventsContextType {
  events: StandaloneEvent[];
  isLoading: boolean;
  addEvent: (event: Omit<StandaloneEvent, 'id' | 'createdAt'>) => Promise<void>;
  updateEvent: (id: string, updates: Partial<StandaloneEvent>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  getEventById: (id: string) => StandaloneEvent | undefined;
  // Rewind functionality
  eventsRewindBackups: EventsRewindBackup[];
  revertEventsToBackup: (backupId: string) => Promise<{ success: boolean; error?: string }>;
}

const EventsContext = createContext<EventsContextType | undefined>(undefined);

export function useEvents() {
  const context = useContext(EventsContext);
  if (!context) {
    throw new Error('useEvents must be used within an EventsProvider');
  }
  return context;
}

interface EventsProviderProps {
  children: ReactNode;
}

export function EventsProvider({ children }: EventsProviderProps) {
  const [events, setEvents] = useState<StandaloneEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [eventsRewindBackups, setEventsRewindBackups] = useState<EventsRewindBackup[]>([]);

  // Load events and rewind backups from storage on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load events
        const storedEvents = await AsyncStorage.getItem(EVENTS_STORAGE_KEY);
        if (storedEvents) {
          const parsed = JSON.parse(storedEvents) as StandaloneEvent[];
          parsed.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
          setEvents(parsed);
        }
        
        // Load rewind backups
        const storedBackups = await AsyncStorage.getItem(EVENTS_REWIND_KEY);
        if (storedBackups) {
          const backups = JSON.parse(storedBackups) as EventsRewindBackup[];
          setEventsRewindBackups(backups);
          console.log('[EventsProvider] Loaded', backups.length, 'rewind backups');
        }
      } catch (error) {
        console.error('[EventsProvider] Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // Save events to storage
  const saveEvents = useCallback(async (newEvents: StandaloneEvent[]) => {
    try {
      await AsyncStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(newEvents));
    } catch (error) {
      console.error('[EventsProvider] Error saving events:', error);
    }
  }, []);

  // Save a rewind backup before making changes
  const saveRewindBackup = useCallback(async (currentEvents: StandaloneEvent[], label: string) => {
    try {
      console.log('[EventsRewind] Saving rewind backup:', label);
      
      const newBackup: EventsRewindBackup = {
        id: `events_rewind_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        label,
        eventCount: currentEvents.length,
        events: [...currentEvents],
      };
      
      // Load existing backups
      let existingBackups: EventsRewindBackup[] = [];
      try {
        const stored = await AsyncStorage.getItem(EVENTS_REWIND_KEY);
        if (stored) {
          existingBackups = JSON.parse(stored);
        }
      } catch (e) {
        console.warn('[EventsRewind] Could not load existing backups:', e);
      }
      
      // Add new backup at the beginning, keep only last MAX_REWIND_BACKUPS
      const updatedBackups = [newBackup, ...existingBackups].slice(0, MAX_REWIND_BACKUPS);
      
      await AsyncStorage.setItem(EVENTS_REWIND_KEY, JSON.stringify(updatedBackups));
      setEventsRewindBackups(updatedBackups);
      
      console.log('[EventsRewind] ✅ Saved rewind backup, total:', updatedBackups.length);
    } catch (e) {
      console.error('[EventsRewind] ❌ Failed to save rewind backup:', e);
    }
  }, []);

  // Revert to a previous backup
  const revertEventsToBackup = useCallback(async (backupId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const backup = eventsRewindBackups.find(b => b.id === backupId);
      if (!backup) {
        return { success: false, error: 'Backup not found' };
      }
      
      // Save current state before reverting
      await saveRewindBackup(events, `Before revert (${events.length} events)`);
      
      // Restore the events from backup
      const restoredEvents = [...backup.events];
      restoredEvents.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
      
      setEvents(restoredEvents);
      await saveEvents(restoredEvents);
      
      console.log('[EventsRewind] ✅ Reverted to backup:', backup.label);
      return { success: true };
    } catch (e) {
      console.error('[EventsRewind] ❌ Failed to revert:', e);
      return { success: false, error: String(e) };
    }
  }, [eventsRewindBackups, events, saveRewindBackup, saveEvents]);

  const addEvent = useCallback(async (eventData: Omit<StandaloneEvent, 'id' | 'createdAt'>) => {
    // Save rewind backup before adding
    await saveRewindBackup(events, `Before adding event (${events.length} events)`);
    
    const newEvent: StandaloneEvent = {
      ...eventData,
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };
    
    const updatedEvents = [newEvent, ...events];
    // Sort by event date descending
    updatedEvents.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
    
    setEvents(updatedEvents);
    await saveEvents(updatedEvents);
  }, [events, saveEvents, saveRewindBackup]);

  const updateEvent = useCallback(async (id: string, updates: Partial<StandaloneEvent>) => {
    // Save rewind backup before updating
    const eventToUpdate = events.find(e => e.id === id);
    await saveRewindBackup(events, `Before updating "${eventToUpdate?.eventName || 'event'}"`);
    
    const updatedEvents = events.map(event => 
      event.id === id ? { ...event, ...updates } : event
    );
    // Re-sort in case event date changed
    updatedEvents.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
    
    setEvents(updatedEvents);
    await saveEvents(updatedEvents);
  }, [events, saveEvents, saveRewindBackup]);

  const deleteEvent = useCallback(async (id: string) => {
    // Save rewind backup before deleting
    const eventToDelete = events.find(e => e.id === id);
    await saveRewindBackup(events, `Before deleting "${eventToDelete?.eventName || 'event'}"`);
    
    const updatedEvents = events.filter(event => event.id !== id);
    setEvents(updatedEvents);
    await saveEvents(updatedEvents);
  }, [events, saveEvents, saveRewindBackup]);

  const getEventById = useCallback((id: string) => {
    return events.find(event => event.id === id);
  }, [events]);

  return (
    <EventsContext.Provider
      value={{
        events,
        isLoading,
        addEvent,
        updateEvent,
        deleteEvent,
        getEventById,
        eventsRewindBackups,
        revertEventsToBackup,
      }}
    >
      {children}
    </EventsContext.Provider>
  );
}
