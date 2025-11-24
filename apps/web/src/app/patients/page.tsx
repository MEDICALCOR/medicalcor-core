'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Phone,
  Mail,
  User,
  Search,
  Loader2,
  AlertCircle,
  Filter,
  Download,
  UserPlus,
} from 'lucide-react';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import {
  getPatientsActionPaginated,
  type PatientListItem,
} from '@/app/actions/get-patients';

function PatientCard({ patient }: { patient: PatientListItem }) {
  const statusColors = {
    lead: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    archived: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  };

  const classificationColors = {
    HOT: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    WARM: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    COLD: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  };

  return (
    <Link href={`/patients/${patient.id}`}>
      <Card className="cursor-pointer transition-all hover:shadow-md hover:ring-1 hover:ring-primary/20">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">
                  {patient.firstName} {patient.lastName}
                </h3>
                <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                  {patient.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {patient.phone}
                    </span>
                  )}
                  {patient.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {patient.email}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <Badge className={statusColors[patient.status]}>{patient.status}</Badge>
              {patient.classification && (
                <Badge
                  variant="outline"
                  className={classificationColors[patient.classification]}
                >
                  {patient.classification}
                </Badge>
              )}
            </div>
          </div>

          {patient.procedureInterest && (
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">
                Procedură: {patient.procedureInterest}
              </p>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Sursă:{' '}
              {patient.source
                .replace('_', ' ')
                .split(' ')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ')}
            </span>
            {patient.leadScore !== undefined && <span>Score: {patient.leadScore}/5</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function PatientCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <Skeleton className="h-6 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <PatientCardSkeleton key={i} />
      ))}
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <Card className="border-destructive/50">
      <CardContent className="flex flex-col items-center justify-center p-12 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
        <h3 className="mb-2 text-lg font-semibold">Eroare la încărcarea pacienților</h3>
        <p className="mb-4 text-sm text-muted-foreground">{error.message}</p>
        <Button onClick={onRetry} variant="outline">
          Încearcă din nou
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center p-12 text-center">
        <User className="mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-2 text-lg font-semibold">Niciun pacient găsit</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Nu există încă pacienți sau lead-uri în sistem.
        </p>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Adaugă pacient
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PatientsPage() {
  const {
    items: patients,
    isInitialLoading,
    isLoadingMore,
    error,
    hasMore,
    total,
    loadMore,
    refresh,
    observerRef,
  } = useInfiniteScroll({
    fetchPage: useCallback(
      (cursor?: string) => getPatientsActionPaginated({ cursor, pageSize: 20 }),
      []
    ),
  });

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pacienți și Lead-uri</h1>
          <p className="mt-2 text-muted-foreground">
            {total !== undefined ? `Total: ${total} pacienți` : 'Gestionează lista de pacienți'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" />
            Filtrează
          </Button>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button size="sm">
            <UserPlus className="mr-2 h-4 w-4" />
            Adaugă pacient
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Caută după nume, telefon sau email..."
              className="pl-10"
              disabled={isInitialLoading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {isInitialLoading && <LoadingState />}

      {/* Error State */}
      {error && !isInitialLoading && <ErrorState error={error} onRetry={refresh} />}

      {/* Empty State */}
      {!isInitialLoading && !error && patients.length === 0 && <EmptyState />}

      {/* Patient List */}
      {!isInitialLoading && !error && patients.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {patients.map((patient) => (
              <PatientCard key={patient.id} patient={patient} />
            ))}
          </div>

          {/* Infinite Scroll Trigger */}
          {hasMore && (
            <div ref={observerRef} className="mt-8 flex justify-center py-4">
              {isLoadingMore ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Se încarcă mai mulți pacienți...</span>
                </div>
              ) : (
                <Button variant="outline" onClick={() => void loadMore()}>
                  Încarcă mai mulți pacienți
                </Button>
              )}
            </div>
          )}

          {/* End of List */}
          {!hasMore && patients.length > 0 && (
            <div className="mt-8 text-center text-sm text-muted-foreground">
              Ai ajuns la sfârșitul listei ({patients.length} pacienți încărcați)
            </div>
          )}
        </>
      )}
    </div>
  );
}
