/**
 * pLTV input builder for LTV orchestration
 */

import type {
  PLTVPredictionInput,
  HistoricalLTVInput,
  PaymentBehaviorInput,
  EngagementMetricsInput,
  ProcedureInterestInput,
} from '@medicalcor/domain';
import type { LTVDataRow, PaymentBehaviorRow, ProcedureInterestRow } from './types.js';

/**
 * Build historical LTV input from database data
 */
export function buildHistoricalInput(ltvData: LTVDataRow | undefined): HistoricalLTVInput {
  const now = new Date();
  const firstCaseDate = ltvData?.first_case_date ? new Date(ltvData.first_case_date) : null;
  const lastCaseDate = ltvData?.last_case_date ? new Date(ltvData.last_case_date) : null;

  return {
    totalPaid: parseFloat(ltvData?.total_paid ?? '0'),
    totalCaseValue: parseFloat(ltvData?.total_case_value ?? '0'),
    totalOutstanding: parseFloat(ltvData?.total_outstanding ?? '0'),
    completedCases: parseInt(ltvData?.completed_cases ?? '0', 10),
    totalCases: parseInt(ltvData?.total_cases ?? '0', 10),
    avgCaseValue: parseFloat(ltvData?.avg_case_value ?? '0'),
    daysSinceFirstCase: firstCaseDate
      ? Math.floor((now.getTime() - firstCaseDate.getTime()) / (1000 * 60 * 60 * 24))
      : null,
    daysSinceLastCase: lastCaseDate
      ? Math.floor((now.getTime() - lastCaseDate.getTime()) / (1000 * 60 * 60 * 24))
      : null,
  };
}

/**
 * Build payment behavior input from database data
 */
export function buildPaymentBehaviorInput(
  paymentBehavior: PaymentBehaviorRow | undefined
): PaymentBehaviorInput {
  return {
    onTimePaymentRate: parseFloat(paymentBehavior?.on_time_rate ?? '100'),
    paymentPlansUsed: parseInt(paymentBehavior?.plans_used ?? '0', 10),
    avgDaysToPayment: paymentBehavior?.avg_days ? parseFloat(paymentBehavior.avg_days) : null,
    missedPayments: parseInt(paymentBehavior?.missed ?? '0', 10),
    preferredPaymentMethod: 'card',
  };
}

/**
 * Build procedure interest input from database data
 */
export function buildProcedureInterestInput(
  procedures: ProcedureInterestRow | undefined
): ProcedureInterestInput {
  return {
    allOnXInterest: procedures?.all_on_x ?? false,
    implantInterest: procedures?.implant ?? false,
    fullMouthInterest: procedures?.full_mouth ?? false,
    cosmeticInterest: procedures?.cosmetic ?? false,
    highValueProceduresCompleted: parseInt(procedures?.high_value_completed ?? '0', 10),
  };
}

/**
 * Build complete pLTV prediction input
 */
export function buildPLTVInput(params: {
  leadId: string;
  clinicId: string;
  ltvData: LTVDataRow | undefined;
  paymentBehavior: PaymentBehaviorRow | undefined;
  engagement: EngagementMetricsInput;
  procedures: ProcedureInterestRow | undefined;
  retentionScore: number | null;
}): PLTVPredictionInput {
  const { leadId, clinicId, ltvData, paymentBehavior, engagement, procedures, retentionScore } =
    params;

  return {
    leadId,
    clinicId,
    historical: buildHistoricalInput(ltvData),
    paymentBehavior: buildPaymentBehaviorInput(paymentBehavior),
    engagement,
    procedureInterest: buildProcedureInterestInput(procedures),
    retentionScore,
  };
}
