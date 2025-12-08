'use client';

/**
 * @fileoverview Webhook Detail Page
 *
 * L6: Webhook Replay UI - Admin UI for webhook replay/debug
 * Detailed view of a single webhook event with:
 * - Full payload inspection
 * - Headers view
 * - Response data
 * - Error details
 * - Replay functionality
 * - Related events by correlation ID
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Webhook,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  Clock,
  RotateCcw,
  Loader2,
  XCircle,
  Copy,
  Check,
  Play,
  ExternalLink,
  FileJson,
  MessageSquare,
  Phone,
  CreditCard,
  Calendar,
  Building2,
  Mic,
  AlertTriangle,
  Hash,
  Server,
  Timer,
  Network,
  Shield,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  getWebhookByIdAction,
  replayWebhookAction,
  getWebhookListAction,
  type WebhookEvent,
  type WebhookSource,
  type WebhookStatus,
} from '@/app/actions/webhooks';

// ============================================================================
// CONSTANTS
// ============================================================================

const SOURCE_CONFIG: Record<
  WebhookSource,
  {
    label: string;
    icon: typeof Webhook;
    color: string;
    bgColor: string;
  }
> = {
  whatsapp: {
    label: 'WhatsApp',
    icon: MessageSquare,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  vapi: {
    label: 'Vapi',
    icon: Mic,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  stripe: {
    label: 'Stripe',
    icon: CreditCard,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  booking: {
    label: 'Booking',
    icon: Calendar,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  voice: {
    label: 'Voice',
    icon: Phone,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
  },
  crm: {
    label: 'CRM',
    icon: Building2,
    color: 'text-pink-600',
    bgColor: 'bg-pink-100',
  },
  hubspot: {
    label: 'HubSpot',
    icon: Building2,
    color: 'text-orange-500',
    bgColor: 'bg-orange-100',
  },
};

const STATUS_CONFIG: Record<
  WebhookStatus,
  {
    label: string;
    icon: typeof CheckCircle2;
    color: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  success: {
    label: 'Success',
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
  },
  replayed: {
    label: 'Replayed',
    icon: RotateCcw,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
};

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: 'Copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
            {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function JsonViewer({ data, title }: { data: unknown; title: string }) {
  const jsonString = JSON.stringify(data, null, 2);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{title}</h4>
        <CopyButton text={jsonString} label="Copy JSON" />
      </div>
      <pre className="p-4 rounded-lg bg-slate-900 text-slate-100 overflow-x-auto text-xs font-mono max-h-[400px] overflow-y-auto">
        <code>{jsonString}</code>
      </pre>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  copyable,
  badge,
}: {
  icon?: typeof Hash;
  label: string;
  value: string | React.ReactNode;
  copyable?: boolean;
  badge?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon && <Icon className="h-4 w-4" />}
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {badge ? (
          <Badge variant="secondary">{value}</Badge>
        ) : (
          <span className="text-sm font-medium">{value}</span>
        )}
        {copyable && typeof value === 'string' && <CopyButton text={value} />}
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function WebhookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const webhookId = params.id as string;

  const [webhook, setWebhook] = useState<WebhookEvent | null>(null);
  const [relatedEvents, setRelatedEvents] = useState<WebhookEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [replayDialog, setReplayDialog] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);

  const { toast } = useToast();

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchData = useCallback(
    async (showRefreshIndicator = false) => {
      if (showRefreshIndicator) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        const webhookData = await getWebhookByIdAction(webhookId);
        setWebhook(webhookData);

        // Fetch related events by correlation ID
        if (webhookData?.correlationId) {
          const related = await getWebhookListAction(1, 10, {
            correlationId: webhookData.correlationId,
          });
          setRelatedEvents(related.webhooks.filter((w) => w.id !== webhookId));
        }
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load webhook details',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [webhookId, toast]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  async function handleReplay() {
    if (!webhook) return;

    setIsReplaying(true);
    try {
      const result = await replayWebhookAction(webhook.id);

      if (result.success) {
        toast({
          title: 'Webhook Replayed',
          description: result.message,
        });
        await fetchData(true);
      } else {
        toast({
          title: 'Replay Failed',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to replay webhook',
        variant: 'destructive',
      });
    } finally {
      setIsReplaying(false);
      setReplayDialog(false);
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!webhook) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertTriangle className="h-12 w-12 text-yellow-500" />
        <p className="text-muted-foreground">Webhook not found</p>
        <Button variant="outline" onClick={() => router.push('/webhooks')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Webhooks
        </Button>
      </div>
    );
  }

  const sourceConfig = SOURCE_CONFIG[webhook.source];
  const statusConfig = STATUS_CONFIG[webhook.status];
  const StatusIcon = statusConfig.icon;
  const SourceIcon = sourceConfig?.icon ?? Webhook;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => router.push('/webhooks')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Webhook className="h-6 w-6 text-blue-600" />
              Webhook Details
            </h1>
          </div>
          <div className="flex items-center gap-2 pl-10">
            <code className="text-sm text-muted-foreground">{webhook.id}</code>
            <CopyButton text={webhook.id} label="Copy ID" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
          <Button onClick={() => setReplayDialog(true)} size="sm">
            <RotateCcw className="h-4 w-4 mr-2" />
            Replay
          </Button>
        </div>
      </div>

      {/* Status Banner */}
      <Card className={cn(statusConfig.bgColor, statusConfig.borderColor, 'border-2')}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <StatusIcon className={cn('h-6 w-6', statusConfig.color)} />
              <div>
                <p className={cn('font-semibold', statusConfig.color)}>{statusConfig.label}</p>
                <p className="text-sm text-muted-foreground">
                  Received {new Date(webhook.receivedAt).toLocaleString('ro-RO')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg',
                  sourceConfig?.bgColor ?? 'bg-gray-100'
                )}
              >
                <SourceIcon className={cn('h-4 w-4', sourceConfig?.color ?? 'text-gray-600')} />
                <span className={cn('text-sm font-medium', sourceConfig?.color ?? 'text-gray-600')}>
                  {sourceConfig?.label ?? webhook.source}
                </span>
              </div>
              <Badge variant="outline" className="font-mono">
                {webhook.eventType}
              </Badge>
            </div>
          </div>

          {/* Error Message */}
          {webhook.error && (
            <div className="mt-4 p-3 rounded-lg bg-red-100 dark:bg-red-950/50 border border-red-200 dark:border-red-800">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">{webhook.error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Details */}
        <div className="lg:col-span-1 space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Event Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <DetailRow icon={Hash} label="Webhook ID" value={webhook.id} copyable />
              <Separator />
              <DetailRow
                icon={Hash}
                label="Correlation ID"
                value={webhook.correlationId}
                copyable
              />
              <Separator />
              <DetailRow
                icon={Server}
                label="HTTP Status"
                value={webhook.httpStatus.toString()}
                badge
              />
              <Separator />
              <DetailRow
                icon={Timer}
                label="Duration"
                value={webhook.duration > 0 ? formatDuration(webhook.duration) : '-'}
              />
              <Separator />
              <DetailRow
                icon={RotateCcw}
                label="Retry Count"
                value={webhook.retryCount.toString()}
                badge
              />
            </CardContent>
          </Card>

          {/* Timestamps */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timestamps</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <DetailRow
                icon={Clock}
                label="Received"
                value={new Date(webhook.receivedAt).toLocaleString('ro-RO')}
              />
              <Separator />
              <DetailRow
                icon={CheckCircle2}
                label="Processed"
                value={
                  webhook.processedAt
                    ? new Date(webhook.processedAt).toLocaleString('ro-RO')
                    : 'Not processed'
                }
              />
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {webhook.metadata.ipAddress && (
                <>
                  <DetailRow icon={Network} label="IP Address" value={webhook.metadata.ipAddress} />
                  <Separator />
                </>
              )}
              {webhook.metadata.contentLength && (
                <>
                  <DetailRow
                    icon={FileJson}
                    label="Content Length"
                    value={`${webhook.metadata.contentLength} bytes`}
                  />
                  <Separator />
                </>
              )}
              {webhook.metadata.signature && (
                <DetailRow icon={Shield} label="Signature" value="Present" badge />
              )}
              {webhook.replayedFrom && (
                <>
                  <Separator />
                  <div className="py-2">
                    <p className="text-sm text-muted-foreground mb-1">Replayed From</p>
                    <Link
                      href={`/webhooks/${webhook.replayedFrom}`}
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                      {webhook.replayedFrom}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Related Events */}
          {relatedEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Related Events</CardTitle>
                <CardDescription>Events with the same correlation ID</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {relatedEvents.map((event) => {
                    const eventStatusConfig = STATUS_CONFIG[event.status];
                    const EventStatusIcon = eventStatusConfig.icon;
                    return (
                      <Link
                        key={event.id}
                        href={`/webhooks/${event.id}`}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <EventStatusIcon className={cn('h-4 w-4', eventStatusConfig.color)} />
                          <code className="text-xs">{event.eventType}</code>
                        </div>
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Payload/Headers/Response */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Event Data</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="payload" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="payload">
                    <FileJson className="h-4 w-4 mr-1" />
                    Payload
                  </TabsTrigger>
                  <TabsTrigger value="headers">
                    <Server className="h-4 w-4 mr-1" />
                    Headers
                  </TabsTrigger>
                  <TabsTrigger value="response">
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Response
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="payload">
                  <JsonViewer data={webhook.payload} title="Request Payload" />
                </TabsContent>

                <TabsContent value="headers">
                  <JsonViewer data={webhook.headers} title="Request Headers" />
                </TabsContent>

                <TabsContent value="response">
                  {webhook.response ? (
                    <JsonViewer data={webhook.response} title="Response Data" />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No response data available</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Replay Dialog */}
      <Dialog open={replayDialog} onOpenChange={setReplayDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replay Webhook</DialogTitle>
            <DialogDescription>
              Are you sure you want to replay this webhook event? The original payload will be
              re-processed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Source</span>
              <div
                className={cn(
                  'flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium',
                  sourceConfig?.bgColor ?? 'bg-gray-100'
                )}
              >
                <SourceIcon className={cn('h-3 w-3', sourceConfig?.color ?? 'text-gray-600')} />
                <span className={sourceConfig?.color ?? 'text-gray-600'}>
                  {sourceConfig?.label ?? webhook.source}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Event Type</span>
              <code className="text-sm">{webhook.eventType}</code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Current Status</span>
              <div
                className={cn(
                  'flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium',
                  statusConfig.bgColor
                )}
              >
                <StatusIcon className={cn('h-3 w-3', statusConfig.color)} />
                <span className={statusConfig.color}>{statusConfig.label}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplayDialog(false)} disabled={isReplaying}>
              Cancel
            </Button>
            <Button onClick={handleReplay} disabled={isReplaying}>
              {isReplaying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Replaying...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Replay Webhook
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
