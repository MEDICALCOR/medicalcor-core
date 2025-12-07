'use server';

// ============================================================================
// TYPES
// ============================================================================

export type AgentAvailability =
  | 'available'
  | 'busy'
  | 'away'
  | 'break'
  | 'training'
  | 'offline'
  | 'wrap-up';

export type QueueItemPriority = 'critical' | 'high' | 'medium' | 'low';

export type QueueItemType = 'call' | 'message' | 'callback' | 'task';

export interface QueueItem {
  id: string;
  type: QueueItemType;
  priority: QueueItemPriority;
  leadId: string;
  leadName: string;
  leadPhone: string;
  source: 'whatsapp' | 'voice' | 'web' | 'hubspot';
  classification: 'HOT' | 'WARM' | 'COLD';
  waitTime: number; // seconds
  procedureInterest?: string;
  assignedAt: string;
  notes?: string;
}

export interface ActiveCall {
  callSid: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  direction: 'inbound' | 'outbound';
  status: 'ringing' | 'in-progress' | 'on-hold';
  startedAt: string;
  duration: number; // seconds
  classification: 'HOT' | 'WARM' | 'COLD';
  procedureInterest?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  transcript: TranscriptEntry[];
  previousInteractions: number;
  aiScore?: number;
}

export interface TranscriptEntry {
  id: string;
  speaker: 'patient' | 'agent' | 'assistant';
  text: string;
  timestamp: string;
}

export interface ScriptStep {
  id: string;
  order: number;
  title: string;
  content: string;
  type: 'greeting' | 'qualification' | 'objection' | 'closing' | 'information';
  isRequired: boolean;
  suggestedDuration?: number; // seconds
  tips?: string[];
}

export interface CallScript {
  id: string;
  name: string;
  procedureType: string;
  steps: ScriptStep[];
  objectionHandlers: ObjectionHandler[];
  faqs: FAQ[];
}

