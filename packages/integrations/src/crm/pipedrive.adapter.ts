/**
 * Pipedrive CRM Adapter
 * Parses Pipedrive webhooks into MedicalCor DTOs
 *
 * Custom Field Configuration:
 * Pipedrive uses hash-based keys for custom fields (e.g., 'abc123_language').
 * Configure these via environment variables:
 *   - PIPEDRIVE_FIELD_LANGUAGE: Custom field key for language (e.g., 'abc123_language')
 *   - PIPEDRIVE_FIELD_UTM_SOURCE: Custom field key for UTM source
 *   - PIPEDRIVE_FIELD_UTM_MEDIUM: Custom field key for UTM medium
 *   - PIPEDRIVE_FIELD_UTM_CAMPAIGN: Custom field key for UTM campaign
 *   - PIPEDRIVE_FIELD_GDPR_CONSENT: Custom field key for GDPR consent
 *   - PIPEDRIVE_FIELD_AD_CAMPAIGN_ID: Custom field key for ad campaign ID
 *   - PIPEDRIVE_FIELD_ACQUISITION_CHANNEL: Custom field key for acquisition channel
 */

import type { ICRMProvider, LeadDTO, TreatmentPlanDTO } from '@medicalcor/types';

/**
 * Pipedrive custom field key configuration
 * Maps logical field names to Pipedrive hash-based custom field keys
 */
interface PipedriveFieldConfig {
  language: string[];
  utmSource: string[];
  utmMedium: string[];
  utmCampaign: string[];
  gdprConsent: string[];
  adCampaignId: string[];
  acquisitionChannel: string[];
}

/**
 * Get custom field configuration from environment variables
 * Supports multiple fallback keys per field for flexibility
 */
function getFieldConfig(): PipedriveFieldConfig {
  return {
    // Language field - check ENV first, then common field names
    language: [
      process.env.PIPEDRIVE_FIELD_LANGUAGE,
      'language',
      'limba',
      'preferred_language',
    ].filter((k): k is string => !!k),

    // UTM Source
    utmSource: [
      process.env.PIPEDRIVE_FIELD_UTM_SOURCE,
      'utm_source',
      'source',
      'lead_source',
      'marketing_source',
    ].filter((k): k is string => !!k),

    // UTM Medium
    utmMedium: [
      process.env.PIPEDRIVE_FIELD_UTM_MEDIUM,
      'utm_medium',
      'medium',
      'marketing_medium',
    ].filter((k): k is string => !!k),

    // UTM Campaign
    utmCampaign: [
      process.env.PIPEDRIVE_FIELD_UTM_CAMPAIGN,
      'utm_campaign',
      'campaign',
      'marketing_campaign',
    ].filter((k): k is string => !!k),

    // GDPR Consent
    gdprConsent: [
      process.env.PIPEDRIVE_FIELD_GDPR_CONSENT,
      'gdpr_consent',
      'marketing_consent',
      'consent',
      'acord_gdpr',
    ].filter((k): k is string => !!k),

    // Ad Campaign ID
    adCampaignId: [
      process.env.PIPEDRIVE_FIELD_AD_CAMPAIGN_ID,
      'ad_campaign_id',
      'gclid',
      'fbclid',
      'campaign_id',
    ].filter((k): k is string => !!k),

    // Acquisition Channel
    acquisitionChannel: [
      process.env.PIPEDRIVE_FIELD_ACQUISITION_CHANNEL,
      'acquisition_channel',
      'channel',
      'lead_channel',
    ].filter((k): k is string => !!k),
  };
}

/**
 * Extract custom field value from Pipedrive person/deal object
 * Tries multiple possible field keys in order of priority
 */
function extractCustomField(
  data: Record<string, unknown>,
  fieldKeys: string[]
): string | undefined {
  for (const key of fieldKeys) {
    const value = data[key];

    // Handle direct string value
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    // Handle Pipedrive option format { id: number, label: string }
    if (value && typeof value === 'object') {
      const objValue = value as Record<string, unknown>;
      if (typeof objValue.label === 'string' && objValue.label.trim()) {
        return objValue.label.trim();
      }
      if (typeof objValue.value === 'string' && objValue.value.trim()) {
        return objValue.value.trim();
      }
    }

    // Handle boolean (for consent fields)
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    // Handle number (for option IDs that map to values)
    if (typeof value === 'number') {
      return String(value);
    }
  }

  return undefined;
}

/**
 * Parse GDPR consent value from various formats
 */
function parseGdprConsent(value: string | undefined): boolean {
  if (!value) return false;

  const normalized = value.toLowerCase().trim();
  return (
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'da' ||
    normalized === '1' ||
    normalized === 'agreed' ||
    normalized === 'consimtit'
  );
}

/**
 * Safely convert unknown value to string
 */
function toSafeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function normalizePhone(raw: unknown): string | null {
  const s = toSafeString(raw).trim();
  if (!s) return null;
  // Basic normalization - preserve the number as-is for now
  // Real E.164 normalization can be added later
  return s;
}

function getPayloadData(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;

  const p = payload as Record<string, unknown>;

  // Pipedrive sends data in `current` for updates, or directly in payload
  if (p.current && typeof p.current === 'object') {
    return p.current as Record<string, unknown>;
  }
  if (p.data && typeof p.data === 'object') {
    return p.data as Record<string, unknown>;
  }
  return p;
}

export class PipedriveAdapter implements ICRMProvider {
  public readonly sourceName = 'pipedrive';

