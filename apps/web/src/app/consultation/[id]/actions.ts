'use server';

import { getCurrentUser, requireAuth } from '@/lib/auth/server-action-auth';
import { createLogger } from '@medicalcor/core';

const logger = createLogger({ name: 'consultation-actions' });

// ============================================================================
// TYPES
// ============================================================================

export type ConsultationStatus = 'waiting' | 'in_progress' | 'completed' | 'cancelled';
export type ParticipantRole = 'doctor' | 'patient' | 'assistant';
export type ParticipantStatus = 'connected' | 'disconnected' | 'connecting';

export interface Participant {
  id: string;
  name: string;
  role: ParticipantRole;
  avatarUrl?: string;
  status: ParticipantStatus;
  isMuted: boolean;
  isVideoOff: boolean;
  joinedAt: Date;
}

export interface ConsultationRoom {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  scheduledAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  duration: number;
  status: ConsultationStatus;
  participants: Participant[];
  recordingEnabled: boolean;
  chatEnabled: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: ParticipantRole;
  content: string;
  timestamp: Date;
  isSystem?: boolean;
}

export interface CurrentUserInfo {
  id: string;
  name: string;
  email: string;
  role: ParticipantRole;
  avatarUrl?: string;
}

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Get current user information for the consultation room
 */
export async function getCurrentUserInfoAction(): Promise<CurrentUserInfo | null> {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  // Map user role to participant role
  const roleMapping: Record<string, ParticipantRole> = {
    doctor: 'doctor',
    physician: 'doctor',
    nurse: 'assistant',
    assistant: 'assistant',
    admin: 'assistant',
    receptionist: 'assistant',
  };

  const participantRole = roleMapping[user.role?.toLowerCase() ?? ''] ?? 'assistant';

  return {
    id: user.id,
    name: user.name ?? 'Utilizator',
    email: user.email ?? '',
    role: participantRole,
    avatarUrl: undefined, // User avatar not available in session
  };
}

/**
 * Get consultation room details by ID
 */
export async function getConsultationRoomAction(roomId: string): Promise<ConsultationRoom | null> {
  await requireAuth();

  logger.info({ roomId }, 'Fetching consultation room');

  // TODO: Replace with actual database query
  // For now, return mock data for development
  const mockRoom: ConsultationRoom = {
    id: roomId,
    patientId: 'p1',
    patientName: 'Ion Popescu',
    doctorId: 'd1',
    doctorName: 'Dr. Maria Ionescu',
    scheduledAt: new Date(),
    duration: 30,
    status: 'waiting',
    participants: [],
    recordingEnabled: true,
    chatEnabled: true,
  };

  return mockRoom;
}

/**
 * Join a consultation room
 */
export async function joinRoomAction(roomId: string): Promise<{
  success: boolean;
  token?: string;
  serverUrl?: string;
  error?: string;
}> {
  const session = await requireAuth();
  const user = session.user;

  logger.info({ roomId, userId: user.id }, 'User joining consultation room');

  // TODO: Implement LiveKit token generation
  // For now, return a placeholder response

  return {
    success: true,
    token: `mock-token-${roomId}-${user.id}`,
    serverUrl: process.env.LIVEKIT_SERVER_URL ?? 'wss://talk.medicalcor.ro',
  };
}

/**
 * Leave a consultation room
 */
export async function leaveRoomAction(roomId: string): Promise<{ success: boolean }> {
  const session = await requireAuth();
  const user = session.user;

  logger.info({ roomId, userId: user.id }, 'User leaving consultation room');

  // TODO: Update participant status in database
  // TODO: End recording if last participant

  return { success: true };
}

/**
 * Send a chat message in the consultation room
 */
export async function sendChatMessageAction(
  roomId: string,
  content: string
): Promise<ChatMessage | null> {
  const session = await requireAuth();
  const user = session.user;

  if (!content.trim()) {
    return null;
  }

  logger.info({ roomId, userId: user.id }, 'Sending chat message');

  // TODO: Store message in database via Supabase Realtime
  const message: ChatMessage = {
    id: crypto.randomUUID(),
    senderId: user.id,
    senderName: user.name ?? 'Utilizator',
    senderRole: 'assistant', // TODO: Get actual role
    content: content.trim(),
    timestamp: new Date(),
  };

  return message;
}

/**
 * Toggle recording for the consultation
 */
export async function toggleRecordingAction(
  roomId: string,
  enabled: boolean
): Promise<{ success: boolean; recordingId?: string }> {
  await requireAuth();

  logger.info({ roomId, enabled }, 'Toggling recording');

  // TODO: Implement LiveKit recording control
  // TODO: Store recording metadata in database

  return {
    success: true,
    recordingId: enabled ? `rec-${roomId}-${Date.now()}` : undefined,
  };
}

/**
 * End the consultation
 */
export async function endConsultationAction(roomId: string): Promise<{ success: boolean }> {
  const session = await requireAuth();
  const user = session.user;

  logger.info({ roomId, userId: user.id }, 'Ending consultation');

  // TODO: Update consultation status in database
  // TODO: Stop recording
  // TODO: Disconnect all participants

  return { success: true };
}

/**
 * Get chat history for a consultation room
 */
export async function getChatHistoryAction(roomId: string): Promise<ChatMessage[]> {
  await requireAuth();

  logger.info({ roomId }, 'Fetching chat history');

  // TODO: Fetch from database
  return [];
}
