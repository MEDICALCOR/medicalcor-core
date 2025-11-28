/**
 * @fileoverview Exhaustive Pattern Matching Utilities
 *
 * Provides type-safe pattern matching inspired by Rust's match and functional
 * programming patterns. Features:
 * - Exhaustive matching with compile-time checks
 * - Discriminated union matching
 * - Guard clauses and predicates
 * - Wildcard patterns
 * - Chained matching
 *
 * @module @medicalcor/types/match
 * @version 2.0.0
 */

/* eslint-disable @typescript-eslint/no-unnecessary-condition -- defensive checks for pattern matching edge cases */
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- type parameters are intentional for pattern matching inference */

// =============================================================================
// TYPE UTILITIES FOR PATTERN MATCHING
// =============================================================================

/**
 * Extracts the discriminant from a discriminated union
 */
export type Discriminant<T, K extends keyof T> = T[K];

/**
 * Extracts a variant from a discriminated union by discriminant value
 */
export type VariantOf<T, K extends keyof T, V extends T[K]> = Extract<T, Record<K, V>>;

/**
 * Gets all possible discriminant values from a union
 */
export type DiscriminantValues<T, K extends keyof T> = T extends unknown ? T[K] : never;

/**
 * Constrains discriminant to valid property key types
 */
type ValidKey<T> = T extends string | number | symbol ? T : never;

/**
 * Creates a handler map type for a discriminated union
 */
export type HandlerMap<T, K extends keyof T, R> = {
  [V in ValidKey<DiscriminantValues<T, K>>]: (value: VariantOf<T, K, V>) => R;
};

/**
 * Partial handler map with optional handlers
 */
export type PartialHandlerMap<T, K extends keyof T, R> = {
  [V in ValidKey<DiscriminantValues<T, K>>]?: (value: VariantOf<T, K, V>) => R;
};

// =============================================================================
// EXHAUSTIVE PATTERN MATCHING
// =============================================================================

/**
 * Creates an exhaustive pattern matcher for discriminated unions
 * Ensures all variants are handled at compile time
 *
 * @example
 * type Shape =
 *   | { type: 'circle'; radius: number }
 *   | { type: 'rect'; width: number; height: number }
 *   | { type: 'triangle'; base: number; height: number };
 *
 * const area = match<Shape, 'type', number>({
 *   circle: (s) => Math.PI * s.radius ** 2,
 *   rect: (s) => s.width * s.height,
 *   triangle: (s) => 0.5 * s.base * s.height,
 * });
 *
 * area({ type: 'circle', radius: 5 }); // 78.54...
 */
export function match<T, K extends keyof T, R>(handlers: HandlerMap<T, K, R>): (value: T) => R {
  return (value: T) => {
    const discriminant = value[Object.keys(handlers)[0] as K] as keyof typeof handlers;
    const handler = handlers[discriminant];
    if (handler) {
      return handler(value as never);
    }
    throw new Error(`No handler for discriminant: ${String(discriminant)}`);
  };
}

/**
 * Pattern matcher with explicit discriminant key
 *
 * @example
 * const handleEvent = matchOn<DomainEvent, 'type'>('type', {
 *   'lead.created': (e) => console.log('New lead:', e.payload.phone),
 *   'lead.scored': (e) => console.log('Score:', e.payload.score),
 *   // ... all other event types
 * });
 */
export function matchOn<T, K extends keyof T>(
  key: K,
  handlers: HandlerMap<T, K, unknown>
): <R>(value: T) => R {
  return (value: T) => {
    const discriminant = value[key] as keyof typeof handlers;
    const handler = handlers[discriminant];
    if (handler) {
      return handler(value as never) as never;
    }
    throw new Error(`No handler for ${String(key)}: ${String(discriminant)}`);
  };
}

// =============================================================================
// PARTIAL MATCHING WITH DEFAULT
// =============================================================================

/**
 * Creates a partial matcher with a default case
 * Allows handling only specific variants
 *
 * @example
 * const handlePriority = matchPartial<Lead, 'priority', string>(
 *   'priority',
 *   {
 *     critical: () => 'URGENT!',
 *     high: () => 'Important',
 *   },
 *   () => 'Normal'
 * );
 */
export function matchPartial<T, K extends keyof T, R>(
  key: K,
  handlers: PartialHandlerMap<T, K, R>,
  defaultHandler: (value: T) => R
): (value: T) => R {
  return (value: T) => {
    const discriminant = value[key] as keyof typeof handlers;
    const handler = handlers[discriminant];
    if (handler) {
      return handler(value as never);
    }
    return defaultHandler(value);
  };
}

// =============================================================================
// FLUENT PATTERN MATCHING API
// =============================================================================

