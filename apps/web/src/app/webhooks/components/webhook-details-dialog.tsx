'use client';

import { ExternalLink, RotateCcw, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { WebhookEvent } from '../actions';
import {
  webhookStatusConfig,
  webhookSourceConfig,
  formatWebhookDate,
  CopyButton,
} from '@/components/shared/webhooks';

interface WebhookDetailsDialogProps {
  webhook: WebhookEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReplay: (id: string) => void;
  isReplaying: boolean;
}

export function WebhookDetailsDialog({
  webhook,
  open,
  onOpenChange,
  onReplay,
  isReplaying,
}: WebhookDetailsDialogProps) {
  if (!webhook) return null;

  const status = webhookStatusConfig[webhook.status];
  const source = webhookSourceConfig[webhook.source];
  const StatusIcon = status.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <div className={cn('w-3 h-3 rounded-full', source.color)} />
              {source.label} Webhook
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => onReplay(webhook.id)}
              disabled={isReplaying || webhook.status === 'pending'}
            >
              {isReplaying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Replay
            </Button>
          </div>
          <DialogDescription className="flex items-center gap-2 mt-2">
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{webhook.id}</code>
            <CopyButton text={webhook.id} label="Copy ID" />
          </DialogDescription>
        </DialogHeader>

        {/* Status and metadata */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-y">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Status</p>
            <div
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
                status.bgColor
              )}
            >
              <StatusIcon className={cn('h-3.5 w-3.5', status.color)} />
              <span className={status.color}>{status.label}</span>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Event Type</p>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{webhook.eventType}</code>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Duration</p>
            <span className="text-sm font-medium tabular-nums">
              {webhook.duration !== null ? `${webhook.duration}ms` : '-'}
            </span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Retries</p>
            <span className="text-sm font-medium">
              {webhook.retryCount}/{webhook.maxRetries}
            </span>
          </div>
        </div>

        {/* Correlation and timing */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Correlation ID</p>
            <div className="flex items-center gap-1">
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {webhook.correlationId}
              </code>
              <CopyButton text={webhook.correlationId} label="Copy Correlation ID" />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Endpoint</p>
            <div className="flex items-center gap-1">
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded flex items-center gap-1">
                {webhook.endpoint}
                <ExternalLink className="h-3 w-3" />
              </code>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Created</p>
            <span className="text-sm">{formatWebhookDate(webhook.createdAt)}</span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Processed</p>
            <span className="text-sm">
              {webhook.processedAt ? formatWebhookDate(webhook.processedAt) : '-'}
            </span>
          </div>
        </div>

        {/* Error message */}
        {webhook.errorMessage && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">Error</p>
            <p className="text-sm text-red-600 dark:text-red-300">{webhook.errorMessage}</p>
          </div>
        )}

        {/* Tabs for payload, headers, response */}
        <Tabs defaultValue="payload" className="mt-4">
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="payload">Payload</TabsTrigger>
            <TabsTrigger value="headers">Headers</TabsTrigger>
            <TabsTrigger value="response">Response</TabsTrigger>
          </TabsList>

          <TabsContent value="payload" className="mt-4">
            <div className="relative">
              <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto max-h-64">
                {JSON.stringify(webhook.payload, null, 2)}
              </pre>
              <div className="absolute top-2 right-2">
                <CopyButton text={JSON.stringify(webhook.payload, null, 2)} label="Copy payload" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="headers" className="mt-4">
            <div className="relative">
              <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto max-h-64">
                {JSON.stringify(webhook.headers, null, 2)}
              </pre>
              <div className="absolute top-2 right-2">
                <CopyButton text={JSON.stringify(webhook.headers, null, 2)} label="Copy headers" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="response" className="mt-4">
            {webhook.responseBody ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      webhook.responseCode && webhook.responseCode < 400 ? 'success' : 'destructive'
                    }
                  >
                    HTTP {webhook.responseCode}
                  </Badge>
                </div>
                <div className="relative">
                  <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto max-h-64">
                    {webhook.responseBody}
                  </pre>
                  <div className="absolute top-2 right-2">
                    <CopyButton text={webhook.responseBody} label="Copy response" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No response available</div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
