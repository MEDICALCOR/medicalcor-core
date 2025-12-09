/**
 * Test Template - Reference Pattern for New Tests
 *
 * This file demonstrates the standard testing patterns used in MedicalCor Core:
 *
 * 1. **Arrange-Act-Assert (AAA)**: Clear structure for each test
 * 2. **Property-Based Testing**: Using fast-check for invariant verification
 * 3. **Dependency Injection Mocking**: Clear mocks through DI for testability
 * 4. **Cleanup in afterEach**: Prevent test pollution
 *
 * @see docs/README/TESTING.md for comprehensive testing documentation
 *
 * Copy this template when creating new test files.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import fc from 'fast-check';

// =============================================================================
// TYPES & INTERFACES FOR THE EXAMPLE
// =============================================================================

/** Example port interface (hexagonal architecture) */
interface ExampleRepository {
  save(item: ExampleEntity): Promise<ExampleEntity>;
  findById(id: string): Promise<ExampleEntity | null>;
  delete(id: string): Promise<void>;
}

/** Example entity */
interface ExampleEntity {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'pending';
  score: number;
  createdAt: Date;
}

/** Example service result */
interface ProcessResult {
  success: boolean;
  entity?: ExampleEntity;
  error?: string;
}

// =============================================================================
// IN-MEMORY TEST DOUBLE (Preferred for complex logic)
// =============================================================================

/**
 * In-memory implementation of the repository port.
 * Provides full control over state and behavior for testing.
 *
 * Benefits:
 * - No external dependencies
 * - Fast execution
 * - Full state inspection
 * - Easy reset between tests
 */
class InMemoryExampleRepository implements ExampleRepository {
  private items = new Map<string, ExampleEntity>();

  async save(item: ExampleEntity): Promise<ExampleEntity> {
    this.items.set(item.id, { ...item });
    return item;
  }

  async findById(id: string): Promise<ExampleEntity | null> {
    return this.items.get(id) ?? null;
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  // Test helper methods
  clear(): void {
    this.items.clear();
  }

  getAll(): ExampleEntity[] {
    return Array.from(this.items.values());
  }

  size(): number {
    return this.items.size;
  }
}

// =============================================================================
// MOCK WITH vi.fn() (For simple cases)
// =============================================================================

/**
 * Create a mock repository using vi.fn()
 * Useful for simple tests where you just need to verify calls.
 */
function createMockRepository(): ExampleRepository {
  return {
    save: vi.fn(async (item: ExampleEntity) => item),
    findById: vi.fn(async () => null),
    delete: vi.fn(async () => undefined),
  };
}

// =============================================================================
// FAST-CHECK ARBITRARIES (Custom generators)
// =============================================================================

/**
 * Generate valid UUIDs for testing
 */
const uuidArbitrary = fc.uuid();

/**
 * Generate entity names (alphanumeric, reasonable length)
 */
const nameArbitrary = fc
  .array(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '.split('')),
    {
      minLength: 1,
      maxLength: 50,
    }
  )
  .map((chars) => chars.join('').trim() || 'default');

/**
 * Generate valid status values
 */
const statusArbitrary = fc.constantFrom('active', 'inactive', 'pending') as fc.Arbitrary<
  ExampleEntity['status']
>;

/**
 * Generate valid scores (1-100)
 */
const scoreArbitrary = fc.integer({ min: 1, max: 100 });

/**
 * Generate valid dates (avoiding Invalid Date issues)
 */
const dateArbitrary = fc
  .integer({
    min: new Date('2020-01-01').getTime(),
    max: new Date('2030-12-31').getTime(),
  })
  .map((ts) => new Date(ts));

/**
 * Generate complete valid entities
 */
const entityArbitrary = fc.record({
  id: uuidArbitrary,
  name: nameArbitrary,
  status: statusArbitrary,
  score: scoreArbitrary,
  createdAt: dateArbitrary,
});

// =============================================================================
// EXAMPLE SERVICE UNDER TEST
// =============================================================================

/**
 * Example service demonstrating dependency injection pattern
 */
class ExampleService {
  constructor(
    private readonly repository: ExampleRepository,
    private readonly options: { maxScore: number } = { maxScore: 100 }
  ) {}

