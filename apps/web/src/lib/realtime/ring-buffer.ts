/**
 * Ring Buffer (Circular Buffer) Implementation
 *
 * A memory-efficient data structure that maintains a fixed-size collection.
 * When capacity is reached, oldest items are automatically removed.
 *
 * Perfect for:
 * - Real-time message feeds (prevent infinite memory growth)
 * - Notification queues
 * - Activity logs in long-running tabs
 *
 * Memory Safety: A doctor with a tab open for 8+ hours won't crash their browser.
 */

export class RingBuffer<T> {
  private buffer: T[];
  private head = 0;
  private tail = 0;
  private count = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    if (capacity < 1) {
      throw new Error('Ring buffer capacity must be at least 1');
    }
    this.capacity = capacity;
    this.buffer = new Array<T>(capacity);
  }

  /**
   * Add an item to the buffer
   * If at capacity, oldest item is automatically removed
   */
  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;

    if (this.count < this.capacity) {
      this.count++;
    } else {
      // Overwriting oldest, move head forward
      this.head = (this.head + 1) % this.capacity;
    }
  }

  /**
   * Add multiple items, maintaining order
   */
  pushMany(items: T[]): void {
    for (const item of items) {
      this.push(item);
    }
  }

  /**
   * Get item at index (0 = oldest, size-1 = newest)
   */
  get(index: number): T | undefined {
    if (index < 0 || index >= this.count) {
      return undefined;
    }
    const actualIndex = (this.head + index) % this.capacity;
    return this.buffer[actualIndex];
  }

  /**
   * Get the most recent item
   */
  getNewest(): T | undefined {
    if (this.count === 0) return undefined;
    const index = (this.tail - 1 + this.capacity) % this.capacity;
    return this.buffer[index];
  }

  /**
   * Get the oldest item
   */
  getOldest(): T | undefined {
    if (this.count === 0) return undefined;
    return this.buffer[this.head];
  }

  /**
   * Convert to array (oldest to newest order)
   */
  toArray(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.count; i++) {
      const index = (this.head + i) % this.capacity;
      const item = this.buffer[index];
      if (item !== undefined) {
        result.push(item);
      }
    }
    return result;
  }

  /**
   * Convert to array (newest to oldest order)
   */
  toArrayReversed(): T[] {
    return this.toArray().reverse();
  }

  /**
   * Find item by predicate
   */
  find(predicate: (item: T) => boolean): T | undefined {
    for (let i = 0; i < this.count; i++) {
      const index = (this.head + i) % this.capacity;
      const item = this.buffer[index];
      if (item !== undefined && predicate(item)) {
        return item;
      }
    }
    return undefined;
  }

  /**
   * Filter items
   */
  filter(predicate: (item: T) => boolean): T[] {
    return this.toArray().filter(predicate);
  }

  /**
   * Map items
   */
  map<U>(fn: (item: T, index: number) => U): U[] {
    return this.toArray().map(fn);
  }

  /**
   * Remove item that matches predicate
   * Note: This is O(n) - use sparingly
   */
  remove(predicate: (item: T) => boolean): boolean {
    const items = this.toArray().filter((item) => !predicate(item));
    if (items.length === this.count) {
      return false; // Nothing removed
    }

    // Rebuild buffer
    this.clear();
    this.pushMany(items);
    return true;
  }

  /**
   * Update item that matches predicate
   */
  update(predicate: (item: T) => boolean, updater: (item: T) => T): boolean {
    for (let i = 0; i < this.count; i++) {
      const index = (this.head + i) % this.capacity;
      const item = this.buffer[index];
      if (item !== undefined && predicate(item)) {
        this.buffer[index] = updater(item);
        return true;
      }
    }
    return false;
  }

  /**
   * Clear all items
   */
  clear(): void {
    this.buffer = new Array<T>(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  /**
   * Current number of items
   */
  get size(): number {
    return this.count;
  }

  /**
   * Maximum capacity
   */
  get maxSize(): number {
    return this.capacity;
  }

  /**
   * Check if buffer is empty
   */
  get isEmpty(): boolean {
    return this.count === 0;
  }

  /**
   * Check if buffer is at capacity
   */
  get isFull(): boolean {
    return this.count === this.capacity;
  }

  /**
   * Iterate over items (oldest to newest)
   */
  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this.count; i++) {
      const index = (this.head + i) % this.capacity;
      const item = this.buffer[index];
      if (item !== undefined) {
        yield item;
      }
    }
  }

  /**
   * For each item
   */
  forEach(callback: (item: T, index: number) => void): void {
    let i = 0;
    for (const item of this) {
      callback(item, i++);
    }
  }

  /**
   * Check if any item matches predicate
   */
  some(predicate: (item: T) => boolean): boolean {
    for (const item of this) {
      if (predicate(item)) return true;
    }
    return false;
  }

  /**
   * Check if all items match predicate
   */
  every(predicate: (item: T) => boolean): boolean {
    for (const item of this) {
      if (!predicate(item)) return false;
    }
    return true;
  }
}

