/**
 * Pipedrive CRM Adapter
 * Parses Pipedrive webhooks into MedicalCor DTOs
 */

import type { ICRMProvider, LeadDTO, TreatmentPlanDTO } from '@medicalcor/types';

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
      const firstPhone = phoneField[0];
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
      const firstEmail = emailField[0];
      if (firstEmail && typeof firstEmail === 'object') {
        const emailObj = firstEmail as Record<string, unknown>;
        emailValue = toSafeString(emailObj.value) || undefined;
      }
    } else if (typeof emailField === 'string') {
      emailValue = emailField;
    }

    // Extract custom fields (language, source, etc.)
    // TODO: Replace with actual Pipedrive custom field keys
    const languageField = person.language ?? person.custom_language;
    const language = typeof languageField === 'string' ? languageField : 'ro';

    const sourceField = person.source ?? person.utm_source;
    const source = typeof sourceField === 'string' ? sourceField : 'pipedrive_webhook';

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
      status: 'new', // Default status for new leads from Pipedrive

      metadata: {
        raw_pipedrive: person,
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
    const dealProbability = typeof deal.probability === 'number' ? deal.probability : (isWon ? 100 : 0);

    const dto: TreatmentPlanDTO = {
      externalSource: this.sourceName,
      externalDealId: dealIdStr,
      leadExternalId: personId,
      doctorExternalUserId,

      name: dealTitle,
      totalValue: dealValue !== null && dealValue !== undefined ? Number(dealValue) : 0,
      currency: dealCurrency,

      stage: stageId !== undefined && stageId !== null ? `stage_${toSafeString(stageId)}` : 'unknown',
      probability: dealProbability,

      isAccepted: isWon,
      acceptedAt:
        isWon && typeof deal.won_time === 'string' ? new Date(deal.won_time) : null,
      rejectedReason: isLost && typeof deal.lost_reason === 'string' ? deal.lost_reason : null,

      notes: dealTitle ? `Pipedrive Deal: ${dealTitle}` : 'Pipedrive Deal',
    };

    return dto;
  }
}
