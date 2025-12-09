import { schedules, logger } from '@trigger.dev/sdk/v3';
import {
  getClients,
  getSupabaseClient,
  generateCorrelationId,
  ninetyDaysAgo,
  processBatch,
  emitJobEvent,
  type HubSpotContactResult,
} from './cron-shared.js';

/**
 * Maintenance-related cron jobs
 * - Stale lead cleanup
 * - Nightly knowledge ingest
 * - CRM health monitoring
 * - Database partition maintenance (monthly and daily)
 */

// ============================================
// Stale Lead Cleanup
// ============================================

/**
 * Stale lead cleanup - archives old unresponsive leads
 * Runs every Sunday at 3:00 AM
 */
export const staleLeadCleanup = schedules.task({
  id: 'stale-lead-cleanup',
  cron: '0 3 * * 0', // 3:00 AM every Sunday
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting stale lead cleanup', { correlationId });

    const { hubspot, eventStore } = getClients();

    if (!hubspot) {
      logger.warn('HubSpot client not configured, skipping cleanup', { correlationId });
      return { success: false, reason: 'HubSpot not configured', leadsArchived: 0 };
    }

    let leadsArchived = 0;
    let errors = 0;

    try {
      // Find leads with no activity in 90 days
      const staleLeads = await hubspot.searchContacts({
        filterGroups: [
          {
            filters: [
              { propertyName: 'notes_last_updated', operator: 'LT', value: ninetyDaysAgo() },
              { propertyName: 'lifecyclestage', operator: 'NEQ', value: 'customer' },
              { propertyName: 'lead_status', operator: 'NEQ', value: 'archived' },
            ],
          },
        ],
        properties: ['phone', 'email', 'firstname', 'lead_status', 'notes_last_updated'],
        limit: 100,
      });

      logger.info(`Found ${staleLeads.total} stale leads to archive`, { correlationId });

      // Process leads in batches
      const batchResult = await processBatch(
        staleLeads.results as HubSpotContactResult[],
        async (lead) => {
          await hubspot.updateContact(lead.id, {
            lead_status: 'archived',
            archived_date: new Date().toISOString(),
            archived_reason: 'No activity for 90+ days',
          });
        },
        logger
      );

      leadsArchived = batchResult.successes;
      errors = batchResult.errors.length;

      // Log individual errors
      for (const { item, error } of batchResult.errors) {
        const lead = item;
        logger.error('Failed to archive lead', { leadId: lead.id, error, correlationId });
      }

      // Emit job completion event
      await emitJobEvent(eventStore, 'cron.stale_lead_cleanup.completed', {
        leadsFound: staleLeads.total,
        leadsArchived,
        errors,
        correlationId,
      });

      logger.info('Stale lead cleanup completed', { leadsArchived, errors, correlationId });
    } catch (error) {
      logger.error('Stale lead cleanup failed', { error, correlationId });
      return { success: false, error: String(error), leadsArchived };
    }

    return { success: true, leadsArchived, errors };
  },
});

// ============================================
// Nightly Knowledge Ingest
// ============================================

/**
 * Nightly knowledge base ingest - re-indexes knowledge base documents
 * Runs every day at 2:30 AM
 */
export const nightlyKnowledgeIngest = schedules.task({
  id: 'nightly-knowledge-ingest',
  cron: '30 2 * * *', // 2:30 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting nightly knowledge ingest', { correlationId });

    const { eventStore } = getClients();

    try {
      // Run the ingest script via child process
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const startTime = Date.now();

      // Execute the ingest script with tsx
      const { stdout, stderr } = await execAsync('pnpm tsx scripts/ingest-knowledge.ts', {
        cwd: process.cwd(),
        env: {
          ...process.env,
        },
        timeout: 300000, // 5 minute timeout
      });

      const duration = Date.now() - startTime;

      if (stderr.trim()) {
        logger.warn('Ingest script stderr', { stderr: stderr.trim(), correlationId });
      }

      // Parse results from stdout
      const entriesMatch = /Entries inserted: (\d+)/.exec(stdout);
      const updatedMatch = /Entries updated: (\d+)/.exec(stdout);
      const filesMatch = /Files processed: (\d+)/.exec(stdout);

      const entriesInserted = entriesMatch ? parseInt(entriesMatch[1]!, 10) : 0;
      const entriesUpdated = updatedMatch ? parseInt(updatedMatch[1]!, 10) : 0;
      const filesProcessed = filesMatch ? parseInt(filesMatch[1]!, 10) : 0;

      logger.info('Nightly knowledge ingest completed', {
        filesProcessed,
        entriesInserted,
        entriesUpdated,
        durationMs: duration,
        correlationId,
      });

      // Emit job completion event
      await emitJobEvent(eventStore, 'cron.knowledge_ingest.completed', {
        filesProcessed,
        entriesInserted,
        entriesUpdated,
        durationMs: duration,
        correlationId,
      });

      return {
        success: true,
        filesProcessed,
        entriesInserted,
        entriesUpdated,
        durationMs: duration,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Nightly knowledge ingest failed', { error: errorMessage, correlationId });

      await emitJobEvent(eventStore, 'cron.knowledge_ingest.failed', {
        error: errorMessage,
        correlationId,
      });

      return { success: false, error: errorMessage };
    }
  },
});

