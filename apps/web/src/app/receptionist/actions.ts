'use server';

import type { HotLead, Appointment, DaySlots, SystemStatus, CallOutcome } from './components';

/**
 * Server actions for the receptionist dashboard
 * These connect to the actual backend services
 */

// Get current user name for greeting
export async function getCurrentUserAction(): Promise<{ name: string }> {
  // TODO: Connect to auth service
  return Promise.resolve({ name: 'Ana' });
}

// Get system status (missed calls, queue, etc.)
export async function getSystemStatusAction(): Promise<SystemStatus> {
  // TODO: Connect to actual metrics service
  return Promise.resolve({
    missedCalls: 0,
    angryPatients: 0,
    insuranceVerified: true,
    queueSize: 2,
  });
}

// Get hot leads that need immediate callback
export async function getHotLeadsAction(): Promise<HotLead[]> {
  // TODO: Connect to lead service
  // For now, return demo data
  return Promise.resolve([
    {
      id: '1',
      name: 'Maria Popescu',
      phone: '+40722123456',
      reason: 'Wants All-on-X pricing',
      waitingMinutes: 45,
      procedureInterest: 'All-on-X',
    },
    {
      id: '2',
      name: 'Ion Gheorghe',
      phone: '+40733456789',
      reason: 'Asked about financing',
      waitingMinutes: 15,
      procedureInterest: 'Implants',
    },
  ]);
}

// Get today's appointments
export async function getTodaysAppointmentsAction(): Promise<Appointment[]> {
  // TODO: Connect to scheduling service
  return Promise.resolve([
    {
      id: '1',
      time: '09:00',
      patientName: 'Andrei Munteanu',
      procedure: 'Cleaning',
      confirmed: true,
      checkedIn: true,
    },
    {
      id: '2',
      time: '10:00',
      patientName: 'Elena Radu',
      procedure: 'Implant consult',
      confirmed: true,
      checkedIn: false,
    },
    {
      id: '3',
      time: '11:00',
      patientName: 'Pop Ioan',
      procedure: 'Crown fitting',
      confirmed: false,
      checkedIn: false,
    },
    {
      id: '4',
      time: '14:00',
      patientName: 'Diana Costea',
      procedure: 'Whitening',
      confirmed: false,
      checkedIn: false,
    },
    {
      id: '5',
      time: '15:30',
      patientName: 'Mihai Vasilescu',
      procedure: 'Extraction',
      confirmed: true,
      checkedIn: false,
    },
  ]);
}

// Send reminder to patient
export async function sendReminderAction(appointmentId: string): Promise<void> {
  // TODO: Connect to notification service
  console.info(`Sending reminder for appointment ${appointmentId}`);
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));
}

// Check in patient
export async function checkInPatientAction(appointmentId: string): Promise<void> {
  // TODO: Connect to appointment service
  console.info(`Checking in patient for appointment ${appointmentId}`);
  await new Promise((resolve) => setTimeout(resolve, 300));
}

// Initiate call to lead
export async function initiateCallAction(leadId: string): Promise<void> {
  // TODO: Connect to Vapi/Twilio service
  console.info(`Initiating call to lead ${leadId}`);
  await new Promise((resolve) => setTimeout(resolve, 200));
}

// Get available slots for booking
export async function getAvailableSlotsAction(): Promise<DaySlots[]> {
  // TODO: Connect to scheduling service
  const today = new Date();
  const days: DaySlots[] = [];

  for (let i = 1; i <= 5; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);

    const dayName = i === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'long' });

    days.push({
      date: date.toISOString().split('T')[0],
      label: dayName,
      slots: [
        { time: '09:00', available: Math.random() > 0.3 },
        { time: '10:00', available: Math.random() > 0.3 },
        { time: '11:00', available: Math.random() > 0.5 },
        { time: '14:00', available: Math.random() > 0.3 },
        { time: '15:00', available: Math.random() > 0.4 },
        { time: '16:00', available: Math.random() > 0.5 },
      ],
    });
  }

  return Promise.resolve(days);
}

// Book appointment
export async function bookAppointmentAction(
  patientName: string,
  date: string,
  time: string,
  _procedure?: string
): Promise<void> {
  // TODO: Connect to scheduling service
  console.info(`Booking appointment for ${patientName} on ${date} at ${time}`);
  await new Promise((resolve) => setTimeout(resolve, 800));
}

// Save call outcome
export async function saveCallOutcomeAction(
  leadId: string,
  outcome: CallOutcome,
  note?: string
): Promise<void> {
  // TODO: Connect to lead/CRM service
  console.info(`Saving call outcome for lead ${leadId}: ${outcome}`, note);
  await new Promise((resolve) => setTimeout(resolve, 400));
}

// Answer incoming call
export async function answerCallAction(callSid: string): Promise<void> {
  // TODO: Connect to Vapi/Twilio
  console.info(`Answering call ${callSid}`);
  await new Promise((resolve) => setTimeout(resolve, 200));
}

// Decline incoming call
export async function declineCallAction(callSid: string): Promise<void> {
  // TODO: Connect to Vapi/Twilio
  console.info(`Declining call ${callSid}`);
  await new Promise((resolve) => setTimeout(resolve, 200));
}
