'use server';

/**
 * Server Actions for Data Lineage Dashboard
 *
 * Provides data lineage visualization and compliance reporting
 * for the compliance officer view.
 *
 * @module data-lineage/actions
 */

// NOTE: Types are defined locally as the domain service uses real DB connections.
// When integrating with production, import from @medicalcor/core instead.

// =============================================================================
// TYPES
// =============================================================================

export interface LineageDashboardData {
  /** Health status */
  health: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    totalEntries: number;
    oldestEntry?: Date;
    newestEntry?: Date;
    issues: string[];
  };
  /** Recent lineage activity */
  recentActivity: {
    last24h: number;
    last7d: number;
    last30d: number;
  };
  /** Top transformations */
  topTransformations: {
    type: string;
    count: number;
    avgQuality: number;
  }[];
  /** Compliance summary */
  complianceSummary: {
    hipaaEntries: number;
    gdprEntries: number;
    withLegalBasis: number;
    withConsent: number;
  };
  /** Aggregate type distribution */
  aggregateDistribution: {
    type: string;
    count: number;
  }[];
  /** Sensitivity distribution */
  sensitivityDistribution: {
    level: string;
    count: number;
  }[];
  /** Generated at */
  generatedAt: Date;
}

export interface LineageSearchResult {
  entries: LineageEntryView[];
  total: number;
  hasMore: boolean;
}

export interface LineageEntryView {
  id: string;
  targetAggregateId: string;
  targetAggregateType: string;
  transformationType: string;
  transformationDescription?: string;
  sourcesCount: number;
  quality?: {
    confidence: number;
    completeness?: number;
  };
  compliance?: {
    frameworks?: string[];
    legalBasis?: string;
    sensitivity?: string;
  };
  actor?: {
    id: string;
    type: string;
    name?: string;
  };
  createdAt: string;
}

export interface LineageGraphView {
  nodes: {
    id: string;
    type: string;
    label: string;
    sensitivity?: string;
    complianceTags?: string[];
  }[];
  edges: {
    sourceId: string;
    targetId: string;
    transformationType: string;
    timestamp: string;
  }[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    maxDepth: number;
  };
}

export interface ComplianceReportView {
  period: {
    start: string;
    end: string;
  };
  framework: string;
  subject: {
    aggregateId: string;
    aggregateType: string;
  };
  processingActivities: {
    transformationType: string;
    description: string;
    legalBasis?: string;
    purpose?: string;
    count: number;
    firstOccurrence: string;
    lastOccurrence: string;
  }[];
  dataSources: {
    aggregateType: string;
    count: number;
    sensitivity?: string;
  }[];
  dataRecipients: {
    aggregateType: string;
    transformationType: string;
    count: number;
  }[];
  consents: {
    consentId: string;
    purpose: string;
    grantedAt: string;
    withdrawnAt?: string;
  }[];
  generatedAt: string;
}

// =============================================================================
// MOCK DATA GENERATORS
// =============================================================================

function generateMockDashboardData(): LineageDashboardData {
  const now = new Date();

  return {
    health: {
      status: 'healthy',
      totalEntries: 15234,
      oldestEntry: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000),
      newestEntry: new Date(now.getTime() - 5 * 60 * 1000),
      issues: [],
    },
    recentActivity: {
      last24h: 847,
      last7d: 5421,
      last30d: 15234,
    },
    topTransformations: [
      { type: 'scoring', count: 4521, avgQuality: 0.92 },
      { type: 'enrichment', count: 3842, avgQuality: 0.88 },
      { type: 'ingestion', count: 2956, avgQuality: 0.95 },
      { type: 'consent_processing', count: 1823, avgQuality: 0.99 },
      { type: 'sync', count: 1256, avgQuality: 0.94 },
    ],
    complianceSummary: {
      hipaaEntries: 12456,
      gdprEntries: 8934,
      withLegalBasis: 14521,
      withConsent: 9823,
    },
    aggregateDistribution: [
      { type: 'Lead', count: 5234 },
      { type: 'Patient', count: 4123 },
      { type: 'Appointment', count: 2845 },
      { type: 'Consent', count: 1823 },
      { type: 'Message', count: 1209 },
    ],
    sensitivityDistribution: [
      { level: 'phi', count: 8934 },
      { level: 'pii', count: 4521 },
      { level: 'confidential', count: 1234 },
      { level: 'internal', count: 456 },
      { level: 'public', count: 89 },
    ],
    generatedAt: now,
  };
}

