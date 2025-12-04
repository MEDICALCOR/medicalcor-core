/**
 * Twilio Flex Integration Client
 * W3 Milestone: Voice AI + Realtime Supervisor
 *
 * Provides Flex TaskRouter, Conference, and Supervisor capabilities
 * for real-time call monitoring and agent management.
 */
import { z } from 'zod';
import crypto from 'crypto';
import { withRetry, ExternalServiceError } from '@medicalcor/core';
import type {
  FlexWorker,
  FlexQueue,
  FlexTask,
  MonitoredCall,
  SupervisorDashboardStats,
} from '@medicalcor/types';

// =============================================================================
// Configuration
// =============================================================================

export interface FlexClientConfig {
  accountSid: string;
  authToken: string;
  workspaceSid: string;
  flexFlowSid?: string | undefined;
  baseUrl?: string | undefined;
  /**
   * Request timeout in milliseconds
   * Default 30000ms (30s) to prevent hanging requests
   */
  timeoutMs?: number | undefined;
  retryConfig?:
    | {
        maxRetries: number;
        baseDelayMs: number;
      }
    | undefined;
}

// =============================================================================
// API Response Schemas
// =============================================================================

const TwilioWorkerSchema = z.object({
  sid: z.string(),
  friendly_name: z.string(),
  activity_name: z.string(),
  activity_sid: z.string(),
  available: z.boolean(),
  attributes: z.string(),
  date_created: z.string(),
  date_updated: z.string(),
});

const TwilioQueueSchema = z.object({
  sid: z.string(),
  friendly_name: z.string(),
  target_workers: z.string().optional(),
  current_size: z.number().optional(),
});

const TwilioTaskSchema = z.object({
  sid: z.string(),
  queue_sid: z.string(),
  worker_sid: z.string().nullable(),
  attributes: z.string(),
  assignment_status: z.string(),
  priority: z.number(),
  reason: z.string().nullable(),
  date_created: z.string(),
  date_updated: z.string(),
  timeout: z.number(),
});

const TwilioConferenceSchema = z.object({
  sid: z.string(),
  friendly_name: z.string(),
  status: z.string(),
  date_created: z.string(),
  date_updated: z.string(),
});

const TwilioParticipantSchema = z.object({
  call_sid: z.string(),
  conference_sid: z.string(),
  muted: z.boolean(),
  hold: z.boolean(),
  coaching: z.boolean(),
  status: z.string(),
});

// =============================================================================
// Types
// =============================================================================

export interface CreateTaskInput {
  workflowSid: string;
  attributes: Record<string, unknown>;
  priority?: number;
  timeout?: number;
  taskChannel?: string;
}

export interface UpdateWorkerInput {
  workerSid: string;
  activitySid?: string;
  attributes?: Record<string, unknown>;
}

export interface CreateConferenceInput {
  friendlyName: string;
  statusCallback?: string;
  statusCallbackEvent?: string[];
  record?: boolean;
}

export interface AddParticipantInput {
  conferenceSid: string;
  from: string;
  to: string;
  statusCallback?: string;
  muted?: boolean;
  coaching?: boolean;
  callSidToCoach?: string;
}

export interface SupervisorMonitorInput {
  conferenceSid: string;
  supervisorCallSid: string;
  mode: 'listen' | 'whisper' | 'barge';
}

export interface QueueStats {
  queueSid: string;
  friendlyName: string;
  currentSize: number;
  longestWaitTime: number;
  averageWaitTime: number;
  tasksToday: number;
}

export interface WorkerStats {
  totalWorkers: number;
  available: number;
  busy: number;
  offline: number;
  onBreak: number;
}

// =============================================================================
// Twilio Flex Client Implementation
// =============================================================================

export class FlexClient {
  private config: FlexClientConfig;
  private baseUrl: string;

  // Active calls cache for supervisor dashboard (TTL: 5 minutes)
  private activeCallsCache = new Map<string, { call: MonitoredCall; updatedAt: number }>();
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

