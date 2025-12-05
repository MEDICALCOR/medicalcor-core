'use client';

/**
 * Client-side wrapper for OSAX Dashboard view mode switching
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LayoutGrid, Table2, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { OsaxCaseTable } from './OsaxCaseTable';
import { OsaxKanbanBoard } from './OsaxKanbanBoard';
import type { OsaxCaseListItem } from '../actions/getOsaxCases';

interface OsaxDashboardViewProps {
  cases: OsaxCaseListItem[];
}

export function OsaxDashboardView({ cases }: OsaxDashboardViewProps) {
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('kanban');
  const { toast } = useToast();

  const handleTriggerConcierge = () => {
    // In production, this would trigger the concierge workflow
    toast({
      title: 'Concierge Triggered',
      description: 'Concierge workflow has been initiated. You will be notified when ready.',
    });
    console.log('Trigger Concierge workflow');
  };

  return (
    <>
      {/* View Mode Toggle and Trigger Concierge Button */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleTriggerConcierge}
          className="bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white shadow-lg"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Trigger Concierge
        </Button>
        <div className="flex rounded-lg border border-gray-200 bg-white p-1">
          <button
            onClick={() => setViewMode('kanban')}
            className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'kanban'
                ? 'bg-teal-600 text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Kanban
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'table'
                ? 'bg-teal-600 text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Table2 className="h-4 w-4" />
            Table
          </button>
        </div>
      </div>

      {/* Cases View */}
      <div className="mt-8">
        {viewMode === 'kanban' ? (
          <OsaxKanbanBoard cases={cases} />
        ) : (
          <OsaxCaseTable cases={cases} />
        )}
      </div>
    </>
  );
}