function generateMockLineageEntries(
  offset: number,
  limit: number,
  filters?: {
    aggregateType?: string;
    transformationType?: string;
    framework?: string;
    sensitivity?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }
): LineageSearchResult {
  const aggregateTypes: string[] = ['Lead', 'Patient', 'Appointment', 'Consent', 'Message', 'Case'];
  const transformationTypes: string[] = [
    'scoring',
    'enrichment',
    'ingestion',
    'consent_processing',
    'sync',
    'validation',
  ];
  const sensitivities: string[] = ['phi', 'pii', 'confidential', 'internal', 'public'];
  const frameworks: string[][] = [['HIPAA'], ['GDPR'], ['HIPAA', 'GDPR'], ['HIPAA', 'SOC2'], []];
  const legalBases: (string | undefined)[] = [
    'consent',
    'contract',
    'legal_obligation',
    'legitimate_interests',
    undefined,
  ];
  const actorTypes: string[] = ['user', 'system', 'api', 'integration', 'cron'];

  // Generate total based on filters
  let total = 15234;
  if (filters?.aggregateType) total = Math.floor(total / 5);
  if (filters?.transformationType) total = Math.floor(total / 6);
  if (filters?.framework) total = Math.floor(total / 4);
  if (filters?.sensitivity) total = Math.floor(total / 5);
  if (filters?.search) total = Math.floor(total / 10);

  const entries: LineageEntryView[] = [];
  const now = Date.now();

  for (let i = 0; i < Math.min(limit, total - offset); i++) {
    const idx = offset + i;
    const createdAt = new Date(now - (idx * 60 * 1000 + Math.random() * 3600000));

    entries.push({
      id: `lineage-${idx.toString().padStart(6, '0')}`,
      targetAggregateId: `agg-${(idx * 7) % 10000}`,
      targetAggregateType: filters?.aggregateType ?? aggregateTypes[idx % aggregateTypes.length],
      transformationType:
        filters?.transformationType ?? transformationTypes[idx % transformationTypes.length],
      transformationDescription: `${transformationTypes[idx % transformationTypes.length]} operation on ${aggregateTypes[idx % aggregateTypes.length]}`,
      sourcesCount: (idx % 5) + 1,
      quality: {
        confidence: 0.7 + Math.random() * 0.3,
        completeness: 0.8 + Math.random() * 0.2,
      },
      compliance: {
        frameworks: filters?.framework ? [filters.framework] : frameworks[idx % frameworks.length],
        legalBasis: legalBases[idx % legalBases.length],
        sensitivity: filters?.sensitivity ?? sensitivities[idx % sensitivities.length],
      },
      actor: {
        id: `actor-${idx % 20}`,
        type: actorTypes[idx % actorTypes.length],
        name: idx % 3 === 0 ? `User ${idx % 20}` : undefined,
      },
      createdAt: createdAt.toISOString(),
    });
  }

  return {
    entries,
    total,
    hasMore: offset + limit < total,
  };
}

