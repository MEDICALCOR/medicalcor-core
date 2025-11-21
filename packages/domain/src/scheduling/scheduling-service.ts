/**
 * Scheduling Service
 * Handles appointment booking, availability, and reminders
 */

export interface TimeSlot {
  id: string;
  date: string; // ISO date string
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  duration: number; // minutes
  available: boolean;
  practitioner?: string;
  location?: string;
  procedureTypes: string[];
}

export interface Appointment {
  id: string;
  hubspotContactId: string;
  phone: string;
  patientName?: string;
  slot: TimeSlot;
  procedureType: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  notes?: string;
  reminders: {
    type: '24h' | '2h' | '1h';
    sentAt?: string;
    channel: 'whatsapp' | 'sms' | 'email';
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilityQuery {
  procedureType: string;
  preferredDates?: string[];
  preferredTime?: 'morning' | 'afternoon' | 'evening';
  practitioner?: string;
  location?: string;
  limit?: number;
}

export interface BookingRequest {
  hubspotContactId: string;
  phone: string;
  patientName?: string;
  slotId: string;
  procedureType: string;
  notes?: string;
}

export interface SchedulingConfig {
  timezone: string;
  workingHours: {
    start: string; // HH:mm
    end: string; // HH:mm
  };
  workingDays: number[]; // 0 = Sunday, 1 = Monday, etc.
  slotDuration: number; // minutes
  bufferBetweenSlots: number; // minutes
  maxAdvanceBookingDays: number;
  procedureDurations: Record<string, number>; // procedure -> minutes
}

const DEFAULT_CONFIG: SchedulingConfig = {
  timezone: 'Europe/Bucharest',
  workingHours: {
    start: '09:00',
    end: '18:00',
  },
  workingDays: [1, 2, 3, 4, 5], // Monday to Friday
  slotDuration: 30,
  bufferBetweenSlots: 15,
  maxAdvanceBookingDays: 60,
  procedureDurations: {
    consultation: 30,
    implant_consultation: 45,
    'all-on-x-consultation': 60,
    cleaning: 45,
    extraction: 30,
    follow_up: 15,
  },
};

export class SchedulingService {
  private config: SchedulingConfig;
  private appointments: Map<string, Appointment> = new Map();
  private slots: Map<string, TimeSlot> = new Map();

  constructor(config?: Partial<SchedulingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get available slots for a procedure
   */
  async getAvailableSlots(query: AvailabilityQuery): Promise<TimeSlot[]> {
    const { procedureType, preferredDates, preferredTime, practitioner, location, limit = 10 } = query;

    const duration = this.config.procedureDurations[procedureType] ?? this.config.slotDuration;
    const slots: TimeSlot[] = [];

    // Generate slots for the next N days
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + this.config.maxAdvanceBookingDays);

    // If preferred dates provided, filter to those
    const datesToCheck = preferredDates?.length
      ? preferredDates.map(d => new Date(d))
      : this.getWorkingDays(startDate, endDate);

    for (const date of datesToCheck) {
      const daySlots = this.generateSlotsForDay(date, duration, procedureType);

      // Filter by preferences
      const filteredSlots = daySlots.filter(slot => {
        if (!slot.available) return false;
        if (practitioner && slot.practitioner !== practitioner) return false;
        if (location && slot.location !== location) return false;
        if (preferredTime) {
          const hour = parseInt(slot.startTime.split(':')[0] ?? '0');
          if (preferredTime === 'morning' && hour >= 12) return false;
          if (preferredTime === 'afternoon' && (hour < 12 || hour >= 17)) return false;
          if (preferredTime === 'evening' && hour < 17) return false;
        }
        return true;
      });

      slots.push(...filteredSlots);

      if (slots.length >= limit) break;
    }

    return slots.slice(0, limit);
  }

  /**
   * Book an appointment
   */
  async bookAppointment(request: BookingRequest): Promise<Appointment> {
    const { hubspotContactId, phone, patientName, slotId, procedureType, notes } = request;

    const slot = this.slots.get(slotId);
    if (!slot) {
      throw new Error('Slot not found');
    }

    if (!slot.available) {
      throw new Error('Slot is no longer available');
    }

    // Mark slot as unavailable
    slot.available = false;
    this.slots.set(slotId, slot);

    const appointment: Appointment = {
      id: this.generateId(),
      hubspotContactId,
      phone,
      patientName,
      slot,
      procedureType,
      status: 'scheduled',
      notes,
      reminders: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.appointments.set(appointment.id, appointment);

    return appointment;
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(appointmentId: string, reason?: string): Promise<Appointment> {
    const appointment = this.appointments.get(appointmentId);
    if (!appointment) {
      throw new Error('Appointment not found');
    }

    // Mark slot as available again
    const slot = this.slots.get(appointment.slot.id);
    if (slot) {
      slot.available = true;
      this.slots.set(slot.id, slot);
    }

    appointment.status = 'cancelled';
    appointment.notes = reason ? `${appointment.notes ?? ''}\nCancelled: ${reason}` : appointment.notes;
    appointment.updatedAt = new Date().toISOString();

    this.appointments.set(appointmentId, appointment);

    return appointment;
  }

  /**
   * Get upcoming appointments for reminders
   */
  async getUpcomingAppointments(startTime: Date, endTime: Date): Promise<Appointment[]> {
    const upcoming: Appointment[] = [];

    for (const appointment of this.appointments.values()) {
      if (appointment.status !== 'scheduled' && appointment.status !== 'confirmed') {
        continue;
      }

      const appointmentDate = new Date(`${appointment.slot.date}T${appointment.slot.startTime}`);
      if (appointmentDate >= startTime && appointmentDate <= endTime) {
        upcoming.push(appointment);
      }
    }

    return upcoming;
  }

  /**
   * Mark reminder as sent
   */
  async markReminderSent(appointmentId: string, reminderType: '24h' | '2h' | '1h'): Promise<void> {
    const appointment = this.appointments.get(appointmentId);
    if (!appointment) {
      throw new Error('Appointment not found');
    }

    const existingReminder = appointment.reminders.find(r => r.type === reminderType);
    if (existingReminder) {
      existingReminder.sentAt = new Date().toISOString();
    } else {
      appointment.reminders.push({
        type: reminderType,
        sentAt: new Date().toISOString(),
        channel: 'whatsapp',
      });
    }

    appointment.updatedAt = new Date().toISOString();
    this.appointments.set(appointmentId, appointment);
  }

  /**
   * Confirm an appointment
   */
  async confirmAppointment(appointmentId: string): Promise<Appointment> {
    const appointment = this.appointments.get(appointmentId);
    if (!appointment) {
      throw new Error('Appointment not found');
    }

    appointment.status = 'confirmed';
    appointment.updatedAt = new Date().toISOString();

    this.appointments.set(appointmentId, appointment);
    return appointment;
  }

  /**
   * Complete an appointment
   */
  async completeAppointment(appointmentId: string): Promise<Appointment> {
    const appointment = this.appointments.get(appointmentId);
    if (!appointment) {
      throw new Error('Appointment not found');
    }

    appointment.status = 'completed';
    appointment.updatedAt = new Date().toISOString();

    this.appointments.set(appointmentId, appointment);
    return appointment;
  }

  /**
   * Mark as no-show
   */
  async markNoShow(appointmentId: string): Promise<Appointment> {
    const appointment = this.appointments.get(appointmentId);
    if (!appointment) {
      throw new Error('Appointment not found');
    }

    appointment.status = 'no_show';
    appointment.updatedAt = new Date().toISOString();

    this.appointments.set(appointmentId, appointment);
    return appointment;
  }

  /**
   * Generate slots for a specific day
   */
  private generateSlotsForDay(date: Date, duration: number, procedureType: string): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const dateStr = date.toISOString().split('T')[0];

    if (!dateStr) return slots;

    const dayOfWeek = date.getDay();
    if (!this.config.workingDays.includes(dayOfWeek)) {
      return slots;
    }

    const [startHour, startMinute] = this.config.workingHours.start.split(':').map(Number);
    const [endHour, endMinute] = this.config.workingHours.end.split(':').map(Number);

    if (startHour === undefined || startMinute === undefined || endHour === undefined || endMinute === undefined) {
      return slots;
    }

    let currentTime = startHour * 60 + startMinute;
    const endTime = endHour * 60 + endMinute;

    while (currentTime + duration <= endTime) {
      const slotStartHour = Math.floor(currentTime / 60);
      const slotStartMinute = currentTime % 60;
      const slotEndTime = currentTime + duration;
      const slotEndHour = Math.floor(slotEndTime / 60);
      const slotEndMinute = slotEndTime % 60;

      const slotId = `${dateStr}-${slotStartHour.toString().padStart(2, '0')}${slotStartMinute.toString().padStart(2, '0')}`;

      const slot: TimeSlot = {
        id: slotId,
        date: dateStr,
        startTime: `${slotStartHour.toString().padStart(2, '0')}:${slotStartMinute.toString().padStart(2, '0')}`,
        endTime: `${slotEndHour.toString().padStart(2, '0')}:${slotEndMinute.toString().padStart(2, '0')}`,
        duration,
        available: !this.slots.has(slotId) || this.slots.get(slotId)!.available,
        procedureTypes: [procedureType],
      };

      this.slots.set(slotId, slot);
      slots.push(slot);

      currentTime += duration + this.config.bufferBetweenSlots;
    }

    return slots;
  }

  /**
   * Get working days between two dates
   */
  private getWorkingDays(start: Date, end: Date): Date[] {
    const days: Date[] = [];
    const current = new Date(start);

    while (current <= end) {
      if (this.config.workingDays.includes(current.getDay())) {
        days.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `apt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Format date for display
   */
  formatDate(isoDate: string, locale: string = 'ro-RO'): string {
    return new Date(isoDate).toLocaleDateString(locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  /**
   * Format time for display
   */
  formatTime(time: string): string {
    return time; // Already in HH:mm format
  }

  /**
   * Format slots as message for patient
   */
  formatSlotsMessage(slots: TimeSlot[], language: 'ro' | 'en' | 'de' = 'ro'): string {
    const headers: Record<string, string> = {
      ro: 'Avem următoarele intervale disponibile:',
      en: 'We have the following available slots:',
      de: 'Wir haben folgende verfügbare Termine:',
    };

    const lines = [headers[language] ?? headers['ro']!];

    slots.forEach((slot, index) => {
      const dateFormatted = this.formatDate(slot.date, language === 'de' ? 'de-DE' : language === 'en' ? 'en-US' : 'ro-RO');
      lines.push(`${index + 1}. ${dateFormatted} la ${slot.startTime}`);
    });

    return lines.join('\n');
  }
}

/**
 * Create a configured scheduling service
 */
export function createSchedulingService(config?: Partial<SchedulingConfig>): SchedulingService {
  return new SchedulingService(config);
}
