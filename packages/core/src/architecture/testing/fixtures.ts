/**
 * @module architecture/testing/fixtures
 *
 * Test Fixtures and Factories
 * ===========================
 *
 * Reusable test data generation.
 */

// ============================================================================
// FIXTURE TYPES
// ============================================================================

export interface Fixture<T> {
  readonly name: string;
  build(overrides?: Partial<T>): T;
  buildMany(count: number, overrides?: Partial<T>): T[];
}

export interface FixtureSequence {
  next(): number;
  reset(): void;
}

// ============================================================================
// FIXTURE FACTORY
// ============================================================================

export class FixtureFactory<T> implements Fixture<T> {
  private sequence = 0;

  constructor(
    readonly name: string,
    private builder: (seq: number) => T
  ) {}

  build(overrides?: Partial<T>): T {
    this.sequence++;
    const base = this.builder(this.sequence);
    return overrides ? { ...base, ...overrides } : base;
  }

  buildMany(count: number, overrides?: Partial<T>): T[] {
    return Array.from({ length: count }, () => this.build(overrides));
  }

  reset(): void {
    this.sequence = 0;
  }
}

// ============================================================================
// FIXTURE REGISTRY
// ============================================================================

export class FixtureRegistry {
  private fixtures = new Map<string, Fixture<unknown>>();

  register<T>(fixture: Fixture<T>): void {
    this.fixtures.set(fixture.name, fixture as Fixture<unknown>);
  }

  get<T>(name: string): Fixture<T> | undefined {
    return this.fixtures.get(name) as Fixture<T> | undefined;
  }

  build<T>(name: string, overrides?: Partial<T>): T {
    const fixture = this.get<T>(name);
    if (!fixture) {
      throw new Error(`Fixture '${name}' not found`);
    }
    return fixture.build(overrides);
  }

  buildMany<T>(name: string, count: number, overrides?: Partial<T>): T[] {
    const fixture = this.get<T>(name);
    if (!fixture) {
      throw new Error(`Fixture '${name}' not found`);
    }
    return fixture.buildMany(count, overrides);
  }

  clear(): void {
    this.fixtures.clear();
  }
}

// ============================================================================
// COMMON FIXTURE HELPERS
// ============================================================================

export const fixtureHelpers = {
  uuid: () => crypto.randomUUID(),

  email: (seq: number) => `user${seq}@example.com`,

  name: (seq: number) => `User ${seq}`,

  timestamp: () => new Date(),

  pastDate: (daysAgo: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date;
  },

  futureDate: (daysAhead: number) => {
    const date = new Date();
    date.setDate(date.getDate() + daysAhead);
    return date;
  },

  randomInt: (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min,

  randomFloat: (min: number, max: number) => Math.random() * (max - min) + min,

  pick: <T>(items: T[]) => {
    const index = Math.floor(Math.random() * items.length);
    const item = items[index];
    if (item === undefined) {
      throw new Error('Cannot pick from empty array');
    }
    return item;
  },

  shuffle: <T>(items: T[]) => {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = shuffled[i];
      const swapItem = shuffled[j];
      if (temp !== undefined && swapItem !== undefined) {
        shuffled[i] = swapItem;
        shuffled[j] = temp;
      }
    }
    return shuffled;
  },
};

// ============================================================================
// FIXTURE DEFINITION HELPERS
// ============================================================================

export function defineFixture<T>(name: string, builder: (seq: number) => T): FixtureFactory<T> {
  return new FixtureFactory(name, builder);
}

export function createFixtureRegistry(): FixtureRegistry {
  return new FixtureRegistry();
}

// ============================================================================
// ASYNC FIXTURE SUPPORT
// ============================================================================

export interface AsyncFixture<T> {
  readonly name: string;
  build(overrides?: Partial<T>): Promise<T>;
  buildMany(count: number, overrides?: Partial<T>): Promise<T[]>;
}

export class AsyncFixtureFactory<T> implements AsyncFixture<T> {
  private sequence = 0;

  constructor(
    readonly name: string,
    private builder: (seq: number) => Promise<T>
  ) {}

  async build(overrides?: Partial<T>): Promise<T> {
    this.sequence++;
    const base = await this.builder(this.sequence);
    return overrides ? { ...base, ...overrides } : base;
  }

  async buildMany(count: number, overrides?: Partial<T>): Promise<T[]> {
    return Promise.all(Array.from({ length: count }, () => this.build(overrides)));
  }

  reset(): void {
    this.sequence = 0;
  }
}

export function defineAsyncFixture<T>(
  name: string,
  builder: (seq: number) => Promise<T>
): AsyncFixtureFactory<T> {
  return new AsyncFixtureFactory(name, builder);
}