export interface ObjectionHandler {
  id: string;
  objection: string;
  response: string;
  category: 'price' | 'time' | 'trust' | 'comparison' | 'other';
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export interface AgentWorkspaceStats {
  queueLength: number;
  avgWaitTime: number;
  callsHandledToday: number;
  conversionsToday: number;
  avgCallDuration: number;
  satisfactionScore: number;
}

export interface AgentSession {
  agentId: string;
  agentName: string;
  availability: AgentAvailability;
  currentCallSid?: string;
  sessionStartedAt: string;
  leadsHandled: number;
  callsHandled: number;
  totalTalkTime: number;
  breakTimeRemaining?: number;
}

// ============================================================================
// MOCK DATA
// ============================================================================

const mockQueueItems: QueueItem[] = [
  {
    id: '1',
    type: 'call',
    priority: 'critical',
    leadId: 'lead-1',
    leadName: 'Maria Ionescu',
    leadPhone: '+40722123456',
    source: 'voice',
    classification: 'HOT',
    waitTime: 45,
    procedureInterest: 'Implant dentar',
    assignedAt: new Date(Date.now() - 45000).toISOString(),
    notes: 'Solicită programare urgentă pentru durere',
  },
  {
    id: '2',
    type: 'callback',
    priority: 'high',
    leadId: 'lead-2',
    leadName: 'Alexandru Pop',
    leadPhone: '+40733456789',
    source: 'whatsapp',
    classification: 'HOT',
    waitTime: 120,
    procedureInterest: 'All-on-4',
    assignedAt: new Date(Date.now() - 120000).toISOString(),
    notes: 'A solicitat apel pentru detalii preț',
  },
  {
    id: '3',
    type: 'message',
    priority: 'medium',
    leadId: 'lead-3',
    leadName: 'Elena Vasilescu',
    leadPhone: '+40744567890',
    source: 'whatsapp',
    classification: 'WARM',
    waitTime: 300,
    procedureInterest: 'Albire dentară',
    assignedAt: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: '4',
    type: 'task',
    priority: 'low',
    leadId: 'lead-4',
    leadName: 'Ion Gheorghe',
    leadPhone: '+40755678901',
    source: 'web',
    classification: 'COLD',
    waitTime: 600,
    procedureInterest: 'Consultație',
    assignedAt: new Date(Date.now() - 600000).toISOString(),
  },
];

const mockActiveCall: ActiveCall = {
  callSid: 'CA123456789',
  leadId: 'lead-1',
  leadName: 'Maria Ionescu',
  leadPhone: '+40722123456',
  direction: 'inbound',
  status: 'in-progress',
  startedAt: new Date(Date.now() - 180000).toISOString(),
  duration: 180,
  classification: 'HOT',
  procedureInterest: 'Implant dentar',
  sentiment: 'positive',
  previousInteractions: 2,
  aiScore: 85,
  transcript: [
    {
      id: 't1',
      speaker: 'patient',
      text: 'Bună ziua, am sunat pentru a afla mai multe despre implantul dentar.',
      timestamp: new Date(Date.now() - 170000).toISOString(),
    },
    {
      id: 't2',
      speaker: 'agent',
      text: 'Bună ziua, Maria! Mă bucur să vă aud. Cum vă putem ajuta astăzi cu implantul dentar?',
      timestamp: new Date(Date.now() - 160000).toISOString(),
    },
    {
      id: 't3',
      speaker: 'patient',
      text: 'Am pierdut un dinte în zona frontală și vreau să știu care sunt opțiunile.',
      timestamp: new Date(Date.now() - 140000).toISOString(),
    },
    {
      id: 't4',
      speaker: 'agent',
      text: 'Înțeleg. Pentru zona frontală, implantul dentar este cea mai bună soluție estetică și funcțională. Ați dori să programăm o consultație gratuită?',
      timestamp: new Date(Date.now() - 120000).toISOString(),
    },
  ],
};

const mockCallScript: CallScript = {
  id: 'script-implant',
  name: 'Script Implant Dentar',
  procedureType: 'implant',
  steps: [
    {
      id: 's1',
      order: 1,
      title: 'Salut și Identificare',
      content:
        'Bună ziua! Mă numesc [Nume Agent] de la MedicalCor Dental. Cu cine am plăcerea să vorbesc?',
      type: 'greeting',
      isRequired: true,
      suggestedDuration: 30,
      tips: ['Ton prietenos și profesional', 'Zâmbește - se aude în voce'],
    },
    {
      id: 's2',
      order: 2,
      title: 'Calificare Nevoie',
      content:
        'Înțeleg că sunteți interesat de implantul dentar. Puteți să îmi spuneți câți dinți lipsesc și de când?',
      type: 'qualification',
      isRequired: true,
      suggestedDuration: 60,
      tips: [
        'Ascultă activ',
        'Notează detaliile medicale',
        'Întreabă despre durere sau disconfort',
      ],
    },
    {
      id: 's3',
      order: 3,
      title: 'Prezentare Beneficii',
      content:
        'Implantul dentar este cea mai modernă și durabilă soluție. Spre deosebire de punți sau proteze, implantul arată și funcționează exact ca un dinte natural.',
      type: 'information',
      isRequired: true,
      suggestedDuration: 90,
      tips: ['Adaptează beneficiile la nevoile pacientului', 'Menționează rata de succes de 98%'],
    },
    {
      id: 's4',
      order: 4,
      title: 'Gestionare Preț',
      content:
        'Investiția pentru un implant complet pornește de la X EUR și include consultația, implantul premium și coroana. Oferim și opțiuni de plată în rate fără dobândă.',
      type: 'objection',
      isRequired: false,
      suggestedDuration: 60,
      tips: ['Subliniază valoarea pe termen lung', 'Menționează garanția de 10 ani'],
    },
    {
      id: 's5',
      order: 5,
      title: 'Închidere - Programare',
      content:
        'Vă propun să programăm o consultație gratuită cu Dr. [Nume]. Astfel veți primi un plan de tratament personalizat. Ce zi din această săptămână v-ar conveni?',
      type: 'closing',
      isRequired: true,
      suggestedDuration: 45,
      tips: ['Oferă 2-3 opțiuni de programare', 'Confirmă contactul și locația clinicii'],
    },
  ],
  objectionHandlers: [
    {
      id: 'o1',
      objection: 'Este prea scump',
      response:
        'Înțeleg preocuparea dvs. Dacă ne gândim pe termen lung, implantul durează o viață întreagă, spre deosebire de alte soluții care trebuie înlocuite. Oferim și plata în rate fără dobândă.',
      category: 'price',
    },
    {
      id: 'o2',
      objection: 'Mă tem de durere',
      response:
        'Este complet normal să aveți această grijă. Procedura se face sub anestezie locală și majoritatea pacienților spun că a fost mai ușor decât se așteptau. Disconfortul post-operator este minim.',
      category: 'trust',
    },
    {
      id: 'o3',
      objection: 'Trebuie să mă gândesc',
      response:
        'Sigur, este o decizie importantă. Ce informații suplimentare v-ar ajuta să luați decizia? Între timp, vă pot trimite materiale informative pe email sau WhatsApp.',
      category: 'time',
    },
  ],
  faqs: [
    {
      id: 'f1',
      question: 'Cât durează procedura?',
      answer:
        'Procedura de inserare a implantului durează aproximativ 30-60 de minute. Perioada totală de tratament, inclusiv vindecarea, este de 3-6 luni.',
      category: 'procedure',
    },
    {
      id: 'f2',
      question: 'Cât timp durează un implant?',
      answer:
        'Cu îngrijire corespunzătoare, un implant dentar poate dura toată viața. Oferim garanție de 10 ani.',
      category: 'durability',
    },
  ],
};

const mockAgentSession: AgentSession = {
  agentId: 'agent-1',
  agentName: 'Ana Popescu',
  availability: 'busy',
  currentCallSid: 'CA123456789',
  sessionStartedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  leadsHandled: 12,
  callsHandled: 8,
  totalTalkTime: 2400,
};

const mockStats: AgentWorkspaceStats = {
  queueLength: 4,
  avgWaitTime: 180,
  callsHandledToday: 8,
  conversionsToday: 3,
  avgCallDuration: 240,
  satisfactionScore: 4.7,
};

// ============================================================================
// SERVER ACTIONS
// ============================================================================

export async function getAgentSessionAction(): Promise<AgentSession> {
  // In production, this would fetch from database based on authenticated user
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockAgentSession;
}

export async function updateAgentAvailabilityAction(
  availability: AgentAvailability
): Promise<AgentSession> {
  // In production, this would update the database
  await new Promise((resolve) => setTimeout(resolve, 100));
  return {
    ...mockAgentSession,
    availability,
    currentCallSid: availability === 'available' ? undefined : mockAgentSession.currentCallSid,
  };
}

export async function getQueueItemsAction(): Promise<QueueItem[]> {
  // In production, this would fetch from database/queue service
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockQueueItems;
}

export async function getActiveCallAction(): Promise<ActiveCall | null> {
  // In production, this would fetch current call from Twilio/Vapi
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockActiveCall;
}

export async function getCallScriptAction(_procedureType?: string): Promise<CallScript> {
  // In production, this would fetch from database based on procedure type
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockCallScript;
}

export async function getWorkspaceStatsAction(): Promise<AgentWorkspaceStats> {
  // In production, this would aggregate from database
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockStats;
}

export async function acceptQueueItemAction(
  _itemId: string
): Promise<{ success: boolean; callSid?: string }> {
  // In production, this would initiate call or assign task
  await new Promise((resolve) => setTimeout(resolve, 200));
  return { success: true, callSid: `CA${Date.now()}` };
}

export async function holdCallAction(_callSid: string): Promise<{ success: boolean }> {
  // In production, this would put call on hold via Twilio
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { success: true };
}

export async function resumeCallAction(_callSid: string): Promise<{ success: boolean }> {
  // In production, this would resume call from hold
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { success: true };
}

export async function transferCallAction(
  _callSid: string,
  _targetAgentId: string
): Promise<{ success: boolean }> {
  // In production, this would transfer call via Twilio
  await new Promise((resolve) => setTimeout(resolve, 200));
  return { success: true };
}

export async function endCallAction(
  _callSid: string,
  _outcome: 'scheduled' | 'callback' | 'not-interested' | 'voicemail'
): Promise<{ success: boolean }> {
  // In production, this would end call and log outcome
  await new Promise((resolve) => setTimeout(resolve, 200));
  return { success: true };
}

export async function scheduleAppointmentAction(
  _leadId: string,
  _appointmentData: {
    date: string;
    time: string;
    procedureType: string;
    doctorId?: string;
    notes?: string;
  }
): Promise<{ success: boolean; appointmentId?: string }> {
  // In production, this would create appointment in calendar system
  await new Promise((resolve) => setTimeout(resolve, 300));
  return { success: true, appointmentId: `apt-${Date.now()}` };
}

export async function addCallNoteAction(
  _callSid: string,
  _note: string
): Promise<{ success: boolean }> {
  // In production, this would add note to call record
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { success: true };
}
