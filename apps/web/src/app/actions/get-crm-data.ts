'use server';

import type {
  CRMDashboardStats,
  CRMPatient,
  ChurnRiskAlert,
  NPSTrendData,
  LoyaltyDistribution,
} from '@medicalcor/types';

/**
 * CRM Dashboard Server Actions
 * Fetches retention, NPS, and loyalty data from HubSpot
 */

// Mock data for demo - in production, this would fetch from HubSpot
const MOCK_PATIENTS: CRMPatient[] = [
  {
    id: '1a2b3c4d',
    name: 'Popescu Maria',
    phone: '+40741234567',
    email: 'maria.popescu@email.com',
    retentionScore: 35,
    churnRisk: 'RIDICAT',
    daysInactive: 17,
    canceledAppointments: 2,
    npsScore: 6,
    npsCategory: 'DETRACTOR',
    npsFeedback: 'Rezultatul e OK dar comunicarea a fost deficitară.',
    loyaltySegment: 'Bronze',
    lifetimeValue: 12500,
    totalTreatments: 1,
    activeDiscounts: [],
    followUpPriority: 'URGENTA',
    lastAppointmentDate: '2024-09-15',
    lastTreatmentDate: '2024-09-15',
    lastNpsSurveyDate: '2024-09-20',
  },
  {
    id: '2b3c4d5e',
    name: 'Ionescu Andrei',
    phone: '+40742345678',
    email: 'andrei.ionescu@email.com',
    retentionScore: 92,
    churnRisk: 'SCAZUT',
    daysInactive: 1,
    canceledAppointments: 0,
    npsScore: 10,
    npsCategory: 'PROMOTOR',
    npsFeedback: 'Experiență absolut excepțională! Recomand cu încredere!',
    loyaltySegment: 'Platinum',
    lifetimeValue: 45200,
    totalTreatments: 4,
    activeDiscounts: ['20% toate serviciile', 'Consultații gratuite'],
    followUpPriority: 'SCAZUTA',
    lastAppointmentDate: '2024-10-01',
    lastTreatmentDate: '2024-10-01',
    lastNpsSurveyDate: '2024-10-02',
  },
  {
    id: '3c4d5e6f',
    name: 'Vasile Elena',
    phone: '+40743456789',
    email: 'elena.vasile@email.com',
    retentionScore: 58,
    churnRisk: 'MEDIU',
    daysInactive: 43,
    canceledAppointments: 1,
    npsScore: 8,
    npsCategory: 'PASIV',
    npsFeedback: 'Mulțumită de rezultat, dar prețul a fost peste buget.',
    loyaltySegment: 'Silver',
    lifetimeValue: 18700,
    totalTreatments: 2,
    activeDiscounts: ['10% mentenanță'],
    followUpPriority: 'MEDIE',
    lastAppointmentDate: '2024-08-20',
    lastTreatmentDate: '2024-08-20',
    lastNpsSurveyDate: '2024-08-25',
  },
  {
    id: '4d5e6f7g',
    name: 'Georgescu Mihai',
    phone: '+40744567890',
    email: 'mihai.georgescu@email.com',
    retentionScore: 88,
    churnRisk: 'SCAZUT',
    daysInactive: 4,
    canceledAppointments: 0,
    npsScore: 9,
    npsCategory: 'PROMOTOR',
    npsFeedback: 'Foarte mulțumit! Calitatea excepțională.',
    loyaltySegment: 'Platinum',
    lifetimeValue: 38900,
    totalTreatments: 3,
    activeDiscounts: ['20% toate serviciile', 'Garanție extinsă +5 ani'],
    followUpPriority: 'SCAZUTA',
    lastAppointmentDate: '2024-09-28',
    lastTreatmentDate: '2024-09-28',
    lastNpsSurveyDate: '2024-09-30',
  },
  {
    id: '5e6f7g8h',
    name: 'Dumitru Carmen',
    phone: '+40745678901',
    email: 'carmen.dumitru@email.com',
    retentionScore: 28,
    churnRisk: 'FOARTE_RIDICAT',
    daysInactive: 84,
    canceledAppointments: 3,
    npsScore: 5,
    npsCategory: 'DETRACTOR',
    npsFeedback: 'Am avut probleme cu durerile post-operatorii.',
    loyaltySegment: 'Gold',
    lifetimeValue: 25800,
    totalTreatments: 1,
    activeDiscounts: ['15% mentenanță'],
    followUpPriority: 'URGENTA',
    lastAppointmentDate: '2024-07-10',
    lastTreatmentDate: '2024-07-10',
    lastNpsSurveyDate: '2024-07-15',
  },
  {
    id: '6f7g8h9i',
    name: 'Stan Victor',
    phone: '+40746789012',
    email: 'victor.stan@email.com',
    retentionScore: 75,
    churnRisk: 'SCAZUT',
    daysInactive: 14,
    canceledAppointments: 0,
    npsScore: 9,
    npsCategory: 'PROMOTOR',
    npsFeedback: 'Foarte profesionist! Apreciez atenția la detalii.',
    loyaltySegment: 'Gold',
    lifetimeValue: 22100,
    totalTreatments: 2,
    activeDiscounts: ['15% mentenanță + check-up'],
    followUpPriority: 'SCAZUTA',
    lastAppointmentDate: '2024-09-18',
    lastTreatmentDate: '2024-09-18',
    lastNpsSurveyDate: '2024-09-20',
  },
  {
    id: '7g8h9i0j',
    name: 'Marinescu Laura',
    phone: '+40747890123',
    email: 'laura.marinescu@email.com',
    retentionScore: 45,
    churnRisk: 'RIDICAT',
    daysInactive: 58,
    canceledAppointments: 1,
    npsScore: 7,
    npsCategory: 'PASIV',
    npsFeedback: 'Bine în general, dar timpul de așteptare a fost lung.',
    loyaltySegment: 'Silver',
    lifetimeValue: 9200,
    totalTreatments: 1,
    activeDiscounts: ['10% mentenanță'],
    followUpPriority: 'RIDICATA',
    lastAppointmentDate: '2024-08-05',
    lastTreatmentDate: '2024-08-05',
    lastNpsSurveyDate: '2024-08-10',
  },
  {
    id: '8h9i0j1k',
    name: 'Popa Daniel',
    phone: '+40748901234',
    email: 'daniel.popa@email.com',
    retentionScore: 82,
    churnRisk: 'SCAZUT',
    daysInactive: 2,
    canceledAppointments: 0,
    npsScore: 10,
    npsCategory: 'PROMOTOR',
    npsFeedback: 'Perfect! Am recomandat deja 3 prieteni.',
    loyaltySegment: 'Platinum',
    lifetimeValue: 31500,
    totalTreatments: 2,
    activeDiscounts: ['20% toate serviciile'],
    followUpPriority: 'SCAZUTA',
    lastAppointmentDate: '2024-09-30',
    lastTreatmentDate: '2024-09-30',
    lastNpsSurveyDate: '2024-10-01',
  },
];

