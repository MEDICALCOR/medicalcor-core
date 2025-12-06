'use server';

/**
 * Server Actions for Supervisor Dashboard
 *
 * Provides real-time data for the mobile supervisor dashboard.
 * Data is fetched from the supervisor state repository.
 */

import type {
  SupervisorDashboardStats,
  MonitoredCall,
  FlexWorker,
} from '@medicalcor/types';

/**
 * Get supervisor dashboard statistics
 */
export async function getSupervisorStatsAction(): Promise<SupervisorDashboardStats> {
  // In production, this would fetch from the supervisor state repository
  // For now, return mock data that follows the schema
  return {
    activeCalls: 5,
    callsInQueue: 3,
    averageWaitTime: 45,

    agentsAvailable: 4,
    agentsBusy: 3,
    agentsOnBreak: 1,
    agentsOffline: 2,

    aiHandledCalls: 12,
    aiHandoffRate: 15,
    averageAiConfidence: 87,

    activeAlerts: 2,
    escalationsToday: 3,
    handoffsToday: 8,

    callsHandledToday: 47,
    averageHandleTime: 180,
    serviceLevelPercent: 92,
    abandonedCalls: 2,
    customerSatisfaction: 94,

    lastUpdated: new Date(),
  };
}

/**
 * Get active calls for monitoring
 */
export async function getActiveCallsAction(): Promise<MonitoredCall[]> {
  // In production, this would fetch from Twilio/Vapi via the domain layer
  // For now, return mock data that follows the schema
  return [
    {
      callSid: 'CA001',
      customerPhone: '+40722123456',
      agentId: 'agent-1',
      agentName: 'Maria Popescu',
      contactName: 'Ion Ionescu',
      state: 'in-progress',
      direction: 'inbound',
      startedAt: new Date(Date.now() - 180000),
      duration: 180,
      sentiment: 'positive',
      urgencyLevel: 'low',
      aiScore: 92,
      flags: [],
      recentTranscript: [
        { speaker: 'customer', text: 'Bună ziua, doresc să fac o programare.', timestamp: Date.now() - 60000 },
        { speaker: 'agent', text: 'Bună ziua! Cu plăcere vă ajut.', timestamp: Date.now() - 45000 },
      ],
    },
    {
      callSid: 'CA002',
      customerPhone: '+40733456789',
      agentId: 'agent-2',
      agentName: 'Alexandru Marin',
      contactName: 'Ana Gheorghe',
      state: 'in-progress',
      direction: 'inbound',
      startedAt: new Date(Date.now() - 320000),
      duration: 320,
      sentiment: 'neutral',
      urgencyLevel: 'high',
      aiScore: 78,
      flags: ['escalation-requested'],
      recentTranscript: [
        { speaker: 'customer', text: 'Am o problemă urgentă...', timestamp: Date.now() - 30000 },
        { speaker: 'agent', text: 'Înțeleg, vă rog să-mi spuneți mai multe detalii.', timestamp: Date.now() - 15000 },
      ],
    },
    {
      callSid: 'CA003',
      customerPhone: '+40744789012',
      vapiCallId: 'vapi-123',
      assistantId: 'dental-assistant',
      contactName: 'Mihai Popa',
      state: 'in-progress',
      direction: 'inbound',
      startedAt: new Date(Date.now() - 90000),
      duration: 90,
      sentiment: 'positive',
      urgencyLevel: 'low',
      aiScore: 95,
      flags: [],
      recentTranscript: [
        { speaker: 'assistant', text: 'Bună ziua, sunt asistentul virtual al clinicii.', timestamp: Date.now() - 60000 },
        { speaker: 'customer', text: 'Aș vrea să aflu programul de mâine.', timestamp: Date.now() - 30000 },
      ],
    },
    {
      callSid: 'CA004',
      customerPhone: '+40755012345',
      agentId: 'agent-3',
      agentName: 'Elena Dumitrescu',
      contactName: 'George Stanescu',
      state: 'on-hold',
      direction: 'outbound',
      startedAt: new Date(Date.now() - 420000),
      duration: 420,
      sentiment: 'negative',
      urgencyLevel: 'critical',
      aiScore: 45,
      flags: ['complaint', 'long-hold'],
      recentTranscript: [
        { speaker: 'customer', text: 'De ce durează atât de mult?', timestamp: Date.now() - 120000 },
        { speaker: 'agent', text: 'Îmi cer scuze, verific imediat.', timestamp: Date.now() - 90000 },
      ],
    },
    {
      callSid: 'CA005',
      customerPhone: '+40766345678',
      agentId: 'agent-1',
      agentName: 'Maria Popescu',
      state: 'wrapping-up',
      direction: 'inbound',
      startedAt: new Date(Date.now() - 600000),
      duration: 600,
      sentiment: 'positive',
      urgencyLevel: 'low',
      aiScore: 88,
      flags: ['high-value-lead'],
      recentTranscript: [],
    },
  ];
}

