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

/**
 * Supervisor Dashboard factories
 */
export interface MockSupervisorStats {
  activeCalls: number;
  callsInQueue: number;
  averageWaitTime: number;
  agentsAvailable: number;
  agentsBusy: number;
  agentsOnBreak: number;
  agentsOffline: number;
  aiHandledCalls: number;
  aiHandoffRate: number;
  averageAiConfidence: number;
  activeAlerts: number;
  escalationsToday: number;
  handoffsToday: number;
  callsHandledToday: number;
  averageHandleTime: number;
  serviceLevelPercent: number;
  abandonedCalls: number;
  customerSatisfaction: number;
  lastUpdated: Date;
}

export function createMockSupervisorStats(
  overrides: Partial<MockSupervisorStats> = {}
): MockSupervisorStats {
  return {
    activeCalls: 5,
    callsInQueue: 3,
    averageWaitTime: 120,
    agentsAvailable: 8,
    agentsBusy: 5,
    agentsOnBreak: 2,
    agentsOffline: 1,
    aiHandledCalls: 15,
    aiHandoffRate: 0.2,
    averageAiConfidence: 0.85,
    activeAlerts: 2,
    escalationsToday: 3,
    handoffsToday: 7,
    callsHandledToday: 45,
    averageHandleTime: 240,
    serviceLevelPercent: 92,
    abandonedCalls: 2,
    customerSatisfaction: 4.5,
    lastUpdated: new Date(),
    ...overrides,
  };
}

export interface MockMonitoredCall {
  callSid: string;
  direction: 'inbound' | 'outbound';
  status: 'ringing' | 'in-progress' | 'on-hold' | 'completed';
  startedAt: Date;
  duration: number;
  callerPhone: string;
  callerName?: string;
  agentId?: string;
  agentName?: string;
  classification?: 'HOT' | 'WARM' | 'COLD';
  sentiment?: 'positive' | 'neutral' | 'negative';
  aiConfidence?: number;
  flags: string[];
  recentTranscript: Array<{ speaker: string; text: string; timestamp: Date }>;
}

export function createMockMonitoredCall(
  overrides: Partial<MockMonitoredCall> = {}
): MockMonitoredCall {
  const id = generateId('call');
  return {
    callSid: `CA${id}`,
    direction: 'inbound',
    status: 'in-progress',
    startedAt: new Date(Date.now() - 180000),
    duration: 180,
    callerPhone: '+40721234567',
    callerName: 'Test Caller',
    agentId: 'agent-1',
    agentName: 'Agent One',
    classification: 'HOT',
    sentiment: 'positive',
    aiConfidence: 0.85,
    flags: [],
    recentTranscript: [],
    ...overrides,
  };
}

export interface MockFlexWorker {
  workerSid: string;
  friendlyName: string;
  activityName: string;
  available: boolean;
  skills: string[];
  languages: string[];
  currentCallSid?: string;
  tasksInProgress: number;
}

export function createMockFlexWorker(overrides: Partial<MockFlexWorker> = {}): MockFlexWorker {
  const id = generateId('worker');
  return {
    workerSid: `WK${id}`,
    friendlyName: 'Test Agent',
    activityName: 'available',
    available: true,
    skills: ['dental', 'implants'],
    languages: ['ro', 'en'],
    tasksInProgress: 0,
    ...overrides,
  };
}

/**
 * Queue SLA Dashboard factories
 */
export interface MockQueueSLAStatus {
  queueSid: string;
  queueName: string;
  currentQueueSize: number;
  averageWaitTime: number;
  longestWaitTime: number;
  serviceLevel: number;
  slaTarget: number;
  isCompliant: boolean;
  severity: 'normal' | 'warning' | 'critical';
  totalAgents: number;
  availableAgents: number;
  busyAgents: number;
  callsHandledToday: number;
  lastUpdated: Date;
}

export function createMockQueueSLAStatus(
  overrides: Partial<MockQueueSLAStatus> = {}
): MockQueueSLAStatus {
  const id = generateId('queue');
  return {
    queueSid: `QU${id}`,
    queueName: 'Test Queue',
    currentQueueSize: 3,
    averageWaitTime: 45,
    longestWaitTime: 120,
    serviceLevel: 92,
    slaTarget: 90,
    isCompliant: true,
    severity: 'normal',
    totalAgents: 5,
    availableAgents: 3,
    busyAgents: 2,
    callsHandledToday: 25,
    lastUpdated: new Date(),
    ...overrides,
  };
}

export interface MockSLABreachEvent {
  eventId: string;
  queueSid: string;
  queueName: string;
  breachType: string;
  severity: 'warning' | 'critical';
  threshold: number;
  currentValue: number;
  affectedCalls: number;
  detectedAt: Date;
  resolvedAt?: Date;
  durationSeconds?: number;
  alertSent: boolean;
  escalated: boolean;
}

export function createMockSLABreachEvent(
  overrides: Partial<MockSLABreachEvent> = {}
): MockSLABreachEvent {
  const id = generateId('breach');
  return {
    eventId: id,
    queueSid: 'QU_1',
    queueName: 'Main Queue',
    breachType: 'wait_time',
    severity: 'warning',
    threshold: 60,
    currentValue: 90,
    affectedCalls: 2,
    detectedAt: new Date(),
    alertSent: true,
    escalated: false,
    ...overrides,
  };
}

/**
 * Agent Workspace factories
 */
export interface MockQueueItem {
  id: string;
  type: 'call' | 'message' | 'callback' | 'task';
  priority: 'critical' | 'high' | 'medium' | 'low';
  leadId: string;
  leadName: string;
  leadPhone: string;
  source: 'whatsapp' | 'voice' | 'web' | 'hubspot';
  classification: 'HOT' | 'WARM' | 'COLD';
  waitTime: number;
  procedureInterest?: string;
  assignedAt: string;
  notes?: string;
}

