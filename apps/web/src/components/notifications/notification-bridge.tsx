'use client';

import { useEffect, useRef } from 'react';
import { useRealtime } from '@/lib/realtime';
import { useNotifications } from '@/lib/notifications';
import { BoundedMap } from '@/lib/realtime/ring-buffer';
import type { LeadCreatedPayload, LeadScoredPayload, UrgencyPayload } from '@/lib/realtime/types';

/**
 * Maximum number of pending leads to track for HOT lead notifications.
 * This prevents memory leaks during long doctor shifts with high lead volume.
 *
 * Rationale:
 * - Average scoring time is ~2-5 seconds
 * - 50 leads provides ~60 seconds buffer at 1 lead/second rate
 * - Higher volumes indicate system stress, older leads likely already scored
 */
const MAX_PENDING_LEADS = 50;

/**
 * Timeout for pending leads cleanup (30 seconds).
 * Leads not scored within this time are removed from tracking.
 */
const PENDING_LEAD_TIMEOUT_MS = 30000;

/**
 * Bridge component that listens to realtime events and triggers browser notifications.
 * This should be rendered once at the app level.
 *
 * Memory Safety:
 * - Uses BoundedMap to prevent unbounded memory growth
 * - Timeouts clean up stale entries
 * - Component cleanup clears all pending data
 */
export function NotificationBridge() {
  const { subscribe } = useRealtime();
  const { notifyUrgency, notifyNewLead } = useNotifications();

  // Use ref to persist bounded map across re-renders
  // This prevents memory leaks during long sessions (8+ hours)
  const pendingLeadsRef = useRef<BoundedMap<string, LeadCreatedPayload>>(
    new BoundedMap(MAX_PENDING_LEADS)
  );

  // Track timeouts for proper cleanup
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Listen for urgency events
  useEffect(() => {
    const unsubscribe = subscribe<UrgencyPayload>('urgency.new', (event) => {
      notifyUrgency({
        type: 'urgency',
        leadId: event.data.leadId,
        phone: event.data.phone,
        reason: event.data.reason,
        priority: event.data.priority,
        waitingTime: event.data.waitingTime,
      });
    });

    return unsubscribe;
  }, [subscribe, notifyUrgency]);

  // Listen for new leads with HOT classification
  useEffect(() => {
    const pendingLeads = pendingLeadsRef.current;
    const timeouts = timeoutsRef.current;

    const unsubCreated = subscribe<LeadCreatedPayload>('lead.created', (event) => {
      const leadId = event.data.id;

      // Clear any existing timeout for this lead (in case of duplicate events)
      const existingTimeout = timeouts.get(leadId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      pendingLeads.set(leadId, event.data);

      // Clean up after timeout if not scored
      const timeout = setTimeout(() => {
        pendingLeads.delete(leadId);
        timeouts.delete(leadId);
      }, PENDING_LEAD_TIMEOUT_MS);

      timeouts.set(leadId, timeout);
    });

    const unsubScored = subscribe<LeadScoredPayload>('lead.scored', (event) => {
      const leadId = event.data.leadId;
      const lead = pendingLeads.get(leadId);

      if (lead) {
        // Notify for HOT leads
        if (event.data.classification === 'HOT') {
          notifyNewLead({
            type: 'lead',
            leadId: leadId,
            phone: lead.phone,
            source: lead.source,
            classification: event.data.classification,
          });
        }

        // Clean up
        pendingLeads.delete(leadId);
        const timeout = timeouts.get(leadId);
        if (timeout) {
          clearTimeout(timeout);
          timeouts.delete(leadId);
        }
      }
    });

    return () => {
      unsubCreated();
      unsubScored();

      // Clear all timeouts on unmount to prevent memory leaks
      for (const timeout of timeouts.values()) {
        clearTimeout(timeout);
      }
      timeouts.clear();
      pendingLeads.clear();
    };
  }, [subscribe, notifyNewLead]);

  // This component doesn't render anything
  return null;
}
