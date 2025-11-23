import { Suspense } from 'react';
// import { notFound } from 'next/navigation'; // Will be used when fetching real data
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Phone,
  MessageSquare,
  CreditCard,
  Calendar,
  Clock,
  ArrowLeft,
  Send,
  Activity,
  User,
  FileText,
} from 'lucide-react';
import Link from 'next/link';

// Mock patient data - will be fetched via Server Actions
const mockPatient = {
  id: '1',
  phone: '+40721123456',
  name: 'Ion Popescu',
  email: 'ion.popescu@email.com',
  hubspotContactId: 'hs_123456',
  lifecycleStage: 'lead',
  leadScore: 5,
  classification: 'HOT',
  language: 'ro',
  firstTouch: '2024-11-20T10:30:00Z',
  lastActivity: '2024-11-23T14:22:00Z',
  procedureInterest: ['All-on-X', 'implant'],
  totalSpent: 0,
  appointmentsCount: 0,
};

// Mock timeline events
const mockTimeline = [
  {
    id: '1',
    type: 'whatsapp.message.received',
    timestamp: '2024-11-23T14:22:00Z',
    data: {
      direction: 'IN',
      content: 'Bună ziua, sunt interesat de All-on-4. Puteți să îmi spuneți prețul?',
    },
  },
  {
    id: '2',
    type: 'lead.scored',
    timestamp: '2024-11-23T14:22:05Z',
    data: {
      score: 5,
      classification: 'HOT',
      confidence: 0.92,
      reasoning: 'All-on-X interest with budget inquiry - high intent',
    },
  },
  {
    id: '3',
    type: 'whatsapp.message.sent',
    timestamp: '2024-11-23T14:22:30Z',
    data: {
      direction: 'OUT',
      content: 'Bună ziua! Mulțumim pentru interes. Prețul pentru All-on-4 începe de la €4,500...',
    },
  },
  {
    id: '4',
    type: 'hubspot.task.created',
    timestamp: '2024-11-23T14:23:00Z',
    data: {
      subject: 'HOT LEAD: Follow-up All-on-X inquiry',
      priority: 'HIGH',
    },
  },
  {
    id: '5',
    type: 'voice.call.initiated',
    timestamp: '2024-11-20T10:30:00Z',
    data: {
      direction: 'inbound',
      duration: 180,
      transcript: 'Bună ziua, vreau să fac o programare pentru implant...',
    },
  },
];

function getEventIcon(type: string) {
  if (type.includes('whatsapp')) return <MessageSquare className="h-4 w-4" />;
  if (type.includes('voice')) return <Phone className="h-4 w-4" />;
  if (type.includes('payment')) return <CreditCard className="h-4 w-4" />;
  if (type.includes('scored')) return <Activity className="h-4 w-4" />;
  if (type.includes('task')) return <FileText className="h-4 w-4" />;
  return <Clock className="h-4 w-4" />;
}

function getEventColor(type: string) {
  if (type.includes('whatsapp')) return 'bg-emerald-500';
  if (type.includes('voice')) return 'bg-blue-500';
  if (type.includes('payment')) return 'bg-purple-500';
  if (type.includes('scored')) return 'bg-amber-500';
  if (type.includes('task')) return 'bg-gray-500';
  return 'bg-gray-400';
}

function formatEventTitle(type: string) {
  const titles: Record<string, string> = {
    'whatsapp.message.received': 'Mesaj WhatsApp primit',
    'whatsapp.message.sent': 'Mesaj WhatsApp trimis',
    'voice.call.initiated': 'Apel vocal',
    'voice.call.completed': 'Apel finalizat',
    'lead.scored': 'Lead scorat de AI',
    'hubspot.task.created': 'Task creat în HubSpot',
    'payment.received': 'Plată primită',
  };
  return titles[type] ?? type;
}

interface TimelineEventData {
  direction?: string;
  content?: string;
  score?: number;
  confidence?: number;
  reasoning?: string;
  subject?: string;
  priority?: string;
  duration?: number;
  transcript?: string;
}

interface TimelineEvent {
  id: string;
  type: string;
  timestamp: string;
  data: TimelineEventData;
}

