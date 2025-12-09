'use client';

import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface IntegrationStatCardProps {
  icon: LucideIcon;
  iconBgColor: string;
  iconColor: string;
  label: string;
  value: string | number;
  className?: string;
}

export function IntegrationStatCard({
  icon: Icon,
  iconBgColor,
  iconColor,
  label,
  value,
  className,
}: IntegrationStatCardProps) {
  return (
    <Card className={className}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', iconBgColor)}>
          <Icon className={cn('h-5 w-5', iconColor)} />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

interface IntegrationStatsGridProps {
  children: React.ReactNode;
}

export function IntegrationStatsGrid({ children }: IntegrationStatsGridProps) {
  return <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{children}</div>;
}
