'use client';

/**
 * Alerts Panel Component
 *
 * Mobile-first alerts display with swipe actions.
 * Shows real-time alerts requiring supervisor attention.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  Clock,
  Volume2,
  Zap,
  Bot,
  ChevronRight,
  Bell,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Alert {
  id: string;
  type: 'escalation' | 'long-hold' | 'silence' | 'high-value' | 'ai-handoff';
  severity: 'info' | 'warning' | 'critical';
  callSid?: string;
  agentName?: string;
  message: string;
  timestamp: Date;
}

interface AlertsPanelProps {
  alerts: Alert[];
  onDismiss?: (alertId: string) => void;
  onDismissAll?: () => void;
  onAlertAction?: (alertId: string) => void;
}

function getAlertIcon(type: Alert['type']) {
  switch (type) {
    case 'escalation':
      return <AlertTriangle className="h-4 w-4" />;
    case 'long-hold':
      return <Clock className="h-4 w-4" />;
    case 'silence':
      return <Volume2 className="h-4 w-4" />;
    case 'high-value':
      return <Zap className="h-4 w-4" />;
    case 'ai-handoff':
      return <Bot className="h-4 w-4" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
}

function getAlertColors(severity: Alert['severity']): {
  bg: string;
  border: string;
  icon: string;
  badge: 'default' | 'hot' | 'warm';
} {
  switch (severity) {
    case 'critical':
      return {
        bg: 'bg-destructive/5',
        border: 'border-destructive/50',
        icon: 'text-destructive',
        badge: 'hot',
      };
    case 'warning':
      return {
        bg: 'bg-amber-500/5',
        border: 'border-amber-500/50',
        icon: 'text-amber-500',
        badge: 'warm',
      };
    case 'info':
    default:
      return {
        bg: 'bg-muted/50',
        border: 'border-muted',
        icon: 'text-muted-foreground',
        badge: 'default',
      };
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'acum';
  if (diffMins === 1) return 'acum 1 min';
  if (diffMins < 60) return `acum ${diffMins} min`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return 'acum 1 oră';
  return `acum ${diffHours} ore`;
}

function getAlertTypeLabel(type: Alert['type']): string {
  switch (type) {
    case 'escalation':
      return 'Escaladare';
    case 'long-hold':
      return 'Așteptare Lungă';
    case 'silence':
      return 'Tăcere';
    case 'high-value':
      return 'Lead Valoros';
    case 'ai-handoff':
      return 'Transfer AI';
    default:
      return 'Alertă';
  }
}

interface AlertItemProps {
  alert: Alert;
  onDismiss?: () => void;
  onAction?: () => void;
}

function AlertItem({ alert, onAction }: AlertItemProps) {
  const colors = getAlertColors(alert.severity);

  return (
    <div className={cn('rounded-lg border p-3 transition-colors', colors.bg, colors.border)}>
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5', colors.icon)}>{getAlertIcon(alert.type)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={colors.badge} className="text-[10px]">
              {getAlertTypeLabel(alert.type)}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {formatTimeAgo(alert.timestamp)}
            </span>
          </div>
          <p className="text-sm mt-1">{alert.message}</p>
          {alert.agentName && (
            <p className="text-xs text-muted-foreground mt-0.5">Agent: {alert.agentName}</p>
          )}
        </div>
        {alert.callSid && (
          <Button variant="ghost" size="sm" className="h-8 px-2 shrink-0" onClick={onAction}>
            <span className="text-xs">Vezi</span>
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function AlertsPanel({ alerts, onDismiss, onDismissAll, onAlertAction }: AlertsPanelProps) {
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical');
  const warningAlerts = alerts.filter((a) => a.severity === 'warning');
  const infoAlerts = alerts.filter((a) => a.severity === 'info');

  const sortedAlerts = [...criticalAlerts, ...warningAlerts, ...infoAlerts];

  return (
    <Card className={cn(alerts.some((a) => a.severity === 'critical') && 'border-destructive/50')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <AlertTriangle
              className={cn(
                'h-4 w-4 sm:h-5 sm:w-5',
                alerts.length > 0 ? 'text-amber-500' : 'text-muted-foreground'
              )}
              aria-hidden="true"
            />
            Alerte
            {alerts.length > 0 && (
              <Badge variant={criticalAlerts.length > 0 ? 'hot' : 'warm'} className="ml-1">
                {alerts.length}
              </Badge>
            )}
          </CardTitle>
          {alerts.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onDismissAll}>
              Toate citite
              <CheckCircle className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
            <CheckCircle className="h-10 w-10 mb-2 text-emerald-500 opacity-50" />
            <p className="text-sm">Nicio alertă activă</p>
            <p className="text-xs">Totul funcționează normal</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedAlerts.map((alert) => (
              <AlertItem
                key={alert.id}
                alert={alert}
                onDismiss={onDismiss ? () => onDismiss(alert.id) : undefined}
                onAction={onAlertAction ? () => onAlertAction(alert.id) : undefined}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AlertsPanelSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="h-5 w-20 bg-muted rounded animate-pulse" />
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
        ))}
      </CardContent>
    </Card>
  );
}
