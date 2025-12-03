'use client';

import { memo, useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: LucideIcon;
  iconColor?: string;
  format?: 'number' | 'currency' | 'percentage' | 'time';
  prefix?: string;
  suffix?: string;
}

/**
 * Memoized MetricCard component
 * Prevents re-renders when parent updates but props haven't changed
 */
export const MetricCard = memo(function MetricCard({
  title,
  value,
  change,
  changeLabel = 'vs perioada anterioară',
  icon: Icon,
  iconColor = 'text-primary',
  format = 'number',
  prefix,
  suffix,
}: MetricCardProps) {
  const formattedValue = useMemo(() => {
    if (typeof value === 'string') return value;

    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('ro-RO', {
          style: 'currency',
          currency: 'EUR',
          maximumFractionDigits: 0,
        }).format(value);
      case 'percentage':
        return `${value.toFixed(1)}%`;
      case 'time':
        return `${value.toFixed(1)} min`;
      case 'number':
      default:
        return new Intl.NumberFormat('ro-RO').format(value);
    }
  }, [value, format]);

  const trendColor = useMemo(() => {
    if (change === undefined || change === 0) return 'text-muted-foreground';
    // For response time, lower is better
    if (format === 'time') {
      return change < 0 ? 'text-green-600' : 'text-red-600';
    }
    return change > 0 ? 'text-green-600' : 'text-red-600';
  }, [change, format]);

  const TrendIcon =
    change === undefined || change === 0 ? Minus : change > 0 ? TrendingUp : TrendingDown;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">
              {prefix}
              {formattedValue}
              {suffix}
            </p>
          </div>
          {Icon && (
            <div className={cn('p-2 rounded-lg bg-primary/10', iconColor)}>
              <Icon className="h-5 w-5" />
            </div>
          )}
        </div>

        {change !== undefined && (
          <div className="mt-2 flex items-center gap-1 text-xs">
            <span className={cn('flex items-center gap-0.5 font-medium', trendColor)}>
              <TrendIcon className="h-3 w-3" />
              {Math.abs(change).toFixed(1)}%
            </span>
            <span className="text-muted-foreground">{changeLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
