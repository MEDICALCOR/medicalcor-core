'use client';

import type { LucideIcon } from 'lucide-react';
import { TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  alert?: boolean;
  subtext?: string;
  iconColor?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  alert,
  subtext,
  iconColor = 'text-muted-foreground',
}: StatCardProps) {
  return (
    <Card
      className={cn(
        'min-w-[140px] flex-shrink-0',
        alert && 'border-destructive/50 bg-destructive/5'
      )}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <Icon
            className={cn('h-4 w-4 sm:h-5 sm:w-5', alert ? 'text-destructive' : iconColor)}
            aria-hidden="true"
          />
          {trend === 'up' && <TrendingUp className="h-3 w-3 text-emerald-500" aria-hidden="true" />}
        </div>
        <div className="mt-2">
          <p className={cn('text-xl sm:text-2xl font-bold', alert && 'text-destructive')}>
            {value}
          </p>
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{label}</p>
          {subtext && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{subtext}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export interface StatCardSkeletonProps {
  count?: number;
}

export function StatCardSkeleton({ count = 4 }: StatCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="min-w-[140px] flex-shrink-0">
          <CardContent className="p-3 sm:p-4">
            <div className="h-4 w-4 bg-muted rounded animate-pulse" />
            <div className="mt-2 space-y-2">
              <div className="h-6 w-12 bg-muted rounded animate-pulse" />
              <div className="h-3 w-16 bg-muted rounded animate-pulse" />
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

export interface StatsGridProps {
  children: React.ReactNode;
  className?: string;
}

export function StatsGrid({ children, className }: StatsGridProps) {
  return (
    <div
      className={cn(
        'flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 md:grid-cols-4 sm:overflow-visible scrollbar-hide',
        className
      )}
    >
      {children}
    </div>
  );
}
