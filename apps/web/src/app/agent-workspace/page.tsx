'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { Headphones, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PagePermissionGate } from '@/components/auth/require-permission';
import {
  AgentStatusBar,
  AgentStatusBarSkeleton,
  QueueView,
  QueueViewSkeleton,
  CallPanel,
  CallPanelSkeleton,
  ScriptGuidance,
  ScriptGuidanceSkeleton,
} from './components';
import {
  type AgentSession,
  type AgentWorkspaceStats,
  type QueueItem,
  type ActiveCall,
  type CallScript,
  getAgentSessionAction,
  getWorkspaceStatsAction,
  getQueueItemsAction,
  getActiveCallAction,
  getCallScriptAction,
} from './actions';

/**
 * Agent Workspace Page
 *
 * Provides agents with a unified interface for handling calls and leads.
 * Features:
 * - Real-time queue view with priority sorting
 * - Active call panel with controls and live transcript
 * - Script guidance with step-by-step prompts
 * - Agent status management and session stats
 */

export default function AgentWorkspacePage() {
  // State
  const [session, setSession] = useState<AgentSession | null>(null);
  const [stats, setStats] = useState<AgentWorkspaceStats | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callScript, setCallScript] = useState<CallScript | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Initial data fetch
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [sessionData, statsData, queueData, callData] = await Promise.all([
          getAgentSessionAction(),
          getWorkspaceStatsAction(),
          getQueueItemsAction(),
          getActiveCallAction(),
        ]);

        setSession(sessionData);
        setStats(statsData);
        setQueueItems(queueData);
        setActiveCall(callData);

        // Load script if there's an active call with a procedure interest
        if (callData?.procedureInterest) {
          const scriptData = await getCallScriptAction(callData.procedureInterest);
          setCallScript(scriptData);
        }
      } finally {
        setIsInitialLoading(false);
      }
    };

    void loadInitialData();
  }, []);

  // Refresh data periodically (every 10 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      startTransition(async () => {
        const [statsData, queueData] = await Promise.all([
          getWorkspaceStatsAction(),
          getQueueItemsAction(),
        ]);
        setStats(statsData);
        setQueueItems(queueData);
      });
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // Handle manual refresh
  const handleRefresh = useCallback(() => {
    startTransition(async () => {
      const [statsData, queueData, callData] = await Promise.all([
        getWorkspaceStatsAction(),
        getQueueItemsAction(),
        getActiveCallAction(),
      ]);
      setStats(statsData);
      setQueueItems(queueData);
      setActiveCall(callData);
    });
  }, []);

  // Handle queue item accepted
  const handleItemAccepted = useCallback(async (item: QueueItem) => {
    // Simulate starting a call
    const callData = await getActiveCallAction();
    setActiveCall(callData);

    // Load script for the procedure
    if (item.procedureInterest) {
      const scriptData = await getCallScriptAction(item.procedureInterest);
      setCallScript(scriptData);
    }

    // Remove item from queue
    setQueueItems((prev) => prev.filter((q) => q.id !== item.id));
  }, []);

  // Handle call ended
  const handleCallEnded = useCallback(() => {
    setActiveCall(null);
    setCallScript(null);
    handleRefresh();
  }, [handleRefresh]);

  // Handle session update
  const handleSessionUpdate = useCallback((updatedSession: AgentSession) => {
    setSession(updatedSession);
  }, []);

  // Handle schedule appointment
  const handleScheduleAppointment = useCallback((_leadId: string) => {
    // TODO: Open scheduling modal for the lead
    // This would typically open a scheduling modal
  }, []);

  if (isInitialLoading) {
    return (
      <PagePermissionGate pathname="/agent-workspace">
        <div className="h-[calc(100vh-8rem)] flex flex-col gap-4">
          <AgentStatusBarSkeleton />
          <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
            <div className="col-span-3">
              <QueueViewSkeleton />
            </div>
            <div className="col-span-5">
              <CallPanelSkeleton />
            </div>
            <div className="col-span-4">
              <ScriptGuidanceSkeleton />
            </div>
          </div>
        </div>
      </PagePermissionGate>
    );
  }

  return (
    <PagePermissionGate pathname="/agent-workspace">
      <div className="h-[calc(100vh-8rem)] flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Headphones className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Agent Workspace</h1>
              <p className="text-sm text-muted-foreground">
                Gestionează apeluri și lead-uri în timp real
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isPending}
            className="gap-2"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Actualizează
          </Button>
        </div>

        {/* Status Bar */}
        {session && stats && (
          <AgentStatusBar session={session} stats={stats} onSessionUpdate={handleSessionUpdate} />
        )}

        {/* Main Content Grid */}
        <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
          {/* Queue View - Left Panel */}
          <div className="col-span-12 lg:col-span-3 h-full overflow-hidden">
            <QueueView items={queueItems} onItemAccepted={handleItemAccepted} />
          </div>

          {/* Call Panel - Center Panel */}
          <div className="col-span-12 lg:col-span-5 h-full overflow-hidden">
            <CallPanel
              call={activeCall}
              onCallEnded={handleCallEnded}
              onScheduleAppointment={handleScheduleAppointment}
            />
          </div>

          {/* Script Guidance - Right Panel */}
          <div className="col-span-12 lg:col-span-4 h-full overflow-hidden">
            <ScriptGuidance script={callScript} activeStep={1} />
          </div>
        </div>
      </div>
    </PagePermissionGate>
  );
}

// Metadata for the page
export const metadata = {
  title: 'Agent Workspace | MedicalCor Cortex',
  description: 'Unified workspace for agents to handle calls and leads',
};
