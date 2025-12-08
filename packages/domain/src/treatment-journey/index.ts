/**
 * @fileoverview Treatment Journey Module
 *
 * The orchestrating module for complete patient treatment journeys.
 * This is the CORE of what makes MedicalCor indispensable for dental practices.
 *
 * Features:
 * - Complete patient journey tracking from inquiry to maintenance
 * - AI-powered treatment planning with GPT-4o
 * - Predictive outcome analytics
 * - Real-time clinic-lab collaboration
 * - Milestone tracking with SLA management
 * - Risk detection and early warning system
 *
 * @module domain/treatment-journey
 *
 * @example
 * ```typescript
 * import {
 *   createTreatmentJourney,
 *   completeMilestone,
 *   predictOutcome,
 *   createCollaborationThread,
 * } from '@medicalcor/domain/treatment-journey';
 *
 * // Create a new treatment journey
 * const journey = createTreatmentJourney({
 *   patientId: 'patient-123',
 *   clinicId: 'clinic-456',
 *   treatmentType: 'ALL_ON_4',
 *   primaryDentistId: 'dr-789',
 *   estimatedCompletionDate: new Date('2025-06-01'),
 *   financialEstimate: 35000,
 *   currency: 'RON',
 * }, 'coordinator-001');
 *
 * // Track milestone completion
 * const updatedJourney = completeMilestone(
 *   journey,
 *   'CONSULTATION_COMPLETED',
 *   'dr-789',
 *   { notes: 'Patient is a good candidate for All-on-4' }
 * );
 *
 * // Predict treatment outcome
 * const prediction = predictOutcome(patientProfile, {
 *   type: 'ALL_ON_4',
 *   location: 'MANDIBLE',
 *   teethCount: 4,
 * });
 *
 * // Start clinic-lab collaboration
 * const thread = createCollaborationThread(
 *   labCaseId,
 *   'Design Review Request',
 *   { id: 'dr-789', name: 'Dr. Smith', role: 'CLINICIAN', organization: 'CLINIC' },
 *   'Please review the attached design for case #LAB-2024-001234',
 *   'HIGH'
 * );
 * ```
 */

// Entities
export * from './entities/index.js';

// Services
export * from './services/index.js';
