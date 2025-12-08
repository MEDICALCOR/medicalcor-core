'use client';

import { useMemo } from 'react';
import type { LoadTestTrendPoint } from '@medicalcor/types';
import { cn } from '@/lib/utils';

interface PerformanceChartProps {
  data: LoadTestTrendPoint[];
  height?: number;
  className?: string;
}

/**
 * Performance trend chart showing P95, P99, and success rate over time
 */
export function PerformanceChart({ data, height = 300, className }: PerformanceChartProps) {
  const {
    lines,
    points,
    maxLatency: _maxLatency,
    minLatency: _minLatency,
    labels,
  } = useMemo(() => {
    if (data.length === 0) {
      return {
        lines: { p95: '', p99: '', avg: '' },
        points: [],
        maxLatency: 0,
        minLatency: 0,
        labels: { y: [], x: [] },
      };
    }

    const latencyValues = data.flatMap((d) => [d.p95Duration, d.p99Duration, d.avgDuration]);
    const max = Math.max(...latencyValues);
    const min = Math.min(...latencyValues);
    const range = max - min || 1;

    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const chartWidth = 100;
    const chartHeight = 100;

    const calcY = (value: number) =>
      padding.top + (1 - (value - min) / range) * (chartHeight - padding.top - padding.bottom);

    const calcX = (index: number) =>
      padding.left + (index / (data.length - 1)) * (chartWidth - padding.left - padding.right);

    const pts = data.map((d, i) => ({
      x: calcX(i),
      yP95: calcY(d.p95Duration),
      yP99: calcY(d.p99Duration),
      yAvg: calcY(d.avgDuration),
      ...d,
    }));

    // Create smooth line paths
    const createPath = (getValue: (p: (typeof pts)[0]) => number) => {
      return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${getValue(p)}`).join(' ');
    };

    // Generate y-axis labels
    const yLabels = [max, (max + min) / 2, min].map((v) => ({
      value: Math.round(v),
      y: calcY(v),
    }));

    // Generate x-axis labels (first, middle, last)
    const xLabels =
      data.length > 2
        ? [
            { date: data[0].date, x: calcX(0) },
            { date: data[Math.floor(data.length / 2)].date, x: calcX(Math.floor(data.length / 2)) },
            { date: data[data.length - 1].date, x: calcX(data.length - 1) },
          ]
        : data.map((d, i) => ({ date: d.date, x: calcX(i) }));

    return {
      lines: {
        p95: createPath((p) => p.yP95),
        p99: createPath((p) => p.yP99),
        avg: createPath((p) => p.yAvg),
      },
      points: pts,
      maxLatency: max,
      minLatency: min,
      labels: { y: yLabels, x: xLabels },
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <div
        className={cn('flex items-center justify-center text-muted-foreground', className)}
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  return (
    <div className={cn('relative', className)} style={{ height }}>
      {/* Legend */}
      <div className="absolute top-0 right-0 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-red-500" />
          <span>P99</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-orange-500" />
          <span>P95</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-blue-500" />
          <span>Avg</span>
        </div>
      </div>

      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
        {/* Grid lines */}
        <g className="text-muted-foreground/20">
          {labels.y.map((label) => (
            <line
              key={label.value}
              x1="50"
              y1={label.y}
              x2="100"
              y2={label.y}
              stroke="currentColor"
              strokeWidth="0.2"
              strokeDasharray="1,1"
            />
          ))}
        </g>

        {/* Area fills */}
        <path
          d={`${lines.p99} L ${points[points.length - 1]?.x ?? 80} 80 L ${points[0]?.x ?? 50} 80 Z`}
          fill="rgb(239, 68, 68)"
          fillOpacity="0.05"
        />
        <path
          d={`${lines.p95} L ${points[points.length - 1]?.x ?? 80} 80 L ${points[0]?.x ?? 50} 80 Z`}
          fill="rgb(249, 115, 22)"
          fillOpacity="0.05"
        />

        {/* Lines */}
        <path
          d={lines.p99}
          fill="none"
          stroke="rgb(239, 68, 68)"
          strokeWidth="0.5"
          strokeLinecap="round"
        />
        <path
          d={lines.p95}
          fill="none"
          stroke="rgb(249, 115, 22)"
          strokeWidth="0.5"
          strokeLinecap="round"
        />
        <path
          d={lines.avg}
          fill="none"
          stroke="rgb(59, 130, 246)"
          strokeWidth="0.5"
          strokeLinecap="round"
          strokeDasharray="1,0.5"
        />

        {/* Status indicators (dots colored by status) */}
        {points.map((point, i) => (
          <circle
            key={i}
            cx={point.x}
            cy={point.yP95}
            r="0.8"
            fill={
              point.status === 'passed'
                ? '#22c55e'
                : point.status === 'failed'
                  ? '#ef4444'
                  : '#f59e0b'
            }
          />
        ))}
      </svg>

      {/* Y-axis labels */}
      <div className="absolute left-0 inset-y-0 flex flex-col justify-between text-[10px] text-muted-foreground py-5">
        {labels.y.map((label) => (
          <span key={label.value}>{label.value}ms</span>
        ))}
      </div>

      {/* X-axis labels */}
      <div className="absolute inset-x-0 bottom-0 flex justify-between text-[10px] text-muted-foreground px-12">
        {labels.x.map((label) => (
          <span key={label.date}>
            {new Date(label.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        ))}
      </div>
    </div>
  );
}
