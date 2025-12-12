/**
 * Appointment reminder helpers
 * Extracted from cron-jobs.ts for better maintainability
 */

import type { HubSpotClient, WhatsAppClient } from '@medicalcor/integrations';
import type { HubSpotContactResult } from './types.js';
import { formatDate, formatTime } from './date-helpers.js';

/**
 * Reminder type configuration
 */
export type ReminderType = '24h' | '2h';

/**
 * Supported languages for appointment reminders
 */
export type AppointmentLanguage = 'ro' | 'en' | 'de';

/**
 * Get normalized language from HubSpot contact
 */
export function getContactLanguage(hsLanguage: string | undefined): AppointmentLanguage {
  if (hsLanguage === 'ro' || hsLanguage === 'en' || hsLanguage === 'de') {
    return hsLanguage;
  }
  return 'ro';
}

/**
 * Get WhatsApp language code
 */
export function getWhatsAppLang(language: AppointmentLanguage): 'ro' | 'en' | 'de' {
  return language;
}

/**
 * Template configuration for each reminder type
 */
export interface ReminderTemplateConfig {
  templateName: string;
  flagProperty: string;
  buildParams: (
    contact: HubSpotContactResult,
    language: AppointmentLanguage
  ) => {
    type: 'text';
    text: string;
  }[];
}

/**
 * Get template configuration for reminder type
 */
export function getReminderConfig(type: ReminderType): ReminderTemplateConfig {
  if (type === '24h') {
    return {
      templateName: 'appointment_reminder_24h',
      flagProperty: 'reminder_24h_sent',
      buildParams: (contact, language) => [
        { type: 'text', text: contact.properties.firstname ?? 'Pacient' },
        { type: 'text', text: formatDate(contact.properties.next_appointment_date!, language) },
        { type: 'text', text: formatTime(contact.properties.next_appointment_date!) },
      ],
    };
  }

  return {
    templateName: 'appointment_reminder_2h',
    flagProperty: 'reminder_2h_sent',
    buildParams: (contact) => [
      { type: 'text', text: formatTime(contact.properties.next_appointment_date!) },
    ],
  };
}

/**
 * Send appointment reminder and update HubSpot
 */
export async function sendAppointmentReminder(
  contact: HubSpotContactResult,
  type: ReminderType,
  clients: { whatsapp: WhatsAppClient; hubspot: HubSpotClient | null }
): Promise<void> {
  const { whatsapp, hubspot } = clients;
  const config = getReminderConfig(type);
  const language = getContactLanguage(contact.properties.hs_language);

  await whatsapp.sendTemplate({
    to: contact.properties.phone!,
    templateName: config.templateName,
    language: getWhatsAppLang(language),
    components: [
      {
        type: 'body',
        parameters: config.buildParams(contact, language),
      },
    ],
  });

  if (hubspot) {
    await hubspot.updateContact(contact.id, { [config.flagProperty]: 'true' });
  }
}

/**
 * Filter contacts for a specific reminder type
 */
export function filterContactsForReminder(
  contacts: HubSpotContactResult[],
  type: ReminderType,
  timeChecker: (dateStr: string) => boolean
): HubSpotContactResult[] {
  const config = getReminderConfig(type);
  return contacts.filter((contact) => {
    const appointmentDate = contact.properties.next_appointment_date;
    if (!appointmentDate) return false;

    const alreadySent = contact.properties[config.flagProperty] === 'true';
    return timeChecker(appointmentDate) && !alreadySent;
  });
}
