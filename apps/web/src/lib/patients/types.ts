'use client';

export type PatientStatus = 'lead' | 'contacted' | 'scheduled' | 'patient' | 'inactive';
export type PatientSource = 'facebook' | 'google' | 'referral' | 'website' | 'walk-in' | 'other';
export type ActivityType =
  | 'call'
  | 'message'
  | 'email'
  | 'appointment'
  | 'note'
  | 'status_change'
  | 'document';

export interface PatientContact {
  phone: string;
  email?: string;
  whatsapp?: string;
  preferredChannel: 'phone' | 'whatsapp' | 'email' | 'sms';
}

export interface PatientAddress {
  street?: string;
  city?: string;
  county?: string;
  postalCode?: string;
}

export interface PatientAppointment {
  id: string;
  date: Date;
  time: string;
  duration: number; // minutes
  type: string;
  doctor?: string;
  location?: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no-show';
  notes?: string;
}

export interface PatientDocument {
  id: string;
  name: string;
  type: 'medical_record' | 'lab_result' | 'imaging' | 'prescription' | 'consent' | 'other';
  mimeType: string;
  size: number; // bytes
  uploadedAt: Date;
  uploadedBy?: string;
  url?: string;
}

export interface PatientActivity {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  timestamp: Date;
  user?: string;
  metadata?: Record<string, unknown>;
}

export interface PatientNote {
  id: string;
  content: string;
  createdAt: Date;
  createdBy: string;
  isPinned?: boolean;
  category?: 'general' | 'medical' | 'billing' | 'follow-up';
}

export interface PatientProcedure {
  id: string;
  name: string;
  date: Date;
  doctor?: string;
  status: 'planned' | 'completed' | 'cancelled';
  cost?: number;
  notes?: string;
}

export interface PatientDetail {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other';
  cnp?: string; // Romanian personal ID
  contact: PatientContact;
  address?: PatientAddress;
  status: PatientStatus;
  source: PatientSource;
  tags: string[];
  assignedTo?: string;
  createdAt: Date;
  updatedAt: Date;
  // Medical info
  medicalHistory?: string;
  allergies?: string[];
  currentMedications?: string[];
  // Related data
  appointments: PatientAppointment[];
  documents: PatientDocument[];
  activities: PatientActivity[];
  notes: PatientNote[];
  procedures: PatientProcedure[];
  // Stats
  totalSpent?: number;
  appointmentCount: number;
  lastVisit?: Date;
  nextAppointment?: Date;
}