/**
 * Get CRM Dashboard statistics
 */
export async function getCRMDashboardStatsAction(): Promise<CRMDashboardStats> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  const patients = MOCK_PATIENTS;

  // Calculate stats
  const promoters = patients.filter((p) => p.npsCategory === 'PROMOTOR').length;
  const passives = patients.filter((p) => p.npsCategory === 'PASIV').length;
  const detractors = patients.filter((p) => p.npsCategory === 'DETRACTOR').length;
  const totalWithNPS = promoters + passives + detractors;

  const npsScore =
    totalWithNPS > 0 ? Math.round(((promoters - detractors) / totalWithNPS) * 100) : 0;

  const avgRetention = Math.round(
    patients.reduce((sum, p) => sum + p.retentionScore, 0) / patients.length
  );

  const patientsAtRisk = patients.filter(
    (p) => p.churnRisk === 'RIDICAT' || p.churnRisk === 'FOARTE_RIDICAT'
  ).length;

  const patientsUrgent = patients.filter((p) => p.followUpPriority === 'URGENTA').length;

  const segmentCounts = {
    platinum: patients.filter((p) => p.loyaltySegment === 'Platinum').length,
    gold: patients.filter((p) => p.loyaltySegment === 'Gold').length,
    silver: patients.filter((p) => p.loyaltySegment === 'Silver').length,
    bronze: patients.filter((p) => p.loyaltySegment === 'Bronze').length,
  };

  const totalLTV = patients.reduce((sum, p) => sum + p.lifetimeValue, 0);
  const avgLTV = Math.round(totalLTV / patients.length);

  return {
    averageRetentionScore: avgRetention,
    patientsAtRisk,
    patientsUrgentFollowUp: patientsUrgent,
    npsScore,
    promotersCount: promoters,
    passivesCount: passives,
    detractorsCount: detractors,
    responseRate: 73,
    platinumCount: segmentCounts.platinum,
    goldCount: segmentCounts.gold,
    silverCount: segmentCounts.silver,
    bronzeCount: segmentCounts.bronze,
    monthlyRevenue: 215000,
    averageLifetimeValue: avgLTV,
  };
}

