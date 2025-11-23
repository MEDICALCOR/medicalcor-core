'use client';

import { useEffect } from 'react';
import { useRealtime } from '@/lib/realtime';
import { useNotifications } from '@/lib/notifications';
import type { LeadCreatedPayload, LeadScoredPayload, UrgencyPayload } from '@/lib/realtime/types';

/**
 * Bridge component that listens to realtime events and triggers browser notifications
 * This should be rendered once at the app level
 */
export function NotificationBridge() {
  const { subscribe } = useRealtime();
  const { notifyUrgency, notifyNewLead } = useNotifications();

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
    // Store lead info temporarily to enrich with scoring
    const pendingLeads = new Map<string, LeadCreatedPayload>();

    const unsubCreated = subscribe<LeadCreatedPayload>('lead.created', (event) => {
      pendingLeads.set(event.data.id, event.data);

      // Clean up after 30 seconds if not scored
      setTimeout(() => {
        pendingLeads.delete(event.data.id);
      }, 30000);
    });

    const unsubScored = subscribe<LeadScoredPayload>('lead.scored', (event) => {
      const lead = pendingLeads.get(event.data.leadId);
      if (lead) {
        // Notify for HOT leads
        if (event.data.classification === 'HOT') {
          notifyNewLead({
            type: 'lead',
            leadId: event.data.leadId,
            phone: lead.phone,
            source: lead.source,
            classification: event.data.classification,
          });
        }
        pendingLeads.delete(event.data.leadId);
      }
    });

    return () => {
      unsubCreated();
      unsubScored();
    };
  }, [subscribe, notifyNewLead]);

  // This component doesn't render anything
  return null;
}