  constructor(config: FlexClientConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl ?? 'https://taskrouter.twilio.com/v1';
  }

  // =============================================================================
  // HTTP Request Helpers
  // =============================================================================

  private getAuthHeader(): string {
    const credentials = `${this.config.accountSid}:${this.config.authToken}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  private async requestWithTimeout<T>(url: string, options: RequestInit = {}): Promise<T> {
    const timeoutMs = this.config.timeoutMs ?? 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: this.getAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(options.headers as Record<string, string> | undefined),
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new ExternalServiceError(
          'TwilioFlex',
          `Request failed with status ${response.status}`
        );
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExternalServiceError('TwilioFlex', `Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  private encodeFormData(data: Record<string, unknown>): string {
    return Object.entries(data)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
  }

  private getRetryConfig() {
    return {
      maxRetries: this.config.retryConfig?.maxRetries ?? 3,
      baseDelayMs: this.config.retryConfig?.baseDelayMs ?? 1000,
      shouldRetry: (error: unknown) => {
        if (error instanceof Error) {
          if (error.message.includes('rate_limit')) return true;
          if (error.message.includes('502')) return true;
          if (error.message.includes('503')) return true;
          if (error.message.includes('timeout')) return true;
        }
        return false;
      },
    };
  }

  // =============================================================================
  // TaskRouter - Workers
  // =============================================================================

  /**
   * List all workers in the workspace
   */
  async listWorkers(options?: {
    activityName?: string;
    available?: boolean;
    targetWorkersExpression?: string;
  }): Promise<FlexWorker[]> {
    const params = new URLSearchParams();
    if (options?.activityName) params.append('ActivityName', options.activityName);
    if (options?.available !== undefined) params.append('Available', String(options.available));
    if (options?.targetWorkersExpression) {
      params.append('TargetWorkersExpression', options.targetWorkersExpression);
    }

    const makeRequest = async () => {
      const url = `${this.baseUrl}/Workspaces/${this.config.workspaceSid}/Workers${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await this.requestWithTimeout<{ workers: unknown[] }>(url);
      return response.workers.map((w) => this.transformWorker(TwilioWorkerSchema.parse(w)));
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  /**
   * Get a specific worker
   */
  async getWorker(workerSid: string): Promise<FlexWorker> {
    const makeRequest = async () => {
      const url = `${this.baseUrl}/Workspaces/${this.config.workspaceSid}/Workers/${workerSid}`;
      const response = await this.requestWithTimeout<unknown>(url);
      return this.transformWorker(TwilioWorkerSchema.parse(response));
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  /**
   * Update worker activity or attributes
   */
  async updateWorker(input: UpdateWorkerInput): Promise<FlexWorker> {
    const makeRequest = async () => {
      const url = `${this.baseUrl}/Workspaces/${this.config.workspaceSid}/Workers/${input.workerSid}`;
      const body: Record<string, unknown> = {};
      if (input.activitySid) body.ActivitySid = input.activitySid;
      if (input.attributes) body.Attributes = JSON.stringify(input.attributes);

      const response = await this.requestWithTimeout<unknown>(url, {
        method: 'POST',
        body: this.encodeFormData(body),
      });
      return this.transformWorker(TwilioWorkerSchema.parse(response));
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  private transformWorker(tw: z.infer<typeof TwilioWorkerSchema>): FlexWorker {
    let attributes: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(tw.attributes);
      if (parsed && typeof parsed === 'object') {
        attributes = parsed as Record<string, unknown>;
      }
    } catch {
      // Invalid JSON attributes, use empty object
    }

    const skills = Array.isArray(attributes.skills) ? (attributes.skills as string[]) : [];
    const languages = Array.isArray(attributes.languages) ? (attributes.languages as string[]) : [];

    return {
      workerSid: tw.sid,
      friendlyName: tw.friendly_name,
      activityName: this.mapActivityName(tw.activity_name),
      available: tw.available,
      attributes,
      skills,
      languages,
      currentCallSid: attributes.current_call_sid as string | undefined,
      tasksInProgress: 0,
    };
  }

  private mapActivityName(
    name: string
  ): 'available' | 'unavailable' | 'offline' | 'break' | 'busy' | 'wrap-up' {
    const normalized = name.toLowerCase();
    if (normalized.includes('available')) return 'available';
    if (normalized.includes('busy') || normalized.includes('reserved')) return 'busy';
    if (normalized.includes('break')) return 'break';
    if (normalized.includes('wrap')) return 'wrap-up';
    if (normalized.includes('offline')) return 'offline';
    return 'unavailable';
  }

  // =============================================================================
  // TaskRouter - Queues
  // =============================================================================

  /**
   * List all task queues
   */
  async listQueues(): Promise<FlexQueue[]> {
    const makeRequest = async () => {
      const url = `${this.baseUrl}/Workspaces/${this.config.workspaceSid}/TaskQueues`;
      const response = await this.requestWithTimeout<{ task_queues: unknown[] }>(url);
      return response.task_queues.map((q) => this.transformQueue(TwilioQueueSchema.parse(q)));
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueSid: string): Promise<QueueStats> {
    const makeRequest = async () => {
      const url = `${this.baseUrl}/Workspaces/${this.config.workspaceSid}/TaskQueues/${queueSid}/Statistics`;
      const response = await this.requestWithTimeout<{
        realtime: {
          tasks_by_status: { pending?: number; reserved?: number; assigned?: number };
          longest_task_waiting_age?: number;
          average_task_acceptance_time?: number;
          total_tasks?: number;
        };
      }>(url);

      const stats = response.realtime;
      const taskStatus = stats.tasks_by_status;
      const pending = taskStatus.pending ?? 0;
      const reserved = taskStatus.reserved ?? 0;
      const assigned = taskStatus.assigned ?? 0;

      return {
        queueSid,
        friendlyName: '',
        currentSize: pending + reserved,
        longestWaitTime: stats.longest_task_waiting_age ?? 0,
        averageWaitTime: stats.average_task_acceptance_time ?? 0,
        tasksToday: stats.total_tasks ?? pending + reserved + assigned,
      };
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  private transformQueue(tq: z.infer<typeof TwilioQueueSchema>): FlexQueue {
    return {
      queueSid: tq.sid,
      friendlyName: tq.friendly_name,
      currentSize: tq.current_size ?? 0,
      longestWaitTime: 0,
      averageWaitTime: 0,
      targetWorkers: tq.target_workers,
    };
  }

  // =============================================================================
  // TaskRouter - Tasks
  // =============================================================================

  /**
   * Create a new task
   */
  async createTask(input: CreateTaskInput): Promise<FlexTask> {
    const makeRequest = async () => {
      const url = `${this.baseUrl}/Workspaces/${this.config.workspaceSid}/Tasks`;
      const body: Record<string, unknown> = {
        WorkflowSid: input.workflowSid,
        Attributes: JSON.stringify(input.attributes),
      };
      if (input.priority !== undefined) body.Priority = input.priority;
      if (input.timeout !== undefined) body.Timeout = input.timeout;
      if (input.taskChannel) body.TaskChannel = input.taskChannel;

      const response = await this.requestWithTimeout<unknown>(url, {
        method: 'POST',
        body: this.encodeFormData(body),
      });
      return this.transformTask(TwilioTaskSchema.parse(response));
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  /**
   * Get a specific task
   */
  async getTask(taskSid: string): Promise<FlexTask> {
    const makeRequest = async () => {
      const url = `${this.baseUrl}/Workspaces/${this.config.workspaceSid}/Tasks/${taskSid}`;
      const response = await this.requestWithTimeout<unknown>(url);
      return this.transformTask(TwilioTaskSchema.parse(response));
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  /**
   * Update task (e.g., complete or cancel)
   */
  async updateTask(
    taskSid: string,
    update: { assignmentStatus?: string; reason?: string }
  ): Promise<FlexTask> {
    const makeRequest = async () => {
      const url = `${this.baseUrl}/Workspaces/${this.config.workspaceSid}/Tasks/${taskSid}`;
      const body: Record<string, unknown> = {};
      if (update.assignmentStatus) body.AssignmentStatus = update.assignmentStatus;
      if (update.reason) body.Reason = update.reason;

      const response = await this.requestWithTimeout<unknown>(url, {
        method: 'POST',
        body: this.encodeFormData(body),
      });
      return this.transformTask(TwilioTaskSchema.parse(response));
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  private transformTask(tt: z.infer<typeof TwilioTaskSchema>): FlexTask {
    let attributes: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(tt.attributes);
      if (parsed && typeof parsed === 'object') {
        attributes = parsed as Record<string, unknown>;
      }
    } catch {
      // Invalid JSON
    }

    return {
      taskSid: tt.sid,
      queueSid: tt.queue_sid,
      workerSid: tt.worker_sid ?? undefined,
      callSid: attributes.call_sid as string | undefined,
      customerPhone: attributes.customer_phone as string | undefined,
      priority: tt.priority,
      assignmentStatus: this.mapAssignmentStatus(tt.assignment_status),
      reason: tt.reason ?? undefined,
      dateCreated: new Date(tt.date_created),
      dateUpdated: new Date(tt.date_updated),
      timeout: tt.timeout,
    };
  }

  private mapAssignmentStatus(
    status: string
  ): 'pending' | 'reserved' | 'assigned' | 'wrapping' | 'completed' | 'canceled' {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'pending';
      case 'reserved':
        return 'reserved';
      case 'assigned':
        return 'assigned';
      case 'wrapping':
        return 'wrapping';
      case 'completed':
        return 'completed';
      case 'canceled':
        return 'canceled';
      default:
        return 'pending';
    }
  }

  // =============================================================================
  // Conference API - Supervisor Monitoring
  // =============================================================================

  /**
   * List active conferences
   */
  async listConferences(options?: { status?: string }): Promise<
    {
      conferenceSid: string;
      friendlyName: string;
      status: string;
      dateCreated: Date;
    }[]
  > {
    const makeRequest = async () => {
      const params = new URLSearchParams();
      if (options?.status) params.append('Status', options.status);

      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Conferences.json${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await this.requestWithTimeout<{ conferences: unknown[] }>(url);

      return response.conferences.map((c) => {
        const conf = TwilioConferenceSchema.parse(c);
        return {
          conferenceSid: conf.sid,
          friendlyName: conf.friendly_name,
          status: conf.status,
          dateCreated: new Date(conf.date_created),
        };
      });
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  /**
   * Get conference participants
   */
  async getConferenceParticipants(conferenceSid: string): Promise<
    {
      callSid: string;
      conferenceSid: string;
      muted: boolean;
      hold: boolean;
      coaching: boolean;
      status: string;
    }[]
  > {
    const makeRequest = async () => {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Conferences/${conferenceSid}/Participants.json`;
      const response = await this.requestWithTimeout<{ participants: unknown[] }>(url);

      return response.participants.map((p) => {
        const part = TwilioParticipantSchema.parse(p);
        return {
          callSid: part.call_sid,
          conferenceSid: part.conference_sid,
          muted: part.muted,
          hold: part.hold,
          coaching: part.coaching,
          status: part.status,
        };
      });
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  /**
   * Add supervisor to conference for monitoring
   * Supports listen, whisper, and barge modes
   */
  async addSupervisorToConference(input: SupervisorMonitorInput): Promise<{
    callSid: string;
    success: boolean;
  }> {
    const makeRequest = async () => {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Conferences/${input.conferenceSid}/Participants.json`;

      const body: Record<string, unknown> = {
        From: process.env.TWILIO_PHONE_NUMBER ?? '+10000000000',
        To: `client:supervisor_${Date.now()}`,
        Muted: input.mode === 'listen',
        Coaching: input.mode === 'whisper',
        BeepOnEnter: false,
        BeepOnExit: false,
      };

      if (input.mode === 'whisper' && input.supervisorCallSid) {
        body.CallSidToCoach = input.supervisorCallSid;
      }

      const response = await this.requestWithTimeout<{ call_sid: string }>(url, {
        method: 'POST',
        body: this.encodeFormData(body),
      });

      return {
        callSid: response.call_sid,
        success: true,
      };
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  /**
   * Update participant (mute/unmute, hold, etc.)
   */
  async updateParticipant(
    conferenceSid: string,
    callSid: string,
    update: { muted?: boolean; hold?: boolean; coaching?: boolean }
  ): Promise<void> {
    const makeRequest = async (): Promise<void> => {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Conferences/${conferenceSid}/Participants/${callSid}.json`;
      const body: Record<string, unknown> = {};
      if (update.muted !== undefined) body.Muted = update.muted;
      if (update.hold !== undefined) body.Hold = update.hold;
      if (update.coaching !== undefined) body.Coaching = update.coaching;

      await this.requestWithTimeout<unknown>(url, {
        method: 'POST',
        body: this.encodeFormData(body),
      });
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  /**
   * Remove participant from conference
   */
  async removeParticipant(conferenceSid: string, callSid: string): Promise<void> {
    const makeRequest = async (): Promise<void> => {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Conferences/${conferenceSid}/Participants/${callSid}.json`;
      await this.requestWithTimeout<unknown>(url, {
        method: 'DELETE',
      });
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  // =============================================================================
  // Call Transfer
  // =============================================================================

  /**
   * Warm transfer - add new party while keeping customer
   */
  async initiateWarmTransfer(
    conferenceSid: string,
    targetNumber: string
  ): Promise<{ callSid: string }> {
    const makeRequest = async () => {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Conferences/${conferenceSid}/Participants.json`;

      const body: Record<string, unknown> = {
        From: process.env.TWILIO_PHONE_NUMBER,
        To: targetNumber,
        EarlyMedia: true,
      };

      const response = await this.requestWithTimeout<{ call_sid: string }>(url, {
        method: 'POST',
        body: this.encodeFormData(body),
      });

      return { callSid: response.call_sid };
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  /**
   * Cold transfer - redirect call to new destination
   */
  async initiateColdTransfer(callSid: string, targetNumber: string): Promise<void> {
    const makeRequest = async (): Promise<void> => {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Calls/${callSid}.json`;

      const twiml = `<Response><Dial>${targetNumber}</Dial></Response>`;

      await this.requestWithTimeout<unknown>(url, {
        method: 'POST',
        body: this.encodeFormData({ Twiml: twiml }),
      });
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  // =============================================================================
  // Dashboard Stats
  // =============================================================================

  /**
   * Get aggregated worker statistics
   */
  async getWorkerStats(): Promise<WorkerStats> {
    const workers = await this.listWorkers();

    const stats: WorkerStats = {
      totalWorkers: workers.length,
      available: 0,
      busy: 0,
      offline: 0,
      onBreak: 0,
    };

    for (const worker of workers) {
      switch (worker.activityName) {
        case 'available':
          stats.available++;
          break;
        case 'busy':
        case 'wrap-up':
          stats.busy++;
          break;
        case 'break':
          stats.onBreak++;
          break;
        case 'offline':
        case 'unavailable':
        default:
          stats.offline++;
          break;
      }
    }

    return stats;
  }

  /**
   * Build supervisor dashboard stats
   */
  async getDashboardStats(): Promise<SupervisorDashboardStats> {
    const [workers, queues, conferences] = await Promise.all([
      this.getWorkerStats(),
      this.listQueues(),
      this.listConferences({ status: 'in-progress' }),
    ]);

    // Calculate queue totals
    let totalInQueue = 0;
    let maxWaitTime = 0;

    for (const queue of queues) {
      totalInQueue += queue.currentSize;
      maxWaitTime = Math.max(maxWaitTime, queue.longestWaitTime);
    }

    return {
      activeCalls: conferences.length,
      callsInQueue: totalInQueue,
      averageWaitTime: maxWaitTime, // Simplified

      agentsAvailable: workers.available,
      agentsBusy: workers.busy,
      agentsOnBreak: workers.onBreak,
      agentsOffline: workers.offline,

      aiHandledCalls: 0, // Would need Vapi integration
      aiHandoffRate: 0,
      averageAiConfidence: 0,

      activeAlerts: 0,
      escalationsToday: 0,

      callsHandledToday: 0,
      averageHandleTime: 0,
      customerSatisfaction: undefined,

      lastUpdated: new Date(),
    };
  }

  // =============================================================================
  // Active Calls Cache Management
  // =============================================================================

  /**
   * Register an active call for monitoring
   */
  registerActiveCall(call: MonitoredCall): void {
    this.activeCallsCache.set(call.callSid, {
      call,
      updatedAt: Date.now(),
    });
    this.cleanupStaleEntries();
  }

  /**
   * Update an active call
   */
  updateActiveCall(callSid: string, updates: Partial<MonitoredCall>): void {
    const entry = this.activeCallsCache.get(callSid);
    if (entry) {
      entry.call = { ...entry.call, ...updates };
      entry.updatedAt = Date.now();
    }
  }

  /**
   * Remove a call from active tracking
   */
  removeActiveCall(callSid: string): void {
    this.activeCallsCache.delete(callSid);
  }

  /**
   * Get all active calls for supervisor dashboard
   */
  getActiveCalls(): MonitoredCall[] {
    this.cleanupStaleEntries();
    return Array.from(this.activeCallsCache.values()).map((entry) => entry.call);
  }

  /**
   * Get a specific active call
   */
  getActiveCall(callSid: string): MonitoredCall | undefined {
    return this.activeCallsCache.get(callSid)?.call;
  }

  private cleanupStaleEntries(): void {
    const now = Date.now();
    for (const [callSid, entry] of this.activeCallsCache.entries()) {
      if (now - entry.updatedAt > FlexClient.CACHE_TTL_MS) {
        this.activeCallsCache.delete(callSid);
      }
    }
  }

  // =============================================================================
  // Webhook Signature Verification
  // =============================================================================

  /**
   * Verify Twilio request signature
   */
  static verifySignature(
    authToken: string,
    signature: string,
    url: string,
    params: Record<string, string>
  ): boolean {
    const sortedKeys = Object.keys(params).sort();
    let data = url;
    for (const key of sortedKeys) {
      data += key + (params[key] ?? '');
    }

    const expectedSignature = crypto
      .createHmac('sha1', authToken)
      .update(data, 'utf-8')
      .digest('base64');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch {
      return false;
    }
  }

  // =============================================================================
  // Cleanup
  // =============================================================================

  /**
   * Clean up resources
   */
  destroy(): void {
    this.activeCallsCache.clear();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a configured Flex client
 */
export function createFlexClient(config: FlexClientConfig): FlexClient {
  return new FlexClient(config);
}

/**
 * Get Flex credentials from environment
 */
export function getFlexCredentials(): FlexClientConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const workspaceSid = process.env.TWILIO_FLEX_WORKSPACE_SID;

  if (!accountSid || !authToken || !workspaceSid) {
    return null;
  }

  return {
    accountSid,
    authToken,
    workspaceSid,
    flexFlowSid: process.env.TWILIO_FLEX_FLOW_SID,
  };
}