/**
 * A bounded Map that automatically evicts oldest entries when capacity is reached.
 * Uses FIFO (First-In-First-Out) eviction strategy via insertion order tracking.
 *
 * Use this instead of Map when you need to track key-value pairs with a maximum size.
 * This prevents unbounded memory growth during long-running sessions.
 */
export class BoundedMap<K, V> {
  private map = new Map<K, V>();
  private insertionOrder: K[] = [];
  private readonly capacity: number;

  constructor(capacity: number) {
    if (capacity < 1) {
      throw new Error('BoundedMap capacity must be at least 1');
    }
    this.capacity = capacity;
  }

  set(key: K, value: V): void {
    // If key already exists, just update the value (don't change order)
    if (this.map.has(key)) {
      this.map.set(key, value);
      return;
    }

    // Evict oldest entries if at capacity
    while (this.insertionOrder.length >= this.capacity) {
      const oldestKey = this.insertionOrder.shift();
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }

    this.map.set(key, value);
    this.insertionOrder.push(key);
  }

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    if (this.map.delete(key)) {
      const index = this.insertionOrder.indexOf(key);
      if (index !== -1) {
        this.insertionOrder.splice(index, 1);
      }
      return true;
    }
    return false;
  }

  get size(): number {
    return this.map.size;
  }

  get maxSize(): number {
    return this.capacity;
  }

  clear(): void {
    this.map.clear();
    this.insertionOrder = [];
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }

  forEach(callback: (value: V, key: K) => void): void {
    this.map.forEach(callback);
  }
}

/**
 * Memory limits configuration for realtime data
 * These values are tuned for medical application usage patterns
 */
export const REALTIME_MEMORY_LIMITS = {
  /** Max leads in memory (newest 100) */
  LEADS: 100,

  /** Max urgencies in memory (newest 200) */
  URGENCIES: 200,

  /** Max messages per conversation (newest 500) */
  MESSAGES_PER_CONVERSATION: 500,

  /** Max notifications (newest 50) */
  NOTIFICATIONS: 50,

  /** Cleanup interval (5 minutes) */
  CLEANUP_INTERVAL_MS: 5 * 60 * 1000,

  /** Max age for read urgencies before cleanup (30 minutes) */
  READ_URGENCY_MAX_AGE_MS: 30 * 60 * 1000,
} as const;

/**
 * Create a new ring buffer with standard limits
 */
export function createLeadsBuffer<T>(): RingBuffer<T> {
  return new RingBuffer<T>(REALTIME_MEMORY_LIMITS.LEADS);
}

export function createUrgenciesBuffer<T>(): RingBuffer<T> {
  return new RingBuffer<T>(REALTIME_MEMORY_LIMITS.URGENCIES);
}

export function createNotificationsBuffer<T>(): RingBuffer<T> {
  return new RingBuffer<T>(REALTIME_MEMORY_LIMITS.NOTIFICATIONS);
}

export function createMessagesBuffer<T>(): RingBuffer<T> {
  return new RingBuffer<T>(REALTIME_MEMORY_LIMITS.MESSAGES_PER_CONVERSATION);
}