/**
 * Fluent pattern matcher builder
 * Provides a chainable API for building pattern matchers
 *
 * @example
 * const result = Matcher.value(lead)
 *   .when(l => l.score >= 4, () => 'Hot lead!')
 *   .when(l => l.score >= 2, () => 'Warm lead')
 *   .otherwise(() => 'Cold lead');
 */
export class Matcher<T, R = never> {
  private value: T;
  private result: R | undefined;
  private matched: boolean;

  private constructor(value: T) {
    this.value = value;
    this.matched = false;
  }

  /**
   * Creates a new matcher for a value
   */
  static value<T>(value: T): Matcher<T> {
    return new Matcher(value);
  }

  /**
   * Adds a conditional case with a guard
   */
  when<U>(guard: (value: T) => boolean, handler: (value: T) => U): Matcher<T, R | U> {
    if (!this.matched && guard(this.value)) {
      this.result = handler(this.value) as unknown as R;
      this.matched = true;
    }
    return this as unknown as Matcher<T, R | U>;
  }

  /**
   * Adds a case matching a specific value
   */
  is<U>(expected: T, handler: () => U): Matcher<T, R | U> {
    if (!this.matched && this.value === expected) {
      this.result = handler() as unknown as R;
      this.matched = true;
    }
    return this as unknown as Matcher<T, R | U>;
  }

  /**
   * Adds a case matching values in a set
   */
  in<U>(values: T[], handler: (value: T) => U): Matcher<T, R | U> {
    if (!this.matched && values.includes(this.value)) {
      this.result = handler(this.value) as unknown as R;
      this.matched = true;
    }
    return this as unknown as Matcher<T, R | U>;
  }

  /**
   * Adds a case for a type guard
   */
  isType<S extends T, U>(
    guard: (value: T) => value is S,
    handler: (value: S) => U
  ): Matcher<T, R | U> {
    if (!this.matched && guard(this.value)) {
      this.result = handler(this.value) as unknown as R;
      this.matched = true;
    }
    return this as unknown as Matcher<T, R | U>;
  }

  /**
   * Adds the default case
   */
  otherwise<U>(handler: (value: T) => U): R | U {
    if (this.matched) {
      return this.result as R;
    }
    return handler(this.value);
  }

  /**
   * Executes without a default (returns undefined if no match)
   */
  run(): R | undefined {
    return this.result;
  }

  /**
   * Executes and throws if no match
   */
  exhaustive(): R {
    if (!this.matched) {
      throw new Error(`No pattern matched for value: ${JSON.stringify(this.value)}`);
    }
    return this.result as R;
  }
}

// =============================================================================
// DISCRIMINATED UNION MATCHER
// =============================================================================

/**
 * Type-safe matcher for discriminated unions
 * Provides IntelliSense for all variants
 *
 * @example
 * type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
 *
 * const message = UnionMatcher.on(result, 'ok')
 *   .case(true, (r) => `Success: ${r.value}`)
 *   .case(false, (r) => `Error: ${r.error}`)
 *   .done();
 */
export class UnionMatcher<T, K extends keyof T, R = never, THandled = never> {
  private value: T;
  private key: K;
  private result: R | undefined;
  private matched: boolean;

  private constructor(value: T, key: K) {
    this.value = value;
    this.key = key;
    this.matched = false;
  }

  /**
   * Creates a union matcher with a discriminant key
   */
  static on<T, K extends keyof T>(value: T, key: K): UnionMatcher<T, K> {
    return new UnionMatcher(value, key);
  }

  /**
   * Adds a case for a specific discriminant value
   */
  case<V extends Exclude<DiscriminantValues<T, K>, THandled>, U>(
    discriminant: V,
    handler: (value: VariantOf<T, K, V>) => U
  ): UnionMatcher<T, K, R | U, THandled | V> {
    if (!this.matched && this.value[this.key] === discriminant) {
      this.result = handler(this.value as VariantOf<T, K, V>) as unknown as R;
      this.matched = true;
    }
    return this as unknown as UnionMatcher<T, K, R | U, THandled | V>;
  }

  /**
   * Completes the matcher (requires all cases handled)
   */
  done(this: UnionMatcher<T, K, R, DiscriminantValues<T, K>>): R {
    return this.result as R;
  }

  /**
   * Completes with a default handler
   */
  default<U>(handler: (value: T) => U): R | U {
    if (this.matched) {
      return this.result as R;
    }
    return handler(this.value);
  }
}

// =============================================================================
// TAGGED UNION HELPERS
// =============================================================================

/**
 * Standard tag for discriminated unions
 */
export const TAG = '_tag' as const;

/**
 * Creates a tagged union variant
 */
export function variant<TTag extends string, TData extends object>(
  tag: TTag,
  data: TData
): { readonly _tag: TTag } & TData {
  return { _tag: tag, ...data };
}

/**
 * Creates a variant constructor
 */
export function makeVariant<TTag extends string>(
  tag: TTag
): <TData extends object>(data: TData) => { readonly _tag: TTag } & TData {
  return (data) => variant(tag, data);
}

