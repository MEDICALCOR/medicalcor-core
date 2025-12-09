/**
 * HubSpot integration for LTV orchestration
 *
 * Uses loosely typed HubSpot client interface to avoid tight coupling.
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-redundant-type-constituents */

import { logger } from '@trigger.dev/sdk/v3';
import type { Pool } from 'pg';
import type { EngagementMetricsInput } from '@medicalcor/domain';
import type { HubSpotContactProperties } from './types.js';
import { fetchLeadContactData } from './database-queries.js';

/**
 * HubSpot client type (loosely typed to avoid coupling)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HubSpotClient = any;

/**
 * Default engagement metrics when HubSpot data is not available
 */
export function getDefaultEngagement(): EngagementMetricsInput {
  return {
    totalAppointments: 0,
    keptAppointments: 0,
    canceledAppointments: 0,
    noShows: 0,
    daysSinceLastContact: 30,
    referralsMade: 0,
    hasNPSFeedback: false,
    npsScore: null,
  };
}

/**
 * Parse engagement metrics from HubSpot contact properties
 */
function parseEngagementFromProperties(props: HubSpotContactProperties): EngagementMetricsInput {
  return {
    totalAppointments: parseInt(props.total_appointments ?? '0', 10),
    keptAppointments: parseInt(props.kept_appointments ?? '0', 10),
    canceledAppointments: parseInt(props.canceled_appointments ?? '0', 10),
    noShows: parseInt(props.no_shows ?? '0', 10),
    daysSinceLastContact: props.last_contact_date
      ? Math.floor(
          (Date.now() - new Date(props.last_contact_date).getTime()) / (1000 * 60 * 60 * 24)
        )
      : 30,
    referralsMade: parseInt(props.referrals_made ?? '0', 10),
    hasNPSFeedback: !!props.nps_score,
    npsScore: props.nps_score ? parseInt(props.nps_score, 10) : null,
  };
}

/**
 * Fetch engagement metrics from HubSpot
 */
export async function fetchEngagementFromHubSpot(
  hubspot: HubSpotClient | null,
  db: Pool,
  leadId: string
): Promise<EngagementMetricsInput> {
  if (!hubspot) {
    return getDefaultEngagement();
  }

  try {
    const lead = await fetchLeadContactData(db, leadId);
    if (!lead?.email) {
      return getDefaultEngagement();
    }

    const contact = await hubspot.findContactByEmail(lead.email);
    if (!contact) {
      return getDefaultEngagement();
    }

    const props = contact.properties as HubSpotContactProperties;
    return parseEngagementFromProperties(props);
  } catch (err) {
    logger.warn('Failed to fetch HubSpot engagement data', { err, leadId });
    return getDefaultEngagement();
  }
}

/**
 * Fetch retention score from HubSpot
 */
export async function fetchRetentionScore(
  hubspot: HubSpotClient | null,
  db: Pool,
  leadId: string
): Promise<number | null> {
  if (!hubspot) {
    return null;
  }

  try {
    const lead = await fetchLeadContactData(db, leadId);
    if (!lead?.email) {
      return null;
    }

    const contact = await hubspot.findContactByEmail(lead.email);

    if (contact?.properties?.retention_score) {
      return parseInt(contact.properties.retention_score as string, 10);
    }
    return null;
  } catch {
    // Retention score is optional
    return null;
  }
}

/**
 * Update HubSpot contact with pLTV data
 */
export async function updateHubSpotWithPLTV(
  hubspot: HubSpotClient | null,
  db: Pool,
  leadId: string,
  pltvData: {
    predictedLTV: number;
    tier: string;
    growthPotential: string;
    investmentPriority: string;
    confidence: number;
    calculatedAt: string;
  }
): Promise<void> {
  if (!hubspot) {
    return;
  }

  try {
    const lead = await fetchLeadContactData(db, leadId);
    if (!lead?.email) {
      return;
    }

    const contact = await hubspot.findContactByEmail(lead.email);
    if (!contact) {
      return;
    }

    await hubspot.updateContact(contact.id, {
      predicted_ltv: pltvData.predictedLTV.toString(),
      pltv_tier: pltvData.tier,
      pltv_growth_potential: pltvData.growthPotential,
      pltv_investment_priority: pltvData.investmentPriority,
      pltv_confidence: Math.round(pltvData.confidence * 100).toString(),
      pltv_calculated_at: pltvData.calculatedAt,
    });

    logger.info('HubSpot contact updated with pLTV', { contactId: contact.id });
  } catch (err) {
    logger.warn('Failed to update HubSpot with pLTV', { err, leadId });
  }
}
