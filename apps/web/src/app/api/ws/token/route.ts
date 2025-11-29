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

// Secret for signing WebSocket tokens - should match the WS server's secret
const WS_TOKEN_SECRET = new TextEncoder().encode(
  process.env.WS_TOKEN_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    'ws-token-secret-change-in-production'
);

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
