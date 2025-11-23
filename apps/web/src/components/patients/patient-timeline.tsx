'use client';

import {
  Phone,
  MessageSquare,
  Mail,
  Calendar,
  FileText,
  RefreshCw,
  StickyNote,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PatientActivity, ActivityType } from '@/lib/patients';

interface PatientTimelineProps {
  activities: PatientActivity[];
}

const activityIcons: Record<ActivityType, React.ElementType> = {
  call: Phone,
  message: MessageSquare,
  email: Mail,
  appointment: Calendar,
  note: StickyNote,
  status_change: RefreshCw,
  document: FileText,
};

const activityColors: Record<ActivityType, string> = {
  call: 'bg-blue-100 text-blue-600',
  message: 'bg-green-100 text-green-600',
  email: 'bg-purple-100 text-purple-600',
  appointment: 'bg-orange-100 text-orange-600',
  note: 'bg-yellow-100 text-yellow-600',
  status_change: 'bg-pink-100 text-pink-600',
  document: 'bg-cyan-100 text-cyan-600',
};

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Acum';
  if (diffMins < 60) return `Acum ${diffMins} min`;
  if (diffHours < 24) return `Acum ${diffHours} ore`;
  if (diffDays < 7) return `Acum ${diffDays} zile`;
  return date.toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function PatientTimeline({ activities }: PatientTimelineProps) {
  // Sort activities by timestamp descending
  const sortedActivities = [...activities].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  return (
    <div className="space-y-4">
      {sortedActivities.map((activity, index) => {
        const Icon = activityIcons[activity.type];
        const isLast = index === sortedActivities.length - 1;

        return (
          <div key={activity.id} className="flex gap-4">
            {/* Timeline connector */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                  activityColors[activity.type]
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              {!isLast && <div className="w-0.5 flex-1 bg-border mt-2" />}
            </div>

            {/* Content */}
            <div className="flex-1 pb-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{activity.title}</p>
                  {activity.description && (
                    <p className="text-sm text-muted-foreground mt-0.5">{activity.description}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatRelativeTime(activity.timestamp)}
                </span>
              </div>
              {activity.user && (
                <p className="text-xs text-muted-foreground mt-1">de {activity.user}</p>
              )}
            </div>
          </div>
        );
      })}

      {activities.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Nu există activități înregistrate</p>
        </div>
      )}
    </div>
  );
}
