'use client';

import { useParams, useRouter } from 'next/navigation';
import { ConsultationRoom } from '@/components/medicalcor-talk';

export default function ConsultationPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;

  return (
    <ConsultationRoom
      roomId={roomId}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_SERVER_URL ?? 'wss://talk.medicalcor.ro'}
      onLeave={() => router.push('/telemedicine')}
    />
  );
}
