/**
 * Supervisor Agent Domain Service
 * W3 Milestone: Voice AI + Realtime Supervisor
 *
 * Provides real-time call monitoring, supervisor actions, and AI-to-human handoff
 * coordination for the dental clinic call center.
 */
import { EventEmitter } from 'events';
import type {
  MonitoredCall,
  SupervisorSession,
  SupervisorDashboardStats,
  SupervisorRole,
  SupervisorPermission,
  HandoffRequest,
  SupervisorNote,
} from '@medicalcor/types';
import {
  MonitoredCallSchema,
  SupervisorSessionSchema,
  HandoffRequestSchema,
  SupervisorNoteSchema,
} from '@medicalcor/types';

// =============================================================================
// Configuration
// =============================================================================

export interface SupervisorAgentConfig {
  /**
   * Maximum number of active calls to track
   */
  maxActiveCalls?: number;
  /**
   * Maximum number of concurrent supervisor sessions
   */
  maxSupervisorSessions?: number;
  /**
   * Alert thresholds
   */
  alertThresholds?: {
    /** Seconds before triggering long-hold alert */
    longHoldSeconds?: number;
    /** Seconds of silence before triggering alert */
    silenceSeconds?: number;
    /** Sentiment score (-1 to 1) below which to alert */
    negativeSentimentThreshold?: number;
  };
  /**
   * Auto-escalation rules
   */
  autoEscalation?: {
    /** Enable automatic escalation for critical calls */
    enabled?: boolean;
    /** Number of negative sentiment messages before escalation */
    negativeMessageThreshold?: number;
    /** Keywords that trigger immediate escalation */
    escalationKeywords?: string[];
  };
}

/**
 * Fully resolved configuration with all defaults applied
 */
interface ResolvedSupervisorAgentConfig {
  maxActiveCalls: number;
  maxSupervisorSessions: number;
  alertThresholds: {
    longHoldSeconds: number;
    silenceSeconds: number;
    negativeSentimentThreshold: number;
  };
  autoEscalation: {
    enabled: boolean;
    negativeMessageThreshold: number;
    escalationKeywords: string[];
  };
}

// =============================================================================
// Events
// =============================================================================

export interface SupervisorAgentEvents {
  'call:started': (call: MonitoredCall) => void;
  'call:updated': (callSid: string, changes: Partial<MonitoredCall>) => void;
  'call:ended': (
    callSid: string,
    outcome: 'completed' | 'transferred' | 'abandoned' | 'failed' | 'voicemail'
  ) => void;
  'transcript:message': (
    callSid: string,
    speaker: 'customer' | 'agent' | 'assistant',
    text: string
  ) => void;
  'alert:escalation': (callSid: string, reason: string) => void;
  'alert:long-hold': (callSid: string, holdDuration: number) => void;
  'alert:silence': (callSid: string, silenceDuration: number) => void;
  'alert:negative-sentiment': (callSid: string, sentiment: number) => void;
  'supervisor:joined': (sessionId: string, callSid: string, mode: string) => void;
  'supervisor:left': (sessionId: string, callSid: string) => void;
  'handoff:requested': (request: HandoffRequest) => void;
  'handoff:completed': (callSid: string, agentId: string) => void;
}

// =============================================================================
// Permission Helpers
// =============================================================================

const ROLE_PERMISSIONS: Record<SupervisorRole, SupervisorPermission[]> = {
  supervisor: ['listen', 'whisper'],
  manager: ['listen', 'whisper', 'barge'],
  admin: ['listen', 'whisper', 'barge', 'coach'],
};

