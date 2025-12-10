'use client';

import { useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  MessageSquare,
  Monitor,
  MonitorOff,
  Settings,
  MoreVertical,
  Circle,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ControlsPanelProps {
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isChatOpen: boolean;
  isRecording: boolean;
  participantCount: number;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onToggleRecording: () => void;
  onLeave: () => void;
  onOpenSettings?: () => void;
}

function LeaveDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Părăsește consultația?</DialogTitle>
          <DialogDescription>
            Ești sigur că vrei să părăsești această consultație video? Poți reveni oricând folosind
            același link.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anulează
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Părăsește
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoreOptionsMenu({
  participantCount,
  onOpenSettings,
  onLeave,
}: {
  participantCount: number;
  onOpenSettings?: () => void;
  onLeave: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" className="h-12 w-12 rounded-full">
          <MoreVertical className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" side="top">
        <DropdownMenuItem onClick={onOpenSettings}>
          <Settings className="h-4 w-4 mr-2" />
          Setări
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Users className="h-4 w-4 mr-2" />
          Participanți ({participantCount})
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={onLeave}>
          <PhoneOff className="h-4 w-4 mr-2" />
          Părăsește consultația
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ControlsPanel({
  isMuted,
  isVideoOff,
  isScreenSharing,
  isChatOpen,
  isRecording,
  participantCount,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onToggleChat,
  onToggleRecording,
  onLeave,
  onOpenSettings,
}: ControlsPanelProps) {
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  const handleLeave = () => {
    setShowLeaveDialog(false);
    onLeave();
  };

  return (
    <>
      <div className="bg-background border-t px-4 py-3">
        <div className="flex items-center justify-center gap-2">
          <Button
            variant={isMuted ? 'destructive' : 'secondary'}
            size="icon"
            className="h-12 w-12 rounded-full"
            onClick={onToggleMute}
            title={isMuted ? 'Activează microfonul' : 'Dezactivează microfonul'}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>

          <Button
            variant={isVideoOff ? 'destructive' : 'secondary'}
            size="icon"
            className="h-12 w-12 rounded-full"
            onClick={onToggleVideo}
            title={isVideoOff ? 'Activează camera' : 'Dezactivează camera'}
          >
            {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          </Button>

          <Button
            variant={isScreenSharing ? 'default' : 'secondary'}
            size="icon"
            className="h-12 w-12 rounded-full"
            onClick={onToggleScreenShare}
            title={isScreenSharing ? 'Oprește partajarea' : 'Partajează ecranul'}
          >
            {isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
          </Button>

          <Button
            variant="destructive"
            size="icon"
            className="h-14 w-14 rounded-full"
            onClick={() => setShowLeaveDialog(true)}
            title="Părăsește consultația"
          >
            <PhoneOff className="h-6 w-6" />
          </Button>

          <Button
            variant={isChatOpen ? 'default' : 'secondary'}
            size="icon"
            className="h-12 w-12 rounded-full relative"
            onClick={onToggleChat}
            title={isChatOpen ? 'Închide chat' : 'Deschide chat'}
          >
            <MessageSquare className="h-5 w-5" />
          </Button>

          <Button
            variant={isRecording ? 'destructive' : 'secondary'}
            size="icon"
            className="h-12 w-12 rounded-full"
            onClick={onToggleRecording}
            title={isRecording ? 'Oprește înregistrarea' : 'Începe înregistrarea'}
          >
            <Circle className={cn('h-5 w-5', isRecording && 'fill-current animate-pulse')} />
          </Button>

          <MoreOptionsMenu
            participantCount={participantCount}
            onOpenSettings={onOpenSettings}
            onLeave={() => setShowLeaveDialog(true)}
          />
        </div>

        {isRecording && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <Circle className="h-3 w-3 fill-red-500 text-red-500 animate-pulse" />
            <span className="text-xs text-red-500 font-medium">Înregistrare în curs</span>
          </div>
        )}
      </div>

      <LeaveDialog
        open={showLeaveDialog}
        onOpenChange={setShowLeaveDialog}
        onConfirm={handleLeave}
      />
    </>
  );
}
