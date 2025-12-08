'use client';

import { useCallback, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search, X, RefreshCw } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'queued', label: 'Queued' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

const TASK_TYPE_OPTIONS = [
  { value: 'all', label: 'All Task Types' },
  { value: 'payment-succeeded-handler', label: 'Payment Succeeded' },
  { value: 'payment-failed-handler', label: 'Payment Failed' },
  { value: 'embed-content', label: 'Embed Content' },
  { value: 'embed-batch', label: 'Embed Batch' },
  { value: 'lead-scoring', label: 'Lead Scoring' },
  { value: 'whatsapp-message', label: 'WhatsApp Message' },
  { value: 'hubspot-sync', label: 'HubSpot Sync' },
  { value: 'gdpr-erasure', label: 'GDPR Erasure' },
  { value: 'ltv-orchestration', label: 'LTV Orchestration' },
] as const;

const TIME_RANGE_OPTIONS = [
  { value: '1h', label: 'Last Hour' },
  { value: '6h', label: 'Last 6 Hours' },
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
] as const;

interface TaskFiltersProps {
  onRefresh?: () => void;
}

export function TaskFilters({ onRefresh }: TaskFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const status = searchParams.get('status') ?? 'all';
  const taskType = searchParams.get('taskType') ?? 'all';
  const timeRange = searchParams.get('timeRange') ?? '24h';
  const search = searchParams.get('search') ?? '';

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === '' || value === 'all') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      startTransition(() => {
        router.push(`?${params.toString()}`);
      });
    },
    [router, searchParams]
  );

  const clearFilters = () => {
    startTransition(() => {
      router.push('/task-queue');
    });
  };

  const hasActiveFilters =
    status !== 'all' || taskType !== 'all' || timeRange !== '24h' || search !== '';

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID or correlation..."
            value={search}
            onChange={(e) => updateParams({ search: e.target.value })}
            className="pl-8 h-9"
          />
        </div>

        <Select value={status} onValueChange={(value) => updateParams({ status: value })}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={taskType} onValueChange={(value) => updateParams({ taskType: value })}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="Task Type" />
          </SelectTrigger>
          <SelectContent>
            {TASK_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={timeRange} onValueChange={(value) => updateParams({ timeRange: value })}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Time Range" />
          </SelectTrigger>
          <SelectContent>
            {TIME_RANGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      <Button variant="outline" size="sm" onClick={onRefresh} disabled={isPending} className="h-9">
        <RefreshCw className={`h-4 w-4 mr-2 ${isPending ? 'animate-spin' : ''}`} />
        Refresh
      </Button>
    </div>
  );
}

export function TaskFiltersSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="h-9 w-[300px] bg-muted animate-pulse rounded-md" />
        <div className="h-9 w-[140px] bg-muted animate-pulse rounded-md" />
        <div className="h-9 w-[180px] bg-muted animate-pulse rounded-md" />
        <div className="h-9 w-[140px] bg-muted animate-pulse rounded-md" />
      </div>
      <div className="h-9 w-[100px] bg-muted animate-pulse rounded-md" />
    </div>
  );
}
