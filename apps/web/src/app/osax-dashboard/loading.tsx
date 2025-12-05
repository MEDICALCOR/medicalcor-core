import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Loading skeleton for OSAX Dashboard
 * 
 * Matches the exact layout structure to prevent layout shift.
 * Medical-grade: Zero layout shift, instant perceived load.
 */
export default function OsaxDashboardLoading() {
  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Header skeleton */}
      <div>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-96 mt-2" />
      </div>

      {/* Statistics Cards skeleton - matches StatisticsSection */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-8 rounded" />
                <Skeleton className="h-8 w-16" />
              </div>
              <Skeleton className="h-4 w-24 mt-4" />
              <Skeleton className="h-3 w-16 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Filters skeleton */}
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>

      {/* Cases Table skeleton - matches OsaxCaseTable structure */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          {/* Table header */}
          <div className="bg-gray-50 border-b">
            <div className="grid grid-cols-9 gap-4 px-6 py-3">
              {['Case #', 'Status', 'Priority', 'Severity', 'AHI', 'Treatment', 'Specialist', 'Created', 'Actions'].map(
                (header) => (
                  <Skeleton key={header} className="h-4 w-full" />
                )
              )}
            </div>
          </div>
          {/* Table rows */}
          <div className="divide-y divide-gray-200">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="grid grid-cols-9 gap-4 px-6 py-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
                <div className="flex gap-2">
                  <Skeleton className="h-7 w-16 rounded" />
                  <Skeleton className="h-7 w-20 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}



