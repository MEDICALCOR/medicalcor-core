import { describe, it, expect, beforeEach } from 'vitest';
import { RingBuffer, BoundedMap, REALTIME_MEMORY_LIMITS } from '../lib/realtime/ring-buffer';

describe('RingBuffer', () => {
  describe('constructor', () => {
    it('should create buffer with specified capacity', () => {
      const buffer = new RingBuffer<number>(10);
      expect(buffer.maxSize).toBe(10);
      expect(buffer.size).toBe(0);
      expect(buffer.isEmpty).toBe(true);
    });

    it('should throw error for capacity less than 1', () => {
      expect(() => new RingBuffer<number>(0)).toThrow('Ring buffer capacity must be at least 1');
      expect(() => new RingBuffer<number>(-1)).toThrow('Ring buffer capacity must be at least 1');
    });
  });

  describe('push', () => {
    let buffer: RingBuffer<number>;

    beforeEach(() => {
      buffer = new RingBuffer<number>(3);
    });

    it('should add items to buffer', () => {
      buffer.push(1);
      expect(buffer.size).toBe(1);
      expect(buffer.getNewest()).toBe(1);

      buffer.push(2);
      expect(buffer.size).toBe(2);
      expect(buffer.getNewest()).toBe(2);
    });

    it('should evict oldest item when at capacity', () => {
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      expect(buffer.size).toBe(3);
      expect(buffer.isFull).toBe(true);

      // This should evict 1
      buffer.push(4);
      expect(buffer.size).toBe(3);
      expect(buffer.toArray()).toEqual([2, 3, 4]);
    });

    it('should maintain FIFO order during eviction', () => {
      // Fill buffer
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      // Overflow multiple times
      buffer.push(4);
      buffer.push(5);
      buffer.push(6);

      expect(buffer.toArray()).toEqual([4, 5, 6]);
      expect(buffer.getOldest()).toBe(4);
      expect(buffer.getNewest()).toBe(6);
    });
  });

  describe('pushMany', () => {
    it('should add multiple items in order', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushMany([1, 2, 3]);
      expect(buffer.toArray()).toEqual([1, 2, 3]);
    });

    it('should handle overflow correctly', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.pushMany([1, 2, 3, 4, 5]);
      expect(buffer.toArray()).toEqual([3, 4, 5]);
    });
  });

  describe('get', () => {
    let buffer: RingBuffer<string>;

    beforeEach(() => {
      buffer = new RingBuffer<string>(5);
      buffer.pushMany(['a', 'b', 'c']);
    });

    it('should get item by index (0 = oldest)', () => {
      expect(buffer.get(0)).toBe('a');
      expect(buffer.get(1)).toBe('b');
      expect(buffer.get(2)).toBe('c');
    });

    it('should return undefined for out of bounds index', () => {
      expect(buffer.get(-1)).toBeUndefined();
      expect(buffer.get(3)).toBeUndefined();
      expect(buffer.get(100)).toBeUndefined();
    });
  });

  describe('getNewest/getOldest', () => {
    it('should return correct edge items', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushMany([1, 2, 3]);

      expect(buffer.getOldest()).toBe(1);
      expect(buffer.getNewest()).toBe(3);
    });

    it('should return undefined for empty buffer', () => {
      const buffer = new RingBuffer<number>(5);
      expect(buffer.getOldest()).toBeUndefined();
      expect(buffer.getNewest()).toBeUndefined();
    });

    it('should work after overflow', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.pushMany([1, 2, 3, 4, 5]);

      expect(buffer.getOldest()).toBe(3);
      expect(buffer.getNewest()).toBe(5);
    });
  });

  describe('toArray/toArrayReversed', () => {
    it('should return items in correct order', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushMany([1, 2, 3]);

      expect(buffer.toArray()).toEqual([1, 2, 3]);
      expect(buffer.toArrayReversed()).toEqual([3, 2, 1]);
    });

    it('should return empty array for empty buffer', () => {
      const buffer = new RingBuffer<number>(5);
      expect(buffer.toArray()).toEqual([]);
      expect(buffer.toArrayReversed()).toEqual([]);
    });
  });

  describe('find', () => {
    interface Item {
      id: string;
      value: number;
    }

    let buffer: RingBuffer<Item>;

    beforeEach(() => {
      buffer = new RingBuffer<Item>(5);
      buffer.pushMany([
        { id: 'a', value: 1 },
        { id: 'b', value: 2 },
        { id: 'c', value: 3 },
      ]);
    });

    it('should find item by predicate', () => {
      const found = buffer.find((item) => item.id === 'b');
      expect(found).toEqual({ id: 'b', value: 2 });
    });

    it('should return undefined if not found', () => {
      const found = buffer.find((item) => item.id === 'z');
      expect(found).toBeUndefined();
    });
  });

  describe('filter', () => {
    it('should filter items by predicate', () => {
      const buffer = new RingBuffer<number>(10);
      buffer.pushMany([1, 2, 3, 4, 5]);

      const evens = buffer.filter((n) => n % 2 === 0);
      expect(evens).toEqual([2, 4]);
    });
  });

  describe('map', () => {
    it('should map items', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushMany([1, 2, 3]);

      const doubled = buffer.map((n) => n * 2);
      expect(doubled).toEqual([2, 4, 6]);
    });
  });

  describe('remove', () => {
    it('should remove item matching predicate', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushMany([1, 2, 3, 4, 5]);

      const removed = buffer.remove((n) => n === 3);
      expect(removed).toBe(true);
      expect(buffer.toArray()).toEqual([1, 2, 4, 5]);
    });

    it('should return false if nothing removed', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushMany([1, 2, 3]);

      const removed = buffer.remove((n) => n === 10);
      expect(removed).toBe(false);
      expect(buffer.toArray()).toEqual([1, 2, 3]);
    });

    it('should remove all matching items', () => {
      const buffer = new RingBuffer<number>(10);
      buffer.pushMany([1, 2, 2, 3, 2, 4]);

      buffer.remove((n) => n === 2);
      expect(buffer.toArray()).toEqual([1, 3, 4]);
    });
  });

  describe('update', () => {
    interface Item {
      id: string;
      value: number;
    }

    it('should update item matching predicate', () => {
      const buffer = new RingBuffer<Item>(5);
      buffer.pushMany([
        { id: 'a', value: 1 },
        { id: 'b', value: 2 },
        { id: 'c', value: 3 },
      ]);

      const updated = buffer.update(
        (item) => item.id === 'b',
        (item) => ({ ...item, value: 20 })
      );

      expect(updated).toBe(true);
      expect(buffer.find((item) => item.id === 'b')?.value).toBe(20);
    });

    it('should return false if no item matches', () => {
      const buffer = new RingBuffer<Item>(5);
      buffer.push({ id: 'a', value: 1 });

      const updated = buffer.update(
        (item) => item.id === 'z',
        (item) => ({ ...item, value: 99 })
      );

      expect(updated).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all items', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushMany([1, 2, 3]);

      buffer.clear();

      expect(buffer.size).toBe(0);
      expect(buffer.isEmpty).toBe(true);
      expect(buffer.toArray()).toEqual([]);
    });
  });

  describe('iteration', () => {
    it('should support for...of loops', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushMany([1, 2, 3]);

      const items: number[] = [];
      for (const item of buffer) {
        items.push(item);
      }

      expect(items).toEqual([1, 2, 3]);
    });

    it('should support forEach', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushMany([1, 2, 3]);

      const items: number[] = [];
      buffer.forEach((item, index) => {
        items.push(item * (index + 1));
      });

      expect(items).toEqual([1, 4, 9]); // 1*1, 2*2, 3*3
    });
  });

  describe('some/every', () => {
    it('should check if some items match', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushMany([1, 2, 3, 4, 5]);

      expect(buffer.some((n) => n > 3)).toBe(true);
      expect(buffer.some((n) => n > 10)).toBe(false);
    });

    it('should check if all items match', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushMany([2, 4, 6]);

      expect(buffer.every((n) => n % 2 === 0)).toBe(true);
      expect(buffer.every((n) => n > 3)).toBe(false);
    });

    it('should return correct values for empty buffer', () => {
      const buffer = new RingBuffer<number>(5);

      // some returns false for empty (no items match)
      expect(buffer.some((n) => n > 0)).toBe(false);
      // every returns true for empty (vacuous truth)
      expect(buffer.every((n) => n > 0)).toBe(true);
    });
  });

  describe('memory safety - long running session simulation', () => {
    it('should maintain bounded memory during high throughput', () => {
      const buffer = new RingBuffer<{ id: number; data: string }>(100);

      // Simulate 8 hours of leads at 1/second = 28,800 leads
      // We push 30,000 items to simulate a long shift
      for (let i = 0; i < 30000; i++) {
        buffer.push({ id: i, data: `lead-${i}` });
      }

      // Buffer should still only contain 100 items
      expect(buffer.size).toBe(100);
      expect(buffer.maxSize).toBe(100);

      // Should contain only the newest 100 items
      const items = buffer.toArray();
      expect(items[0]?.id).toBe(29900);
      expect(items[99]?.id).toBe(29999);
    });

    it('should handle rapid concurrent-style operations', () => {
      const buffer = new RingBuffer<number>(50);

      // Simulate rapid fire events
      for (let batch = 0; batch < 100; batch++) {
        // Push batch
        for (let i = 0; i < 10; i++) {
          buffer.push(batch * 10 + i);
        }

        // Occasionally remove some
        if (batch % 10 === 0) {
          buffer.remove((n) => n % 7 === 0);
        }

        // Occasionally update some
        if (batch % 5 === 0) {
          buffer.update(
            (n) => n % 13 === 0,
            (n) => n * 2
          );
        }
      }

      // Buffer should never exceed capacity
      expect(buffer.size).toBeLessThanOrEqual(50);
    });
  });

  describe('REALTIME_MEMORY_LIMITS', () => {
    it('should have reasonable default limits', () => {
      expect(REALTIME_MEMORY_LIMITS.LEADS).toBe(100);
      expect(REALTIME_MEMORY_LIMITS.URGENCIES).toBe(200);
      expect(REALTIME_MEMORY_LIMITS.MESSAGES_PER_CONVERSATION).toBe(500);
      expect(REALTIME_MEMORY_LIMITS.NOTIFICATIONS).toBe(50);
    });

    it('should have cleanup interval of 5 minutes', () => {
      expect(REALTIME_MEMORY_LIMITS.CLEANUP_INTERVAL_MS).toBe(5 * 60 * 1000);
    });

    it('should have max age of 30 minutes for read urgencies', () => {
      expect(REALTIME_MEMORY_LIMITS.READ_URGENCY_MAX_AGE_MS).toBe(30 * 60 * 1000);
    });
  });
});