  parseContactWebhook(payload: unknown): LeadDTO | null {
    const person = getPayloadData(payload);
    if (!person) return null;

    const personId = person.id;
    if (personId === undefined || personId === null) return null;

    // Extract phone from array or string
    let phoneValue: string | null = null;
    const phoneField = person.phone;

    if (Array.isArray(phoneField) && phoneField.length > 0) {
      const firstPhone: unknown = phoneField[0];
      if (firstPhone && typeof firstPhone === 'object') {
        const phoneObj = firstPhone as Record<string, unknown>;
        phoneValue = toSafeString(phoneObj.value) || null;
      }
    } else if (typeof phoneField === 'string') {
      phoneValue = phoneField;
    }

    const phone = normalizePhone(phoneValue);
    if (!phone) return null;

    // Extract email from array or string
    let emailValue: string | undefined;
    const emailField = person.email;

    if (Array.isArray(emailField) && emailField.length > 0) {
      const firstEmail: unknown = emailField[0];
      if (firstEmail && typeof firstEmail === 'object') {
        const emailObj = firstEmail as Record<string, unknown>;
        emailValue = toSafeString(emailObj.value) || undefined;
      }
    } else if (typeof emailField === 'string') {
      emailValue = emailField;
    }

    // Extract custom fields using configurable field keys
    const fieldConfig = getFieldConfig();

    // Language extraction with fallback to Romanian
    const language = extractCustomField(person, fieldConfig.language) ?? 'ro';

    // Source/UTM extraction
    const source = extractCustomField(person, fieldConfig.utmSource) ?? 'pipedrive_webhook';
    const utmMedium = extractCustomField(person, fieldConfig.utmMedium);
    const utmCampaign = extractCustomField(person, fieldConfig.utmCampaign);

    // Marketing attribution
    const acquisitionChannel = extractCustomField(person, fieldConfig.acquisitionChannel);
    const adCampaignId = extractCustomField(person, fieldConfig.adCampaignId);

    // GDPR consent
    const gdprConsentValue = extractCustomField(person, fieldConfig.gdprConsent);
    const gdprConsent = parseGdprConsent(gdprConsentValue);

    // Build company domain URL
    const companyDomain = process.env.PIPEDRIVE_COMPANY_DOMAIN ?? 'medicalcor';
    const personIdStr = toSafeString(personId);

    const dto: LeadDTO = {
      externalSource: this.sourceName,
      externalContactId: personIdStr,
      externalUrl: `https://${companyDomain}.pipedrive.com/person/${personIdStr}`,

      fullName: typeof person.name === 'string' ? person.name : undefined,
      phone,
      email: emailValue,

      language,
      source,
      acquisitionChannel,
      adCampaignId,

      // GDPR compliance
      gdprConsent,
      gdprConsentAt: gdprConsent ? new Date() : undefined,
      gdprConsentSource: gdprConsent ? 'pipedrive_sync' : undefined,

      status: 'new', // Default status for new leads from Pipedrive

      metadata: {
        raw_pipedrive: person,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
      },
    };

    return dto;
  }

  parseDealWebhook(payload: unknown): TreatmentPlanDTO | null {
    const deal = getPayloadData(payload);
    if (!deal) return null;

    const dealId = deal.id;
    if (dealId === undefined || dealId === null) return null;

    // Extract person ID from deal
    let personId: string | undefined;
    const personIdField = deal.person_id;

    if (typeof personIdField === 'object' && personIdField !== null) {
      const personObj = personIdField as Record<string, unknown>;
      const personValue = personObj.value;
      if (personValue !== undefined && personValue !== null) {
        personId = toSafeString(personValue);
      }
    } else if (personIdField !== undefined && personIdField !== null) {
      personId = toSafeString(personIdField);
    }

    if (!personId) return null;

    // Extract user/doctor ID
    let doctorExternalUserId: string | undefined;
    const userIdField = deal.user_id;

    if (typeof userIdField === 'object' && userIdField !== null) {
      const userObj = userIdField as Record<string, unknown>;
      const userId = userObj.id;
      if (userId !== undefined && userId !== null) {
        doctorExternalUserId = toSafeString(userId);
      }
    } else if (userIdField !== undefined && userIdField !== null) {
      doctorExternalUserId = toSafeString(userIdField);
    }

    const isWon = deal.status === 'won';
    const isLost = deal.status === 'lost';

    const dealIdStr = toSafeString(dealId);
    const dealTitle = typeof deal.title === 'string' ? deal.title : undefined;
    const dealValue = deal.value;
    const dealCurrency = typeof deal.currency === 'string' ? deal.currency : 'EUR';
    const stageId = deal.stage_id;
    const dealProbability =
      typeof deal.probability === 'number' ? deal.probability : isWon ? 100 : 0;

    const dto: TreatmentPlanDTO = {
      externalSource: this.sourceName,
      externalDealId: dealIdStr,
      leadExternalId: personId,
      doctorExternalUserId,

      name: dealTitle,
      totalValue: dealValue !== null && dealValue !== undefined ? Number(dealValue) : 0,
      currency: dealCurrency,

      stage:
        stageId !== undefined && stageId !== null ? `stage_${toSafeString(stageId)}` : 'unknown',
      probability: dealProbability,

      isAccepted: isWon,
      acceptedAt: isWon && typeof deal.won_time === 'string' ? new Date(deal.won_time) : null,
      rejectedReason: isLost && typeof deal.lost_reason === 'string' ? deal.lost_reason : null,

      notes: dealTitle ? `Pipedrive Deal: ${dealTitle}` : 'Pipedrive Deal',
    };

    return dto;
  }
}
