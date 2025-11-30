/**
 * @module architecture/application/saga
 *
 * Saga / Process Manager Pattern
 * ==============================
 *
 * Sagas orchestrate long-running business processes that span
 * multiple aggregates or bounded contexts.
 */

import type {
  Saga as ISaga,
  SagaStatus,
  SagaAction,
  DomainEvent,
  ApplicationComponent,
  Command,
} from '../layers/contracts.js';
import type { Result } from '../../types/result.js';
import { Ok, Err } from '../../types/result.js';

// ============================================================================
// SAGA BASE CLASS
// ============================================================================

/**
 * Abstract base class for sagas
 */
export abstract class Saga<TState = unknown> implements ISaga<TState>, ApplicationComponent {
  readonly __layer = 'application' as const;
  readonly sagaId: string;
  abstract readonly sagaType: string;

  protected _state: TState;
  protected _status: SagaStatus = 'started';
  protected _version = 0;
  protected _createdAt: Date;
  protected _updatedAt: Date;
  protected _completedAt?: Date;
  protected _error?: string;

  constructor(sagaId: string, initialState: TState) {
    this.sagaId = sagaId;
    this._state = initialState;
    this._createdAt = new Date();
    this._updatedAt = new Date();
  }

  get state(): TState {
    return this._state;
  }

  get status(): SagaStatus {
    return this._status;
  }

  get version(): number {
    return this._version;
  }

  /**
   * Handle an event and return actions to take
   */
  abstract handle(event: DomainEvent): Promise<SagaAction[]>;

  /**
   * Compensate for failures (rollback)
   */
  abstract compensate(): Promise<SagaAction[]>;

  /**
   * Start the saga
   */
  start(): void {
    this._status = 'running';
    this._updatedAt = new Date();
  }

  /**
   * Mark the saga as completed
   */
  complete(): void {
    this._status = 'completed';
    this._completedAt = new Date();
    this._updatedAt = new Date();
  }

  /**
   * Mark the saga as failed
   */
  fail(error: string): void {
    this._status = 'failed';
    this._error = error;
    this._updatedAt = new Date();
  }

  /**
   * Start compensation
   */
  startCompensation(): void {
    this._status = 'compensating';
    this._updatedAt = new Date();
  }

  /**
   * Update state
   */
  protected updateState(updates: Partial<TState>): void {
    this._state = { ...this._state, ...updates };
    this._version++;
    this._updatedAt = new Date();
  }

  /**
   * Create a command action
   */
  protected createCommandAction<TPayload>(commandType: string, payload: TPayload): SagaAction {
    return {
      type: 'command',
      payload: { commandType, payload },
    };
  }

  /**
   * Create an event action
   */
  protected createEventAction<TPayload>(eventType: string, payload: TPayload): SagaAction {
    return {
      type: 'event',
      payload: { eventType, payload },
    };
  }

  /**
   * Create a timeout action
   */
  protected createTimeoutAction(durationMs: number, timeoutId: string): SagaAction {
    return {
      type: 'timeout',
      payload: { durationMs, timeoutId },
    };
  }

  /**
   * Create a completion action
   */
  protected createCompleteAction(): SagaAction {
    return { type: 'complete', payload: null };
  }

  /**
   * Create a failure action
   */
  protected createFailAction(error: string): SagaAction {
    return { type: 'fail', payload: { error } };
  }

  /**
   * Serialize saga state for persistence
   */
  toJSON(): SagaSnapshot<TState> {
    return {
      sagaId: this.sagaId,
      sagaType: this.sagaType,
      state: this._state,
      status: this._status,
      version: this._version,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
      completedAt: this._completedAt?.toISOString(),
      error: this._error,
    };
  }
}

export interface SagaSnapshot<TState> {
  readonly sagaId: string;
  readonly sagaType: string;
  readonly state: TState;
  readonly status: SagaStatus;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
  readonly error?: string;
}

// ============================================================================
// SAGA ORCHESTRATOR
// ============================================================================

/**
 * Saga Orchestrator - Manages saga lifecycle and execution
 */
export class SagaOrchestrator {
  private sagas = new Map<string, Saga>();
  private sagaFactories = new Map<string, SagaFactory>();
  private eventHandlers = new Map<string, string[]>(); // eventType -> sagaTypes
  private commandDispatcher?: CommandDispatcher;
  private sagaRepository?: SagaRepository;

  /**
   * Set the command dispatcher
   */
  setCommandDispatcher(dispatcher: CommandDispatcher): void {
    this.commandDispatcher = dispatcher;
  }

  /**
   * Set the saga repository for persistence
   */
  setSagaRepository(repository: SagaRepository): void {
    this.sagaRepository = repository;
  }

  /**
   * Register a saga factory
   */
  registerSagaType<TState>(
    sagaType: string,
    factory: SagaFactory<TState>,
    triggerEvents: string[]
  ): void {
    this.sagaFactories.set(sagaType, factory as SagaFactory);

    // Register event handlers
    for (const eventType of triggerEvents) {
      const handlers = this.eventHandlers.get(eventType) ?? [];
      handlers.push(sagaType);
      this.eventHandlers.set(eventType, handlers);
    }
  }

