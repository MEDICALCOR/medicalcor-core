/**
 * Memory monitoring utilities for the realtime system.
 *
 * These utilities help identify memory leaks during development and testing.
 * They should be used in development builds only - do not enable in production.
 *
 * Usage:
 *   import { RealtimeMemoryMonitor } from '@/lib/realtime/memory-monitor';
 *
 *   // In development, attach to window for debugging
 *   if (process.env.NODE_ENV === 'development') {
 *     window.__realtimeMemory = RealtimeMemoryMonitor;
 *   }
 *
 *   // Check memory usage
 *   RealtimeMemoryMonitor.logMemoryUsage();
 *
 *   // Start continuous monitoring
 *   RealtimeMemoryMonitor.startMonitoring(30000); // every 30 seconds
 */

import type { RingBuffer, BoundedMap } from './ring-buffer';
import { REALTIME_MEMORY_LIMITS } from './ring-buffer';

/** Extend Window interface for development debugging */
declare global {
  interface Window {
    __realtimeMemory?: typeof RealtimeMemoryMonitor;
  }
}

export interface MemoryStats {
  timestamp: Date;
  heapUsed: number | null;
  heapTotal: number | null;
  bufferStats: BufferStats[];
}

export interface BufferStats {
  name: string;
  size: number;
  maxSize: number;
  utilizationPercent: number;
}

/**
 * Registry for tracking memory-bounded data structures.
 * Register your buffers/maps here to include them in memory reports.
 */
class MemoryRegistry {
  private buffers = new Map<string, RingBuffer<unknown>>();
  private maps = new Map<string, BoundedMap<unknown, unknown>>();

  registerBuffer<T>(name: string, buffer: RingBuffer<T>): void {
    this.buffers.set(name, buffer as RingBuffer<unknown>);
  }

  registerMap<K, V>(name: string, map: BoundedMap<K, V>): void {
    this.maps.set(name, map as BoundedMap<unknown, unknown>);
  }

  unregister(name: string): void {
    this.buffers.delete(name);
    this.maps.delete(name);
  }

  clear(): void {
    this.buffers.clear();
    this.maps.clear();
  }

  getStats(): BufferStats[] {
    const stats: BufferStats[] = [];

    for (const [name, buffer] of this.buffers) {
      stats.push({
        name,
        size: buffer.size,
        maxSize: buffer.maxSize,
        utilizationPercent: (buffer.size / buffer.maxSize) * 100,
      });
    }

    for (const [name, map] of this.maps) {
      stats.push({
        name,
        size: map.size,
        maxSize: map.maxSize,
        utilizationPercent: (map.size / map.maxSize) * 100,
      });
    }

    return stats;
  }
}

/**
 * Memory monitor singleton for tracking realtime system memory usage.
 *
 * Note: This module intentionally uses console.log/group/table for debugging output.
 */
