/**
 * @fileoverview DummyResourceSchedulerAdapter - Stub Adapter for Development/Testing
 *
 * Returns mock resource scheduling operations for development and testing.
 * Not for production use.
 *
 * @module core/adapters/osax/resources/dummy-resource-scheduler-adapter
 *
 * TODO: Integrate with actual scheduling system (Google Calendar API, Calendly, custom)
 */

import type {
  ResourceSchedulerPort,
  SoftHoldOptions,
  AvailabilityResult,
  DateRange,
  SchedulerHealth,
  TimeSlot,
} from '@medicalcor/core/ports/osax/ResourceSchedulerPort.js';
import { ResourceBlock, type ResourceType } from '@medicalcor/domain/osax';

// ============================================================================
// ADAPTER IMPLEMENTATION
// ============================================================================

/**
 * DummyResourceSchedulerAdapter - Stub adapter for development/testing
 *
 * Returns mock resource scheduling operations. Use for:
 * - Local development without calendar API access
 * - Unit testing service layer
 * - Integration testing without external dependencies
 *
 * @example
 * ```typescript
 * const adapter = new DummyResourceSchedulerAdapter();
 * const blocks = await adapter.softHoldResources(
 *   'case-123',
 *   ['OR_TIME', 'SPECIALIST'],
 *   90
 * );
 * // Returns mock resource blocks
 * ```
 *
 * TODO: Integrate with actual scheduling system
 */
export class DummyResourceSchedulerAdapter implements ResourceSchedulerPort {
  public readonly portName = 'resource-scheduler' as const;
  public readonly portType = 'outbound' as const;

  /**
   * Simulated latency in milliseconds
   */
  private readonly simulatedLatencyMs: number;

  /**
   * In-memory storage for resource blocks
   */
  private readonly blocks: Map<string, ResourceBlock>;

  constructor(options?: DummyResourceSchedulerAdapterOptions) {
    this.simulatedLatencyMs = options?.simulatedLatencyMs ?? 50;
    this.blocks = new Map();
  }

  /**
   * Create soft-holds on resources (mock)
   *
   * TODO: Integrate with actual scheduling system
   */
  public async softHoldResources(
    caseId: string,
    resources: ResourceType[],
    durationMinutes: number,
    options?: SoftHoldOptions
  ): Promise<ResourceBlock[]> {
    await this.delay(this.simulatedLatencyMs);

    const createdBlocks: ResourceBlock[] = [];

    for (const resourceType of resources) {
      const block = ResourceBlock.create({
        caseId,
        resourceType,
        durationMinutes,
        ttlHours: options?.ttlHours,
      });

      this.blocks.set(block.id, block);
      createdBlocks.push(block);
    }

    return createdBlocks;
  }

  /**
   * Confirm resources (mock)
   */
  public async confirmResources(
    blockIds: string[],
    scheduledStart: Date
  ): Promise<ResourceBlock[]> {
    await this.delay(this.simulatedLatencyMs);

    const confirmedBlocks: ResourceBlock[] = [];

    for (const blockId of blockIds) {
      const block = this.blocks.get(blockId);
      if (block?.isSoftHeld()) {
        block.confirm(scheduledStart);
        confirmedBlocks.push(block);
      }
    }

    return confirmedBlocks;
  }

  /**
   * Release resources (mock)
   */
  public async releaseResources(blockIds: string[], reason?: string): Promise<void> {
    await this.delay(this.simulatedLatencyMs);

    for (const blockId of blockIds) {
      const block = this.blocks.get(blockId);
      if (block?.isActive()) {
        block.release(reason);
      }
    }
  }

  /**
   * Check availability (mock - always returns available)
   */
  public async checkAvailability(
    resources: ResourceType[],
    dateRange: DateRange
  ): Promise<AvailabilityResult> {
    await this.delay(this.simulatedLatencyMs);

    // Generate suggested time slots
    const suggestedSlots: TimeSlot[] = this.generateSuggestedSlots(resources, dateRange);

    return {
      available: true,
      availableResources: resources,
      conflicts: [],
      suggestedSlots,
    };
  }

  /**
   * Get blocks for case
   */
  public async getBlocksForCase(caseId: string): Promise<ResourceBlock[]> {
    await this.delay(10);

    const caseBlocks: ResourceBlock[] = [];
    for (const block of this.blocks.values()) {
      if (block.caseId === caseId) {
        caseBlocks.push(block);
      }
    }

    return caseBlocks;
  }

  /**
   * Health check (mock)
   */
  public async healthCheck(): Promise<SchedulerHealth> {
    await this.delay(5);

    return {
      available: true,
      latencyMs: this.simulatedLatencyMs,
      system: 'dummy-scheduler',
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Generate mock suggested time slots
   */
  private generateSuggestedSlots(resources: ResourceType[], dateRange: DateRange): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const startDate = new Date(dateRange.start);

    // Generate 3 suggested slots
    for (let i = 0; i < 3; i++) {
      const slotStart = new Date(startDate);
      slotStart.setDate(slotStart.getDate() + i);
      slotStart.setHours(9 + i * 2, 0, 0, 0);

      const slotEnd = new Date(slotStart);
      slotEnd.setHours(slotStart.getHours() + 2);

      slots.push({
        start: slotStart,
        end: slotEnd,
        availableResources: resources,
        suitabilityScore: 0.9 - i * 0.1,
      });
    }

    return slots;
  }

  /**
   * Promise-based delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clear all blocks (for testing)
   */
  public clearAllBlocks(): void {
    this.blocks.clear();
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Options for DummyResourceSchedulerAdapter
 */
export interface DummyResourceSchedulerAdapterOptions {
  /**
   * Simulated API latency in milliseconds
   */
  readonly simulatedLatencyMs?: number;
}
