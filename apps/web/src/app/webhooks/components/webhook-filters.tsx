'use client';

import { Search, X, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { WebhookFilter, WebhookSource, WebhookStatus } from '../actions';

interface WebhookFiltersProps {
  filter: WebhookFilter;
  onFilterChange: (filter: WebhookFilter) => void;
  eventTypes: string[];
}

const sources: { value: WebhookSource; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'hubspot', label: 'HubSpot' },
  { value: 'twilio', label: 'Twilio' },
  { value: 'vapi', label: 'Vapi' },
  { value: 'custom', label: 'Custom' },
];

const statuses: { value: WebhookStatus; label: string }[] = [
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Pending' },
  { value: 'retrying', label: 'Retrying' },
];

export function WebhookFilters({ filter, onFilterChange, eventTypes }: WebhookFiltersProps) {
  const activeFilterCount = [filter.source, filter.status, filter.eventType, filter.search].filter(
    Boolean
  ).length;

  const clearFilters = () => {
    onFilterChange({});
  };

  return (
    <div className="space-y-4">
      {/* Search and main filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cauta dupa ID, correlation ID, payload..."
            value={filter.search ?? ''}
            onChange={(e) => onFilterChange({ ...filter, search: e.target.value || undefined })}
            className="pl-9"
          />
        </div>

        {/* Source filter */}
        <Select
          value={filter.source ?? 'all'}
          onValueChange={(value) =>
            onFilterChange({
              ...filter,
              source: value === 'all' ? undefined : (value as WebhookSource),
            })
          }
        >
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {sources.map((source) => (
              <SelectItem key={source.value} value={source.value}>
                {source.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select
          value={filter.status ?? 'all'}
          onValueChange={(value) =>
            onFilterChange({
              ...filter,
              status: value === 'all' ? undefined : (value as WebhookStatus),
            })
          }
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map((status) => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Event type filter */}
        <Select
          value={filter.eventType ?? 'all'}
          onValueChange={(value) =>
            onFilterChange({ ...filter, eventType: value === 'all' ? undefined : value })
          }
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Event type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {eventTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Active filters */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            <span>Active filters:</span>
          </div>

          {filter.source && (
            <Badge variant="secondary" className="gap-1">
              Source: {sources.find((s) => s.value === filter.source)?.label}
              <button
                onClick={() => onFilterChange({ ...filter, source: undefined })}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {filter.status && (
            <Badge variant="secondary" className="gap-1">
              Status: {statuses.find((s) => s.value === filter.status)?.label}
              <button
                onClick={() => onFilterChange({ ...filter, status: undefined })}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {filter.eventType && (
            <Badge variant="secondary" className="gap-1">
              Event: {filter.eventType}
              <button
                onClick={() => onFilterChange({ ...filter, eventType: undefined })}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {filter.search && (
            <Badge variant="secondary" className="gap-1">
              Search: "{filter.search}"
              <button
                onClick={() => onFilterChange({ ...filter, search: undefined })}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 text-xs">
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
