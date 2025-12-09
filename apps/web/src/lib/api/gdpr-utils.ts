import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface SessionValidationResult {
  user: AuthenticatedUser | null;
  error: NextResponse | null;
}

/**
 * Validates the current session and returns the user ID and email.
 * Returns an error response if the session is invalid.
 */
export async function validateGdprSession(): Promise<SessionValidationResult> {
  const session = await auth();

  if (!session?.user) {
    return {
      user: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const userId = session.user.id;
  const userEmail = session.user.email;

  if (!userId || !userEmail) {
    return {
      user: null,
      error: NextResponse.json({ error: 'Invalid session' }, { status: 401 }),
    };
  }

  return {
    user: { id: userId, email: userEmail },
    error: null,
  };
}

/**
 * Handles GDPR API errors consistently
 */
export function handleGdprError(operation: string, error: unknown): NextResponse {
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[GDPR ${operation}] Error:`, error);
  }

  return NextResponse.json(
    { error: `Failed to process ${operation.toLowerCase()} request. Please contact support.` },
    { status: 500 }
  );
}

/**
 * GDPR legal information for responses
 */
export const GDPR_LEGAL_INFO = {
  regulation: 'General Data Protection Regulation (GDPR)',
  controller: 'MedicalCor SRL',
  dpo: 'dpo@medicalcor.ro',
};
