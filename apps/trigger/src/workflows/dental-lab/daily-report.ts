/**
 * @fileoverview Daily Lab Report Workflow
 *
 * Scheduled workflow that generates and distributes daily lab reports.
 * Runs at 6 AM to prepare reports for the day ahead.
 *
 * @module apps/trigger/workflows/dental-lab/daily-report
 */

import { task, schedules, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';

// =============================================================================
// SCHEMAS
// =============================================================================

export const DailyReportPayloadSchema = z.object({
  clinicId: z.string().uuid(),
  reportDate: z.string().datetime(),
  recipientEmails: z.array(z.string().email()),
  includeAnalytics: z.boolean().default(true),
  correlationId: z.string(),
});

export type DailyReportPayload = z.infer<typeof DailyReportPayloadSchema>;

// =============================================================================
// SCHEDULED DAILY REPORT
// =============================================================================

/**
 * Scheduled task that generates daily reports at 6 AM
 */
export const scheduledDailyReport = schedules.task({
  id: 'dental-lab-daily-report-scheduled',
  cron: '0 6 * * *', // 6 AM daily
  run: async () => {
    logger.info('Starting scheduled daily report generation for all clinics');

    // In a real implementation:
    // 1. Query all clinics with lab operations
    // 2. Trigger individual report generation in parallel
    // 3. Collect results

    const reportDate = new Date().toISOString();

    logger.info('Daily reports generation triggered', { reportDate });

    return {
      success: true,
      triggeredAt: reportDate,
    };
  },
});

// =============================================================================
// PER-CLINIC DAILY REPORT WORKFLOW
// =============================================================================

/**
 * Daily Lab Report Workflow
 *
 * Generates comprehensive daily report including:
 * - Cases due today
 * - SLA status summary
 * - Pending actions
 * - Performance metrics
 * - Workload distribution
 */
export const dailyLabReportWorkflow = task({
  id: 'dental-lab-daily-report',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 60000,
    factor: 2,
  },
  run: async (payload: DailyReportPayload) => {
    const {
      clinicId,
      reportDate,
      recipientEmails,
      includeAnalytics,
      correlationId,
    } = payload;

    logger.info('Starting daily report generation', {
      clinicId,
      reportDate,
      recipientCount: recipientEmails.length,
      correlationId,
    });

    // =========================================================================
    // Stage 1: Gather Report Data
    // =========================================================================
    logger.info('Stage 1: Gathering report data', { correlationId });

    const reportData = await gatherReportData(clinicId, reportDate, includeAnalytics);

    // =========================================================================
    // Stage 2: Generate Report Content
    // =========================================================================
    logger.info('Stage 2: Generating report content', { correlationId });

    const report = generateReportContent(reportData);

    // =========================================================================
    // Stage 3: Distribute Report
    // =========================================================================
    logger.info('Stage 3: Distributing report', { correlationId });

    for (const email of recipientEmails) {
      await sendReportEmail(email, report, correlationId);
    }

    // =========================================================================
    // Stage 4: Store Report
    // =========================================================================
    logger.info('Stage 4: Storing report for reference', { correlationId });

    const storedReport = {
      id: crypto.randomUUID(),
      clinicId,
      reportDate,
      generatedAt: new Date().toISOString(),
      reportType: 'DAILY',
      data: reportData,
      recipientCount: recipientEmails.length,
    };

    // =========================================================================
    // Workflow Complete
    // =========================================================================
    logger.info('Daily report workflow completed', {
      clinicId,
      reportId: storedReport.id,
      correlationId,
    });

    return {
      success: true,
      reportId: storedReport.id,
      clinicId,
      reportDate,
      recipientCount: recipientEmails.length,
      summary: {
        casesToday: reportData.casesToday,
        casesAtRisk: reportData.casesAtRisk,
        pendingDesignReviews: reportData.pendingDesignReviews,
        readyForDelivery: reportData.readyForDelivery,
      },
    };
  },
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

interface ReportData {
  clinicId: string;
  reportDate: string;
  casesToday: {
    dueToday: number;
    newCases: number;
    completed: number;
    inProgress: number;
  };
  casesAtRisk: number;
  casesOverdue: number;
  pendingDesignReviews: number;
  readyForDelivery: number;
  pipeline: {
    received: number;
    inDesign: number;
    inFabrication: number;
    inQC: number;
    awaitingDelivery: number;
  };
  workload: Array<{
    technicianId: string;
    technicianName: string;
    activeCases: number;
    completedToday: number;
  }>;
  analytics?: {
    avgTurnaroundDays: number;
    onTimeDeliveryRate: number;
    qcPassRate: number;
    reworkRate: number;
  };
  urgentItems: Array<{
    caseNumber: string;
    reason: string;
    action: string;
  }>;
}

async function gatherReportData(
  clinicId: string,
  reportDate: string,
  includeAnalytics: boolean
): Promise<ReportData> {
  // In a real implementation, this would query the database
  // For now, return placeholder data
  return {
    clinicId,
    reportDate,
    casesToday: {
      dueToday: 5,
      newCases: 3,
      completed: 2,
      inProgress: 8,
    },
    casesAtRisk: 2,
    casesOverdue: 1,
    pendingDesignReviews: 3,
    readyForDelivery: 4,
    pipeline: {
      received: 2,
      inDesign: 5,
      inFabrication: 6,
      inQC: 3,
      awaitingDelivery: 4,
    },
    workload: [],
    analytics: includeAnalytics ? {
      avgTurnaroundDays: 4.5,
      onTimeDeliveryRate: 92,
      qcPassRate: 95,
      reworkRate: 5,
    } : undefined,
    urgentItems: [],
  };
}

function generateReportContent(data: ReportData): {
  subject: string;
  html: string;
  text: string;
} {
  const dateStr = new Date(data.reportDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const subject = `Daily Lab Report - ${dateStr}`;

  const textLines = [
    `Daily Lab Report`,
    `${dateStr}`,
    ``,
    `TODAY'S OVERVIEW`,
    `================`,
    `Cases Due Today: ${data.casesToday.dueToday}`,
    `New Cases: ${data.casesToday.newCases}`,
    `Completed: ${data.casesToday.completed}`,
    `In Progress: ${data.casesToday.inProgress}`,
    ``,
    `ATTENTION REQUIRED`,
    `==================`,
    `Cases At Risk: ${data.casesAtRisk}`,
    `Cases Overdue: ${data.casesOverdue}`,
    `Pending Design Reviews: ${data.pendingDesignReviews}`,
    ``,
    `PIPELINE STATUS`,
    `===============`,
    `Received: ${data.pipeline.received}`,
    `In Design: ${data.pipeline.inDesign}`,
    `In Fabrication: ${data.pipeline.inFabrication}`,
    `In QC: ${data.pipeline.inQC}`,
    `Ready for Delivery: ${data.pipeline.awaitingDelivery}`,
  ];

  if (data.analytics) {
    textLines.push(
      ``,
      `PERFORMANCE METRICS`,
      `===================`,
      `Avg Turnaround: ${data.analytics.avgTurnaroundDays} days`,
      `On-Time Delivery: ${data.analytics.onTimeDeliveryRate}%`,
      `QC Pass Rate: ${data.analytics.qcPassRate}%`,
      `Rework Rate: ${data.analytics.reworkRate}%`
    );
  }

  if (data.urgentItems.length > 0) {
    textLines.push(``, `URGENT ITEMS`, `============`);
    for (const item of data.urgentItems) {
      textLines.push(`• ${item.caseNumber}: ${item.reason} - ${item.action}`);
    }
  }

  const text = textLines.join('\n');

  // HTML version would be more styled in real implementation
  const html = `
    <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1a365d;">Daily Lab Report</h1>
        <p style="color: #666;">${dateStr}</p>

        <h2 style="color: #2d3748; border-bottom: 2px solid #e2e8f0;">Today's Overview</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td>Cases Due Today</td><td style="text-align: right; font-weight: bold;">${data.casesToday.dueToday}</td></tr>
          <tr><td>New Cases</td><td style="text-align: right;">${data.casesToday.newCases}</td></tr>
          <tr><td>Completed</td><td style="text-align: right; color: green;">${data.casesToday.completed}</td></tr>
          <tr><td>In Progress</td><td style="text-align: right;">${data.casesToday.inProgress}</td></tr>
        </table>

        <h2 style="color: #c53030; border-bottom: 2px solid #feb2b2;">Attention Required</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td>Cases At Risk</td><td style="text-align: right; color: orange; font-weight: bold;">${data.casesAtRisk}</td></tr>
          <tr><td>Cases Overdue</td><td style="text-align: right; color: red; font-weight: bold;">${data.casesOverdue}</td></tr>
          <tr><td>Pending Design Reviews</td><td style="text-align: right;">${data.pendingDesignReviews}</td></tr>
        </table>

        <h2 style="color: #2d3748; border-bottom: 2px solid #e2e8f0;">Pipeline Status</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td>Received</td><td style="text-align: right;">${data.pipeline.received}</td></tr>
          <tr><td>In Design</td><td style="text-align: right;">${data.pipeline.inDesign}</td></tr>
          <tr><td>In Fabrication</td><td style="text-align: right;">${data.pipeline.inFabrication}</td></tr>
          <tr><td>In QC</td><td style="text-align: right;">${data.pipeline.inQC}</td></tr>
          <tr><td>Ready for Delivery</td><td style="text-align: right; color: green;">${data.pipeline.awaitingDelivery}</td></tr>
        </table>

        ${data.analytics ? `
        <h2 style="color: #2d3748; border-bottom: 2px solid #e2e8f0;">Performance Metrics</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td>Avg Turnaround</td><td style="text-align: right;">${data.analytics.avgTurnaroundDays} days</td></tr>
          <tr><td>On-Time Delivery</td><td style="text-align: right;">${data.analytics.onTimeDeliveryRate}%</td></tr>
          <tr><td>QC Pass Rate</td><td style="text-align: right;">${data.analytics.qcPassRate}%</td></tr>
          <tr><td>Rework Rate</td><td style="text-align: right;">${data.analytics.reworkRate}%</td></tr>
        </table>
        ` : ''}

        <p style="margin-top: 30px; color: #666; font-size: 12px;">
          This report was automatically generated. View full details in the lab management system.
        </p>
      </body>
    </html>
  `;

  return { subject, html, text };
}

async function sendReportEmail(
  email: string,
  report: { subject: string; html: string; text: string },
  correlationId: string
): Promise<void> {
  // In a real implementation, send via email service
  logger.info('Report email sent', { email, subject: report.subject, correlationId });
}