export function createMockQueueItem(overrides: Partial<MockQueueItem> = {}): MockQueueItem {
  const id = generateId('item');
  return {
    id,
    type: 'call',
    priority: 'high',
    leadId: `lead-${id}`,
    leadName: 'Test Lead',
    leadPhone: '+40721234567',
    source: 'voice',
    classification: 'HOT',
    waitTime: 60,
    procedureInterest: 'Implant dentar',
    assignedAt: new Date().toISOString(),
    ...overrides,
  };
}

export interface MockActiveCall {
  callSid: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  direction: 'inbound' | 'outbound';
  status: 'ringing' | 'in-progress' | 'on-hold';
  startedAt: string;
  duration: number;
  classification: 'HOT' | 'WARM' | 'COLD';
  procedureInterest?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  transcript: Array<{ id: string; speaker: string; text: string; timestamp: string }>;
  previousInteractions: number;
  aiScore?: number;
}

export function createMockActiveCall(overrides: Partial<MockActiveCall> = {}): MockActiveCall {
  const id = generateId('call');
  return {
    callSid: `CA${id}`,
    leadId: 'lead-1',
    leadName: 'Test Patient',
    leadPhone: '+40721234567',
    direction: 'inbound',
    status: 'in-progress',
    startedAt: new Date(Date.now() - 120000).toISOString(),
    duration: 120,
    classification: 'HOT',
    procedureInterest: 'Implant dentar',
    sentiment: 'positive',
    transcript: [],
    previousInteractions: 1,
    aiScore: 85,
    ...overrides,
  };
}

export interface MockAgentSession {
  agentId: string;
  agentName: string;
  availability: 'available' | 'busy' | 'away' | 'break' | 'training' | 'offline' | 'wrap-up';
  currentCallSid?: string;
  sessionStartedAt: string;
  leadsHandled: number;
  callsHandled: number;
  totalTalkTime: number;
  breakTimeRemaining?: number;
}

export function createMockAgentSession(
  overrides: Partial<MockAgentSession> = {}
): MockAgentSession {
  const id = generateId('agent');
  return {
    agentId: id,
    agentName: 'Test Agent',
    availability: 'available',
    sessionStartedAt: new Date(Date.now() - 3600000).toISOString(),
    leadsHandled: 5,
    callsHandled: 3,
    totalTalkTime: 1200,
    ...overrides,
  };
}

export interface MockAgentWorkspaceStats {
  queueLength: number;
  avgWaitTime: number;
  callsHandledToday: number;
  conversionsToday: number;
  avgCallDuration: number;
  satisfactionScore: number;
}

export function createMockAgentWorkspaceStats(
  overrides: Partial<MockAgentWorkspaceStats> = {}
): MockAgentWorkspaceStats {
  return {
    queueLength: 4,
    avgWaitTime: 90,
    callsHandledToday: 12,
    conversionsToday: 4,
    avgCallDuration: 180,
    satisfactionScore: 4.6,
    ...overrides,
  };
}

/**
 * LTV Dashboard factories
 */
export interface MockLeadLTV {
  leadId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  totalCases: number;
  completedCases: number;
  totalCaseValue: number;
  totalPaid: number;
  totalOutstanding: number;
  avgCaseValue: number;
  firstCaseDate: string | null;
  lastCaseDate: string | null;
}

export function createMockLeadLTV(overrides: Partial<MockLeadLTV> = {}): MockLeadLTV {
  const id = generateId('lead');
  return {
    leadId: id,
    fullName: 'Test Patient',
    email: `${id}@example.com`,
    phone: '+40721234567',
    totalCases: 2,
    completedCases: 1,
    totalCaseValue: 25000,
    totalPaid: 18000,
    totalOutstanding: 7000,
    avgCaseValue: 12500,
    firstCaseDate: '2024-01-15',
    lastCaseDate: '2024-11-20',
    ...overrides,
  };
}

export interface MockLTVDashboardStats {
  totalRevenue: number;
  totalOutstanding: number;
  avgLTV: number;
  totalCases: number;
  paidCases: number;
  partialCases: number;
  monthlyGrowth: number;
}

export function createMockLTVDashboardStats(
  overrides: Partial<MockLTVDashboardStats> = {}
): MockLTVDashboardStats {
  return {
    totalRevenue: 1250000,
    totalOutstanding: 350000,
    avgLTV: 8500,
    totalCases: 150,
    paidCases: 95,
    partialCases: 35,
    monthlyGrowth: 12.5,
    ...overrides,
  };
}

export interface MockMonthlyRevenue {
  month: string;
  grossRevenue: number;
  netRevenue: number;
  refunds: number;
  paymentCount: number;
  casesWithPayments: number;
}

export function createMockMonthlyRevenue(
  overrides: Partial<MockMonthlyRevenue> = {}
): MockMonthlyRevenue {
  return {
    month: '2024-11',
    grossRevenue: 125000,
    netRevenue: 122500,
    refunds: 2500,
    paymentCount: 45,
    casesWithPayments: 30,
    ...overrides,
  };
}

export interface MockCasePipeline {
  status: string;
  paymentStatus: string;
  caseCount: number;
  totalValue: number;
  paidValue: number;
  outstandingValue: number;
}

export function createMockCasePipeline(
  overrides: Partial<MockCasePipeline> = {}
): MockCasePipeline {
  return {
    status: 'in_progress',
    paymentStatus: 'partial',
    caseCount: 25,
    totalValue: 450000,
    paidValue: 250000,
    outstandingValue: 200000,
    ...overrides,
  };
}
