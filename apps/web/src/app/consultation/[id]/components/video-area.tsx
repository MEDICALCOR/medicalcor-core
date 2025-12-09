'use client';

import { Video, VideoOff, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Participant } from '../actions';

interface VideoAreaProps {
  participants: Participant[];
  localStream: MediaStream | null;
  isLocalVideoOff: boolean;
  currentUserId: string;
}

interface VideoTileProps {
  participant?: Participant;
  stream?: MediaStream | null;
  isLocal?: boolean;
  isVideoOff?: boolean;
  isMuted?: boolean;
  label?: string;
}

function VideoTile({
  participant,
  stream,
  isLocal = false,
  isVideoOff = false,
  isMuted = false,
  label,
}: VideoTileProps) {
  const displayName = participant?.name ?? label ?? (isLocal ? 'Tu' : 'Participant');
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={cn(
        'relative aspect-video bg-muted rounded-lg overflow-hidden',
        'flex items-center justify-center',
        isLocal && 'ring-2 ring-primary/50'
      )}
    >
      {/* Video element or placeholder */}
      {stream && !isVideoOff ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- Captions not applicable for live video consultations
        <video
          ref={(el) => {
            if (el && stream) {
              el.srcObject = stream;
            }
          }}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2">
          <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center">
            {isVideoOff ? (
              <VideoOff className="h-8 w-8 text-muted-foreground" />
            ) : (
              <span className="text-2xl font-bold text-primary">{initials}</span>
            )}
          </div>
          {isVideoOff && <span className="text-sm text-muted-foreground">Camera oprită</span>}
        </div>
      )}

      {/* Participant info overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white text-sm font-medium">{displayName}</span>
            {isLocal && (
              <Badge variant="secondary" className="text-[10px]">
                Tu
              </Badge>
            )}
            {participant?.role === 'doctor' && (
              <Badge className="bg-blue-500 text-[10px]">Doctor</Badge>
            )}
            {participant?.role === 'patient' && (
              <Badge className="bg-green-500 text-[10px]">Pacient</Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isMuted && (
              <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                <User className="h-3 w-3 text-white" />
              </div>
            )}
            {isVideoOff && (
              <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                <VideoOff className="h-3 w-3 text-white" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Connection status indicator */}
      {participant && (
        <div className="absolute top-2 right-2">
          <div
            className={cn(
              'w-2 h-2 rounded-full',
              participant.status === 'connected' && 'bg-green-500',
              participant.status === 'connecting' && 'bg-yellow-500 animate-pulse',
              participant.status === 'disconnected' && 'bg-red-500'
            )}
          />
        </div>
      )}
    </div>
  );
}

export function VideoArea({
  participants,
  localStream,
  isLocalVideoOff,
  currentUserId,
}: VideoAreaProps) {
  // Separate local and remote participants
  const remoteParticipants = participants.filter((p) => p.id !== currentUserId);
  const localParticipant = participants.find((p) => p.id === currentUserId);

  // Determine grid layout based on participant count
  const totalParticipants = remoteParticipants.length + 1; // +1 for local

  const getGridClass = () => {
    switch (totalParticipants) {
      case 1:
        return 'grid-cols-1';
      case 2:
        return 'grid-cols-2';
      case 3:
      case 4:
        return 'grid-cols-2';
      default:
        return 'grid-cols-3';
    }
  };

  return (
    <div className="flex-1 p-4 bg-background/95">
      <div className={cn('grid gap-4 h-full', getGridClass())}>
        {/* Local video tile */}
        <VideoTile
          participant={localParticipant}
          stream={localStream}
          isLocal
          isVideoOff={isLocalVideoOff}
          isMuted={localParticipant?.isMuted}
          label="Tu"
        />

        {/* Remote participant tiles */}
        {remoteParticipants.map((participant) => (
          <VideoTile
            key={participant.id}
            participant={participant}
            isVideoOff={participant.isVideoOff}
            isMuted={participant.isMuted}
          />
        ))}

        {/* Empty state when waiting for others */}
        {remoteParticipants.length === 0 && (
          <div className="aspect-video bg-muted/50 rounded-lg flex items-center justify-center border-2 border-dashed border-muted-foreground/20">
            <div className="text-center">
              <Video className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Se așteaptă participanți...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function VideoAreaSkeleton() {
  return (
    <div className="flex-1 p-4 bg-background/95">
      <div className="grid grid-cols-2 gap-4 h-full">
        <div className="aspect-video bg-muted animate-pulse rounded-lg" />
        <div className="aspect-video bg-muted animate-pulse rounded-lg" />
      </div>
    </div>
  );
}
