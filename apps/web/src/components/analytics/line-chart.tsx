'use client';

import { useMemo } from 'react';
import type { TimeSeriesDataPoint } from '@/lib/analytics';
import { cn } from '@/lib/utils';

interface LineChartProps {
  data: TimeSeriesDataPoint[];
  height?: number;
  color?: string;
  showGrid?: boolean;
  showLabels?: boolean;
  className?: string;
}

export function LineChart({
  data,
  height = 200,
  color = 'hsl(var(--primary))',
  showGrid = true,
  showLabels = true,
  className,
}: LineChartProps) {
  const { path, area, points, maxValue, minValue } = useMemo(() => {
    if (data.length === 0) return { path: '', area: '', points: [], maxValue: 0, minValue: 0 };

    const values = data.map((d) => d.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;

    const padding = 20;
    const chartWidth = 100;
    const chartHeight = 100;

    const pts = data.map((d, i) => {
      const x = padding + (i / (data.length - 1)) * (chartWidth - 2 * padding);
      const y = chartHeight - padding - ((d.value - min) / range) * (chartHeight - 2 * padding);
      return { x, y, value: d.value, date: d.date };
    });

    // Create smooth line path
    let linePath = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      linePath += ` L ${pts[i].x} ${pts[i].y}`;
    }

    // Create area path
    const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${chartHeight - padding} L ${pts[0].x} ${chartHeight - padding} Z`;

    return {
      path: linePath,
      area: areaPath,
      points: pts,
      maxValue: max,
      minValue: min,
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <div
        className={cn('flex items-center justify-center text-muted-foreground', className)}
        style={{ height }}
      >
        Nu sunt date disponibile
      </div>
    );
  }

  return (
    <div className={cn('relative', className)} style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
        {/* Grid lines */}
        {showGrid && (
          <g className="text-muted-foreground/20">
            {[0, 25, 50, 75, 100].map((y) => (
              <line key={y} x1="20" y1={y} x2="80" y2={y} stroke="currentColor" strokeWidth="0.2" />
            ))}
          </g>
        )}

        {/* Area fill */}
        <path d={area} fill={color} fillOpacity="0.1" />

        {/* Line */}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="0.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((point, i) => (
          <circle
            key={i}
            cx={point.x}
            cy={point.y}
            r="1"
            fill={color}
            className="hover:r-2 transition-all"
          />
        ))}
      </svg>

      {/* Labels */}
      {showLabels && (
        <div className="absolute inset-x-0 bottom-0 flex justify-between text-[10px] text-muted-foreground px-2">
          <span>
            {new Date(data[0].date).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })}
          </span>
          <span>
            {new Date(data[data.length - 1].date).toLocaleDateString('ro-RO', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        </div>
      )}

      {/* Y-axis labels */}
      {showLabels && (
        <div className="absolute left-0 inset-y-0 flex flex-col justify-between text-[10px] text-muted-foreground py-2">
          <span>{maxValue}</span>
          <span>{minValue}</span>
        </div>
      )}
    </div>
  );
}