function TimelineItem({ event }: { event: TimelineEvent }) {
  const date = new Date(event.timestamp);

  return (
    <div className="relative flex gap-4 pb-8 last:pb-0">
      {/* Timeline line */}
      <div className="absolute left-[11px] top-6 h-full w-0.5 bg-border last:hidden" />

      {/* Icon */}
      <div
        className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-white ${getEventColor(event.type)}`}
      >
        {getEventIcon(event.type)}
      </div>

      {/* Content */}
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="font-medium">{formatEventTitle(event.type)}</span>
          <span className="text-xs text-muted-foreground">
            {date.toLocaleDateString('ro-RO')}{' '}
            {date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Event specific content */}
        {event.data.content && (
          <p className="mt-1 rounded-lg bg-muted p-3 text-sm">{event.data.content}</p>
        )}

        {event.data.score !== undefined && (
          <div className="mt-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Badge variant={event.data.score >= 4 ? 'hot' : 'warm'}>
                Score: {event.data.score}/5
              </Badge>
              {event.data.confidence !== undefined && (
                <span className="text-xs text-muted-foreground">
                  {Math.round(event.data.confidence * 100)}% confidence
                </span>
              )}
            </div>
            {event.data.reasoning && (
              <p className="mt-1 text-sm italic text-muted-foreground">
                &quot;{event.data.reasoning}&quot;
              </p>
            )}
          </div>
        )}

        {event.data.subject && (
          <div className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium">{event.data.subject}</span>
            {event.data.priority && (
              <Badge variant="outline" className="ml-2 text-xs">
                {event.data.priority}
              </Badge>
            )}
          </div>
        )}

        {event.data.duration !== undefined && (
          <p className="mt-1 text-sm text-muted-foreground">Durata: {event.data.duration}s</p>
        )}
      </div>
    </div>
  );
}

function PatientHeader({ patient }: { patient: typeof mockPatient }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl">{patient.name || patient.phone}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Phone className="h-3 w-3" />
                {patient.phone}
                {patient.email && (
                  <>
                    <span>•</span>
                    {patient.email}
                  </>
                )}
              </CardDescription>
            </div>
          </div>
          <Badge
            variant={
              patient.classification === 'HOT'
                ? 'hot'
                : patient.classification === 'WARM'
                  ? 'warm'
                  : 'cold'
            }
            className="text-lg px-4 py-1"
          >
            {patient.classification} ({patient.leadScore}/5)
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-sm text-muted-foreground">Lifecycle Stage</p>
            <p className="font-medium capitalize">{patient.lifecycleStage}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Limbă</p>
            <p className="font-medium uppercase">{patient.language}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Interes Proceduri</p>
            <div className="flex flex-wrap gap-1">
              {patient.procedureInterest.map((proc) => (
                <Badge key={proc} variant="outline" className="text-xs">
                  {proc}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Ultima Activitate</p>
            <p className="font-medium">
              {new Date(patient.lastActivity).toLocaleDateString('ro-RO')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Acțiuni Rapide</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="gap-2">
          <MessageSquare className="h-4 w-4" />
          Trimite Template
        </Button>
        <Button variant="outline" className="gap-2">
          <Phone className="h-4 w-4" />
          Inițiază Apel
        </Button>
        <Button variant="outline" className="gap-2">
          <Calendar className="h-4 w-4" />
          Programează
        </Button>
        <Button variant="outline" className="gap-2">
          <Send className="h-4 w-4" />
          Mesaj Custom
        </Button>
      </CardContent>
    </Card>
  );
}

function PatientSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-48 w-full" />
      <div className="grid gap-6 md:grid-cols-3">
        <Skeleton className="col-span-2 h-96" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // In production, fetch patient data here using Server Actions
  // const patient = await getPatientById(id);
  // For now, use mock data with the ID for demo purposes
  const patient = { ...mockPatient, id };

  // This check will be relevant when fetching real data
  // if (!patient) {
  //   notFound();
  // }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/triage">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Patient 360</h2>
          <p className="text-muted-foreground">Vizualizare completă a interacțiunilor</p>
        </div>
      </div>

      <Suspense fallback={<PatientSkeleton />}>
        <PatientHeader patient={patient} />

        <div className="grid gap-6 md:grid-cols-3">
          {/* Timeline */}
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle>Timeline Interacțiuni</CardTitle>
              <CardDescription>Istoricul complet al comunicării</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                {mockTimeline.map((event) => (
                  <TimelineItem key={event.id} event={event} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Sidebar */}
          <div className="space-y-6">
            <QuickActions />

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Statistici</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total cheltuit</span>
                  <span className="font-medium">€{patient.totalSpent}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Programări</span>
                  <span className="font-medium">{patient.appointmentsCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">HubSpot ID</span>
                  <span className="font-mono text-xs">{patient.hubspotContactId}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </Suspense>
    </div>
  );
}
