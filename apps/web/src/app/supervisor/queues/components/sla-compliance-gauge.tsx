'use client';

/**
 * SLA Compliance Gauge Component
 *
 * Visual gauge showing overall SLA compliance for a queue.
 * Uses a circular progress indicator with color-coded status.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import type { QueueSLAStatus, QueueSLAConfig } from '@medicalcor/types';
import { cn } from '@/lib/utils';

interface SLAComplianceGaugeProps {
  status: QueueSLAStatus;
  config: QueueSLAConfig;
  trend?: 'improving' | 'stable' | 'declining';
}

export function SLAComplianceGauge({ status, config, trend = 'stable' }: SLAComplianceGaugeProps) {
  // Calculate overall compliance score based on key metrics
  const calculateComplianceScore = () => {
    let score = 100;

    // Wait time factor (30%)
    if (status.longestWaitTime > config.criticalWaitTime) {
      score -= 30;
    } else if (status.longestWaitTime > config.maxWaitTime) {
      score -= 15;
    }

    // Queue size factor (25%)
    if (status.currentQueueSize > config.criticalQueueSize) {
      score -= 25;
    } else if (status.currentQueueSize > config.maxQueueSize) {
      score -= 12;
    }

    // Service level factor (25%)
    const slDiff = config.serviceLevelTarget - status.serviceLevel;
    if (slDiff > 20) {
      score -= 25;
    } else if (slDiff > 0) {
      score -= Math.min(12, slDiff * 0.6);
    }

    // Agent availability factor (20%)
    if (status.availableAgents < config.minAvailableAgents && status.currentQueueSize > 0) {
      score -= 20;
    } else if (status.availableAgents < config.minAvailableAgents) {
      score -= 10;
    }

    return Math.max(0, Math.round(score));
  };

  const complianceScore = calculateComplianceScore();

  const getScoreColor = (score: number) => {
    if (score >= 80) return { text: 'text-emerald-600', bg: 'text-emerald-100', stroke: '#10b981' };
    if (score >= 60) return { text: 'text-amber-600', bg: 'text-amber-100', stroke: '#f59e0b' };
    return { text: 'text-red-600', bg: 'text-red-100', stroke: '#ef4444' };
  };

  const colors = getScoreColor(complianceScore);

  // SVG circle parameters
  const size = 160;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (complianceScore / 100) * circumference;
  const offset = circumference - progress;

  const TrendIcon =
    trend === 'improving' ? TrendingUp : trend === 'declining' ? TrendingDown : Minus;
  const trendColor =
    trend === 'improving'
      ? 'text-emerald-500'
      : trend === 'declining'
        ? 'text-red-500'
        : 'text-muted-foreground';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span>SLA Compliance Score</span>
          <div className="flex items-center gap-1 text-xs font-normal">
            <TrendIcon className={cn('h-3 w-3', trendColor)} />
            <span className={cn(trendColor)}>
              {trend === 'improving' ? 'Improving' : trend === 'declining' ? 'Declining' : 'Stable'}
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center">
          {/* Circular gauge */}
          <div className="relative">
            <svg width={size} height={size} className="transform -rotate-90">
              {/* Background circle */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                className="text-muted"
              />
              {/* Progress circle */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={colors.stroke}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn('text-4xl font-bold', colors.text)}>{complianceScore}</span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
          </div>

          {/* Status indicator */}
          <div className="mt-4 flex items-center gap-2">
            {status.isCompliant ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <span className="text-sm font-medium text-emerald-600">SLA Compliant</span>
              </>
            ) : status.severity === 'warning' ? (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <span className="text-sm font-medium text-amber-600">At Risk</span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-500" />
                <span className="text-sm font-medium text-red-600">Non-Compliant</span>
              </>
            )}
          </div>

          {/* Breakdown */}
          <div className="mt-4 w-full grid grid-cols-2 gap-2 text-xs">
            <ScoreFactor
              label="Wait Time"
              isOk={status.longestWaitTime <= config.maxWaitTime}
              isWarning={
                status.longestWaitTime > config.maxWaitTime &&
                status.longestWaitTime <= config.criticalWaitTime
              }
            />
            <ScoreFactor
              label="Queue Size"
              isOk={status.currentQueueSize <= config.maxQueueSize}
              isWarning={
                status.currentQueueSize > config.maxQueueSize &&
                status.currentQueueSize <= config.criticalQueueSize
              }
            />
            <ScoreFactor
              label="Service Level"
              isOk={status.serviceLevel >= config.serviceLevelTarget}
              isWarning={
                status.serviceLevel >= config.serviceLevelTarget - 10 &&
                status.serviceLevel < config.serviceLevelTarget
              }
            />
            <ScoreFactor
              label="Agent Availability"
              isOk={status.availableAgents >= config.minAvailableAgents}
              isWarning={status.availableAgents === config.minAvailableAgents}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ScoreFactorProps {
  label: string;
  isOk: boolean;
  isWarning?: boolean;
}

function ScoreFactor({ label, isOk, isWarning }: ScoreFactorProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 p-2 rounded',
        isOk ? 'bg-emerald-50' : isWarning ? 'bg-amber-50' : 'bg-red-50'
      )}
    >
      {isOk ? (
        <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
      ) : isWarning ? (
        <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
      ) : (
        <XCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
      )}
      <span
        className={cn(
          'truncate',
          isOk ? 'text-emerald-700' : isWarning ? 'text-amber-700' : 'text-red-700'
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function SLAComplianceGaugeSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="h-4 w-32 bg-muted rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center">
          <div className="h-40 w-40 rounded-full bg-muted animate-pulse" />
          <div className="mt-4 h-5 w-24 bg-muted rounded animate-pulse" />
          <div className="mt-4 w-full grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
