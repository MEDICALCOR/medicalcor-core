import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Activity,
  Calendar,
  FileText,
  StickyNote,
  Heart,
  AlertTriangle,
  Pill,
  DollarSign,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  PatientHeader,
  PatientTimeline,
  PatientAppointments,
  PatientDocuments,
  PatientNotes,
} from '@/components/patients';
import { getPatientByIdAction, type PatientDetailData } from '@/app/actions/get-patients';
import { AuthorizationError } from '@/lib/auth/server-action-auth';
import type { PatientDetail } from '@/lib/patients/types';

interface PageProps {
  params: Promise<{ id: string }>;
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
        <Link href="/patients">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Înapoi la pacienți
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

/**
 * Convert HubSpot contact data to PatientDetail format
 * Note: HubSpot doesn't store detailed medical data, so we use empty defaults
 */
function toPatientDetail(data: PatientDetailData): PatientDetail {
  const name = [data.firstName, data.lastName].filter(Boolean).join(' ') || data.phone;
  return {
    id: data.id,
    firstName: data.firstName,
    lastName: data.lastName,
    contact: {
      phone: data.phone,
      email: data.email,
      preferredChannel: 'phone',
    },
    status: data.lifecycleStage === 'customer' ? 'patient' : 'lead',
    source: data.source === 'facebook' ? 'facebook' : data.source === 'google' ? 'google' : data.source === 'referral' ? 'referral' : 'website',
    tags: data.procedureInterest ?? [],
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
    // Medical info - HubSpot doesn't store this, use empty defaults
    medicalHistory: undefined,
    allergies: [],
    currentMedications: [],
    // Related data - would come from separate data sources
    appointments: [],
    documents: [],
    activities: [],
    notes: [],
    procedures: [],
    // Stats
    totalSpent: 0,
    appointmentCount: 0,
    assignedTo: undefined,
  };
}

export default async function PatientDetailPage({ params }: PageProps) {
  const { id } = await params;

  let patientData: PatientDetailData | null = null;
  let accessDenied = false;

  try {
    // Fetch patient data with IDOR protection
    patientData = await getPatientByIdAction(id);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      accessDenied = true;
    } else {
      console.error('[PatientDetailPage] Error fetching patient:', error);
    }
  }

  // Handle access denied
  if (accessDenied) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/patients">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Înapoi la pacienți
            </Link>
          </Button>
        </div>
        <AccessDenied />
      </div>
    );
  }

  // Handle patient not found
  if (!patientData) {
    notFound();
  }

  // Convert to PatientDetail format for components
  const patient = toPatientDetail(patientData);

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/patients">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Înapoi la pacienți
          </Link>
        </Button>
      </div>

      {/* Patient Header */}
      <PatientHeader patient={patient} />

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Programări</p>
                <p className="text-xl font-bold">{patient.appointmentCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total cheltuit</p>
                <p className="text-xl font-bold">{patient.totalSpent?.toLocaleString()} RON</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Documente</p>
                <p className="text-xl font-bold">{patient.documents.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                <Activity className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Activități</p>
                <p className="text-xl font-bold">{patient.activities.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content with Tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Tabs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="timeline">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="timeline" className="gap-2">
                <Activity className="h-4 w-4" />
                Activitate
              </TabsTrigger>
              <TabsTrigger value="appointments" className="gap-2">
                <Calendar className="h-4 w-4" />
                Programări
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-2">
                <FileText className="h-4 w-4" />
                Documente
              </TabsTrigger>
              <TabsTrigger value="notes" className="gap-2">
                <StickyNote className="h-4 w-4" />
                Note
              </TabsTrigger>
            </TabsList>

            <TabsContent value="timeline" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Istoric activitate</CardTitle>
                </CardHeader>
                <CardContent>
                  <PatientTimeline activities={patient.activities} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="appointments" className="mt-6">
              <Card>
                <CardContent className="pt-6">
                  <PatientAppointments appointments={patient.appointments} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="mt-6">
              <Card>
                <CardContent className="pt-6">
                  <PatientDocuments documents={patient.documents} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notes" className="mt-6">
              <Card>
                <CardContent className="pt-6">
                  <PatientNotes notes={patient.notes} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column - Medical Info */}
        <div className="space-y-6">
          {/* Medical History */}
          {patient.medicalHistory && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Heart className="h-4 w-4 text-red-500" />
                  Istoric medical
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{patient.medicalHistory}</p>
              </CardContent>
            </Card>
          )}

          {/* Allergies */}
          {patient.allergies && patient.allergies.length > 0 && (
            <Card className="border-red-200 bg-red-50/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  Alergii
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {patient.allergies.map((allergy) => (
                    <Badge key={allergy} variant="destructive">
                      {allergy}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Current Medications */}
          {patient.currentMedications && patient.currentMedications.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Pill className="h-4 w-4 text-blue-500" />
                  Medicație curentă
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {patient.currentMedications.map((med) => (
                    <li key={med} className="text-sm flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      {med}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Assigned To */}
          {patient.assignedTo && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Responsabil</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-medium text-primary">
                      {patient.assignedTo
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-sm">{patient.assignedTo}</p>
                    <p className="text-xs text-muted-foreground">Medic responsabil</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* HubSpot Info Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informații HubSpot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Lead Score</span>
                <span className="font-medium">{patientData.leadScore ?? 0}/5</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Clasificare</span>
                <Badge variant={patientData.classification === 'HOT' ? 'hot' : patientData.classification === 'WARM' ? 'warm' : 'cold'}>
                  {patientData.classification}
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">HubSpot ID</span>
                <span className="font-mono text-xs">{patientData.hubspotContactId}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