/**
 * Get agent statuses
 */
export async function getAgentStatusesAction(): Promise<FlexWorker[]> {
  // In production, this would fetch from Twilio Flex
  return [
    {
      workerSid: 'WK001',
      friendlyName: 'Maria Popescu',
      activityName: 'busy',
      available: false,
      skills: ['dental', 'orthodontics'],
      languages: ['ro', 'en'],
      currentCallSid: 'CA001',
      tasksInProgress: 1,
    },
    {
      workerSid: 'WK002',
      friendlyName: 'Alexandru Marin',
      activityName: 'busy',
      available: false,
      skills: ['dental', 'implants'],
      languages: ['ro'],
      currentCallSid: 'CA002',
      tasksInProgress: 1,
    },
    {
      workerSid: 'WK003',
      friendlyName: 'Elena Dumitrescu',
      activityName: 'busy',
      available: false,
      skills: ['dental', 'pediatric'],
      languages: ['ro', 'en', 'fr'],
      currentCallSid: 'CA004',
      tasksInProgress: 1,
    },
    {
      workerSid: 'WK004',
      friendlyName: 'Andrei Stoica',
      activityName: 'available',
      available: true,
      skills: ['dental'],
      languages: ['ro'],
      tasksInProgress: 0,
    },
    {
      workerSid: 'WK005',
      friendlyName: 'Cristina Radu',
      activityName: 'available',
      available: true,
      skills: ['dental', 'cosmetic'],
      languages: ['ro', 'en'],
      tasksInProgress: 0,
    },
    {
      workerSid: 'WK006',
      friendlyName: 'Ionut Florea',
      activityName: 'break',
      available: false,
      skills: ['dental'],
      languages: ['ro'],
      tasksInProgress: 0,
    },
    {
      workerSid: 'WK007',
      friendlyName: 'Diana Preda',
      activityName: 'available',
      available: true,
      skills: ['dental', 'surgery'],
      languages: ['ro', 'en'],
      tasksInProgress: 0,
    },
    {
      workerSid: 'WK008',
      friendlyName: 'Victor Neagu',
      activityName: 'available',
      available: true,
      skills: ['dental'],
      languages: ['ro'],
      tasksInProgress: 0,
    },
  ];
}

/**
 * Get recent alerts for supervisor
 */
export async function getAlertsAction(): Promise<Array<{
  id: string;
  type: 'escalation' | 'long-hold' | 'silence' | 'high-value' | 'ai-handoff';
  severity: 'info' | 'warning' | 'critical';
  callSid?: string;
  agentName?: string;
  message: string;
  timestamp: Date;
}>> {
  return [
    {
      id: 'alert-1',
      type: 'escalation',
      severity: 'critical',
      callSid: 'CA002',
      agentName: 'Alexandru Marin',
      message: 'Solicitare de escaladare de la client',
      timestamp: new Date(Date.now() - 60000),
    },
    {
      id: 'alert-2',
      type: 'long-hold',
      severity: 'warning',
      callSid: 'CA004',
      agentName: 'Elena Dumitrescu',
      message: 'Client în așteptare de peste 2 minute',
      timestamp: new Date(Date.now() - 120000),
    },
  ];
}
