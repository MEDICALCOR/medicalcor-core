/**
 * Test data factories for creating mock data in tests.
 * Use these to generate consistent test data across test files.
 */

// Counter for generating unique IDs
let idCounter = 0;

function generateId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

// Reset counter between tests if needed
export function resetIdCounter(): void {
  idCounter = 0;
}

/**
 * Patient/Lead factory
 */
export interface MockPatient {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: 'lead' | 'contacted' | 'scheduled' | 'completed' | 'lost';
  score: number;
  classification: 'hot' | 'warm' | 'cold';
  createdAt: string;
  lastContactAt: string | null;
  source?: string;
  clinicId?: string;
}

export function createMockPatient(overrides: Partial<MockPatient> = {}): MockPatient {
  const id = overrides.id ?? generateId('patient');
  return {
    id,
    firstName: 'Test',
    lastName: 'Patient',
    email: `${id}@example.com`,
    phone: `+4072${Math.floor(1000000 + Math.random() * 9000000)}`,
    status: 'lead',
    score: 3,
    classification: 'warm',
    createdAt: new Date().toISOString(),
    lastContactAt: null,
    source: 'web',
    clinicId: 'clinic_1',
    ...overrides,
  };
}

export function createMockPatients(
  count: number,
  overrides: Partial<MockPatient> = {}
): MockPatient[] {
  return Array.from({ length: count }, () => createMockPatient(overrides));
}

/**
 * Workflow factory
 */
export interface MockWorkflowStep {
  id: string;
  type: 'action' | 'condition' | 'delay';
  action?: { type: string; template?: string };
  condition?: { conditions: unknown[]; operator: 'and' | 'or' };
  delay?: { value: number; unit: 'minutes' | 'hours' | 'days' };
}

export interface MockWorkflow {
  id: string;
  name: string;
  triggerType: string;
  isActive: boolean;
  steps: MockWorkflowStep[];
  createdAt: string;
  updatedAt: string;
}

export function createMockWorkflow(overrides: Partial<MockWorkflow> = {}): MockWorkflow {
  const id = overrides.id ?? generateId('workflow');
  const now = new Date().toISOString();
  return {
    id,
    name: 'Test Workflow',
    triggerType: 'new_lead',
    isActive: true,
    steps: [
      {
        id: generateId('step'),
        type: 'action',
        action: { type: 'send_whatsapp', template: 'welcome' },
      },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * User/Session factory
 */
export interface MockUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'doctor' | 'receptionist' | 'staff';
  clinicId: string;
}

export interface MockSession {
  user: MockUser;
  expires: string;
}

export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  const id = overrides.id ?? generateId('user');
  return {
    id,
    email: `${id}@medicalcor.ro`,
    name: 'Test User',
    role: 'admin',
    clinicId: 'clinic_1',
    ...overrides,
  };
}

export function createMockSession(overrides: Partial<MockSession> = {}): MockSession {
  return {
    user: createMockUser(overrides.user),
    expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // 8 hours
    ...overrides,
  };
}

/**
 * Realtime event factory
 */
export interface MockRealtimeEvent {
  id: string;
  type: string;
  payload: unknown;
  timestamp: string;
}

export function createMockRealtimeEvent(
  type: string,
  payload: unknown,
  overrides: Partial<MockRealtimeEvent> = {}
): MockRealtimeEvent {
  return {
    id: generateId('event'),
    type,
    payload,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Urgency/Notification factory
 */
export interface MockUrgency {
  id: string;
  type: 'high_score_lead' | 'appointment_soon' | 'callback_requested';
  message: string;
  leadId?: string;
  appointmentId?: string;
  timestamp: string;
}

export function createMockUrgency(overrides: Partial<MockUrgency> = {}): MockUrgency {
  return {
    id: generateId('urgency'),
    type: 'high_score_lead',
    message: 'New high-priority lead requires attention',
    leadId: 'lead_123',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Analytics data factory
 */
export interface MockAnalyticsData {
  timeRange: string;
  totalLeads: number;
  conversionRate: number;
  appointments: number;
  revenue: number;
  leadsBySource: Record<string, number>;
  leadsByStatus: Record<string, number>;
}

export function createMockAnalyticsData(
  overrides: Partial<MockAnalyticsData> = {}
): MockAnalyticsData {
  return {
    timeRange: '7d',
    totalLeads: 150,
    conversionRate: 0.23,
    appointments: 34,
    revenue: 45000,
    leadsBySource: {
      web: 60,
      whatsapp: 50,
      voice: 30,
      referral: 10,
    },
    leadsByStatus: {
      lead: 45,
      contacted: 35,
      scheduled: 34,
      completed: 26,
      lost: 10,
    },
    ...overrides,
  };
}

/**
 * Form data factories
 */
export interface MockLeadSubmission {
  phone: string;
  name?: string;
  email?: string;
  source: string;
  campaign?: string;
  gdprConsent: boolean;
}

export function createMockLeadSubmission(
  overrides: Partial<MockLeadSubmission> = {}
): MockLeadSubmission {
  return {
    phone: '+40721234567',
    name: 'Test Lead',
    email: 'test@example.com',
    source: 'web',
    gdprConsent: true,
    ...overrides,
  };
}
