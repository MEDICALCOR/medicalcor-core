'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import {
  VideoArea,
  VideoAreaSkeleton,
  ChatPanel,
  ControlsPanel,
  RoomHeader,
  RoomHeaderSkeleton,
} from '@/app/consultation/[id]/components';
import {
  type ConsultationRoom as ConsultationRoomType,
  type ChatMessage,
  type CurrentUserInfo,
  getConsultationRoomAction,
  getCurrentUserInfoAction,
  joinRoomAction,
  leaveRoomAction,
  sendChatMessageAction,
  toggleRecordingAction,
} from '@/app/consultation/[id]/actions';

// ============================================================================
// TYPES
// ============================================================================

interface ConsultationRoomProps {
  roomId: string;
  serverUrl?: string;
  onLeave?: () => void;
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function LoadingState() {
  return (
    <div className="h-screen flex flex-col bg-background">
      <RoomHeaderSkeleton />
      <div className="flex-1 flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
            <h2 className="text-lg font-semibold mb-2">Se conectează...</h2>
            <p className="text-sm text-muted-foreground">
              Se inițializează camera de consultație video
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ErrorState({
  error,
  onBack,
  onRetry,
}: {
  error: string | null;
  onBack: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="flex-1 flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-lg font-semibold mb-2">Eroare de conexiune</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {error ?? 'Nu s-a putut conecta la camera de consultație'}
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={onBack}>
                Înapoi
              </Button>
              <Button onClick={onRetry}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reîncearcă
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface RoomViewProps {
  room: ConsultationRoomType;
  currentUser: CurrentUserInfo;
  localStream: MediaStream | null;
  duration: number;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isChatOpen: boolean;
  isRecording: boolean;
  messages: ChatMessage[];
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onToggleRecording: () => void;
  onSendMessage: (content: string) => void;
}

function RoomView({
  room,
  currentUser,
  localStream,
  duration,
  isMuted,
  isVideoOff,
  isScreenSharing,
  isChatOpen,
  isRecording,
  messages,
  onLeave,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onToggleChat,
  onToggleRecording,
  onSendMessage,
}: RoomViewProps) {
  return (
    <div className="h-screen flex flex-col bg-background">
      <RoomHeader room={room} duration={duration} onBack={onLeave} />
      <div className="flex-1 flex overflow-hidden">
        <VideoArea
          participants={room.participants}
          localStream={localStream}
          isLocalVideoOff={isVideoOff}
          currentUserId={currentUser.id}
        />
        <ChatPanel
          messages={messages}
          currentUserId={currentUser.id}
          isOpen={isChatOpen}
          onClose={() => onToggleChat()}
          onSendMessage={onSendMessage}
        />
      </div>
      <ControlsPanel
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        isScreenSharing={isScreenSharing}
        isChatOpen={isChatOpen}
        isRecording={isRecording}
        participantCount={room.participants.length}
        onToggleMute={onToggleMute}
        onToggleVideo={onToggleVideo}
        onToggleScreenShare={onToggleScreenShare}
        onToggleChat={onToggleChat}
        onToggleRecording={onToggleRecording}
        onLeave={onLeave}
      />
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ConsultationRoom({
  roomId,
  serverUrl: _serverUrl = 'wss://talk.medicalcor.ro',
  onLeave,
}: ConsultationRoomProps) {
  const router = useRouter();

  // Room state
  const [room, setRoom] = useState<ConsultationRoomType | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUserInfo | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState<string | null>(null);

  // Media state
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // UI state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [duration, setDuration] = useState(0);

  // Refs
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize room
  useEffect(() => {
    async function initialize() {
      try {
        setConnectionStatus('connecting');
        const [roomData, userData] = await Promise.all([
          getConsultationRoomAction(roomId),
          getCurrentUserInfoAction(),
        ]);

        if (!roomData) {
          setError('Camera de consultație nu a fost găsită');
          setConnectionStatus('error');
          return;
        }

        if (!userData) {
          setError('Trebuie să fiți autentificat');
          setConnectionStatus('error');
          return;
        }

        setRoom(roomData);
        setCurrentUser(userData);
        setIsRecording(roomData.recordingEnabled);

        const joinResult = await joinRoomAction(roomId);
        if (!joinResult.success) {
          setError(joinResult.error ?? 'Nu s-a putut alătura');
          setConnectionStatus('error');
          return;
        }

        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          setLocalStream(stream);
        } catch {
          console.warn('Could not access media devices');
        }

        setConnectionStatus('connected');
        durationIntervalRef.current = setInterval(() => setDuration((p) => p + 1), 1000);
      } catch (err) {
        console.error('Failed to initialize room:', err);
        setError('A apărut o eroare la conectare');
        setConnectionStatus('error');
      }
    }

    void initialize();

    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      localStream?.getTracks().forEach((t) => t.stop());
    };
  }, [roomId]);

  const handleLeave = useCallback(async () => {
    try {
      await leaveRoomAction(roomId);
    } finally {
      localStream?.getTracks().forEach((t) => t.stop());
      if (onLeave) {
        onLeave();
      } else {
        router.push('/telemedicine');
      }
    }
  }, [roomId, localStream, onLeave, router]);

  const handleToggleMute = useCallback(() => {
    localStream?.getAudioTracks().forEach((t) => (t.enabled = isMuted));
    setIsMuted(!isMuted);
  }, [localStream, isMuted]);

  const handleToggleVideo = useCallback(() => {
    localStream?.getVideoTracks().forEach((t) => (t.enabled = isVideoOff));
    setIsVideoOff(!isVideoOff);
  }, [localStream, isVideoOff]);

  const handleToggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      setIsScreenSharing(false);
    } else {
      try {
        const ss = await navigator.mediaDevices.getDisplayMedia({ video: true });
        ss.getVideoTracks()[0].addEventListener('ended', () => setIsScreenSharing(false));
        setIsScreenSharing(true);
      } catch {
        console.warn('Screen sharing cancelled');
      }
    }
  }, [isScreenSharing]);

  const handleToggleRecording = useCallback(async () => {
    const result = await toggleRecordingAction(roomId, !isRecording);
    if (result.success) setIsRecording(!isRecording);
  }, [roomId, isRecording]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      const message = await sendChatMessageAction(roomId, content);
      if (message) setMessages((prev) => [...prev, message]);
    },
    [roomId]
  );

  const handleRetry = useCallback(() => {
    setError(null);
    setConnectionStatus('connecting');
    window.location.reload();
  }, []);

  const handleBack = useCallback(() => router.push('/telemedicine'), [router]);

  if (connectionStatus === 'connecting') return <LoadingState />;
  if (connectionStatus === 'error' || error) {
    return <ErrorState error={error} onBack={handleBack} onRetry={handleRetry} />;
  }
  if (!room || !currentUser) return null;

  return (
    <RoomView
      room={room}
      currentUser={currentUser}
      localStream={localStream}
      duration={duration}
      isMuted={isMuted}
      isVideoOff={isVideoOff}
      isScreenSharing={isScreenSharing}
      isChatOpen={isChatOpen}
      isRecording={isRecording}
      messages={messages}
      onLeave={handleLeave}
      onToggleMute={handleToggleMute}
      onToggleVideo={handleToggleVideo}
      onToggleScreenShare={handleToggleScreenShare}
      onToggleChat={() => setIsChatOpen(!isChatOpen)}
      onToggleRecording={handleToggleRecording}
      onSendMessage={handleSendMessage}
    />
  );
}

export function ConsultationRoomSkeleton() {
  return (
    <div className="h-screen flex flex-col bg-background">
      <RoomHeaderSkeleton />
      <VideoAreaSkeleton />
      <div className="h-20 bg-background border-t" />
    </div>
  );
}
