'use server';

/**
 * Server Actions for OSAX Dashboard
 *
 * These actions fetch OSAX case data from the repository.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface OsaxCaseListItem {
  id: string;
  caseNumber: string;
  status: string;
  priority: string;
  severity: string | null;
  ahi: number | null;
  treatmentType: string | null;
  createdAt: string;
  updatedAt: string;
  assignedSpecialistName: string | null;
  nextFollowUpDate: string | null;
}

export interface OsaxStatistics {
  totalCases: number;
  pendingReview: number;
  activeTreatments: number;
  complianceRate: number;
  casesBySeverity: Record<string, number>;
  casesByStatus: Record<string, number>;
}

export interface GetOsaxCasesOptions {
  status?: string;
  severity?: string;
  priority?: string;
  assignedSpecialistId?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Get OSAX cases with optional filtering
 */
export function getOsaxCases(options: GetOsaxCasesOptions = {}): Promise<OsaxCaseListItem[]> {
  // In production, this would use the actual repository
  // For now, return mock data

  const mockCases: OsaxCaseListItem[] = [
    {
      id: '1',
      caseNumber: 'OSA-2025-00001',
      status: 'SCORED',
      priority: 'URGENT',
      severity: 'SEVERE',
      ahi: 45.2,
      treatmentType: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedSpecialistName: 'Dr. Smith',
      nextFollowUpDate: null,
    },
    {
      id: '2',
      caseNumber: 'OSA-2025-00002',
      status: 'IN_TREATMENT',
      priority: 'NORMAL',
      severity: 'MODERATE',
      ahi: 22.8,
      treatmentType: 'CPAP_THERAPY',
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
      assignedSpecialistName: 'Dr. Johnson',
      nextFollowUpDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '3',
      caseNumber: 'OSA-2025-00003',
      status: 'REVIEWED',
      priority: 'NORMAL',
      severity: 'MILD',
      ahi: 8.5,
      treatmentType: null,
      createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
      assignedSpecialistName: 'Dr. Williams',
      nextFollowUpDate: null,
    },
    {
      id: '4',
      caseNumber: 'OSA-2025-00004',
      status: 'PENDING_STUDY',
      priority: 'LOW',
      severity: null,
      ahi: null,
      treatmentType: null,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
      assignedSpecialistName: null,
      nextFollowUpDate: null,
    },
    {
      id: '5',
      caseNumber: 'OSA-2025-00005',
      status: 'FOLLOW_UP',
      priority: 'NORMAL',
      severity: 'MODERATE',
      ahi: 18.3,
      treatmentType: 'ORAL_APPLIANCE',
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
      assignedSpecialistName: 'Dr. Brown',
      nextFollowUpDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  // Apply filters
  let filteredCases = [...mockCases];

  if (options.status) {
    filteredCases = filteredCases.filter((c) => c.status === options.status);
  }
  if (options.severity) {
    filteredCases = filteredCases.filter((c) => c.severity === options.severity);
  }
  if (options.priority) {
    filteredCases = filteredCases.filter((c) => c.priority === options.priority);
  }

  // Apply pagination
  if (options.limit) {
    const start = options.offset ?? 0;
    filteredCases = filteredCases.slice(start, start + options.limit);
  }

  return Promise.resolve(filteredCases);
}

/**
 * Get a single OSAX case by ID
 */
export async function getOsaxCaseById(id: string): Promise<OsaxCaseListItem | null> {
  const cases = await getOsaxCases();
  return cases.find((c) => c.id === id) ?? null;
}

/**
 * Get OSAX dashboard statistics
 */
export function getOsaxStatistics(): Promise<OsaxStatistics> {
  // In production, this would aggregate from the repository
  return Promise.resolve({
    totalCases: 247,
    pendingReview: 12,
    activeTreatments: 89,
    complianceRate: 78,
    casesBySeverity: {
      NONE: 23,
      MILD: 67,
      MODERATE: 98,
      SEVERE: 59,
    },
    casesByStatus: {
      PENDING_STUDY: 15,
      STUDY_COMPLETED: 8,
      SCORED: 12,
      REVIEWED: 24,
      TREATMENT_PLANNED: 11,
      IN_TREATMENT: 89,
      FOLLOW_UP: 56,
      CLOSED: 32,
    },
  });
}

/**
 * Get cases needing urgent attention
 */
export async function getUrgentCases(): Promise<OsaxCaseListItem[]> {
  return getOsaxCases({ priority: 'URGENT' });
}

/**
 * Get cases pending review
 */
export async function getPendingReviewCases(): Promise<OsaxCaseListItem[]> {
  return getOsaxCases({ status: 'SCORED' });
}

/**
 * Get cases with overdue follow-ups
 */
export async function getOverdueFollowUpCases(): Promise<OsaxCaseListItem[]> {
  const cases = await getOsaxCases();
  const now = new Date();

  return cases.filter((c) => {
    if (!c.nextFollowUpDate) return false;
    return new Date(c.nextFollowUpDate) < now;
  });
}

/**
 * Get severity distribution for charts
 */
export async function getSeverityDistribution(): Promise<{ severity: string; count: number }[]> {
  const stats = await getOsaxStatistics();

  return Object.entries(stats.casesBySeverity).map(([severity, count]) => ({
    severity,
    count,
  }));
}

/**
 * Get treatment type distribution
 */
export function getTreatmentDistribution(): Promise<{ type: string; count: number }[]> {
  // In production, aggregate from repository
  return Promise.resolve([
    { type: 'CPAP_THERAPY', count: 52 },
    { type: 'BIPAP_THERAPY', count: 12 },
    { type: 'ORAL_APPLIANCE', count: 18 },
    { type: 'POSITIONAL_THERAPY', count: 8 },
    { type: 'LIFESTYLE_MODIFICATION', count: 24 },
  ]);
}