function generateMockGraph(
  aggregateId: string,
  aggregateType: string,
  direction: 'upstream' | 'downstream' | 'both'
): LineageGraphView {
  const nodeTypes = ['Lead', 'Patient', 'Appointment', 'Consent', 'Message', 'Case'];
  const transformTypes = ['scoring', 'enrichment', 'ingestion', 'consent_processing', 'sync'];
  const sensitivities = ['phi', 'pii', 'confidential', 'internal'];

  const nodes: LineageGraphView['nodes'] = [
    {
      id: aggregateId,
      type: aggregateType,
      label: `${aggregateType} (Root)`,
      sensitivity: 'phi',
      complianceTags: ['HIPAA', 'GDPR'],
    },
  ];

  const edges: LineageGraphView['edges'] = [];
  const now = Date.now();

  // Generate upstream nodes
  if (direction === 'upstream' || direction === 'both') {
    for (let i = 0; i < 5; i++) {
      const nodeId = `upstream-${i}`;
      const nodeType = nodeTypes[i % nodeTypes.length];
      nodes.push({
        id: nodeId,
        type: nodeType,
        label: `${nodeType} #${i + 1}`,
        sensitivity: sensitivities[i % sensitivities.length],
        complianceTags: i % 2 === 0 ? ['HIPAA'] : ['GDPR'],
      });
      edges.push({
        sourceId: nodeId,
        targetId: aggregateId,
        transformationType: transformTypes[i % transformTypes.length],
        timestamp: new Date(now - (i + 1) * 3600000).toISOString(),
      });

      // Add second level upstream
      if (i < 3) {
        const secondLevelId = `upstream-${i}-parent`;
        const secondLevelType = nodeTypes[(i + 2) % nodeTypes.length];
        nodes.push({
          id: secondLevelId,
          type: secondLevelType,
          label: `${secondLevelType} (Source)`,
          sensitivity: sensitivities[(i + 1) % sensitivities.length],
        });
        edges.push({
          sourceId: secondLevelId,
          targetId: nodeId,
          transformationType: transformTypes[(i + 1) % transformTypes.length],
          timestamp: new Date(now - (i + 1) * 7200000).toISOString(),
        });
      }
    }
  }

  // Generate downstream nodes
  if (direction === 'downstream' || direction === 'both') {
    for (let i = 0; i < 4; i++) {
      const nodeId = `downstream-${i}`;
      const nodeType = nodeTypes[(i + 2) % nodeTypes.length];
      nodes.push({
        id: nodeId,
        type: nodeType,
        label: `${nodeType} (Derived)`,
        sensitivity: sensitivities[i % sensitivities.length],
        complianceTags: i % 2 === 0 ? ['HIPAA', 'SOC2'] : ['GDPR'],
      });
      edges.push({
        sourceId: aggregateId,
        targetId: nodeId,
        transformationType: transformTypes[(i + 2) % transformTypes.length],
        timestamp: new Date(now - i * 1800000).toISOString(),
      });
    }
  }

  return {
    nodes,
    edges,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      maxDepth: direction === 'both' ? 2 : 2,
    },
  };
}

function generateMockComplianceReport(
  aggregateId: string,
  aggregateType: string,
  framework: string,
  startDate: string,
  endDate: string
): ComplianceReportView {
  const transformTypes = ['scoring', 'enrichment', 'ingestion', 'consent_processing', 'sync'];
  const purposes = ['Patient care', 'Quality improvement', 'Billing', 'Research', 'Marketing'];
  const legalBases = ['consent', 'contract', 'legal_obligation', 'legitimate_interests'];

  return {
    period: {
      start: startDate,
      end: endDate,
    },
    framework,
    subject: {
      aggregateId,
      aggregateType,
    },
    processingActivities: transformTypes.map((type, i) => ({
      transformationType: type,
      description: `${type.charAt(0).toUpperCase() + type.slice(1)} processing activity`,
      legalBasis: legalBases[i % legalBases.length],
      purpose: purposes[i % purposes.length],
      count: Math.floor(Math.random() * 100) + 10,
      firstOccurrence: new Date(Date.parse(startDate) + i * 86400000).toISOString(),
      lastOccurrence: new Date(Date.parse(endDate) - i * 86400000).toISOString(),
    })),
    dataSources: [
      { aggregateType: 'Lead', count: 234, sensitivity: 'pii' },
      { aggregateType: 'Message', count: 156, sensitivity: 'phi' },
      { aggregateType: 'Consent', count: 89, sensitivity: 'pii' },
    ],
    dataRecipients: [
      { aggregateType: 'Patient', transformationType: 'scoring', count: 178 },
      { aggregateType: 'Case', transformationType: 'enrichment', count: 89 },
      { aggregateType: 'TreatmentPlan', transformationType: 'derivation', count: 45 },
    ],
    consents: [
      {
        consentId: 'consent-001',
        purpose: 'Treatment and care',
        grantedAt: startDate,
      },
      {
        consentId: 'consent-002',
        purpose: 'Communications',
        grantedAt: startDate,
        withdrawnAt: undefined,
      },
    ],
    generatedAt: new Date().toISOString(),
  };
}