/**
 * Type guard for tagged unions
 */
export function isVariant<TUnion extends { _tag: string }, TTag extends TUnion['_tag']>(
  value: TUnion,
  tag: TTag
): value is Extract<TUnion, { _tag: TTag }> {
  return value._tag === tag;
}

/**
 * Creates a type guard for a specific tag
 */
export function tagIs<TUnion extends { _tag: string }, TTag extends TUnion['_tag']>(
  tag: TTag
): (value: TUnion) => value is Extract<TUnion, { _tag: TTag }> {
  return (value): value is Extract<TUnion, { _tag: TTag }> => value._tag === tag;
}

// =============================================================================
// PATTERN MATCHING UTILITIES
// =============================================================================

/**
 * Pattern type for matching
 */
export type Pattern<T> =
  | T
  | ((value: T) => boolean)
  | { _: 'wildcard' }
  | { _: 'type'; guard: (value: unknown) => value is T };

/**
 * Wildcard pattern - matches anything
 */
export const _ = { _: 'wildcard' as const };

/**
 * Type pattern - matches with a type guard
 */
export function P<T>(guard: (value: unknown) => value is T): Pattern<T> {
  return { _: 'type', guard };
}

/**
 * Checks if a value matches a pattern
 */
export function matchesPattern<T>(value: T, pattern: Pattern<T>): boolean {
  if (pattern === _) return true;
  if (typeof pattern === 'function') return (pattern as (value: T) => boolean)(value);
  if (typeof pattern === 'object' && pattern !== null && '_' in pattern) {
    if (pattern._ === 'wildcard') return true;
    if (pattern._ === 'type')
      return (pattern as { _: 'type'; guard: (v: unknown) => boolean }).guard(value);
  }
  return value === pattern;
}

// =============================================================================
// SWITCH EXPRESSION
// =============================================================================

/**
 * Type-safe switch expression
 * Returns a value instead of being a statement
 *
 * @example
 * const label = switchExpr(status)
 *   .case('new', () => 'New Lead')
 *   .case('contacted', () => 'In Contact')
 *   .case('qualified', () => 'Qualified')
 *   .default(() => 'Other');
 */
export function switchExpr<T>(value: T): SwitchExpr<T, never> {
  return new SwitchExpr(value);
}

class SwitchExpr<T, R> {
  private value: T;
  private result: R | undefined;
  private matched: boolean;

  constructor(value: T) {
    this.value = value;
    this.matched = false;
  }

  case<U>(match: T, handler: () => U): SwitchExpr<T, R | U> {
    if (!this.matched && this.value === match) {
      this.result = handler() as unknown as R;
      this.matched = true;
    }
    return this as unknown as SwitchExpr<T, R | U>;
  }

  cases<U>(matches: T[], handler: () => U): SwitchExpr<T, R | U> {
    if (!this.matched && matches.includes(this.value)) {
      this.result = handler() as unknown as R;
      this.matched = true;
    }
    return this as unknown as SwitchExpr<T, R | U>;
  }

  default<U>(handler: () => U): R | U {
    if (this.matched) {
      return this.result as R;
    }
    return handler();
  }
}

// =============================================================================
// CONDITIONAL EXPRESSION HELPERS
// =============================================================================

/**
 * Conditional expression that works with null/undefined
 *
 * @example
 * const greeting = cond(
 *   [user.isAdmin, 'Hello, Admin!'],
 *   [user.isPremium, 'Hello, Premium User!'],
 *   ['Hello, User!']
 * );
 */
export function cond<T>(...conditions: [...[boolean, T][], [T]]): T {
  for (const item of conditions) {
    if (item.length === 1) return item[0];
    const [condition, value] = item;
    if (condition) return value;
  }
  throw new Error('No condition matched and no default provided');
}

/**
 * Lazy conditional - evaluates handlers only when needed
 */
export function condLazy<T>(...conditions: [...[boolean, () => T][], [() => T]]): T {
  for (const item of conditions) {
    if (item.length === 1) return (item[0] as () => T)();
    const [condition, handler] = item as [boolean, () => T];
    if (condition) return handler();
  }
  throw new Error('No condition matched and no default provided');
}

/**
 * Null-coalescing chain
 *
 * @example
 * const value = coalesce(maybeNull, maybeUndefined, defaultValue);
 */
export function coalesce<T>(...values: (T | null | undefined)[]): T | undefined {
  for (const value of values) {
    // eslint-disable-next-line eqeqeq -- intentional: != null checks both null and undefined
    if (value != null) return value;
  }
  return undefined;
}

/**
 * First truthy value
 */
export function firstTruthy<T>(
  ...values: (T | null | undefined | false | 0 | '')[]
): T | undefined {
  for (const value of values) {
    if (value) return value;
  }
  return undefined;
}
