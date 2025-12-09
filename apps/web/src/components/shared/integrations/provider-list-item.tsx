'use client';

import type { LucideIcon } from 'lucide-react';
import { Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export type ProviderStatus = 'active' | 'inactive' | 'error';

interface ProviderListItemProps {
  icon: LucideIcon | string;
  name: string;
  description?: string;
  enabled: boolean;
  status?: ProviderStatus;
  badges?: { label: string; variant?: 'default' | 'outline' }[];
  onToggle?: (enabled: boolean) => void;
  onConfigure?: () => void;
  configureLabel?: string;
  configureIcon?: LucideIcon;
  className?: string;
}

export function ProviderListItem({
  icon: Icon,
  name,
  description,
  enabled,
  status,
  badges = [],
  onToggle,
  onConfigure,
  configureLabel = 'Configurează',
  configureIcon: ConfigureIcon,
  className,
}: ProviderListItemProps) {
  const isEmoji = typeof Icon === 'string';

  return (
    <div className={cn('flex items-center justify-between p-4 border rounded-lg', className)}>
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'w-12 h-12 rounded-lg bg-muted flex items-center justify-center',
            isEmoji && 'text-2xl'
          )}
        >
          {isEmoji ? Icon : <Icon className="h-6 w-6" />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{name}</h3>
            {badges.map((badge, i) => (
              <Badge key={i} variant={badge.variant ?? 'outline'}>
                {badge.label}
              </Badge>
            ))}
            {enabled && status && (
              <Badge
                className={
                  status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }
              >
                {status === 'active' ? (
                  <Check className="h-3 w-3 mr-1" />
                ) : (
                  <AlertCircle className="h-3 w-3 mr-1" />
                )}
                {status === 'active' ? 'Activ' : 'Eroare'}
              </Badge>
            )}
          </div>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {onToggle && <Switch checked={enabled} onCheckedChange={onToggle} />}
        {onConfigure && (
          <Button variant="outline" size="sm" onClick={onConfigure}>
            {ConfigureIcon && <ConfigureIcon className="h-4 w-4 mr-2" />}
            {configureLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