describe('RingBuffer edge cases', () => {
  it('should handle single item buffer', () => {
    const buffer = new RingBuffer<string>(1);

    buffer.push('a');
    expect(buffer.toArray()).toEqual(['a']);

    buffer.push('b');
    expect(buffer.toArray()).toEqual(['b']);
    expect(buffer.size).toBe(1);
  });

  it('should handle large capacity buffer', () => {
    const buffer = new RingBuffer<number>(10000);

    for (let i = 0; i < 5000; i++) {
      buffer.push(i);
    }

    expect(buffer.size).toBe(5000);
    expect(buffer.isFull).toBe(false);
    expect(buffer.getOldest()).toBe(0);
    expect(buffer.getNewest()).toBe(4999);
  });

  it('should handle wrap-around correctly', () => {
    const buffer = new RingBuffer<number>(3);

    // Fill and overflow multiple times
    for (let i = 0; i < 10; i++) {
      buffer.push(i);
    }

    expect(buffer.toArray()).toEqual([7, 8, 9]);

    // Add more
    buffer.push(10);
    buffer.push(11);

    expect(buffer.toArray()).toEqual([9, 10, 11]);
  });
});

describe('BoundedMap', () => {
  describe('constructor', () => {
    it('should create map with specified capacity', () => {
      const map = new BoundedMap<string, number>(10);
      expect(map.maxSize).toBe(10);
      expect(map.size).toBe(0);
    });

    it('should throw error for capacity less than 1', () => {
      expect(() => new BoundedMap<string, number>(0)).toThrow(
        'BoundedMap capacity must be at least 1'
      );
      expect(() => new BoundedMap<string, number>(-1)).toThrow(
        'BoundedMap capacity must be at least 1'
      );
    });
  });

  describe('set/get', () => {
    let map: BoundedMap<string, number>;

    beforeEach(() => {
      map = new BoundedMap<string, number>(3);
    });

    it('should set and get values', () => {
      map.set('a', 1);
      map.set('b', 2);

      expect(map.get('a')).toBe(1);
      expect(map.get('b')).toBe(2);
      expect(map.size).toBe(2);
    });

    it('should update existing keys without changing order', () => {
      map.set('a', 1);
      map.set('b', 2);
      map.set('c', 3);

      // Update 'a' - should not affect order
      map.set('a', 100);

      expect(map.get('a')).toBe(100);
      expect(map.size).toBe(3);

      // Add new item - should evict 'a' (oldest)
      map.set('d', 4);

      expect(map.get('a')).toBeUndefined();
      expect(map.get('b')).toBe(2);
      expect(map.get('c')).toBe(3);
      expect(map.get('d')).toBe(4);
    });

    it('should evict oldest entries when at capacity', () => {
      map.set('a', 1);
      map.set('b', 2);
      map.set('c', 3);

      expect(map.size).toBe(3);

      // Should evict 'a'
      map.set('d', 4);

      expect(map.size).toBe(3);
      expect(map.get('a')).toBeUndefined();
      expect(map.get('b')).toBe(2);
      expect(map.get('d')).toBe(4);
    });

    it('should return undefined for non-existent keys', () => {
      map.set('a', 1);
      expect(map.get('z')).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should check if key exists', () => {
      const map = new BoundedMap<string, number>(5);
      map.set('a', 1);

      expect(map.has('a')).toBe(true);
      expect(map.has('b')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete existing key', () => {
      const map = new BoundedMap<string, number>(5);
      map.set('a', 1);
      map.set('b', 2);

      const deleted = map.delete('a');

      expect(deleted).toBe(true);
      expect(map.get('a')).toBeUndefined();
      expect(map.size).toBe(1);
    });

    it('should return false for non-existent key', () => {
      const map = new BoundedMap<string, number>(5);
      map.set('a', 1);

      const deleted = map.delete('z');

      expect(deleted).toBe(false);
      expect(map.size).toBe(1);
    });

    it('should maintain correct order after deletion', () => {
      const map = new BoundedMap<string, number>(3);
      map.set('a', 1);
      map.set('b', 2);
      map.set('c', 3);

      // Delete middle item
      map.delete('b');

      // Add new items - should evict in order: a, c
      map.set('d', 4);
      map.set('e', 5);

      expect(map.get('a')).toBeUndefined();
      expect(map.get('c')).toBe(3);
      expect(map.get('d')).toBe(4);
      expect(map.get('e')).toBe(5);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      const map = new BoundedMap<string, number>(5);
      map.set('a', 1);
      map.set('b', 2);

      map.clear();

      expect(map.size).toBe(0);
      expect(map.get('a')).toBeUndefined();
      expect(map.get('b')).toBeUndefined();
    });
  });

  describe('iteration', () => {
    it('should iterate over keys', () => {
      const map = new BoundedMap<string, number>(5);
      map.set('a', 1);
      map.set('b', 2);

      const keys = [...map.keys()];
      expect(keys).toContain('a');
      expect(keys).toContain('b');
    });

    it('should iterate over values', () => {
      const map = new BoundedMap<string, number>(5);
      map.set('a', 1);
      map.set('b', 2);

      const values = [...map.values()];
      expect(values).toContain(1);
      expect(values).toContain(2);
    });

    it('should iterate over entries', () => {
      const map = new BoundedMap<string, number>(5);
      map.set('a', 1);
      map.set('b', 2);

      const entries = [...map.entries()];
      expect(entries).toContainEqual(['a', 1]);
      expect(entries).toContainEqual(['b', 2]);
    });

    it('should support forEach', () => {
      const map = new BoundedMap<string, number>(5);
      map.set('a', 1);
      map.set('b', 2);

      const collected: [string, number][] = [];
      map.forEach((value, key) => {
        collected.push([key, value]);
      });

      expect(collected).toContainEqual(['a', 1]);
      expect(collected).toContainEqual(['b', 2]);
    });
  });

  describe('memory safety - lead correlation simulation', () => {
    it('should maintain bounded memory during high throughput', () => {
      const map = new BoundedMap<string, { phone: string; timestamp: number }>(50);

      // Simulate high-volume lead creation without scoring
      // 1000 leads coming in rapidly
      for (let i = 0; i < 1000; i++) {
        map.set(`lead-${i}`, { phone: `+1234567${i}`, timestamp: Date.now() });
      }

      // Should never exceed capacity
      expect(map.size).toBe(50);

      // Should contain only newest leads
      expect(map.has('lead-999')).toBe(true);
      expect(map.has('lead-950')).toBe(true);
      expect(map.has('lead-0')).toBe(false);
      expect(map.has('lead-949')).toBe(false);
    });

    it('should handle rapid set/delete cycles', () => {
      const map = new BoundedMap<string, number>(10);

      for (let i = 0; i < 500; i++) {
        map.set(`key-${i}`, i);

        // Simulate scoring (delete) for older items
        if (i > 5) {
          map.delete(`key-${i - 5}`);
        }
      }

      // Should be bounded
      expect(map.size).toBeLessThanOrEqual(10);
    });
  });
});

describe('BoundedMap edge cases', () => {
  it('should handle single capacity', () => {
    const map = new BoundedMap<string, number>(1);

    map.set('a', 1);
    expect(map.get('a')).toBe(1);

    map.set('b', 2);
    expect(map.get('a')).toBeUndefined();
    expect(map.get('b')).toBe(2);
    expect(map.size).toBe(1);
  });

  it('should handle complex keys', () => {
    interface Key {
      id: string;
    }
    const map = new BoundedMap<Key, string>(3);

    const key1: Key = { id: '1' };
    const key2: Key = { id: '2' };

    map.set(key1, 'value1');
    map.set(key2, 'value2');

    expect(map.get(key1)).toBe('value1');
    expect(map.get(key2)).toBe('value2');
  });
});
