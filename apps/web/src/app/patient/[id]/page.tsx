import { Suspense } from 'react';
import { notFound } from 'next/navigation';
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
  ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';
import { getPatientByIdAction, getPatientTimelineAction, type PatientDetailData, type PatientTimelineEvent } from '@/app/actions/get-patients';
import { AuthorizationError } from '@/lib/auth/server-action-auth';

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

function PatientHeader({ patient }: { patient: PatientDetailData }) {
  const name = [patient.firstName, patient.lastName].filter(Boolean).join(' ') || patient.phone;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl">{name}</CardTitle>
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
            {patient.classification} ({patient.leadScore ?? 0}/5)
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-sm text-muted-foreground">Lifecycle Stage</p>
            <p className="font-medium capitalize">{patient.lifecycleStage ?? 'lead'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Limbă</p>
            <p className="font-medium uppercase">{patient.language ?? 'ro'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Interes Proceduri</p>
            <div className="flex flex-wrap gap-1">
              {(patient.procedureInterest ?? []).map((proc) => (
                <Badge key={proc} variant="outline" className="text-xs">
                  {proc}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Ultima Activitate</p>
            <p className="font-medium">
              {new Date(patient.updatedAt).toLocaleDateString('ro-RO')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AccessDenied() {
  return (
    <Card className="border-destructive">
      <CardHeader>
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <CardTitle className="text-destructive">Acces Interzis</CardTitle>
            <CardDescription>
              Nu aveți permisiunea de a accesa acest pacient.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Contactați administratorul pentru a solicita acces.
        </p>
        <Link href="/triage">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Înapoi la Triage
          </Button>
        </Link>
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

  let patient: PatientDetailData | null = null;
  let timeline: PatientTimelineEvent[] = [];
  let accessDenied = false;

  try {
    // Fetch patient data with IDOR protection
    [patient, timeline] = await Promise.all([
      getPatientByIdAction(id),
      getPatientTimelineAction(id),
    ]);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      accessDenied = true;
    } else {
      console.error('[PatientPage] Error fetching patient:', error);
    }
  }

  // Handle access denied
  if (accessDenied) {
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
        <AccessDenied />
      </div>
    );
  }

  // Handle patient not found
  if (!patient) {
    notFound();
  }

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
              {timeline.length > 0 ? (
                <div className="space-y-0">
                  {timeline.map((event) => (
                    <TimelineItem key={event.id} event={event} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nu există evenimente în timeline.
                </p>
              )}
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
                  <span className="text-muted-foreground">Lead Score</span>
                  <span className="font-medium">{patient.leadScore ?? 0}/5</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Clasificare</span>
                  <Badge variant={patient.classification === 'HOT' ? 'hot' : patient.classification === 'WARM' ? 'warm' : 'cold'}>
                    {patient.classification}
                  </Badge>
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
