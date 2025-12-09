'use client';

import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface StatusConfig {
  label: string;
  color: string;
}

interface HistoryLogItemProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  status: string;
  statusConfig: Record<string, StatusConfig>;
  timestamp?: Date;
  locale?: string;
  className?: string;
}

export function HistoryLogItem({
  icon: Icon,
  title,
  subtitle,
  status,
  statusConfig,
  timestamp,
  locale = 'ro-RO',
  className,
}: HistoryLogItemProps) {
  const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-700' };

  const formattedTime = timestamp
    ? timestamp.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div className={cn('flex items-center justify-between p-4 border rounded-lg', className)}>
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">
            {subtitle}
            {formattedTime && ` • ${formattedTime}`}
          </p>
        </div>
      </div>
      <Badge className={config.color}>{config.label}</Badge>
    </div>
  );
}

export function createStatusConfig<T extends string>(
  config: Record<T, StatusConfig>
): Record<T, StatusConfig> {
  return config;
}
