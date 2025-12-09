'use client';

import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface IntegrationPageHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionIcon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
}

export function IntegrationPageHeader({
  icon: Icon,
  title,
  description,
  actionIcon: ActionIcon,
  actionLabel,
  onAction,
}: IntegrationPageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Icon className="h-6 w-6 text-primary" />
          {title}
        </h1>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>
      {actionLabel && (
        <Button onClick={onAction}>
          {ActionIcon && <ActionIcon className="h-4 w-4 mr-2" />}
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
