/**
 * WebSocket Token Endpoint
 *
 * Generates short-lived JWT tokens for WebSocket authentication.
 * This prevents replay attacks and ensures tokens expire quickly.
 *
 * Flow:
 * 1. Client calls POST /api/ws/token with session cookie
 * 2. Server validates NextAuth session
 * 3. Server generates a short-lived JWT (5 minutes)
 * 4. Client uses JWT for WebSocket auth
 * 5. WebSocket server validates JWT signature and expiry
 */

import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { auth } from '@/lib/auth';

// CRITICAL FIX: Validate WebSocket token secret exists - no hardcoded defaults allowed
// This prevents token forgery attacks in production
function getWebSocketSecret(): Uint8Array {
  const secret = process.env.WS_TOKEN_SECRET ?? process.env.NEXTAUTH_SECRET;

  if (!secret) {
    // CRITICAL: In production, this MUST be configured - throw error
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CRITICAL: WS_TOKEN_SECRET or NEXTAUTH_SECRET must be configured in production. ' +
          'Refusing to use hardcoded default to prevent token forgery attacks.'
      );
    }
    // Development only: Use warning and fallback
    console.warn(
      '[SECURITY WARNING] WS_TOKEN_SECRET not configured - using insecure default for development only'
    );
    return new TextEncoder().encode('dev-only-ws-token-secret-not-for-production');
  }

  // Validate secret length for security (at least 32 characters)
  if (secret.length < 32) {
    throw new Error(
      'WS_TOKEN_SECRET/NEXTAUTH_SECRET must be at least 32 characters for adequate security'
    );
  }

  return new TextEncoder().encode(secret);
}

// Secret for signing WebSocket tokens - validated at runtime
const WS_TOKEN_SECRET = getWebSocketSecret();

// Token expiry time (5 minutes)
const TOKEN_EXPIRY = '5m';

export async function POST() {
  try {
    // Validate session
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Generate a short-lived JWT for WebSocket authentication
    const token = await new SignJWT({
      sub: session.user.id,
      email: session.user.email,
      role: session.user.role,
      clinicId: session.user.clinicId,
      type: 'ws_auth',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(TOKEN_EXPIRY)
      .setJti(crypto.randomUUID()) // Unique token ID to prevent replay
      .sign(WS_TOKEN_SECRET);

    return NextResponse.json({
      token,
      expiresIn: 300, // 5 minutes in seconds
    });
  } catch (error) {
    // SECURITY FIX: Only log in non-production to avoid console noise
    if (process.env.NODE_ENV !== 'production') {
      console.error('[WS Token] Error generating token:', error);
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Reject other HTTP methods
export function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
