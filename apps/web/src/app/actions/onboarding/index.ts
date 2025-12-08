'use server';

import { z } from 'zod';
import { getDatabase } from '@/lib/db';
import { requirePermission, requireCurrentUser } from '@/lib/auth/server-action-auth';

/**
 * Server Actions for Clinic Onboarding
 *
 * Handles the complete clinic onboarding flow including:
 * - Clinic creation/update
 * - Schedule configuration
 * - Notification preferences
 * - Team member invites
 */

// =============================================================================
// Types
// =============================================================================

export interface ClinicScheduleDay {
  day: string;
  isOpen: boolean;
  startTime: string;
  endTime: string;
}

export interface NotificationPreferences {
  smsReminders: boolean;
  emailReminders: boolean;
  whatsappEnabled: boolean;
  autoConfirmation: boolean;
  reminderHours: number;
}

export interface TeamMemberInvite {
  email: string;
  name: string;
  role: 'doctor' | 'receptionist' | 'staff';
}

export interface OnboardingData {
  // Step 1: Clinic Details
  clinicName: string;
  address?: string;
  city?: string;
  country: string;
  phone?: string;
  email?: string;
  taxId?: string;
  website?: string;
  specialty?: string;
  // Compliance
  hipaaCompliant: boolean;
  gdprCompliant: boolean;
  // Step 2: Team Members (optional)
  teamMembers: TeamMemberInvite[];
  // Step 3: Schedule
  schedule: ClinicScheduleDay[];
  // Step 4: Notifications
  notifications: NotificationPreferences;
}

export interface OnboardingResult {
  clinicId: string;
  clinicName: string;
  invitedMembers: number;
  success: boolean;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const TeamMemberSchema = z.object({
  email: z.string().email('Email invalid'),
  name: z.string().min(1, 'Numele este obligatoriu').max(200),
  role: z.enum(['doctor', 'receptionist', 'staff']),
});

const ScheduleDaySchema = z.object({
  day: z.string(),
  isOpen: z.boolean(),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Format oră invalid'),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Format oră invalid'),
});

const NotificationPreferencesSchema = z.object({
  smsReminders: z.boolean(),
  emailReminders: z.boolean(),
  whatsappEnabled: z.boolean(),
  autoConfirmation: z.boolean(),
  reminderHours: z.number().min(1).max(72).default(24),
});

const OnboardingSchema = z.object({
  clinicName: z.string().min(1, 'Numele clinicii este obligatoriu').max(255),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  country: z.string().default('Romania'),
  phone: z.string().max(50).optional(),
  email: z.string().email('Email invalid').optional().or(z.literal('')),
  taxId: z.string().max(50).optional(),
  website: z.string().url('URL invalid').optional().or(z.literal('')),
  specialty: z.string().max(100).optional(),
  hipaaCompliant: z.boolean().default(false),
  gdprCompliant: z.boolean().default(true),
  teamMembers: z.array(TeamMemberSchema).default([]),
  schedule: z.array(ScheduleDaySchema).default([]),
  notifications: NotificationPreferencesSchema.default({
    smsReminders: true,
    emailReminders: true,
    whatsappEnabled: false,
    autoConfirmation: true,
    reminderHours: 24,
  }),
});

export type OnboardingInput = z.infer<typeof OnboardingSchema>;

// =============================================================================
// Default Values
// =============================================================================

export const DEFAULT_SCHEDULE: ClinicScheduleDay[] = [
  { day: 'Luni', isOpen: true, startTime: '09:00', endTime: '18:00' },
  { day: 'Marți', isOpen: true, startTime: '09:00', endTime: '18:00' },
  { day: 'Miercuri', isOpen: true, startTime: '09:00', endTime: '18:00' },
  { day: 'Joi', isOpen: true, startTime: '09:00', endTime: '18:00' },
  { day: 'Vineri', isOpen: true, startTime: '09:00', endTime: '18:00' },
  { day: 'Sâmbătă', isOpen: false, startTime: '09:00', endTime: '14:00' },
  { day: 'Duminică', isOpen: false, startTime: '09:00', endTime: '14:00' },
];

export const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  smsReminders: true,
  emailReminders: true,
  whatsappEnabled: false,
  autoConfirmation: true,
  reminderHours: 24,
};

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Complete the clinic onboarding process
 * Creates the clinic and associated settings
 */
