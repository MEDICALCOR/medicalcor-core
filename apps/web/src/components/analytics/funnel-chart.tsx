'use client';

import type { ConversionFunnelStep } from '@/lib/analytics';
import { cn } from '@/lib/utils';

interface FunnelChartProps {
  data: ConversionFunnelStep[];
  className?: string;
}

export function FunnelChart({ data, className }: FunnelChartProps) {
  const maxCount = data[0]?.count ?? 1;

  return (
    <div className={cn('space-y-2', className)}>
      {data.map((step, index) => {
        const widthPercentage = (step.count / maxCount) * 100;
        const isLast = index === data.length - 1;

        return (
          <div key={step.name} className="relative">
            {/* Bar */}
            <div className="relative h-12 rounded-lg overflow-hidden bg-muted/30">
              <div
                className={cn(
                  'absolute inset-y-0 left-0 rounded-lg transition-all',
                  index === 0 && 'bg-primary',
                  index === 1 && 'bg-primary/90',
                  index === 2 && 'bg-primary/80',
                  index === 3 && 'bg-primary/70',
                  index === 4 && 'bg-primary/60',
                  index >= 5 && 'bg-primary/50'
                )}
                style={{ width: `${widthPercentage}%` }}
              />

              {/* Content */}
              <div className="absolute inset-0 flex items-center justify-between px-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{step.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold">{step.count.toLocaleString('ro-RO')}</span>
                  <span className="text-xs text-muted-foreground">
                    ({step.percentage.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Dropoff indicator */}
            {!isLast && step.dropoff !== undefined && (
              <div className="flex items-center justify-end gap-1 mt-1 pr-2">
                <div className="h-4 w-px bg-red-300" />
                <span className="text-[10px] text-red-500">-{step.dropoff.toFixed(1)}%</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
