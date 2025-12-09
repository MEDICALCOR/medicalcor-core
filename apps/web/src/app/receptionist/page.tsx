'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CallNowCard,
  NoCallsNeeded,
  TodaysAppointments,
  QuickBookModal,
  StatusBanner,
  IncomingCallOverlay,
  CallEndedModal,
  type HotLead,
  type Appointment,
  type DaySlots,
  type SystemStatus,
  type IncomingCall,
  type CallOutcome,
} from './components';
import {
  getCurrentUserAction,
  getSystemStatusAction,
  getHotLeadsAction,
  getTodaysAppointmentsAction,
  sendReminderAction,
  checkInPatientAction,
  initiateCallAction,
  getAvailableSlotsAction,
  bookAppointmentAction,
  saveCallOutcomeAction,
  answerCallAction,
  declineCallAction,
} from './actions';

/**
 * Receptionist Dashboard - Kindergarten Simple
 *
 * Design principles:
 * 1. At a glance: What needs attention? (colors tell the story)
 * 2. One tap: What should I do? (big obvious buttons)
 * 3. Instant feedback: Did it work? (success states)
 *
 * No training required. If grandma can't use it, redesign it.
 */
export default function ReceptionistDashboard() {
  // State
  const [userName, setUserName] = useState<string>('');
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [hotLeads, setHotLeads] = useState<HotLead[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal states
  const [bookingModal, setBookingModal] = useState<{
    open: boolean;
    patientName: string;
    procedure?: string;
    slots: DaySlots[];
  } | null>(null);

  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [callEnded, setCallEnded] = useState<{
    patientName: string;
    leadId: string;
    duration: string;
  } | null>(null);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [user, statusData, leads, appts] = await Promise.all([
          getCurrentUserAction(),
          getSystemStatusAction(),
          getHotLeadsAction(),
          getTodaysAppointmentsAction(),
        ]);

        setUserName(user.name);
        setStatus(statusData);
        setHotLeads(leads);
        setAppointments(appts);
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
  }, []);

  // Refresh data periodically (every 30 seconds)
  useEffect(() => {
    const interval = setInterval(async () => {
      const [statusData, leads, appts] = await Promise.all([
        getSystemStatusAction(),
        getHotLeadsAction(),
        getTodaysAppointmentsAction(),
      ]);

      setStatus(statusData);
      setHotLeads(leads);
      setAppointments(appts);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Simulate incoming call (for demo - in production this would be WebSocket)
  useEffect(() => {
    // Demo: show incoming call after 10 seconds
    const timeout = setTimeout(() => {
      setIncomingCall({
        callSid: 'demo-call-123',
        callerName: 'Maria Popescu',
        callerPhone: '+40722123456',
        leadScore: 'HOT',
        lastContact: 'Asked about All-on-X 3 days ago',
        tip: 'She mentioned she needs financing options. Offer our 0% payment plan!',
      });
    }, 10000);

    return () => clearTimeout(timeout);
  }, []);

  // Handle call to hot lead
  const handleCallLead = useCallback(async (lead: HotLead) => {
    await initiateCallAction(lead.id);
    // In production, this would trigger the call via Vapi/Twilio
    // and the call screen would appear
  }, []);

  // Handle send reminder
  const handleSendReminder = useCallback(async (appointmentId: string) => {
    await sendReminderAction(appointmentId);
    // Update local state to show it was sent
    setAppointments((prev) =>
      prev.map((a) => (a.id === appointmentId ? { ...a, reminderSent: true } : a))
    );
  }, []);

  // Handle check in
  const handleCheckIn = useCallback(async (appointmentId: string) => {
    await checkInPatientAction(appointmentId);
    setAppointments((prev) =>
      prev.map((a) => (a.id === appointmentId ? { ...a, checkedIn: true } : a))
    );
  }, []);

  // Handle book appointment
  const handleOpenBooking = useCallback(async (patientName: string, procedure?: string) => {
    const slots = await getAvailableSlotsAction();
    setBookingModal({ open: true, patientName, procedure, slots });
  }, []);

  const handleBook = useCallback(
    async (date: string, time: string) => {
      if (!bookingModal) return;
      await bookAppointmentAction(bookingModal.patientName, date, time, bookingModal.procedure);
    },
    [bookingModal]
  );

  const handleCloseBooking = useCallback(() => {
    setBookingModal(null);
  }, []);

  // Handle incoming call
  const handleAnswerCall = useCallback(async () => {
    if (!incomingCall) return;
    await answerCallAction(incomingCall.callSid);
    setIncomingCall(null);
    // In production, this would open the call interface
    // For demo, show call ended after 5 seconds
    setTimeout(() => {
      setCallEnded({
        patientName: incomingCall.callerName ?? 'Unknown',
        leadId: 'lead-123',
        duration: '4:32',
      });
    }, 5000);
  }, [incomingCall]);

  const handleDeclineCall = useCallback(async () => {
    if (!incomingCall) return;
    await declineCallAction(incomingCall.callSid);
    setIncomingCall(null);
  }, [incomingCall]);

  // Handle call outcome
  const handleCallOutcome = useCallback(
    async (outcome: CallOutcome, note?: string) => {
      if (!callEnded) return;
      await saveCallOutcomeAction(callEnded.leadId, outcome, note);
      setCallEnded(null);
    },
    [callEnded]
  );

  const handleCallBookAppointment = useCallback(() => {
    if (!callEnded) return;
    void handleOpenBooking(callEnded.patientName);
    setCallEnded(null);
  }, [callEnded, handleOpenBooking]);

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Main content */}
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header - Simple greeting */}
        <div className="pt-4">
          <h1 className="text-2xl sm:text-3xl font-bold">
            {getGreeting()}, {userName}! 👋
          </h1>
          <p className="text-muted-foreground">{today}</p>
        </div>

        {/* Status Banner - What's the situation? */}
        {status && <StatusBanner status={status} />}

        {/* Hot Leads - Who needs a call RIGHT NOW? */}
        <section>
          <h2 className="font-semibold text-lg flex items-center gap-2 mb-3">
            <span className="text-2xl">🔴</span>
            Call Now
            {hotLeads.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({hotLeads.length} waiting)
              </span>
            )}
          </h2>

          {hotLeads.length > 0 ? (
            <div className="space-y-3">
              {hotLeads.map((lead) => (
                <CallNowCard key={lead.id} lead={lead} onCall={handleCallLead} />
              ))}
            </div>
          ) : (
            <NoCallsNeeded />
          )}
        </section>

        {/* Today's Appointments */}
        <section>
          <TodaysAppointments
            appointments={appointments}
            onSendReminder={handleSendReminder}
            onCheckIn={handleCheckIn}
          />
        </section>
      </div>

      {/* Modals */}
      {bookingModal && (
        <QuickBookModal
          patientName={bookingModal.patientName}
          procedure={bookingModal.procedure}
          days={bookingModal.slots}
          onBook={handleBook}
          onClose={handleCloseBooking}
        />
      )}

      {incomingCall && (
        <IncomingCallOverlay
          call={incomingCall}
          onAnswer={handleAnswerCall}
          onDecline={handleDeclineCall}
        />
      )}

      {callEnded && (
        <CallEndedModal
          patientName={callEnded.patientName}
          callDuration={callEnded.duration}
          onOutcome={handleCallOutcome}
          onBookAppointment={handleCallBookAppointment}
        />
      )}
    </div>
  );
}
