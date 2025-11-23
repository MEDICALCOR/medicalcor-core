'use client';

import { cn } from '@/lib/utils';

interface BarChartData {
  label: string;
  value: number;
  secondaryValue?: number;
}

interface BarChartProps {
  data: BarChartData[];
  valueLabel?: string;
  secondaryLabel?: string;
  formatValue?: (value: number) => string;
  formatSecondary?: (value: number) => string;
  color?: string;
  className?: string;
}

export function BarChart({
  data,
  valueLabel = 'Valoare',
  secondaryLabel,
  formatValue = (v) => v.toString(),
  formatSecondary,
  color = 'bg-primary',
  className,
}: BarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value));

  return (
    <div className={cn('space-y-3', className)}>
      {data.map((item, index) => {
        const widthPercentage = (item.value / maxValue) * 100;

        return (
          <div key={index} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium truncate">{item.label}</span>
              <div className="flex items-center gap-3 text-muted-foreground">
                <span>
                  {formatValue(item.value)} {valueLabel}
                </span>
                {item.secondaryValue !== undefined && formatSecondary && (
                  <span className="text-emerald-600">
                    {formatSecondary(item.secondaryValue)} {secondaryLabel}
                  </span>
                )}
              </div>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', color)}
                style={{ width: `${widthPercentage}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
