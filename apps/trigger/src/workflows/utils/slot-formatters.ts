import type { TimeSlot, Appointment } from '@medicalcor/integrations';
import {
  getSlotsIntroMessage,
  getSlotsInstructionMessage,
  getWithLabel,
  getAppointmentLabels,
  type SupportedLanguage,
} from '../i18n/booking-messages';

/**
 * Slot Formatters - Utilities for formatting time slots and appointments
 */

/**
 * Scheduling service interface for formatting
 */
export interface SchedulingFormatter {
  formatSlotForDisplay: (slot: TimeSlot, lang: SupportedLanguage) => string;
  formatSlotShort: (slot: TimeSlot) => string;
}

/**
 * Format available slots for WhatsApp interactive list
 */
export function formatSlotsMessage(
  slots: TimeSlot[],
  language: SupportedLanguage,
  scheduling: SchedulingFormatter
): { bodyText: string } {
  const intro = getSlotsIntroMessage(language);

  const slotList = slots
    .slice(0, 5)
    .map((slot, index) => `${index + 1}. ${scheduling.formatSlotForDisplay(slot, language)}`)
    .join('\n');

  return {
    bodyText: `${intro}\n\n${slotList}`,
  };
}

/**
 * Format slot description for interactive list row
 */
export function formatSlotDescription(slot: TimeSlot, language: SupportedLanguage): string {
  const parts: string[] = [];

  if (slot.practitioner?.name) {
    const withLabel = getWithLabel(language);
    parts.push(`${withLabel} ${slot.practitioner.name}`);
  }

  if (slot.location?.name) {
    parts.push(slot.location.name);
  }

  return parts.join(' - ') || `${slot.duration} min`;
}

/**
 * Format slots as fallback text message
 */
export function formatSlotsFallbackText(
  slots: TimeSlot[],
  language: SupportedLanguage,
  scheduling: SchedulingFormatter
): string {
  const introMessages: Record<SupportedLanguage, string> = {
    ro: 'Avem următoarele intervale disponibile:\n\n',
    en: 'We have the following available times:\n\n',
    de: 'Wir haben folgende verfügbare Zeiten:\n\n',
  };

  const slotList = slots
    .slice(0, 5)
    .map((slot, index) => `${index + 1}. ${scheduling.formatSlotForDisplay(slot, language)}`)
    .join('\n');

  const intro = introMessages[language] ?? introMessages.ro ?? '';
  const instruction = getSlotsInstructionMessage(language);
  return intro + slotList + instruction;
}

/**
 * Format appointment details for follow-up message
 */
export function formatAppointmentDetails(
  appointment: Appointment,
  language: SupportedLanguage
): string {
  const labels = getAppointmentLabels(language);
  const parts: string[] = [];

  if (appointment.confirmationCode) {
    parts.push(`📋 ${labels.confirmation}: ${appointment.confirmationCode}`);
  }

  if (appointment.practitioner?.name) {
    parts.push(`👨‍⚕️ ${labels.doctor}: ${appointment.practitioner.name}`);
  }

  if (appointment.location?.address) {
    parts.push(`📍 ${labels.address}: ${appointment.location.address}`);
  }

  if (appointment.duration) {
    parts.push(`⏱️ ${labels.duration}: ${appointment.duration} ${labels.minutes}`);
  }

  return parts.join('\n');
}
