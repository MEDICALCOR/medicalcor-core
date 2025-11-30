/**
 * @module architecture/events/process-manager
 *
 * Process Manager Pattern
 * =======================
 *
 * Coordinates long-running business processes across aggregates.
 */

import type { DomainEvent } from '../layers/contracts.js';
import type { Result } from '../../types/result.js';
import { Ok, Err } from '../../types/result.js';

// ============================================================================
// PROCESS MANAGER TYPES
// ============================================================================

/**
 * Process instance
 */
export interface Process<TState = unknown> {
  readonly processId: string;
  readonly processType: string;
  readonly correlationId: string;
  readonly state: TState;
  readonly status: ProcessStatus;
  readonly version: number;
  readonly startedAt: Date;
  readonly updatedAt: Date;
  readonly completedAt?: Date;
  readonly error?: ProcessError;
  readonly pendingCommands: PendingCommand[];
  readonly processedEvents: string[];
}

export type ProcessStatus =
  | 'started'
  | 'running'
  | 'awaiting'
  | 'completed'
  | 'failed'
  | 'compensating'
  | 'compensated';

export interface ProcessError {
  readonly code: string;
  readonly message: string;
  readonly step?: string;
  readonly occurredAt: Date;
}

export interface PendingCommand {
  readonly commandType: string;
  readonly payload: unknown;
  readonly targetAggregate?: string;
  readonly scheduledFor?: Date;
}

// ============================================================================
// PROCESS DEFINITION
// ============================================================================

/**
 * Process step definition
 */
export interface ProcessStep<TState> {
  readonly name: string;
  readonly handler: (state: TState, event: DomainEvent) => ProcessStepResult<TState>;
  readonly compensator?: (state: TState) => ProcessCompensation;
}

export interface ProcessStepResult<TState> {
  readonly newState: TState;
  readonly commands?: PendingCommand[];
  readonly complete?: boolean;
  readonly fail?: { code: string; message: string };
}

export interface ProcessCompensation {
  readonly commands: PendingCommand[];
}

/**
 * Process definition
 */
export interface ProcessDefinition<TState> {
  readonly processType: string;
  readonly initialState: TState;
  readonly startingEvents: string[];
  readonly steps: ProcessStep<TState>[];
  readonly timeout?: number;
  readonly correlationIdExtractor: (event: DomainEvent) => string;
}

// ============================================================================
// PROCESS MANAGER
// ============================================================================

/**
 * Process manager - Coordinates processes
 */
export class ProcessManager<TState = unknown> {
  private processes = new Map<string, Process<TState>>();
  private definition: ProcessDefinition<TState>;
  private commandDispatcher?: CommandDispatcher;

  constructor(definition: ProcessDefinition<TState>) {
    this.definition = definition;
  }

  /**
   * Set command dispatcher
   */
  setCommandDispatcher(dispatcher: CommandDispatcher): void {
    this.commandDispatcher = dispatcher;
  }

  /**
   * Handle an event
   */
  async handleEvent(event: DomainEvent): Promise<Result<void, ProcessManagerError>> {
    const correlationId = this.definition.correlationIdExtractor(event);

    // Check if this is a starting event for a new process
    if (this.definition.startingEvents.includes(event.eventType)) {
      const existingProcess = this.findByCorrelationId(correlationId);
      if (!existingProcess) {
        return this.startProcess(correlationId, event);
      }
    }

    // Find process by correlation ID
    const process = this.findByCorrelationId(correlationId);
    if (!process) {
      return Ok(undefined); // No process to handle this event
    }

    // Skip if already processed
    if (process.processedEvents.includes(event.eventId)) {
      return Ok(undefined);
    }

    return this.processEvent(process, event);
  }

  /**
   * Start a new process
   */
  private async startProcess(
    correlationId: string,
    event: DomainEvent
  ): Promise<Result<void, ProcessManagerError>> {
    const process: Process<TState> = {
      processId: crypto.randomUUID(),
      processType: this.definition.processType,
      correlationId,
      state: { ...this.definition.initialState },
      status: 'started',
      version: 0,
      startedAt: new Date(),
      updatedAt: new Date(),
      pendingCommands: [],
      processedEvents: [],
    };

    this.processes.set(process.processId, process);

    return this.processEvent(process, event);
  }