  /**
   * Handle an incoming event
   */
  async handleEvent(event: DomainEvent): Promise<void> {
    // Get all saga types that handle this event
    const sagaTypes = this.eventHandlers.get(event.eventType) ?? [];

    for (const sagaType of sagaTypes) {
      await this.processEventForSagaType(event, sagaType);
    }
  }

  private async processEventForSagaType(event: DomainEvent, sagaType: string): Promise<void> {
    const factory = this.sagaFactories.get(sagaType);
    if (!factory) return;

    // Find or create saga
    let saga = await this.findSaga(event, sagaType);
    if (!saga) {
      // Create new saga if this is a starting event
      if (factory.isStartingEvent(event)) {
        saga = factory.create(event);
        this.sagas.set(saga.sagaId, saga);
      } else {
        return; // No existing saga and not a starting event
      }
    }

    // Handle the event
    const actions = await saga.handle(event);

    // Execute actions
    await this.executeActions(saga, actions);

    // Persist saga state
    if (this.sagaRepository) {
      await this.sagaRepository.save(saga);
    }
  }

  private async findSaga(event: DomainEvent, sagaType: string): Promise<Saga | undefined> {
    // First check in-memory
    for (const saga of this.sagas.values()) {
      if (saga.sagaType === sagaType && this.sagaMatchesEvent(saga, event)) {
        return saga;
      }
    }

    // Then check repository
    if (this.sagaRepository) {
      const saga = await this.sagaRepository.findByCorrelationId(
        event.metadata.correlationId,
        sagaType
      );
      if (saga) {
        this.sagas.set(saga.sagaId, saga);
        return saga;
      }
    }

    return undefined;
  }

  private sagaMatchesEvent(saga: Saga, event: DomainEvent): boolean {
    // Default matching by correlation ID
    return true; // Override in subclasses for custom matching
  }

  private async executeActions(saga: Saga, actions: SagaAction[]): Promise<void> {
    for (const action of actions) {
      switch (action.type) {
        case 'command':
          if (this.commandDispatcher) {
            const { commandType, payload } = action.payload as {
              commandType: string;
              payload: unknown;
            };
            await this.commandDispatcher.dispatch(commandType, payload);
          }
          break;

        case 'complete':
          saga.complete();
          break;

        case 'fail':
          const { error } = action.payload as { error: string };
          saga.fail(error);
          // Start compensation
          saga.startCompensation();
          const compensationActions = await saga.compensate();
          await this.executeActions(saga, compensationActions);
          break;

        case 'timeout':
          // Schedule timeout (implementation depends on infrastructure)
          break;
      }
    }
  }

  /**
   * Get saga by ID
   */
  getSaga(sagaId: string): Saga | undefined {
    return this.sagas.get(sagaId);
  }

  /**
   * Get all active sagas
   */
  getActiveSagas(): Saga[] {
    return Array.from(this.sagas.values()).filter(
      (s) => s.status === 'running' || s.status === 'started'
    );
  }
}

export interface SagaFactory<TState = unknown> {
  create(triggerEvent: DomainEvent): Saga<TState>;
  isStartingEvent(event: DomainEvent): boolean;
}

export interface CommandDispatcher {
  dispatch<TPayload>(commandType: string, payload: TPayload): Promise<void>;
}

export interface SagaRepository {
  save(saga: Saga): Promise<void>;
  findById(sagaId: string): Promise<Saga | null>;
  findByCorrelationId(correlationId: string, sagaType: string): Promise<Saga | null>;
  findActive(sagaType: string): Promise<Saga[]>;
}

// ============================================================================
// SAGA STATE MACHINE
// ============================================================================

/**
 * State machine for saga transitions
 */
export interface SagaStateMachine<TState extends string> {
  initialState: TState;
  transitions: SagaTransition<TState>[];
  finalStates: TState[];
}

export interface SagaTransition<TState extends string> {
  from: TState;
  to: TState;
  event: string;
  guard?: (event: DomainEvent) => boolean;
  action?: (event: DomainEvent) => SagaAction[];
}

/**
 * Create a state machine based saga
 */
export abstract class StateMachineSaga<TState extends string, TData = unknown> extends Saga<{
  currentState: TState;
  data: TData;
}> {
  protected abstract getStateMachine(): SagaStateMachine<TState>;

  async handle(event: DomainEvent): Promise<SagaAction[]> {
    const machine = this.getStateMachine();
    const currentState = this._state.currentState;

    // Find applicable transition
    const transition = machine.transitions.find(
      (t) => t.from === currentState && t.event === event.eventType && (!t.guard || t.guard(event))
    );

    if (!transition) {
      return []; // No applicable transition
    }

    // Execute transition
    this.updateState({ ...this._state, currentState: transition.to });

    // Check if reached final state
    if (machine.finalStates.includes(transition.to)) {
      this.complete();
    }

    // Return actions
    return transition.action ? transition.action(event) : [];
  }
}

// Singleton orchestrator
export const sagaOrchestrator = new SagaOrchestrator();