  async processEntity(input: { name: string; score: number }): Promise<ProcessResult> {
    // Validation
    if (!input.name || input.name.trim().length === 0) {
      return { success: false, error: 'Name is required' };
    }

    if (input.score < 1 || input.score > this.options.maxScore) {
      return { success: false, error: `Score must be between 1 and ${this.options.maxScore}` };
    }

    // Create entity
    const entity: ExampleEntity = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      status: input.score >= 70 ? 'active' : input.score >= 40 ? 'pending' : 'inactive',
      score: input.score,
      createdAt: new Date(),
    };

    // Save
    const saved = await this.repository.save(entity);

    return { success: true, entity: saved };
  }

  calculateStatus(score: number): ExampleEntity['status'] {
    if (score >= 70) return 'active';
    if (score >= 40) return 'pending';
    return 'inactive';
  }
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe('ExampleService', () => {
  // ---------------------------------------------------------------------------
  // TEST SETUP & CLEANUP
  // ---------------------------------------------------------------------------

  let service: ExampleService;
  let repository: InMemoryExampleRepository;

  /**
   * beforeEach: Set up fresh instances for each test
   *
   * This ensures:
   * - Tests are isolated from each other
   * - No state leaks between tests
   * - Each test starts with a clean slate
   */
  beforeEach(() => {
    repository = new InMemoryExampleRepository();
    service = new ExampleService(repository);
  });

  /**
   * afterEach: Clean up after each test
   *
   * This ensures:
   * - All mocks are reset
   * - No timers or state persists
   * - Repository is cleared
   */
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    repository.clear();
  });

  // ---------------------------------------------------------------------------
  // EXAMPLE-BASED TESTS (Arrange-Act-Assert Pattern)
  // ---------------------------------------------------------------------------

  describe('processEntity', () => {
    it('should create entity with valid input', async () => {
      // ARRANGE - Set up test data and preconditions
      const input = {
        name: 'Test Entity',
        score: 75,
      };

      // ACT - Execute the code under test
      const result = await service.processEntity(input);

      // ASSERT - Verify the expected outcome
      expect(result.success).toBe(true);
      expect(result.entity).toBeDefined();
      expect(result.entity!.name).toBe('Test Entity');
      expect(result.entity!.score).toBe(75);
      expect(result.entity!.status).toBe('active');
    });

    it('should return error for empty name', async () => {
      // ARRANGE
      const input = {
        name: '',
        score: 50,
      };

      // ACT
      const result = await service.processEntity(input);

      // ASSERT
      expect(result.success).toBe(false);
      expect(result.error).toBe('Name is required');
      expect(result.entity).toBeUndefined();
    });

    it('should return error for invalid score', async () => {
      // ARRANGE
      const input = {
        name: 'Test',
        score: 150, // exceeds max
      };

      // ACT
      const result = await service.processEntity(input);

      // ASSERT
      expect(result.success).toBe(false);
      expect(result.error).toContain('Score must be between');
    });

    it('should persist entity to repository', async () => {
      // ARRANGE
      const input = {
        name: 'Persisted Entity',
        score: 85,
      };

      // ACT
      const result = await service.processEntity(input);

      // ASSERT
      expect(result.success).toBe(true);
      expect(repository.size()).toBe(1);

      const persisted = await repository.findById(result.entity!.id);
      expect(persisted).toEqual(result.entity);
    });
  });

