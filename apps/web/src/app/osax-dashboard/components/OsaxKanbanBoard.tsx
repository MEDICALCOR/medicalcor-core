'use client';

/**
 * OSAX Kanban Board Component
 *
 * Displays OSAX cases in a Kanban board layout organized by status.
 * Allows drag-and-drop between columns (visual only for demo).
 */

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle2, Eye, FileText, Stethoscope, Calendar, X } from 'lucide-react';
import Link from 'next/link';
import type { OsaxCaseListItem } from '../actions/getOsaxCases';

interface OsaxKanbanBoardProps {
  cases: OsaxCaseListItem[];
}

const STATUS_COLUMNS = [
  {
    id: 'PENDING_STUDY',
    title: 'Pending Study',
    icon: Clock,
    color: 'bg-gray-50 border-gray-200',
    headerColor: 'bg-gray-100',
  },
  {
    id: 'STUDY_COMPLETED',
    title: 'Study Done',
    icon: FileText,
    color: 'bg-blue-50 border-blue-200',
    headerColor: 'bg-blue-100',
  },
  {
    id: 'SCORED',
    title: 'Scored',
    icon: Eye,
    color: 'bg-yellow-50 border-yellow-200',
    headerColor: 'bg-yellow-100',
  },
  {
    id: 'REVIEWED',
    title: 'Reviewed',
    icon: CheckCircle2,
    color: 'bg-indigo-50 border-indigo-200',
    headerColor: 'bg-indigo-100',
  },
  {
    id: 'IN_TREATMENT',
    title: 'In Treatment',
    icon: Stethoscope,
    color: 'bg-green-50 border-green-200',
    headerColor: 'bg-green-100',
  },
] as const;

const PRIORITY_COLORS = {
  LOW: 'bg-gray-100 text-gray-700',
  NORMAL: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
} as const;

const SEVERITY_COLORS = {
  NONE: 'bg-green-100 text-green-700',
  MILD: 'bg-yellow-100 text-yellow-700',
  MODERATE: 'bg-orange-100 text-orange-700',
  SEVERE: 'bg-red-100 text-red-700',
} as const;

export function OsaxKanbanBoard({ cases }: OsaxKanbanBoardProps) {
  const casesByStatus = useMemo(() => {
    const grouped: Record<string, OsaxCaseListItem[]> = {};
    STATUS_COLUMNS.forEach((col) => {
      grouped[col.id] = [];
    });
    
    cases.forEach((caseItem) => {
      const status = caseItem.status;
      if (grouped[status]) {
        grouped[status].push(caseItem);
      } else {
        // Fallback for unknown statuses
        if (!grouped['PENDING_STUDY']) {
          grouped['PENDING_STUDY'] = [];
        }
        grouped['PENDING_STUDY'].push(caseItem);
      }
    });

    return grouped;
  }, [cases]);

  return (
    <div className="grid grid-cols-1 gap-4 overflow-x-auto md:grid-cols-3 lg:grid-cols-5">
      {STATUS_COLUMNS.map((column) => {
        const columnCases = casesByStatus[column.id] || [];
        const Icon = column.icon;

        return (
          <div
            key={column.id}
            className={`flex flex-col rounded-lg border-2 ${column.color} min-h-[600px]`}
          >
            {/* Column Header */}
            <div className={`${column.headerColor} border-b-2 border-gray-200 p-4 rounded-t-lg`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-gray-700" />
                  <h3 className="font-semibold text-gray-900">{column.title}</h3>
                </div>
                <Badge variant="secondary" className="bg-white">
                  {columnCases.length}
                </Badge>
              </div>
            </div>

            {/* Cases List */}
            <div className="flex-1 p-3 space-y-3 overflow-y-auto">
              {columnCases.map((caseItem) => (
                <CaseCard key={caseItem.id} caseItem={caseItem} />
              ))}
              {columnCases.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm">
                  No cases in this status
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CaseCard({ caseItem }: { caseItem: OsaxCaseListItem }) {
  const priorityColor = PRIORITY_COLORS[caseItem.priority as keyof typeof PRIORITY_COLORS] || PRIORITY_COLORS.NORMAL;
  const severityColor = caseItem.severity
    ? SEVERITY_COLORS[caseItem.severity as keyof typeof SEVERITY_COLORS] || SEVERITY_COLORS.NONE
    : null;

  return (
    <Link href={`/osax-dashboard/${caseItem.id}`}>
      <Card className="cursor-pointer transition-all hover:shadow-md hover:ring-2 hover:ring-teal-500/20">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <span className="font-semibold text-sm text-gray-900">{caseItem.caseNumber}</span>
            <Badge className={`text-xs ${priorityColor}`}>{caseItem.priority}</Badge>
          </div>

          {caseItem.ahi !== null && (
            <div className="mb-2">
              <span className="text-xs text-gray-600">AHI: </span>
              <span className="text-sm font-medium text-gray-900">{caseItem.ahi.toFixed(1)}</span>
            </div>
          )}

          {severityColor && (
            <div className="mb-2">
              <Badge className={`text-xs ${severityColor}`}>{caseItem.severity}</Badge>
            </div>
          )}

          {caseItem.treatmentType && (
            <div className="mb-2">
              <span className="text-xs text-gray-600">Treatment: </span>
              <span className="text-xs font-medium text-gray-900">
                {formatTreatmentType(caseItem.treatmentType)}
              </span>
            </div>
          )}

          {caseItem.assignedSpecialistName && (
            <div className="mt-2 pt-2 border-t border-gray-200">
              <span className="text-xs text-gray-500">
                Specialist: {caseItem.assignedSpecialistName}
              </span>
            </div>
          )}

          <div className="mt-2 text-xs text-gray-400">
            {formatDate(caseItem.createdAt)}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatTreatmentType(type: string): string {
  const typeLabels: Record<string, string> = {
    CPAP_THERAPY: 'CPAP',
    BIPAP_THERAPY: 'BiPAP',
    ORAL_APPLIANCE: 'Oral Appliance',
    POSITIONAL_THERAPY: 'Positional',
    LIFESTYLE_MODIFICATION: 'Lifestyle',
    SURGERY_EVALUATION: 'Surgery Eval',
  };

  return typeLabels[type] || type;
}