// ============================================
// CRM Health Monitor
// ============================================

/**
 * CRM Health Monitoring - periodic health check of CRM integration
 * Runs every 15 minutes to detect CRM issues early
 */
export const crmHealthMonitor = schedules.task({
  id: 'crm-health-monitor',
  cron: '*/15 * * * *', // Every 15 minutes
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting CRM health check', { correlationId });

    const { eventStore } = getClients();

    try {
      // Dynamic import to get CRM provider and health service
      const { getCRMProvider, isMockCRMProvider } = await import('@medicalcor/integrations');
      const { CrmHealthCheckService } = await import('@medicalcor/infra');

      const crmProvider = getCRMProvider();
      const healthService = new CrmHealthCheckService({
        timeoutMs: 10000,
        degradedThresholdMs: 3000,
        unhealthyThresholdMs: 8000,
        providerName: 'crm',
      });

      const result = await healthService.check(crmProvider);

      const metrics = {
        status: result.status,
        provider: result.provider,
        isMock: isMockCRMProvider(),
        latencyMs: result.latencyMs,
        apiConnected: result.details.apiConnected,
        authenticated: result.details.authenticated,
        consecutiveFailures: healthService.getConsecutiveFailures(),
      };

      // Log based on health status
      if (result.status === 'healthy') {
        logger.info('CRM health check passed', { ...metrics, correlationId });
      } else if (result.status === 'degraded') {
        logger.warn('CRM health degraded', { ...metrics, message: result.message, correlationId });
      } else {
        logger.error('CRM health check failed', {
          ...metrics,
          message: result.message,
          error: result.details.error,
          correlationId,
        });
      }

      // Emit health check event
      await emitJobEvent(eventStore, 'cron.crm_health_check.completed', {
        ...metrics,
        timestamp: result.timestamp.toISOString(),
        message: result.message,
        correlationId,
      });

      return {
        success: result.status !== 'unhealthy',
        ...metrics,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('CRM health check failed with exception', {
        error: errorMessage,
        correlationId,
      });

      await emitJobEvent(eventStore, 'cron.crm_health_check.failed', {
        error: errorMessage,
        correlationId,
      });

      return { success: false, error: errorMessage };
    }
  },
});

// ============================================
// Database Partition Maintenance (Monthly)
// ============================================

/**
 * Database Partition Maintenance - creates future partitions and cleans up old ones
 * Runs on the 1st of every month at 1:00 AM
 *
 * H6: Database Partitioning for Event Tables
 */
export const databasePartitionMaintenance = schedules.task({
  id: 'database-partition-maintenance',
  cron: '0 1 1 * *', // 1:00 AM on the 1st of every month
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting database partition maintenance', { correlationId });

    const { eventStore } = getClients();

    try {
      const { client: supabase, error: supabaseError } = await getSupabaseClient();
      if (!supabase) {
        logger.warn('Supabase credentials not configured, skipping partition maintenance', {
          correlationId,
          error: supabaseError,
        });
        return { success: false, reason: 'Supabase not configured' };
      }

      // Create future partitions (3 months ahead)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Supabase RPC typing
      const { data: createResult, error: createError } = await supabase.rpc(
        'create_future_partitions',
        { p_months_ahead: 3 }
      );

      if (createError) {
        throw new Error(`Failed to create future partitions: ${createError.message}`);
      }

      const partitionsCreated = typeof createResult === 'number' ? createResult : 0;
      logger.info('Created future partitions', { partitionsCreated, correlationId });

      // Emit job completion event
      await emitJobEvent(eventStore, 'cron.partition_maintenance.completed', {
        partitionsCreated,
        correlationId,
      });

      logger.info('Database partition maintenance completed', {
        partitionsCreated,
        correlationId,
      });

      return { success: true, partitionsCreated };
    } catch (error) {
      logger.error('Database partition maintenance failed', { error, correlationId });

      await emitJobEvent(eventStore, 'cron.partition_maintenance.failed', {
        error: String(error),
        correlationId,
      });

      return { success: false, error: String(error) };
    }
  },
});