/* eslint-disable no-console */
export const RealtimeMemoryMonitor = {
  registry: new MemoryRegistry(),
  history: [] as MemoryStats[],
  maxHistorySize: 100,
  monitoringInterval: null as NodeJS.Timeout | null,

  /**
   * Get current memory statistics
   */
  getStats(): MemoryStats {
    // Browser memory API (if available)
    let heapUsed: number | null = null;
    let heapTotal: number | null = null;

    // @ts-expect-error - performance.memory is non-standard but available in Chrome
    if (typeof performance !== 'undefined' && performance.memory) {
      // @ts-expect-error - performance.memory is non-standard

      heapUsed = performance.memory.usedJSHeapSize;
      // @ts-expect-error - performance.memory is non-standard

      heapTotal = performance.memory.totalJSHeapSize;
    }

    return {
      timestamp: new Date(),
      heapUsed,
      heapTotal,
      bufferStats: this.registry.getStats(),
    };
  },

  /**
   * Log current memory usage to console
   */
  logMemoryUsage(): void {
    const stats = this.getStats();

    console.group('🧠 Realtime Memory Usage');

    if (stats.heapUsed !== null && stats.heapTotal !== null) {
      const usedMB = (stats.heapUsed / 1024 / 1024).toFixed(2);
      const totalMB = (stats.heapTotal / 1024 / 1024).toFixed(2);
      console.log(`Heap: ${usedMB} MB / ${totalMB} MB`);
    }

    console.log('\nBuffer/Map Usage:');
    console.table(
      stats.bufferStats.map((s) => ({
        Name: s.name,
        Size: s.size,
        'Max Size': s.maxSize,
        'Utilization %': s.utilizationPercent.toFixed(1),
      }))
    );

    console.log('\nMemory Limits Configuration:');
    console.table(REALTIME_MEMORY_LIMITS);

    console.groupEnd();
  },

  /**
   * Start periodic memory monitoring
   * @param intervalMs - Check interval in milliseconds (default: 60000)
   */
  startMonitoring(intervalMs = 60000): void {
    if (this.monitoringInterval) {
      console.warn('Memory monitoring already started');
      return;
    }

    console.log(`📊 Starting memory monitoring (interval: ${intervalMs}ms)`);

    this.monitoringInterval = setInterval(() => {
      const stats = this.getStats();
      this.history.push(stats);

      // Keep history bounded
      while (this.history.length > this.maxHistorySize) {
        this.history.shift();
      }

      // Check for potential issues
      const warnings = this.checkForIssues(stats);
      if (warnings.length > 0) {
        console.warn('⚠️ Memory warnings:', warnings);
      }
    }, intervalMs);
  },

  /**
   * Stop periodic memory monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('📊 Memory monitoring stopped');
    }
  },

  /**
   * Check for potential memory issues
   */
  checkForIssues(stats: MemoryStats): string[] {
    const warnings: string[] = [];

    // Check buffer utilization
    for (const buffer of stats.bufferStats) {
      if (buffer.utilizationPercent >= 100) {
        warnings.push(
          `${buffer.name} is at 100% capacity (${buffer.size}/${buffer.maxSize}) - oldest items being evicted`
        );
      } else if (buffer.utilizationPercent >= 90) {
        warnings.push(
          `${buffer.name} is at ${buffer.utilizationPercent.toFixed(0)}% capacity - approaching limit`
        );
      }
    }

    // Check heap growth trend (if we have history)
    if (this.history.length >= 5) {
      const recent = this.history.slice(-5);
      const heapGrowth = recent.map((s) => s.heapUsed).filter((h): h is number => h !== null);

      if (heapGrowth.length >= 5) {
        // Check if heap is consistently growing
        let growthCount = 0;
        for (let i = 1; i < heapGrowth.length; i++) {
          // After filter, array contains only numbers, indices are guaranteed valid
          const current = heapGrowth[i];
          const previous = heapGrowth[i - 1];
          if (current > previous) {
            growthCount++;
          }
        }

        if (growthCount === heapGrowth.length - 1) {
          // Array has at least 5 elements at this point
          const newest = heapGrowth[heapGrowth.length - 1];
          const oldest = heapGrowth[0];
          const growth = newest - oldest;
          const growthMB = (growth / 1024 / 1024).toFixed(2);
          warnings.push(`Heap has grown ${growthMB} MB over last 5 checks - potential leak`);
        }
      }
    }

    return warnings;
  },

  /**
   * Get memory history for analysis
   */
  getHistory(): MemoryStats[] {
    return [...this.history];
  },

  /**
   * Clear memory history
   */
  clearHistory(): void {
    this.history = [];
  },

  /**
   * Export report for debugging
   */
  exportReport(): string {
    const stats = this.getStats();
    const report = {
      generated: new Date().toISOString(),
      current: stats,
      history: this.history,
      config: REALTIME_MEMORY_LIMITS,
    };
    return JSON.stringify(report, null, 2);
  },
};

/* eslint-enable no-console */

/**
 * Development-only helper to attach monitor to window
 */
export function attachMemoryMonitorToWindow(): void {
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    window.__realtimeMemory = RealtimeMemoryMonitor;
    // eslint-disable-next-line no-console
    console.log(
      '🔧 RealtimeMemoryMonitor attached to window.__realtimeMemory\n' +
        '   Use window.__realtimeMemory.logMemoryUsage() to check memory\n' +
        '   Use window.__realtimeMemory.startMonitoring(30000) for continuous monitoring'
    );
  }
}
