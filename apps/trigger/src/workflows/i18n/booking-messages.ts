/**
 * Booking Messages - Localization for booking agent workflow
 *
 * Supports Romanian (ro), English (en), and German (de)
 */

export type BookingMessageKey =
  | 'slots_header'
  | 'select_slot_button'
  | 'available_slots_section'
  | 'slots_footer'
  | 'slots_error'
  | 'no_slots'
  | 'booking_error';

export type SupportedLanguage = 'ro' | 'en' | 'de';

const bookingMessages: Record<BookingMessageKey, Record<SupportedLanguage, string>> = {
  slots_header: {
    ro: 'Programări Disponibile',
    en: 'Available Appointments',
    de: 'Verfügbare Termine',
  },
  select_slot_button: {
    ro: 'Alege un interval',
    en: 'Select a time',
    de: 'Zeit auswählen',
  },
  available_slots_section: {
    ro: 'Intervale disponibile',
    en: 'Available times',
    de: 'Verfügbare Zeiten',
  },
  slots_footer: {
    ro: 'Selectați intervalul dorit pentru a confirma programarea.',
    en: 'Select your preferred time to confirm the appointment.',
    de: 'Wählen Sie Ihre bevorzugte Zeit aus, um den Termin zu bestätigen.',
  },
  slots_error: {
    ro: 'Ne pare rău, a apărut o eroare la verificarea disponibilității. Vă rugăm să încercați din nou sau să ne contactați telefonic.',
    en: 'Sorry, there was an error checking availability. Please try again or contact us by phone.',
    de: 'Es tut uns leid, beim Überprüfen der Verfügbarkeit ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut oder kontaktieren Sie uns telefonisch.',
  },
  no_slots: {
    ro: 'Ne pare rău, în momentul de față nu avem intervale disponibile pentru procedura dorită. Un coleg vă va contacta în curând pentru a găsi o soluție.',
    en: 'Sorry, we currently have no available slots for this procedure. A colleague will contact you shortly to find a solution.',
    de: 'Es tut uns leid, wir haben derzeit keine verfügbaren Termine für dieses Verfahren. Ein Kollege wird Sie in Kürze kontaktieren, um eine Lösung zu finden.',
  },
  booking_error: {
    ro: 'Ne pare rău, nu am putut finaliza programarea. Vă rugăm să încercați din nou sau să ne contactați telefonic.',
    en: 'Sorry, we could not complete the booking. Please try again or contact us by phone.',
    de: 'Es tut uns leid, wir konnten die Buchung nicht abschließen. Bitte versuchen Sie es erneut oder kontaktieren Sie uns telefonisch.',
  },
};

/**
 * Get localized message for booking flow
 */
export function getLocalizedMessage(key: BookingMessageKey, language: SupportedLanguage): string {
  return bookingMessages[key]?.[language] ?? bookingMessages[key]?.ro ?? key;
}

/**
 * Get intro messages for slot lists
 */
export function getSlotsIntroMessage(language: SupportedLanguage): string {
  const introMessages: Record<SupportedLanguage, string> = {
    ro: 'Am găsit următoarele intervale disponibile pentru dumneavoastră:',
    en: 'We found the following available times for you:',
    de: 'Wir haben folgende verfügbare Zeiten für Sie gefunden:',
  };
  return introMessages[language];
}

/**
 * Get instruction messages for fallback slot display
 */
export function getSlotsInstructionMessage(language: SupportedLanguage): string {
  const instructionMessages: Record<SupportedLanguage, string> = {
    ro: '\n\nRăspundeți cu numărul intervalului dorit pentru a confirma programarea.',
    en: '\n\nReply with the number of your preferred time to confirm the appointment.',
    de: '\n\nAntworten Sie mit der Nummer Ihrer bevorzugten Zeit, um den Termin zu bestätigen.',
  };
  return instructionMessages[language];
}

/**
 * Get "with" label for practitioner names
 */
export function getWithLabel(language: SupportedLanguage): string {
  const withLabels: Record<SupportedLanguage, string> = {
    ro: 'cu',
    en: 'with',
    de: 'mit',
  };
  return withLabels[language];
}

/**
 * Get appointment detail labels
 */
export function getAppointmentLabels(language: SupportedLanguage): {
  confirmation: string;
  address: string;
  doctor: string;
  duration: string;
  minutes: string;
} {
  const labels: Record<
    SupportedLanguage,
    {
      confirmation: string;
      address: string;
      doctor: string;
      duration: string;
      minutes: string;
    }
  > = {
    ro: {
      confirmation: 'Cod confirmare',
      address: 'Adresă',
      doctor: 'Medic',
      duration: 'Durată estimată',
      minutes: 'minute',
    },
    en: {
      confirmation: 'Confirmation code',
      address: 'Address',
      doctor: 'Doctor',
      duration: 'Estimated duration',
      minutes: 'minutes',
    },
    de: {
      confirmation: 'Bestätigungscode',
      address: 'Adresse',
      doctor: 'Arzt',
      duration: 'Geschätzte Dauer',
      minutes: 'Minuten',
    },
  };
  return labels[language];
}
