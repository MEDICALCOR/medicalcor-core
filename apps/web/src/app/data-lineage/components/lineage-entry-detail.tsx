'use client';

import {
  GitBranch,
  Clock,
  Shield,
  Database,
  User,
  Activity,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { LineageEntryView } from '../actions';

// =============================================================================
// TYPES
// =============================================================================

interface LineageEntryDetailProps {
  entry: LineageEntryView;
  onExplore?: () => void;
}

// =============================================================================
// HELPERS
// =============================================================================

const SENSITIVITY_COLORS: Record<string, { bg: string; text: string }> = {
  phi: { bg: 'bg-red-100', text: 'text-red-700' },
  pii: { bg: 'bg-orange-100', text: 'text-orange-700' },
  confidential: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  restricted: { bg: 'bg-purple-100', text: 'text-purple-700' },
  internal: { bg: 'bg-blue-100', text: 'text-blue-700' },
  public: { bg: 'bg-green-100', text: 'text-green-700' },
};

const ACTOR_TYPE_LABELS: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  user: { label: 'User', icon: User },
  system: { label: 'System', icon: Activity },
  api: { label: 'API', icon: Database },
  integration: { label: 'Integration', icon: GitBranch },
  cron: { label: 'Cron Job', icon: Clock },
};

// =============================================================================
// COMPONENT
// =============================================================================

export function LineageEntryDetail({ entry, onExplore }: LineageEntryDetailProps) {
  const sensitivityColors = entry.compliance?.sensitivity
    ? SENSITIVITY_COLORS[entry.compliance.sensitivity]
    : null;

  const actorConfig = entry.actor?.type ? ACTOR_TYPE_LABELS[entry.actor.type] : null;

  const qualityPercent = entry.quality?.confidence
    ? (entry.quality.confidence * 100).toFixed(0)
    : null;

  const qualityStatus = entry.quality?.confidence
    ? entry.quality.confidence >= 0.8
      ? 'good'
      : entry.quality.confidence >= 0.5
        ? 'moderate'
        : 'low'
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{entry.targetAggregateType}</span>
            <Badge variant="outline" className="capitalize">
              {entry.transformationType.replace(/_/g, ' ')}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 font-mono">{entry.targetAggregateId}</p>
        </div>
        {entry.compliance?.sensitivity && sensitivityColors && (
          <Badge className={cn(sensitivityColors.bg, sensitivityColors.text, 'uppercase')}>
            {entry.compliance.sensitivity}
          </Badge>
        )}
      </div>

      <Separator />

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-4">
          {/* Transformation */}
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-1">Transformation</div>
            <div className="capitalize">{entry.transformationType.replace(/_/g, ' ')}</div>
            {entry.transformationDescription && (
              <p className="text-sm text-muted-foreground mt-1">
                {entry.transformationDescription}
              </p>
            )}
          </div>

          {/* Sources */}
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-1">Data Sources</div>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span>{entry.sourcesCount} source(s)</span>
            </div>
          </div>

          {/* Quality */}
          {entry.quality && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">Data Quality</div>
              <div className="flex items-center gap-2">
                {qualityStatus === 'good' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : qualityStatus === 'moderate' ? (
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
                <span>{qualityPercent}% confidence</span>
                {entry.quality.completeness !== undefined && (
                  <span className="text-muted-foreground">
                    ({(entry.quality.completeness * 100).toFixed(0)}% complete)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Created At */}
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-1">Created</div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{new Date(entry.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Compliance */}
          {entry.compliance && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">Compliance</div>
              <div className="space-y-2">
                {/* Frameworks */}
                {entry.compliance.frameworks && entry.compliance.frameworks.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <div className="flex gap-1">
                      {entry.compliance.frameworks.map((fw) => (
                        <Badge
                          key={fw}
                          variant={fw === 'HIPAA' ? 'success' : 'secondary'}
                          className="text-xs"
                        >
                          {fw}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Legal Basis */}
                {entry.compliance.legalBasis && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Legal Basis: </span>
                    <span className="capitalize">
                      {entry.compliance.legalBasis.replace(/_/g, ' ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actor */}
          {entry.actor && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">Actor</div>
              <div className="flex items-center gap-2">
                {actorConfig && <actorConfig.icon className="h-4 w-4 text-muted-foreground" />}
                <span>
                  {entry.actor.name ?? entry.actor.id}
                  <span className="text-muted-foreground ml-2">
                    ({actorConfig?.label ?? entry.actor.type})
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* Entry ID */}
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-1">Entry ID</div>
            <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{entry.id}</code>
          </div>
        </div>
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex justify-end gap-2">
        {onExplore && (
          <Button onClick={onExplore} className="gap-2">
            <GitBranch className="h-4 w-4" />
            Explore in Graph
          </Button>
        )}
      </div>
    </div>
  );
}
