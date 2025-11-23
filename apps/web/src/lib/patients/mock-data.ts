'use client';

import type {
  PatientDetail,
  PatientAppointment,
  PatientDocument,
  PatientActivity,
  PatientNote,
  PatientProcedure,
} from './types';

export function generateMockPatientDetail(id: string): PatientDetail {
  const appointments: PatientAppointment[] = [
    {
      id: 'apt-1',
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      time: '10:00',
      duration: 30,
      type: 'Consultație',
      doctor: 'Dr. Maria Ionescu',
      location: 'Cabinet 3',
      status: 'confirmed',
    },
    {
      id: 'apt-2',
      date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      time: '14:30',
      duration: 45,
      type: 'Control',
      doctor: 'Dr. Maria Ionescu',
      location: 'Cabinet 3',
      status: 'completed',
      notes: 'Evoluție bună, continuă tratamentul',
    },
    {
      id: 'apt-3',
      date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      time: '09:00',
      duration: 60,
      type: 'Consultație inițială',
      doctor: 'Dr. Andrei Popa',
      location: 'Cabinet 1',
      status: 'completed',
    },
  ];

  const documents: PatientDocument[] = [
    {
      id: 'doc-1',
      name: 'Analize de sânge - Ianuarie 2024',
      type: 'lab_result',
      mimeType: 'application/pdf',
      size: 245000,
      uploadedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      uploadedBy: 'Dr. Maria Ionescu',
    },
    {
      id: 'doc-2',
      name: 'Ecografie abdominală',
      type: 'imaging',
      mimeType: 'application/pdf',
      size: 1250000,
      uploadedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      uploadedBy: 'Dr. Andrei Popa',
    },
    {
      id: 'doc-3',
      name: 'Consimțământ tratament',
      type: 'consent',
      mimeType: 'application/pdf',
      size: 125000,
      uploadedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      uploadedBy: 'Receptie',
    },
    {
      id: 'doc-4',
      name: 'Rețetă medicală',
      type: 'prescription',
      mimeType: 'application/pdf',
      size: 85000,
      uploadedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      uploadedBy: 'Dr. Maria Ionescu',
    },
  ];

  const activities: PatientActivity[] = [
    {
      id: 'act-1',
      type: 'appointment',
      title: 'Programare confirmată',
      description: 'Consultație programată pentru 10:00',
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      user: 'Sistem',
    },
    {
      id: 'act-2',
      type: 'message',
      title: 'Mesaj WhatsApp trimis',
      description: 'Reminder pentru programarea de săptămâna viitoare',
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      user: 'Automat',
    },
    {
      id: 'act-3',
      type: 'call',
      title: 'Apel telefonic',
      description: 'Confirmare programare - pacientul a confirmat prezența',
      timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      user: 'Ana Popescu',
    },
    {
      id: 'act-4',
      type: 'status_change',
      title: 'Status actualizat',
      description: 'Status schimbat de la "Lead" la "Pacient"',
      timestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      user: 'Dr. Maria Ionescu',
    },
    {
      id: 'act-5',
      type: 'document',
      title: 'Document încărcat',
      description: 'Analize de sânge - Ianuarie 2024',
      timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      user: 'Dr. Maria Ionescu',
    },
    {
      id: 'act-6',
      type: 'appointment',
      title: 'Consultație finalizată',
      description: 'Control - evoluție bună',
      timestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      user: 'Dr. Maria Ionescu',
    },
    {
      id: 'act-7',
      type: 'note',
      title: 'Notă adăugată',
      description: 'Pacient cooperant, respectă indicațiile medicale',
      timestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      user: 'Dr. Maria Ionescu',
    },
  ];

  const notes: PatientNote[] = [
    {
      id: 'note-1',
      content:
        'Pacient cooperant, respectă indicațiile medicale. De urmărit evoluția la controlul următor.',
      createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      createdBy: 'Dr. Maria Ionescu',
      isPinned: true,
      category: 'medical',
    },
    {
      id: 'note-2',
      content:
        'Preferă să fie contactat pe WhatsApp, nu răspunde la telefon în timpul programului.',
      createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      createdBy: 'Ana Popescu',
      category: 'general',
    },
    {
      id: 'note-3',
      content: 'Alergie la penicilină - de menționat la fiecare prescripție!',
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      createdBy: 'Dr. Andrei Popa',
      isPinned: true,
      category: 'medical',
    },
  ];

  const procedures: PatientProcedure[] = [
    {
      id: 'proc-1',
      name: 'Consultație inițială',
      date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      doctor: 'Dr. Andrei Popa',
      status: 'completed',
      cost: 250,
    },
    {
      id: 'proc-2',
      name: 'Analize de laborator',
      date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      status: 'completed',
      cost: 450,
    },
    {
      id: 'proc-3',
      name: 'Control',
      date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      doctor: 'Dr. Maria Ionescu',
      status: 'completed',
      cost: 150,
    },
  ];

  return {
    id,
    firstName: 'Elena',
    lastName: 'Popescu',
    dateOfBirth: new Date('1985-03-15'),
    gender: 'female',
    cnp: '2850315123456',
    contact: {
      phone: '+40 721 123 456',
      email: 'elena.popescu@email.com',
      whatsapp: '+40 721 123 456',
      preferredChannel: 'whatsapp',
    },
    address: {
      street: 'Str. Victoriei nr. 42',
      city: 'București',
      county: 'București',
      postalCode: '010061',
    },
    status: 'patient',
    source: 'facebook',
    tags: ['VIP', 'Fidelizat', 'Tratament activ'],
    assignedTo: 'Dr. Maria Ionescu',
    createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    medicalHistory: 'Hipertensiune arterială controlată, Diabet tip 2',
    allergies: ['Penicilină', 'Iod'],
    currentMedications: ['Metformin 500mg', 'Lisinopril 10mg'],
    appointments,
    documents,
    activities,
    notes,
    procedures,
    totalSpent: 850,
    appointmentCount: 3,
    lastVisit: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    nextAppointment: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };
}
