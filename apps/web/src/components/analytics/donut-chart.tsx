'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface DonutChartData {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutChartData[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string | number;
  className?: string;
}

export function DonutChart({
  data,
  size = 160,
  strokeWidth = 24,
  centerLabel,
  centerValue,
  className,
}: DonutChartProps) {
  const segments = useMemo(() => {
    const sum = data.reduce((acc, d) => acc + d.value, 0);
    let currentAngle = -90; // Start from top

    return data.map((d) => {
      const percentage = d.value / sum;
      const angle = percentage * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      return {
        ...d,
        percentage,
        startAngle,
        endAngle,
      };
    });
  }, [data]);

  const radius = (size - strokeWidth) / 2;
  const center = size / 2;

  // Convert angle to SVG arc path
  const polarToCartesian = (angle: number) => {
    const radians = (angle * Math.PI) / 180;
    return {
      x: center + radius * Math.cos(radians),
      y: center + radius * Math.sin(radians),
    };
  };

  const describeArc = (startAngle: number, endAngle: number) => {
    const start = polarToCartesian(endAngle);
    const end = polarToCartesian(startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
  };

  return (
    <div className={cn('flex items-center gap-4', className)}>
      {/* Chart */}
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
          />

          {/* Segments */}
          {segments.map((segment, i) => (
            <path
              key={i}
              d={describeArc(segment.startAngle, segment.endAngle - 0.5)}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              className="transition-all hover:opacity-80"
            />
          ))}
        </svg>

        {/* Center text */}
        {(centerLabel !== undefined || centerValue !== undefined) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {centerValue && <span className="text-2xl font-bold">{centerValue}</span>}
            {centerLabel && <span className="text-xs text-muted-foreground">{centerLabel}</span>}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-2">
        {segments.map((segment, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: segment.color }}
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium">{segment.label}</span>
              <span className="text-xs text-muted-foreground">
                {segment.value} ({(segment.percentage * 100).toFixed(1)}%)
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
