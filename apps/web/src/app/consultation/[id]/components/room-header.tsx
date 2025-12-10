'use client';

import { ArrowLeft, Clock, Users, Shield, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ConsultationRoom, ConsultationStatus } from '../actions';

interface RoomHeaderProps {
  room: ConsultationRoom;
  duration: number;
  onBack: () => void;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getStatusConfig(status: ConsultationStatus): { label: string; className: string } {
  switch (status) {
    case 'waiting':
      return { label: 'În așteptare', className: 'bg-yellow-100 text-yellow-700' };
    case 'in_progress':
      return { label: 'În desfășurare', className: 'bg-green-100 text-green-700' };
    case 'completed':
      return { label: 'Finalizată', className: 'bg-gray-100 text-gray-700' };
    case 'cancelled':
      return { label: 'Anulată', className: 'bg-red-100 text-red-700' };
    default:
      return { label: status, className: 'bg-gray-100 text-gray-700' };
  }
}

export function RoomHeader({ room, duration, onBack }: RoomHeaderProps) {
  const statusConfig = getStatusConfig(room.status);

  return (
    <div className="bg-background border-b px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Left: Back button + Room info */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Video className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold">Consultație Video</h1>
                <Badge className={cn('text-xs', statusConfig.className)}>
                  {statusConfig.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {room.patientName} • {room.doctorName}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Stats */}
        <div className="flex items-center gap-4">
          {/* Duration */}
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono tabular-nums">{formatDuration(duration)}</span>
          </div>

          {/* Participants */}
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>{room.participants.length} participanți</span>
          </div>

          {/* HIPAA/GDPR compliance indicator */}
          <div className="flex items-center gap-1 text-xs text-green-600">
            <Shield className="h-3 w-3" />
            <span className="hidden sm:inline">HIPAA/GDPR</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RoomHeaderSkeleton() {
  return (
    <div className="bg-background border-b px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-9 w-9 rounded bg-muted animate-pulse" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
            <div>
              <div className="h-5 w-40 bg-muted animate-pulse rounded mb-1" />
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="h-5 w-20 bg-muted animate-pulse rounded" />
          <div className="h-5 w-24 bg-muted animate-pulse rounded" />
        </div>
      </div>
    </div>
  );
}
