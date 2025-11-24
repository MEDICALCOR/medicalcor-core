import type { LeadClassification, LeadSource } from '@medicalcor/types';

/**
 * Maps HubSpot lifecycle stage to our internal PatientStatus
 */
export function mapHubSpotStageToStatus(
  stage?: string
): 'lead' | 'active' | 'inactive' | 'archived' {
  switch (stage?.toLowerCase()) {
    case 'customer':
    case 'evangelist':
      return 'active';
    case 'lead':
    case 'subscriber':
    case 'marketingqualifiedlead':
    case 'salesqualifiedlead':
    case 'opportunity':
      return 'lead';
    case 'other':
      return 'inactive';
    default:
      return 'lead';
  }
}

/**
 * Maps lead_score string to classification
 */
export function mapScoreToClassification(score?: string): LeadClassification {
  const numScore = parseInt(score ?? '0', 10);
  if (numScore >= 4) return 'HOT';
  if (numScore >= 2) return 'WARM';
  return 'COLD';
}

/**
 * Maps HubSpot lead_source to our LeadSource enum
 */
export function mapLeadSource(source?: string): LeadSource {
  switch (source?.toLowerCase()) {
    case 'whatsapp':
    case '360dialog':
      return 'whatsapp';
    case 'voice':
    case 'phone':
    case 'twilio':
      return 'voice';
    case 'facebook':
    case 'facebook_ads':
      return 'facebook';
    case 'google':
    case 'google_ads':
      return 'google';
    case 'referral':
      return 'referral';
    case 'web':
    case 'website':
    case 'form':
      return 'web_form';
    default:
      return 'manual';
  }
}
