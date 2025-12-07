'use client';

/**
 * Queue List Component
 *
 * Displays a list of all queues with filtering options.
 * Supports sorting by severity, name, or queue size.
 */

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, ArrowUpDown, Filter } from 'lucide-react';
import type { QueueSLAStatus } from '@medicalcor/types';
import { QueueCard, QueueCardSkeleton } from './queue-card';

interface QueueListProps {
  queues: QueueSLAStatus[];
}

type SortOption = 'severity' | 'name' | 'queueSize' | 'waitTime' | 'serviceLevel';
type FilterOption = 'all' | 'ok' | 'warning' | 'critical';

export function QueueList({ queues }: QueueListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('severity');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');

  // Filter queues
  const filteredQueues = queues.filter((queue) => {
    // Search filter
    if (
      searchQuery &&
      !queue.queueName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !queue.queueSid.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }

    // Severity filter
    if (filterBy !== 'all' && queue.severity !== filterBy) {
      return false;
    }

    return true;
  });

  // Sort queues
  const sortedQueues = [...filteredQueues].sort((a, b) => {
    switch (sortBy) {
      case 'severity': {
        const severityOrder = { critical: 0, warning: 1, ok: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      case 'name':
        return a.queueName.localeCompare(b.queueName);
      case 'queueSize':
        return b.currentQueueSize - a.currentQueueSize;
      case 'waitTime':
        return b.longestWaitTime - a.longestWaitTime;
      case 'serviceLevel':
        return a.serviceLevel - b.serviceLevel;
      default:
        return 0;
    }
  });

  return (
    <div className="space-y-4">
      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search queues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={filterBy} onValueChange={(v) => setFilterBy(v as FilterOption)}>
            <SelectTrigger className="w-[130px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Queues</SelectItem>
              <SelectItem value="ok">Compliant</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-[140px]">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="severity">By Severity</SelectItem>
              <SelectItem value="name">By Name</SelectItem>
              <SelectItem value="queueSize">By Queue Size</SelectItem>
              <SelectItem value="waitTime">By Wait Time</SelectItem>
              <SelectItem value="serviceLevel">By Service Level</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Queue cards */}
      {sortedQueues.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">No queues found</p>
          <p className="text-sm mt-1">
            {searchQuery || filterBy !== 'all'
              ? 'Try adjusting your search or filters'
              : 'No queues are currently configured'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedQueues.map((queue) => (
            <QueueCard key={queue.queueSid} queue={queue} />
          ))}
        </div>
      )}

      {/* Results count */}
      {(searchQuery || filterBy !== 'all') && sortedQueues.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {sortedQueues.length} of {queues.length} queues
        </p>
      )}
    </div>
  );
}

export function QueueListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="h-10 flex-1 bg-muted rounded animate-pulse" />
        <div className="flex gap-2">
          <div className="h-10 w-[130px] bg-muted rounded animate-pulse" />
          <div className="h-10 w-[140px] bg-muted rounded animate-pulse" />
        </div>
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <QueueCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