// ============================================
// Database Partition Maintenance (Daily)
// ============================================

/**
 * Database Partition Maintenance (Daily) - creates future partitions and monitors stats
 * Runs every day at 1:00 AM
 */
export const databasePartitionMaintenanceDaily = schedules.task({
  id: 'database-partition-maintenance-daily',
  cron: '0 1 * * *', // 1:00 AM every day
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting database partition maintenance', { correlationId });

    const { eventStore } = getClients();

    try {
      const { client: supabase, error: supabaseError } = await getSupabaseClient();
      if (!supabase) {
        logger.warn('Supabase credentials not configured', { correlationId, error: supabaseError });
        return { success: false, reason: 'Supabase not configured' };
      }

      interface PartitionStats {
        partition_name: string;
        row_count: number;
        total_size: string;
        partition_range: string;
      }

      // Create future partitions (3 months ahead)
      const createResponse = await supabase.rpc('create_future_partitions', {
        p_months_ahead: 3,
      });
      const partitionsCreated = (createResponse.data as number | null) ?? 0;

      if (createResponse.error) {
        logger.error('Failed to create future partitions', {
          error: createResponse.error.message,
          correlationId,
        });
      } else {
        logger.info('Created future partitions', {
          partitionsCreated,
          correlationId,
        });
      }

      // Get partition statistics for monitoring
      const domainEventsResponse = await supabase.rpc('get_partition_stats', {
        p_table_name: 'domain_events',
      });
      const domainEventsStats = (domainEventsResponse.data as PartitionStats[] | null) ?? [];

      const auditLogResponse = await supabase.rpc('get_partition_stats', {
        p_table_name: 'audit_log',
      });
      const auditLogStats = (auditLogResponse.data as PartitionStats[] | null) ?? [];

      // Calculate total sizes
      const totalDomainEventsPartitions = domainEventsStats.length;
      const totalAuditLogPartitions = auditLogStats.length;

      // Check retention policy (24 months by default)
      const retentionMonthsStr = process.env.PARTITION_RETENTION_MONTHS ?? '24';
      const retentionMonths = Number.parseInt(retentionMonthsStr, 10);
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);

      const allPartitions = [...domainEventsStats, ...auditLogStats];
      const oldPartitions = allPartitions.filter((p) => {
        // Extract date from partition name (e.g., domain_events_y2024m01)
        const match = /y(\d{4})m(\d{2})/.exec(p.partition_name);
        if (match?.[1] && match[2]) {
          const year = Number.parseInt(match[1], 10);
          const month = Number.parseInt(match[2], 10);
          const partitionDate = new Date(year, month - 1, 1);
          return partitionDate < cutoffDate;
        }
        return false;
      });

      if (oldPartitions.length > 0) {
        logger.warn('Old partitions found that could be archived', {
          count: oldPartitions.length,
          partitions: oldPartitions.map((p) => p.partition_name),
          retentionMonths,
          correlationId,
        });
      }

      // Emit monitoring event
      await emitJobEvent(eventStore, 'cron.partition_maintenance.completed', {
        partitionsCreated,
        domainEventsPartitions: totalDomainEventsPartitions,
        auditLogPartitions: totalAuditLogPartitions,
        oldPartitionsFound: oldPartitions.length,
        retentionMonths,
        correlationId,
      });

      logger.info('Database partition maintenance completed', {
        partitionsCreated,
        domainEventsPartitions: totalDomainEventsPartitions,
        auditLogPartitions: totalAuditLogPartitions,
        correlationId,
      });

      return {
        success: true,
        partitionsCreated,
        domainEventsPartitions: totalDomainEventsPartitions,
        auditLogPartitions: totalAuditLogPartitions,
        oldPartitionsFound: oldPartitions.length,
      };
    } catch (error) {
      logger.error('Database partition maintenance failed', { error, correlationId });

      await emitJobEvent(eventStore, 'cron.partition_maintenance.failed', {
        error: String(error),
        correlationId,
      });

      return { success: false, error: String(error) };
    }
  },
});
