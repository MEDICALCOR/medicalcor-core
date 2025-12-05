'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  AppNotification,
  NotificationPermissionState,
  NotificationPreferences,
  PushNotificationPayload,
} from './types';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './types';

const PREFERENCES_KEY = 'medicalcor_notification_preferences';

function getStoredPreferences(): NotificationPreferences {
  if (typeof window === 'undefined') return DEFAULT_NOTIFICATION_PREFERENCES;

  try {
    const stored = localStorage.getItem(PREFERENCES_KEY);
    if (stored) {
      return {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ...JSON.parse(stored),
      } as NotificationPreferences;
    }
  } catch (error) {
    // Invalid JSON stored in localStorage, use defaults
    if (process.env.NODE_ENV === 'development') {
      console.debug('[notifications] Failed to parse stored preferences:', error);
    }
  }
  return DEFAULT_NOTIFICATION_PREFERENCES;
}

function storePreferences(preferences: NotificationPreferences) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermissionState>('default');
  const [preferences, setPreferencesState] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [isSupported, setIsSupported] = useState(false);

  // Initialize on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsSupported(true);
      setPermission(Notification.permission as NotificationPermissionState);
      setPreferencesState(getStoredPreferences());
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result as NotificationPermissionState);
      return result === 'granted';
    } catch {
      return false;
    }
  }, [isSupported]);

  const setPreferences = useCallback((newPrefs: Partial<NotificationPreferences>) => {
    setPreferencesState((prev) => {
      const updated = { ...prev, ...newPrefs };
      storePreferences(updated);
      return updated;
    });
  }, []);

  const showNotification = useCallback(
    (payload: PushNotificationPayload) => {
      if (!isSupported || permission !== 'granted' || !preferences.enabled) {
        return null;
      }

      const notification = new Notification(payload.title, {
        body: payload.body,
        icon: payload.icon ?? '/icons/icon-192x192.png',
        badge: payload.badge ?? '/icons/badge-72x72.png',
        tag: payload.tag,
        data: payload.data,
        requireInteraction: payload.requireInteraction ?? false,
      });

      // Play sound if enabled
      if (preferences.sound) {
        playNotificationSound();
      }

      return notification;
    },
    [isSupported, permission, preferences.enabled, preferences.sound]
  );

  const notifyUrgency = useCallback(
    (notification: AppNotification & { type: 'urgency' }) => {
      if (!preferences.urgencies) return null;

      const priorityEmoji = {
        critical: '🚨',
        high: '⚠️',
        medium: '📢',
      };

      return showNotification({
        title: `${priorityEmoji[notification.priority]} Urgență: ${notification.phone}`,
        body: `${notification.reason}\nAșteaptă: ${notification.waitingTime} min`,
        tag: `urgency-${notification.leadId}`,
        requireInteraction: notification.priority === 'critical',
        data: { type: 'urgency', leadId: notification.leadId },
        actions: [
          { action: 'view', title: 'Vezi detalii' },
          { action: 'call', title: 'Sună' },
        ],
      });
    },
    [preferences.urgencies, showNotification]
  );

  const notifyNewLead = useCallback(
    (notification: AppNotification & { type: 'lead' }) => {
      if (!preferences.newLeads) return null;

      const sourceLabel = {
        whatsapp: 'WhatsApp',
        voice: 'Apel',
        web: 'Web',
      };

      const classificationEmoji = {
        HOT: '🔥',
        WARM: '🌡️',
        COLD: '❄️',
      };

      const emoji = notification.classification
        ? classificationEmoji[notification.classification]
        : '📥';

      return showNotification({
        title: `${emoji} Lead nou: ${notification.phone}`,
        body: `Sursa: ${sourceLabel[notification.source]}${notification.classification ? ` • ${notification.classification}` : ''}`,
        tag: `lead-${notification.leadId}`,
        data: { type: 'lead', leadId: notification.leadId },
      });
    },
    [preferences.newLeads, showNotification]
  );

  const notifyAppointment = useCallback(
    (notification: AppNotification & { type: 'appointment' }) => {
      if (!preferences.appointments) return null;

      const statusConfig = {
        created: { emoji: '📅', text: 'Programare nouă' },
        reminder: { emoji: '⏰', text: 'Reminder' },
        cancelled: { emoji: '❌', text: 'Anulare' },
      };

      const config = statusConfig[notification.status];
      const date = new Date(notification.dateTime);
      const formattedDate = date.toLocaleDateString('ro-RO', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });

      return showNotification({
        title: `${config.emoji} ${config.text}: ${notification.patientName}`,
        body: formattedDate,
        tag: `appointment-${notification.appointmentId}`,
        data: { type: 'appointment', appointmentId: notification.appointmentId },
      });
    },
    [preferences.appointments, showNotification]
  );

  return {
    isSupported,
    permission,
    preferences,
    requestPermission,
    setPreferences,
    showNotification,
    notifyUrgency,
    notifyNewLead,
    notifyAppointment,
  };
}

function playNotificationSound() {
  try {
    const audio = new Audio('/sounds/notification.mp3');
    audio.volume = 0.5;
    audio.play().catch((error: unknown) => {
      // Audio playback failed - common in browsers without user interaction
      if (process.env.NODE_ENV === 'development') {
        console.debug('[notifications] Audio playback failed:', error);
      }
    });
  } catch (error) {
    // Audio API not supported in this environment
    if (process.env.NODE_ENV === 'development') {
      console.debug('[notifications] Audio not supported:', error);
    }
  }
}