  /**
   * Process an event for a process
   */
  private async processEvent(
    process: Process<TState>,
    event: DomainEvent
  ): Promise<Result<void, ProcessManagerError>> {
    // Find matching step
    const step = this.definition.steps.find((s) => this.stepMatchesEvent(s, event));

    if (!step) {
      return Ok(undefined); // No step handles this event
    }

    try {
      const result = step.handler(process.state, event);

      // Update process
      const updatedProcess: Process<TState> = {
        ...process,
        state: result.newState,
        status: result.complete ? 'completed' : result.fail ? 'failed' : 'running',
        version: process.version + 1,
        updatedAt: new Date(),
        completedAt: result.complete ? new Date() : undefined,
        error: result.fail
          ? {
              code: result.fail.code,
              message: result.fail.message,
              step: step.name,
              occurredAt: new Date(),
            }
          : undefined,
        pendingCommands: result.commands ?? [],
        processedEvents: [...process.processedEvents, event.eventId],
      };

      this.processes.set(process.processId, updatedProcess);

      // Dispatch pending commands
      if (result.commands && this.commandDispatcher) {
        for (const command of result.commands) {
          await this.commandDispatcher.dispatch(command.commandType, command.payload);
        }
      }

      // Start compensation if failed
      if (result.fail && step.compensator) {
        return this.compensate(updatedProcess);
      }

      return Ok(undefined);
    } catch (error) {
      return Err({
        code: 'PROCESS_ERROR',
        message: error instanceof Error ? error.message : String(error),
        processId: process.processId,
      });
    }
  }

  /**
   * Compensate a failed process
   */
  private async compensate(process: Process<TState>): Promise<Result<void, ProcessManagerError>> {
    const updatedProcess: Process<TState> = {
      ...process,
      status: 'compensating',
      updatedAt: new Date(),
    };

    this.processes.set(process.processId, updatedProcess);

    // Run compensators in reverse order
    const compensations: PendingCommand[] = [];

    for (let i = this.definition.steps.length - 1; i >= 0; i--) {
      const step = this.definition.steps[i];
      if (step?.compensator) {
        const compensation = step.compensator(process.state);
        compensations.push(...compensation.commands);
      }
    }

    // Dispatch compensation commands
    if (this.commandDispatcher) {
      for (const command of compensations) {
        try {
          await this.commandDispatcher.dispatch(command.commandType, command.payload);
        } catch (error) {
          // Log but continue with other compensations
          console.error('Compensation command failed:', error);
        }
      }
    }

    // Mark as compensated
    const compensatedProcess: Process<TState> = {
      ...updatedProcess,
      status: 'compensated',
      updatedAt: new Date(),
    };

    this.processes.set(process.processId, compensatedProcess);

    return Ok(undefined);
  }

  /**
   * Find process by correlation ID
   */
  private findByCorrelationId(correlationId: string): Process<TState> | undefined {
    for (const process of this.processes.values()) {
      if (process.correlationId === correlationId) {
        return process;
      }
    }
    return undefined;
  }

  /**
   * Check if a step matches an event
   */
  private stepMatchesEvent(step: ProcessStep<TState>, event: DomainEvent): boolean {
    // By default, match by step name = event type
    // Can be customized in step definition
    return step.name === event.eventType;
  }

  /**
   * Get a process by ID
   */
  getProcess(processId: string): Process<TState> | undefined {
    return this.processes.get(processId);
  }

  /**
   * Get all processes
   */
  getAllProcesses(): Process<TState>[] {
    return Array.from(this.processes.values());
  }

  /**
   * Get processes by status
   */
  getProcessesByStatus(status: ProcessStatus): Process<TState>[] {
    return Array.from(this.processes.values()).filter((p) => p.status === status);
  }

  /**
   * Clear all processes (for testing)
   */
  clear(): void {
    this.processes.clear();
  }
}

export interface ProcessManagerError {
  code: string;
  message: string;
  processId?: string;
}

export interface CommandDispatcher {
  dispatch<TPayload>(commandType: string, payload: TPayload): Promise<void>;
}

// ============================================================================
// PROCESS MANAGER REGISTRY
// ============================================================================

/**
 * Registry for process managers
 */
export class ProcessManagerRegistry {
  private managers = new Map<string, ProcessManager>();

  /**
   * Register a process manager
   */
  register<TState>(manager: ProcessManager<TState>): void {
    // Get the process type from the definition
    const processType = (manager as unknown as { definition: ProcessDefinition<TState> }).definition
      .processType;
    this.managers.set(processType, manager as unknown as ProcessManager);
  }

  /**
   * Get a process manager by type
   */
  get<TState>(processType: string): ProcessManager<TState> | undefined {
    return this.managers.get(processType) as ProcessManager<TState> | undefined;
  }

  /**
   * Handle an event across all process managers
   */
  async handleEvent(event: DomainEvent): Promise<void> {
    for (const manager of this.managers.values()) {
      await manager.handleEvent(event);
    }
  }
}

// Singleton registry
export const processManagerRegistry = new ProcessManagerRegistry();
