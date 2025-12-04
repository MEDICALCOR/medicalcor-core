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
// Development fallback uses a randomly generated secret per process (not hardcoded)
let _devOnlyRandomSecret: Uint8Array | null = null;

function getDevOnlyRandomSecret(): Uint8Array {
  if (!_devOnlyRandomSecret) {
    // Generate a cryptographically secure random secret for development
    // This is NOT stored anywhere and changes on each process restart
    _devOnlyRandomSecret = crypto.getRandomValues(new Uint8Array(32));
    console.warn(
      '[SECURITY WARNING] WS_TOKEN_SECRET not configured - using randomly generated secret for this dev session. ' +
        'WebSocket tokens will be invalidated on server restart.'
    );
  }
  return _devOnlyRandomSecret;
}

function getWebSocketSecret(): Uint8Array {
  const secret = process.env.WS_TOKEN_SECRET ?? process.env.NEXTAUTH_SECRET;

  if (!secret) {
    // CRITICAL: In production, this MUST be configured - throw error
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CRITICAL: WS_TOKEN_SECRET or NEXTAUTH_SECRET must be configured in production. ' +
          'Refusing to generate random secret to prevent token persistence issues.'
      );
    }
    // Development only: Use randomly generated secret (not hardcoded)
    return getDevOnlyRandomSecret();
  }

  // Validate secret length for security (at least 32 characters)
  if (secret.length < 32) {
    throw new Error(
      'WS_TOKEN_SECRET/NEXTAUTH_SECRET must be at least 32 characters for adequate security'
    );
  }

  return new TextEncoder().encode(secret);
}

// Secret for signing WebSocket tokens - lazily initialized at runtime
// This prevents build-time errors while maintaining runtime security
let _wsTokenSecret: Uint8Array | null = null;

function getWsTokenSecretLazy(): Uint8Array {
  _wsTokenSecret ??= getWebSocketSecret();
  return _wsTokenSecret;
}

// Token expiry time (5 minutes)
const TOKEN_EXPIRY = '5m';

export async function POST() {
  try {
    // Get secret lazily at runtime (not build time)
    const WS_TOKEN_SECRET = getWsTokenSecretLazy();

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
  } catch (_error) {
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