// =============================================================================
// SERVER ACTIONS
// =============================================================================

/**
 * Get dashboard data for the data lineage overview
 */
export async function getLineageDashboardDataAction(): Promise<LineageDashboardData> {
  // In production, this would use the DataLineageService
  // const service = createDataLineageService({ connectionString: process.env.DATABASE_URL });
  // return service.getDashboardData();

  // Simulate async operation for mock data
  await Promise.resolve();
  return generateMockDashboardData();
}

/**
 * Search lineage entries with filters
 */
export async function searchLineageEntriesAction(params: {
  offset?: number;
  limit?: number;
  aggregateType?: string;
  transformationType?: string;
  framework?: string;
  sensitivity?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}): Promise<LineageSearchResult> {
  const { offset = 0, limit = 20, ...filters } = params;

  await Promise.resolve();
  return generateMockLineageEntries(offset, limit, filters);
}

/**
 * Get lineage graph for an aggregate
 */
export async function getLineageGraphAction(params: {
  aggregateId: string;
  aggregateType: string;
  direction?: 'upstream' | 'downstream' | 'both';
  maxDepth?: number;
}): Promise<LineageGraphView> {
  const { aggregateId, aggregateType, direction = 'both' } = params;

  await Promise.resolve();
  return generateMockGraph(aggregateId, aggregateType, direction);
}

/**
 * Get a single lineage entry by ID
 */
export async function getLineageEntryAction(entryId: string): Promise<LineageEntryView | null> {
  await Promise.resolve();
  const result = generateMockLineageEntries(0, 1);
  if (result.entries.length > 0) {
    return { ...result.entries[0], id: entryId };
  }
  return null;
}

/**
 * Generate a compliance report
 */
export async function generateComplianceReportAction(params: {
  aggregateId: string;
  aggregateType: string;
  framework: string;
  startDate: string;
  endDate: string;
}): Promise<ComplianceReportView> {
  await Promise.resolve();
  return generateMockComplianceReport(
    params.aggregateId,
    params.aggregateType,
    params.framework,
    params.startDate,
    params.endDate
  );
}

/**
 * Get aggregate types for filter dropdown
 */
export async function getAggregateTypesAction(): Promise<string[]> {
  await Promise.resolve();
  return [
    'Lead',
    'Patient',
    'Contact',
    'Appointment',
    'Consent',
    'Message',
    'Case',
    'TreatmentPlan',
    'Payment',
    'User',
    'Clinic',
  ];
}

/**
 * Get transformation types for filter dropdown
 */
export async function getTransformationTypesAction(): Promise<string[]> {
  await Promise.resolve();
  return [
    'ingestion',
    'enrichment',
    'scoring',
    'aggregation',
    'transformation',
    'derivation',
    'validation',
    'pattern_detection',
    'insight_generation',
    'routing_decision',
    'consent_processing',
    'sync',
    'manual_update',
    'system_update',
    'merge',
    'anonymization',
  ];
}

/**
 * Get compliance frameworks for filter dropdown
 */
export async function getComplianceFrameworksAction(): Promise<string[]> {
  await Promise.resolve();
  return ['HIPAA', 'GDPR', 'PCI', 'SOC2', 'CCPA'];
}

/**
 * Get data sensitivity levels for filter dropdown
 */
export async function getSensitivityLevelsAction(): Promise<string[]> {
  await Promise.resolve();
  return ['public', 'internal', 'confidential', 'restricted', 'phi', 'pii'];
}
