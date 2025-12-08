'use client';

import { useState } from 'react';
import {
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Eye,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { WebhookEvent, WebhookStatus, WebhookSource } from '../actions';

interface WebhookTableProps {
  webhooks: WebhookEvent[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onReplay: (id: string) => void;
  onViewDetails: (webhook: WebhookEvent) => void;
  isReplaying: string | null;
}

const statusConfig: Record<
  WebhookStatus,
  { label: string; icon: typeof CheckCircle2; color: string; bgColor: string }
> = {
  success: {
    label: 'Success',
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
  },
  retrying: {
    label: 'Retrying',
    icon: RefreshCw,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
};

const sourceConfig: Record<WebhookSource, { label: string; color: string }> = {
  whatsapp: { label: 'WhatsApp', color: 'bg-green-500' },
  stripe: { label: 'Stripe', color: 'bg-purple-500' },
  hubspot: { label: 'HubSpot', color: 'bg-orange-500' },
  twilio: { label: 'Twilio', color: 'bg-red-500' },
  vapi: { label: 'Vapi', color: 'bg-blue-500' },
  custom: { label: 'Custom', color: 'bg-gray-500' },
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function WebhookTable({
  webhooks,
  selectedIds,
  onSelectionChange,
  onReplay,
  onViewDetails,
  isReplaying,
}: WebhookTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const allSelected = webhooks.length > 0 && selectedIds.length === webhooks.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < webhooks.length;

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(webhooks.map((w) => w.id));
    }
  };

  const handleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((i) => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (webhooks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <RefreshCw className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground">Nu au fost gasite webhook-uri</p>
        <p className="text-sm text-muted-foreground mt-1">
          Ajusteaza filtrele pentru a vedea rezultate
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected}
                  ref={(el) => {
                    if (el) (el as unknown as HTMLInputElement).indeterminate = someSelected;
                  }}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="w-10" />
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Event Type</TableHead>
              <TableHead className="hidden md:table-cell">Correlation ID</TableHead>
              <TableHead className="hidden lg:table-cell">Duration</TableHead>
              <TableHead className="hidden md:table-cell">Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {webhooks.map((webhook) => {
              const status = statusConfig[webhook.status];
              const source = sourceConfig[webhook.source];
              const StatusIcon = status.icon;
              const isExpanded = expandedRows.has(webhook.id);
              const isCurrentlyReplaying = isReplaying === webhook.id;

              return (
                <>
                  <TableRow
                    key={webhook.id}
                    className={cn(selectedIds.includes(webhook.id) && 'bg-muted/50')}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(webhook.id)}
                        onCheckedChange={() => handleSelectOne(webhook.id)}
                        aria-label={`Select ${webhook.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleExpand(webhook.id)}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
                          status.bgColor
                        )}
                      >
                        <StatusIcon className={cn('h-3.5 w-3.5', status.color)} />
                        <span className={status.color}>{status.label}</span>
                        {webhook.retryCount > 0 && (
                          <span className="text-muted-foreground">
                            ({webhook.retryCount}/{webhook.maxRetries})
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={cn('w-2 h-2 rounded-full', source.color)} />
                        <span className="text-sm">{source.label}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {webhook.eventType}
                      </code>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <code className="text-xs text-muted-foreground cursor-help">
                            {webhook.correlationId.slice(0, 12)}...
                          </code>
                        </TooltipTrigger>
                        <TooltipContent>
                          <code>{webhook.correlationId}</code>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm tabular-nums">
                        {formatDuration(webhook.duration)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {formatDate(webhook.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => onViewDetails(webhook)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View details</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => onReplay(webhook.id)}
                              disabled={isCurrentlyReplaying || webhook.status === 'pending'}
                            >
                              {isCurrentlyReplaying ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCcw className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Replay webhook</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Expanded row with payload preview */}
                  {isExpanded && (
                    <TableRow key={`${webhook.id}-expanded`}>
                      <TableCell colSpan={9} className="bg-muted/30 p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-sm font-medium mb-2">Payload</h4>
                            <pre className="text-xs bg-background p-3 rounded-lg overflow-x-auto max-h-48">
                              {JSON.stringify(webhook.payload, null, 2)}
                            </pre>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <h4 className="text-sm font-medium mb-2">Endpoint</h4>
                              <code className="text-xs bg-background px-2 py-1 rounded flex items-center gap-2">
                                {webhook.endpoint}
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                              </code>
                            </div>
                            {webhook.errorMessage && (
                              <div>
                                <h4 className="text-sm font-medium mb-2 text-red-600">Error</h4>
                                <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 p-2 rounded">
                                  {webhook.errorMessage}
                                </p>
                              </div>
                            )}
                            {webhook.responseBody && (
                              <div>
                                <h4 className="text-sm font-medium mb-2">Response</h4>
                                <pre className="text-xs bg-background p-2 rounded overflow-x-auto">
                                  {webhook.responseBody}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
