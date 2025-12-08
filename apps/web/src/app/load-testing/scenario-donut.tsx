'use client';

import { useMemo } from 'react';
import type { ScenarioBreakdown } from '@medicalcor/types';
import { cn } from '@/lib/utils';

interface ScenarioDonutProps {
  data: ScenarioBreakdown[];
  className?: string;
}

/**
 * Scenario colors for the donut chart
 */
const SCENARIO_COLORS: Record<string, string> = {
  smoke: '#22c55e', // green
  load: '#3b82f6', // blue
  stress: '#f59e0b', // orange
  soak: '#a855f7', // purple
  custom: '#6b7280', // gray
};

/**
 * Donut chart showing scenario breakdown with pass rates
 */
export function ScenarioDonut({ data, className }: ScenarioDonutProps) {
  const { segments, total, centerX, centerY, radius, strokeWidth } = useMemo(() => {
    const cx = 50;
    const cy = 50;
    const r = 35;
    const sw = 15;

    const totalCount = data.reduce((sum, s) => sum + s.count, 0);
    if (totalCount === 0) {
      return { segments: [], total: 0, centerX: cx, centerY: cy, radius: r, strokeWidth: sw };
    }

    let cumulativeAngle = -90; // Start from top

    const segs = data.map((item) => {
      const angle = (item.count / totalCount) * 360;
      const startAngle = cumulativeAngle;
      cumulativeAngle += angle;

      // Calculate arc path
      const startRad = (startAngle * Math.PI) / 180;
      const endRad = ((startAngle + angle) * Math.PI) / 180;

      const x1 = cx + r * Math.cos(startRad);
      const y1 = cy + r * Math.sin(startRad);
      const x2 = cx + r * Math.cos(endRad);
      const y2 = cy + r * Math.sin(endRad);

      const largeArc = angle > 180 ? 1 : 0;

      return {
        ...item,
        path: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
        color: SCENARIO_COLORS[item.scenario] ?? SCENARIO_COLORS.custom,
        percentage: Math.round((item.count / totalCount) * 100),
      };
    });

    return {
      segments: segs,
      total: totalCount,
      centerX: cx,
      centerY: cy,
      radius: r,
      strokeWidth: sw,
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center text-muted-foreground h-[300px]',
          className
        )}
      >
        No scenario data available
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Donut Chart */}
      <div className="relative h-[180px]">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Background circle */}
          <circle
            cx={centerX}
            cy={centerY}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/20"
          />

          {/* Segment arcs */}
          {segments.map((segment) => (
            <path
              key={segment.scenario}
              d={segment.path}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              className="transition-all duration-300 hover:opacity-80"
            />
          ))}

          {/* Center text */}
          <text
            x={centerX}
            y={centerY - 4}
            textAnchor="middle"
            className="text-[8px] fill-muted-foreground"
          >
            Total
          </text>
          <text
            x={centerX}
            y={centerY + 6}
            textAnchor="middle"
            className="text-[12px] font-bold fill-foreground"
          >
            {total}
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="space-y-2 mt-2">
        {segments.map((segment) => (
          <div key={segment.scenario} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: segment.color }} />
              <span className="capitalize">{segment.scenario}</span>
            </div>
            <div className="flex items-center gap-3 text-muted-foreground">
              <span>{segment.count} runs</span>
              <span
                className={cn(
                  'font-medium',
                  segment.passRate >= 90 ? 'text-green-600' : 'text-orange-500'
                )}
              >
                {segment.passRate.toFixed(0)}% pass
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Average P95 by scenario */}
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs text-muted-foreground mb-2">Average P95 by Scenario</p>
        <div className="grid grid-cols-2 gap-2">
          {segments.map((segment) => (
            <div key={segment.scenario} className="flex items-center justify-between text-xs">
              <span className="capitalize text-muted-foreground">{segment.scenario}:</span>
              <span className="font-medium">{segment.avgP95.toFixed(0)}ms</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