export async function completeOnboardingAction(data: OnboardingInput): Promise<OnboardingResult> {
  await requirePermission('clinics:write');
  const currentUser = await requireCurrentUser();

  const parsed = OnboardingSchema.parse(data);
  const database = getDatabase();

  // Start transaction
  const client = await database.connect();

  try {
    await client.query('BEGIN');

    // 1. Create or update the clinic
    const clinicResult = await client.query<{ id: string; name: string }>(
      `INSERT INTO clinics (
        name, address, city, country, phone, email, tax_id,
        hipaa_compliant, gdpr_compliant, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        address = EXCLUDED.address,
        city = EXCLUDED.city,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email
      RETURNING id, name`,
      [
        parsed.clinicName,
        parsed.address ?? null,
        parsed.city ?? null,
        parsed.country,
        parsed.phone ?? null,
        parsed.email ?? null,
        parsed.taxId ?? null,
        parsed.hipaaCompliant,
        parsed.gdprCompliant,
      ]
    );

    const clinic = clinicResult.rows[0];

    // 2. Save clinic settings (schedule and notifications)
    const settings = {
      schedule: parsed.schedule,
      notifications: parsed.notifications,
      specialty: parsed.specialty ?? null,
      website: parsed.website ?? null,
      onboardingCompletedAt: new Date().toISOString(),
      onboardingCompletedBy: currentUser.id,
    };

    await client.query(
      `INSERT INTO clinic_settings (clinic_id, settings)
       VALUES ($1, $2)
       ON CONFLICT (clinic_id) DO UPDATE SET
         settings = clinic_settings.settings || $2,
         updated_at = CURRENT_TIMESTAMP`,
      [clinic.id, JSON.stringify(settings)]
    );

    // 3. Associate current user with the clinic if not already
    await client.query(`UPDATE users SET clinic_id = $1 WHERE id = $2 AND clinic_id IS NULL`, [
      clinic.id,
      currentUser.id,
    ]);

    // 4. Create team member invitations
    let invitedCount = 0;
    for (const member of parsed.teamMembers) {
      // Check if user already exists
      const existingUser = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`,
        [member.email]
      );

      if (existingUser.rows.length === 0) {
        // Create invitation record
        await client.query(
          `INSERT INTO user_invitations (
            email, name, role, clinic_id, invited_by, status
          )
          VALUES ($1, $2, $3, $4, $5, 'pending')
          ON CONFLICT (email, clinic_id) WHERE status = 'pending'
          DO UPDATE SET
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            updated_at = CURRENT_TIMESTAMP`,
          [member.email, member.name, member.role, clinic.id, currentUser.id]
        );
        invitedCount++;
      }
    }

    await client.query('COMMIT');

    return {
      clinicId: clinic.id,
      clinicName: clinic.name,
      invitedMembers: invitedCount,
      success: true,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if the current user needs onboarding
 */
export async function checkOnboardingStatusAction(): Promise<{
  needsOnboarding: boolean;
  clinicId: string | null;
  clinicName: string | null;
}> {
  const currentUser = await requireCurrentUser();

  if (!currentUser.clinicId) {
    return {
      needsOnboarding: true,
      clinicId: null,
      clinicName: null,
    };
  }

  const database = getDatabase();

  // Check if clinic has completed onboarding
  const result = await database.query<{
    id: string;
    name: string;
    settings: { onboardingCompletedAt?: string } | null;
  }>(
    `SELECT c.id, c.name, cs.settings
     FROM clinics c
     LEFT JOIN clinic_settings cs ON c.id = cs.clinic_id
     WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [currentUser.clinicId]
  );

  if (result.rows.length === 0) {
    return {
      needsOnboarding: true,
      clinicId: null,
      clinicName: null,
    };
  }

  const clinic = result.rows[0];
  const hasCompletedOnboarding = Boolean(clinic.settings?.onboardingCompletedAt);

  return {
    needsOnboarding: !hasCompletedOnboarding,
    clinicId: clinic.id,
    clinicName: clinic.name,
  };
}

/**
 * Get existing clinic data for editing during onboarding
 */
export async function getOnboardingDataAction(): Promise<Partial<OnboardingData> | null> {
  const currentUser = await requireCurrentUser();

  if (!currentUser.clinicId) {
    return null;
  }

  const database = getDatabase();

  const result = await database.query<{
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    country: string;
    phone: string | null;
    email: string | null;
    tax_id: string | null;
    hipaa_compliant: boolean;
    gdpr_compliant: boolean;
    settings: {
      schedule?: ClinicScheduleDay[];
      notifications?: NotificationPreferences;
      specialty?: string;
      website?: string;
    } | null;
  }>(
    `SELECT
       c.id, c.name, c.address, c.city, c.country,
       c.phone, c.email, c.tax_id,
       c.hipaa_compliant, c.gdpr_compliant,
       cs.settings
     FROM clinics c
     LEFT JOIN clinic_settings cs ON c.id = cs.clinic_id
     WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [currentUser.clinicId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const clinic = result.rows[0];

  return {
    clinicName: clinic.name,
    address: clinic.address ?? undefined,
    city: clinic.city ?? undefined,
    country: clinic.country,
    phone: clinic.phone ?? undefined,
    email: clinic.email ?? undefined,
    taxId: clinic.tax_id ?? undefined,
    hipaaCompliant: clinic.hipaa_compliant,
    gdprCompliant: clinic.gdpr_compliant,
    schedule: clinic.settings?.schedule ?? DEFAULT_SCHEDULE,
    notifications: clinic.settings?.notifications ?? DEFAULT_NOTIFICATIONS,
    specialty: clinic.settings?.specialty,
    website: clinic.settings?.website,
  };
}

/**
 * Skip onboarding (mark as completed without full configuration)
 */
export async function skipOnboardingAction(): Promise<boolean> {
  const currentUser = await requireCurrentUser();

  if (!currentUser.clinicId) {
    return false;
  }

  const database = getDatabase();

  await database.query(
    `INSERT INTO clinic_settings (clinic_id, settings)
     VALUES ($1, $2)
     ON CONFLICT (clinic_id) DO UPDATE SET
       settings = clinic_settings.settings || $2,
       updated_at = CURRENT_TIMESTAMP`,
    [
      currentUser.clinicId,
      JSON.stringify({
        onboardingSkippedAt: new Date().toISOString(),
        onboardingSkippedBy: currentUser.id,
      }),
    ]
  );

  return true;
}