  describe('calculateStatus', () => {
    it('should return active for score >= 70', () => {
      // ARRANGE
      const score = 70;

      // ACT
      const status = service.calculateStatus(score);

      // ASSERT
      expect(status).toBe('active');
    });

    it('should return pending for score 40-69', () => {
      expect(service.calculateStatus(40)).toBe('pending');
      expect(service.calculateStatus(55)).toBe('pending');
      expect(service.calculateStatus(69)).toBe('pending');
    });

    it('should return inactive for score < 40', () => {
      expect(service.calculateStatus(1)).toBe('inactive');
      expect(service.calculateStatus(39)).toBe('inactive');
    });
  });

  // ---------------------------------------------------------------------------
  // PROPERTY-BASED TESTS (fast-check)
  // ---------------------------------------------------------------------------

  describe('Property: Score Invariants', () => {
    /**
     * Property test: Status should always be consistent with score
     *
     * This tests the invariant across all possible score values,
     * catching edge cases that example-based tests might miss.
     */
    it('status should always be consistent with score', () => {
      fc.assert(
        fc.property(scoreArbitrary, (score) => {
          // ACT
          const status = service.calculateStatus(score);

          // ASSERT - Verify invariant holds
          if (score >= 70) {
            expect(status).toBe('active');
          } else if (score >= 40) {
            expect(status).toBe('pending');
          } else {
            expect(status).toBe('inactive');
          }
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property test: Determinism - same input always produces same output
     */
    it('calculateStatus should be deterministic', () => {
      fc.assert(
        fc.property(scoreArbitrary, (score) => {
          const result1 = service.calculateStatus(score);
          const result2 = service.calculateStatus(score);
          const result3 = service.calculateStatus(score);

          expect(result1).toBe(result2);
          expect(result2).toBe(result3);
        }),
        { numRuns: 50 }
      );
    });

    /**
     * Property test: Monotonicity - higher scores never result in lower status
     */
    it('higher scores should never result in lower status', () => {
      const statusOrder = { inactive: 0, pending: 1, active: 2 };

      fc.assert(
        fc.property(
          scoreArbitrary,
          fc.integer({ min: 0, max: 50 }), // increment
          (score, increment) => {
            const higherScore = Math.min(score + increment, 100);

            const statusLow = service.calculateStatus(score);
            const statusHigh = service.calculateStatus(higherScore);

            expect(statusOrder[statusHigh]).toBeGreaterThanOrEqual(statusOrder[statusLow]);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Entity Processing', () => {
    /**
     * Property test: Valid entities should always succeed
     *
     * Use fc.asyncProperty for async operations
     */
    it('valid inputs should always produce successful results', () => {
      fc.assert(
        fc.asyncProperty(nameArbitrary, scoreArbitrary, async (name, score) => {
          // Create fresh service for isolation in property tests
          const localRepo = new InMemoryExampleRepository();
          const localService = new ExampleService(localRepo);

          const result = await localService.processEntity({ name, score });

          // Valid inputs should succeed
          expect(result.success).toBe(true);
          expect(result.entity).toBeDefined();
          expect(result.entity!.name).toBe(name.trim());
          expect(result.entity!.score).toBe(score);
        }),
        { numRuns: 50 }
      );
    });

    /**
     * Property test: Entity ID should always be a valid UUID
     */
    it('generated entity ID should always be a valid UUID', () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      fc.assert(
        fc.asyncProperty(nameArbitrary, scoreArbitrary, async (name, score) => {
          const localRepo = new InMemoryExampleRepository();
          const localService = new ExampleService(localRepo);

          const result = await localService.processEntity({ name, score });

          expect(result.entity!.id).toMatch(uuidRegex);
        }),
        { numRuns: 30 }
      );
    });
  });

  describe('Property: Idempotency and State', () => {
    /**
     * Property test: Multiple saves should not create duplicates
     * (when saving the same entity)
     */
    it('saving same entity multiple times should be idempotent', () => {
      fc.assert(
        fc.asyncProperty(entityArbitrary, async (entity) => {
          const localRepo = new InMemoryExampleRepository();

          // Save multiple times
          await localRepo.save(entity);
          await localRepo.save(entity);
          await localRepo.save(entity);

          // Should only have one entity
          expect(localRepo.size()).toBe(1);

          const retrieved = await localRepo.findById(entity.id);
          expect(retrieved).toEqual(entity);
        }),
        { numRuns: 30 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // TIME-DEPENDENT TESTS
  // ---------------------------------------------------------------------------

  describe('Time-Dependent Operations', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should set createdAt to current time', async () => {
      // ARRANGE
      const mockDate = new Date('2025-06-15T10:30:00Z');
      vi.setSystemTime(mockDate);

      // ACT
      const result = await service.processEntity({
        name: 'Time Test',
        score: 50,
      });

      // ASSERT
      expect(result.entity!.createdAt).toEqual(mockDate);
    });
  });

  // ---------------------------------------------------------------------------
  // USING vi.fn() MOCKS
  // ---------------------------------------------------------------------------

  describe('With Mock Repository', () => {
    it('should call repository.save exactly once', async () => {
      // ARRANGE
      const mockRepo = createMockRepository();
      const serviceWithMock = new ExampleService(mockRepo);

      // ACT
      await serviceWithMock.processEntity({
        name: 'Mock Test',
        score: 60,
      });

      // ASSERT
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Mock Test',
          score: 60,
          status: 'pending',
        })
      );
    });

    it('should handle repository failures gracefully', async () => {
      // ARRANGE
      const mockRepo = createMockRepository();
      vi.mocked(mockRepo.save).mockRejectedValue(new Error('Database error'));
      const serviceWithMock = new ExampleService(mockRepo);

      // ACT & ASSERT
      await expect(
        serviceWithMock.processEntity({
          name: 'Fail Test',
          score: 50,
        })
      ).rejects.toThrow('Database error');
    });
  });

  // ---------------------------------------------------------------------------
  // ERROR HANDLING TESTS
  // ---------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should reject whitespace-only names', async () => {
      const result = await service.processEntity({
        name: '   ',
        score: 50,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Name is required');
    });

    it('should reject zero score', async () => {
      const result = await service.processEntity({
        name: 'Test',
        score: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Score must be between');
    });

    it('should reject negative score', async () => {
      const result = await service.processEntity({
        name: 'Test',
        score: -5,
      });

      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// ADDITIONAL PATTERNS
// =============================================================================

/**
 * Pattern: Testing Async Generators/Iterators
 */
describe('Async Iteration Pattern', () => {
  async function* generateItems(): AsyncGenerator<number> {
    for (let i = 1; i <= 3; i++) {
      yield i;
    }
  }

  it('should iterate through all items', async () => {
    const items: number[] = [];

    for await (const item of generateItems()) {
      items.push(item);
    }

    expect(items).toEqual([1, 2, 3]);
  });
});

/**
 * Pattern: Testing Event Emitters
 */
describe('Event Pattern', () => {
  it('should emit events in correct order', async () => {
    const events: string[] = [];

    // Simulate event handling
    const handler = {
      onStart: () => events.push('start'),
      onProgress: () => events.push('progress'),
      onComplete: () => events.push('complete'),
    };

    // Execute
    handler.onStart();
    handler.onProgress();
    handler.onComplete();

    // Verify order
    expect(events).toEqual(['start', 'progress', 'complete']);
  });
});

/**
 * Pattern: Testing with beforeAll/afterAll for expensive setup
 */
describe('Expensive Setup Pattern', () => {
  let sharedResource: { initialized: boolean };

  beforeAll(() => {
    // One-time expensive setup
    sharedResource = { initialized: true };
  });

  afterAll(() => {
    // One-time cleanup
    sharedResource = { initialized: false };
  });

  it('should use shared resource', () => {
    expect(sharedResource.initialized).toBe(true);
  });
});