/**
 * Get all CRM patients
 */
export async function getCRMPatientsAction(): Promise<CRMPatient[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return MOCK_PATIENTS;
}

/**
 * Get churn risk alerts (urgent follow-up needed)
 */
export async function getChurnRiskAlertsAction(): Promise<ChurnRiskAlert[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  const atRiskPatients = MOCK_PATIENTS.filter(
    (p) => p.churnRisk === 'RIDICAT' || p.churnRisk === 'FOARTE_RIDICAT'
  );

  return atRiskPatients.map((p) => ({
    patientId: p.id,
    patientName: p.name,
    phone: p.phone,
    retentionScore: p.retentionScore,
    churnRisk: p.churnRisk,
    lifetimeValue: p.lifetimeValue,
    daysInactive: p.daysInactive,
    canceledAppointments: p.canceledAppointments,
    npsScore: p.npsScore,
    npsFeedback: p.npsFeedback,
    followUpPriority: p.followUpPriority,
    suggestedAction: getSuggestedAction(p),
  }));
}

function getSuggestedAction(patient: CRMPatient): string {
  if (patient.churnRisk === 'FOARTE_RIDICAT') {
    return 'Contactați URGENT telefonic. Oferți discount personalizat 35% și programare prioritară.';
  }
  if (patient.npsCategory === 'DETRACTOR') {
    return 'Apel de follow-up pentru a înțelege nemulțumirile. Propuneți soluții concrete.';
  }
  if (patient.daysInactive > 60) {
    return 'Trimiteți mesaj WhatsApp personalizat cu ofertă specială de reactivare.';
  }
  return 'Programați un check-up gratuit pentru menținerea relației.';
}

/**
 * Get NPS trend data for charts
 */
export async function getNPSTrendDataAction(): Promise<NPSTrendData[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  return [
    { period: 'Mai', npsScore: 25, promoters: 12, passives: 8, detractors: 5, totalResponses: 25 },
    { period: 'Iun', npsScore: 32, promoters: 15, passives: 7, detractors: 4, totalResponses: 26 },
    { period: 'Jul', npsScore: 38, promoters: 18, passives: 9, detractors: 5, totalResponses: 32 },
    { period: 'Aug', npsScore: 42, promoters: 20, passives: 8, detractors: 4, totalResponses: 32 },
    { period: 'Sep', npsScore: 48, promoters: 24, passives: 10, detractors: 5, totalResponses: 39 },
    { period: 'Oct', npsScore: 50, promoters: 4, passives: 2, detractors: 2, totalResponses: 8 },
  ];
}

/**
 * Get loyalty distribution for pie chart
 */
export async function getLoyaltyDistributionAction(): Promise<LoyaltyDistribution[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  const patients = MOCK_PATIENTS;

  const segments: LoyaltyDistribution[] = [
    {
      segment: 'Platinum',
      count: patients.filter((p) => p.loyaltySegment === 'Platinum').length,
      percentage: 0,
      totalLTV: patients
        .filter((p) => p.loyaltySegment === 'Platinum')
        .reduce((sum, p) => sum + p.lifetimeValue, 0),
    },
    {
      segment: 'Gold',
      count: patients.filter((p) => p.loyaltySegment === 'Gold').length,
      percentage: 0,
      totalLTV: patients
        .filter((p) => p.loyaltySegment === 'Gold')
        .reduce((sum, p) => sum + p.lifetimeValue, 0),
    },
    {
      segment: 'Silver',
      count: patients.filter((p) => p.loyaltySegment === 'Silver').length,
      percentage: 0,
      totalLTV: patients
        .filter((p) => p.loyaltySegment === 'Silver')
        .reduce((sum, p) => sum + p.lifetimeValue, 0),
    },
    {
      segment: 'Bronze',
      count: patients.filter((p) => p.loyaltySegment === 'Bronze').length,
      percentage: 0,
      totalLTV: patients
        .filter((p) => p.loyaltySegment === 'Bronze')
        .reduce((sum, p) => sum + p.lifetimeValue, 0),
    },
  ];

  const total = segments.reduce((sum, s) => sum + s.count, 0);
  segments.forEach((s) => {
    s.percentage = Math.round((s.count / total) * 100);
  });

  return segments;
}