function hasPermission(role: SupervisorRole, permission: SupervisorPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

// =============================================================================
// Supervisor Agent Implementation
// =============================================================================

/**
 * Tracked escalation event for historical reporting
 */
interface EscalationEvent {
  callSid: string;
  timestamp: Date;
  reason: string;
}

export class SupervisorAgent extends EventEmitter {
  private config: ResolvedSupervisorAgentConfig;
  private activeCalls = new Map<string, MonitoredCall>();
  private supervisorSessions = new Map<string, SupervisorSession>();
  private callNotes = new Map<string, SupervisorNote[]>();
  private callTimers = new Map<string, NodeJS.Timeout>();

  // Historical tracking for daily metrics
  private escalationHistory: EscalationEvent[] = [];
  private handoffHistory: { callSid: string; timestamp: Date; agentId: string }[] = [];

  // Escalation keywords (Romanian + English)
  private readonly ESCALATION_KEYWORDS = [
    // English
    'manager',
    'supervisor',
    'complaint',
    'lawsuit',
    'lawyer',
    'refund',
    'speak to human',
    'real person',
    // Romanian
    'sef',
    'manager',
    'plangere',
    'avocat',
    'reclamatie',
    'rambursare',
    'persoana reala',
    'om adevarat',
    'nu vreau robot',
    'nu functioneaza',
  ];

  constructor(config: SupervisorAgentConfig = {}) {
    super();
    this.config = {
      maxActiveCalls: config.maxActiveCalls ?? 100,
      maxSupervisorSessions: config.maxSupervisorSessions ?? 20,
      alertThresholds: {
        longHoldSeconds: config.alertThresholds?.longHoldSeconds ?? 120,
        silenceSeconds: config.alertThresholds?.silenceSeconds ?? 30,
        negativeSentimentThreshold: config.alertThresholds?.negativeSentimentThreshold ?? -0.5,
      },
      autoEscalation: {
        enabled: config.autoEscalation?.enabled ?? true,
        negativeMessageThreshold: config.autoEscalation?.negativeMessageThreshold ?? 3,
        escalationKeywords: config.autoEscalation?.escalationKeywords ?? this.ESCALATION_KEYWORDS,
      },
    };
  }

  // =============================================================================
  // Call Lifecycle Management
  // =============================================================================

  /**
   * Register a new call for monitoring
   */
  registerCall(callData: Omit<MonitoredCall, 'recentTranscript' | 'flags'>): MonitoredCall {
    if (this.activeCalls.size >= this.config.maxActiveCalls) {
      // Remove oldest call to make room
      const oldestCallSid = this.activeCalls.keys().next().value;
      if (oldestCallSid) {
        this.activeCalls.delete(oldestCallSid);
      }
    }

    const call: MonitoredCall = {
      ...callData,
      recentTranscript: [],
      flags: [],
    };

    const validated = MonitoredCallSchema.parse(call);
    this.activeCalls.set(validated.callSid, validated);

    // Start monitoring timer for alerts
    this.startCallMonitoring(validated.callSid);

    this.emit('call:started', validated);
    return validated;
  }

  /**
   * Update call state
   */
  updateCall(callSid: string, updates: Partial<MonitoredCall>): MonitoredCall | null {
    const call = this.activeCalls.get(callSid);
    if (!call) return null;

    const updatedCall = { ...call, ...updates };
    this.activeCalls.set(callSid, updatedCall);

    this.emit('call:updated', callSid, updates);
    return updatedCall;
  }

  /**
   * End and remove a call from monitoring
   */
  endCall(
    callSid: string,
    outcome: 'completed' | 'transferred' | 'abandoned' | 'failed' | 'voicemail' = 'completed'
  ): void {
    this.stopCallMonitoring(callSid);
    this.activeCalls.delete(callSid);

    // End any supervisor sessions monitoring this call
    for (const [sessionId, session] of this.supervisorSessions.entries()) {
      if (session.activeCallSid === callSid) {
        this.stopMonitoring(sessionId);
      }
    }

    this.emit('call:ended', callSid, outcome);
  }

  /**
   * Get a specific call
   */
  getCall(callSid: string): MonitoredCall | undefined {
    return this.activeCalls.get(callSid);
  }

  /**
   * Get all active calls
   */
  getActiveCalls(): MonitoredCall[] {
    return Array.from(this.activeCalls.values());
  }

  /**
   * Get calls with specific flags (e.g., escalation-requested)
   */
  getCallsByFlag(
    flag:
      | 'escalation-requested'
      | 'high-value-lead'
      | 'complaint'
      | 'long-hold'
      | 'silence-detected'
      | 'ai-handoff-needed'
  ): MonitoredCall[] {
    return this.getActiveCalls().filter((call) => call.flags.includes(flag));
  }

  // =============================================================================
  // Transcript Processing
  // =============================================================================

  /**
   * Process incoming transcript message
   * Handles sentiment analysis, keyword detection, and auto-escalation
   */
  processTranscriptMessage(
    callSid: string,
    speaker: 'customer' | 'agent' | 'assistant',
    text: string,
    _confidence?: number
  ): void {
    const call = this.activeCalls.get(callSid);
    if (!call) return;

    // Add to recent transcript (keep last 20 messages)
    const transcript = [...call.recentTranscript];
    transcript.push({
      speaker,
      text,
      timestamp: Date.now(),
    });

    if (transcript.length > 20) {
      transcript.shift();
    }

    // Check for escalation keywords
    const lowerText = text.toLowerCase();
    const escalationKeywords = this.config.autoEscalation.escalationKeywords;
    const hasEscalationKeyword = escalationKeywords.some((kw) => lowerText.includes(kw));

    if (hasEscalationKeyword && speaker === 'customer') {
      this.flagCall(callSid, 'escalation-requested');
      this.emit('alert:escalation', callSid, `Escalation keyword detected: "${text}"`);
    }

    // Update call with new transcript
    this.updateCall(callSid, { recentTranscript: transcript });

    this.emit('transcript:message', callSid, speaker, text);
  }

  /**
   * Update call sentiment based on analysis
   */
  updateSentiment(
    callSid: string,
    sentiment: 'positive' | 'neutral' | 'negative',
    score?: number
  ): void {
    const call = this.activeCalls.get(callSid);
    if (!call) return;

    this.updateCall(callSid, { sentiment });

    // Check for negative sentiment threshold
    const threshold = this.config.alertThresholds.negativeSentimentThreshold;
    if (sentiment === 'negative' && score !== undefined && score < threshold) {
      this.emit('alert:negative-sentiment', callSid, score);
    }
  }

  // =============================================================================
  // Call Flags & Alerts
  // =============================================================================

  /**
   * Add a flag to a call
   */
  flagCall(
    callSid: string,
    flag:
      | 'escalation-requested'
      | 'high-value-lead'
      | 'complaint'
      | 'long-hold'
      | 'silence-detected'
      | 'ai-handoff-needed',
    reason?: string
      | 'ai-handoff-needed'
  ): void {
    const call = this.activeCalls.get(callSid);
    if (!call) return;

    const flags = [...call.flags];
    if (!flags.includes(flag)) {
      flags.push(flag);
      this.updateCall(callSid, { flags });

      // Track escalation in history for reporting
      if (flag === 'escalation-requested') {
        this.escalationHistory.push({
          callSid,
          timestamp: new Date(),
          reason: reason ?? 'Manual escalation',
        });

        // Prune old history (keep last 7 days)
        this.pruneOldHistory();
      }
    }
  }

  /**
   * Prune history older than 7 days to prevent memory buildup
   */
  private pruneOldHistory(): void {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    this.escalationHistory = this.escalationHistory.filter((e) => e.timestamp > sevenDaysAgo);
    this.handoffHistory = this.handoffHistory.filter((h) => h.timestamp > sevenDaysAgo);
  }

  /**
   * Get escalations for today
   */
  getEscalationsToday(): EscalationEvent[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.escalationHistory.filter((e) => e.timestamp >= today);
  }

  /**
   * Get handoffs for today
   */
  getHandoffsToday(): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.handoffHistory.filter((h) => h.timestamp >= today).length;
  }

  /**
    }
  }

  /**
   * Remove a flag from a call
   */
  unflagCall(
    callSid: string,
    flag:
      | 'escalation-requested'
      | 'high-value-lead'
      | 'complaint'
      | 'long-hold'
      | 'silence-detected'
      | 'ai-handoff-needed'
  ): void {
    const call = this.activeCalls.get(callSid);
    if (!call) return;

    const flags = call.flags.filter((f) => f !== flag);
    this.updateCall(callSid, { flags });
  }

  /**
   * Start monitoring timers for a call (hold time, silence detection)
   */
  private startCallMonitoring(callSid: string): void {
    // Check hold time periodically
    const timer = setInterval(() => {
      const call = this.activeCalls.get(callSid);
      if (!call) {
        this.stopCallMonitoring(callSid);
        return;
      }

      // Check for long hold
      if (call.state === 'on-hold') {
        const holdDuration = (Date.now() - call.startedAt.getTime()) / 1000;
        const longHoldThreshold = this.config.alertThresholds.longHoldSeconds;
        if (holdDuration >= longHoldThreshold) {
          if (!call.flags.includes('long-hold')) {
            this.flagCall(callSid, 'long-hold');
            this.emit('alert:long-hold', callSid, holdDuration);
          }
        }
      }
    }, 10000); // Check every 10 seconds

    this.callTimers.set(callSid, timer);
  }

  /**
   * Stop monitoring timers for a call
   */
  private stopCallMonitoring(callSid: string): void {
    const timer = this.callTimers.get(callSid);
    if (timer) {
      clearInterval(timer);
      this.callTimers.delete(callSid);
    }
  }

  // =============================================================================
  // Supervisor Session Management
  // =============================================================================

  /**
   * Create a new supervisor session
   */
  createSession(
    supervisorId: string,
    supervisorName: string,
    role: SupervisorRole
  ): SupervisorSession {
    if (this.supervisorSessions.size >= this.config.maxSupervisorSessions) {
      throw new Error('Maximum supervisor sessions reached');
    }

    const sessionId = `sup_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const session: SupervisorSession = {
      sessionId,
      supervisorId,
      supervisorName,
      role,
      permissions: ROLE_PERMISSIONS[role],
      monitoringMode: 'none',
      startedAt: new Date(),
      callsMonitored: 0,
      interventions: 0,
    };

    const validated = SupervisorSessionSchema.parse(session);
    this.supervisorSessions.set(sessionId, validated);
    return validated;
  }

  /**
   * Get supervisor session
   */
  getSession(sessionId: string): SupervisorSession | undefined {
    return this.supervisorSessions.get(sessionId);
  }

  /**
   * Get all active supervisor sessions
   */
  getActiveSessions(): SupervisorSession[] {
    return Array.from(this.supervisorSessions.values());
  }

  /**
   * End a supervisor session
   */
  endSession(sessionId: string): void {
    const session = this.supervisorSessions.get(sessionId);
    if (session?.activeCallSid) {
      this.emit('supervisor:left', sessionId, session.activeCallSid);
    }
    this.supervisorSessions.delete(sessionId);
  }

  // =============================================================================
  // Supervisor Actions
  // =============================================================================

  /**
   * Start monitoring a call
   */
  startMonitoring(
    sessionId: string,
    callSid: string,
    mode: 'listen' | 'whisper' | 'barge' = 'listen'
  ): { success: boolean; error?: string } {
    const session = this.supervisorSessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const call = this.activeCalls.get(callSid);
    if (!call) {
      return { success: false, error: 'Call not found' };
    }

    // Check permissions
    const requiredPermission: SupervisorPermission =
      mode === 'barge' ? 'barge' : mode === 'whisper' ? 'whisper' : 'listen';

    if (!hasPermission(session.role, requiredPermission)) {
      return { success: false, error: `Insufficient permissions for ${mode} mode` };
    }

    // Update session
    session.activeCallSid = callSid;
    session.monitoringMode = mode;
    session.callsMonitored++;
    this.supervisorSessions.set(sessionId, session);

    this.emit('supervisor:joined', sessionId, callSid, mode);
    return { success: true };
  }

  /**
   * Stop monitoring a call
   */
  stopMonitoring(sessionId: string): { success: boolean; error?: string } {
    const session = this.supervisorSessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const previousCallSid = session.activeCallSid;

    session.activeCallSid = undefined;
    session.monitoringMode = 'none';
    this.supervisorSessions.set(sessionId, session);

    if (previousCallSid) {
      this.emit('supervisor:left', sessionId, previousCallSid);
    }

    return { success: true };
  }

  /**
   * Change monitoring mode (e.g., from listen to whisper)
   */
  changeMonitoringMode(
    sessionId: string,
    mode: 'listen' | 'whisper' | 'barge'
  ): { success: boolean; error?: string } {
    const session = this.supervisorSessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    if (!session.activeCallSid) {
      return { success: false, error: 'Not monitoring any call' };
    }

    const requiredPermission: SupervisorPermission =
      mode === 'barge' ? 'barge' : mode === 'whisper' ? 'whisper' : 'listen';

    if (!hasPermission(session.role, requiredPermission)) {
      return { success: false, error: `Insufficient permissions for ${mode} mode` };
    }

    session.monitoringMode = mode;
    if (mode !== 'listen') {
      session.interventions++;
    }
    this.supervisorSessions.set(sessionId, session);

    return { success: true };
  }

  // =============================================================================
  // AI-to-Human Handoff
  // =============================================================================

  /**
   * Request handoff from AI to human agent
   */
  requestHandoff(request: HandoffRequest): {
    success: boolean;
    handoffId?: string;
    error?: string;
  } {
    const validated = HandoffRequestSchema.parse(request);
    const call = this.activeCalls.get(validated.callSid);

    if (!call) {
      return { success: false, error: 'Call not found' };
    }

    // Flag the call for handoff
    this.flagCall(validated.callSid, 'ai-handoff-needed');

    // Generate handoff ID
    const handoffId = `hoff_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    this.emit('handoff:requested', validated);

    return { success: true, handoffId };
  }

  /**
   * Complete a handoff (AI disconnected, human agent connected)
   */
  completeHandoff(callSid: string, agentId: string): void {
    this.unflagCall(callSid, 'ai-handoff-needed');
    this.updateCall(callSid, { agentId });

    // Track handoff in history for reporting
    this.handoffHistory.push({
      callSid,
      timestamp: new Date(),
      agentId,
    });

    this.emit('handoff:completed', callSid, agentId);
  }

  // =============================================================================
  // Supervisor Notes
  // =============================================================================

  /**
   * Add a note to a call
   */
  addNote(note: Omit<SupervisorNote, 'timestamp'>): SupervisorNote {
    const fullNote: SupervisorNote = {
      ...note,
      timestamp: new Date(),
    };

    const validated = SupervisorNoteSchema.parse(fullNote);

    const notes = this.callNotes.get(note.callSid) ?? [];
    notes.push(validated);
    this.callNotes.set(note.callSid, notes);

    return validated;
  }

  /**
   * Get notes for a call
   */
  getNotes(callSid: string, supervisorId?: string): SupervisorNote[] {
    const notes = this.callNotes.get(callSid) ?? [];

    if (supervisorId) {
      // Filter to show own notes and non-private notes
      return notes.filter((n) => n.supervisorId === supervisorId || !n.isPrivate);
    }

    return notes;
  }

  // =============================================================================
  // Dashboard Statistics
  // =============================================================================

  /**
   * Get real-time dashboard statistics
   */
  getDashboardStats(): Partial<SupervisorDashboardStats> {
    const calls = this.getActiveCalls();

    // Calculate active metrics
    const activeEscalations = calls.filter((c) => c.flags.includes('escalation-requested'));
    const aiHandoffs = calls.filter((c) => c.flags.includes('ai-handoff-needed'));
    const callsWithFlags = calls.filter((c) => c.flags.length > 0);

    // Historical metrics from tracking
    const escalationsToday = this.getEscalationsToday();
    const handoffsToday = this.getHandoffsToday();

    // Calculate metrics
    const escalations = calls.filter((c) => c.flags.includes('escalation-requested'));
    const aiHandoffs = calls.filter((c) => c.flags.includes('ai-handoff-needed'));
    const callsWithFlags = calls.filter((c) => c.flags.length > 0);

    return {
      activeCalls: calls.length,
      callsInQueue: calls.filter((c) => c.state === 'ringing').length,

      activeAlerts: activeEscalations.length + aiHandoffs.length + callsWithFlags.length,
      escalationsToday: escalationsToday.length,
      handoffsToday,
      activeAlerts: escalations.length + aiHandoffs.length + callsWithFlags.length,
      escalationsToday: escalations.length, // Would need historical tracking

      aiHandledCalls: calls.filter((c) => c.assistantId && !c.agentId).length,

      lastUpdated: new Date(),
    };
  }

  // =============================================================================
  // Cleanup
  // =============================================================================

  /**
   * Clean up all resources
   */
  destroy(): void {
    // Clear all timers
    for (const timer of this.callTimers.values()) {
      clearInterval(timer);
    }
    this.callTimers.clear();

    // Clear all data
    this.activeCalls.clear();
    this.supervisorSessions.clear();
    this.callNotes.clear();

    // Clear historical tracking
    this.escalationHistory = [];
    this.handoffHistory = [];

    // Remove all listeners
    this.removeAllListeners();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

let supervisorAgentInstance: SupervisorAgent | null = null;

/**
 * Create or get the supervisor agent singleton
 */
export function getSupervisorAgent(config?: SupervisorAgentConfig): SupervisorAgent {
  supervisorAgentInstance ??= new SupervisorAgent(config);
  return supervisorAgentInstance;
}

/**
 * Reset the supervisor agent (for testing)
 */
export function resetSupervisorAgent(): void {
  if (supervisorAgentInstance) {
    supervisorAgentInstance.destroy();
    supervisorAgentInstance = null;
  }
}
