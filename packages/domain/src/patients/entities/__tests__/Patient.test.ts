/**
 * @fileoverview Tests for Patient Aggregate Root
 *
 * Comprehensive tests for the Patient entity including:
 * - Factory methods (fromLeadConversion, create, reconstitute, fromEvents)
 * - Status transitions and lifecycle
 * - Treatment management
 * - Appointment management
 * - Medical history and allergies
 * - Insurance handling
 * - Consent management
 * - Error conditions
 *
 * @module domain/patients/entities/__tests__/Patient
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PatientAggregateRoot,
  PatientError,
  PatientDeletedError,
  PatientArchivedError,
  PatientNotActiveError,
  InvalidPatientStatusTransitionError,
  type PatientAggregateState,
  type FromLeadConversionParams,
  type CreatePatientParams,
} from '../Patient.js';
import { PhoneNumber } from '../../../shared-kernel/value-objects/phone-number.js';

describe('PatientAggregateRoot', () => {
  const testPhone = PhoneNumber.create('+40721234567');

  const defaultConversionParams: FromLeadConversionParams = {
    id: 'patient-123',
    leadId: 'lead-456',
    phone: testPhone,
    email: 'patient@example.com',
    firstName: 'Ion',
    lastName: 'Popescu',
    conversionProcedure: 'dental_implant',
    assignedProviderId: 'doctor-789',
  };

  const defaultCreateParams: CreatePatientParams = {
    id: 'patient-direct-123',
    phone: testPhone,
    email: 'direct@example.com',
    firstName: 'Maria',
    lastName: 'Ionescu',
    address: 'Strada Principal 1',
    city: 'Bucharest',
    county: 'Bucharest',
  };

  describe('Factory methods', () => {
    describe('fromLeadConversion', () => {
      it('should create patient from lead conversion', () => {
        const patient = PatientAggregateRoot.fromLeadConversion(defaultConversionParams);

        expect(patient.id).toBe('patient-123');
        expect(patient.leadId).toBe('lead-456');
        expect(patient.firstName).toBe('Ion');
        expect(patient.lastName).toBe('Popescu');
        expect(patient.fullName).toBe('Ion Popescu');
        expect(patient.status).toBe('registered');
        expect(patient.phone.e164).toBe('+40721234567');
        expect(patient.email).toBe('patient@example.com');
        expect(patient.primaryProviderId).toBe('doctor-789');
      });

      it('should emit patient.registered event', () => {
        const patient = PatientAggregateRoot.fromLeadConversion(
          defaultConversionParams,
          'corr-123'
        );
        const events = patient.getUncommittedEvents();

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('patient.registered');
        expect(events[0].correlationId).toBe('corr-123');
      });

      it('should set source to lead_conversion', () => {
        const patient = PatientAggregateRoot.fromLeadConversion(defaultConversionParams);
        const state = patient.getState();

        expect(state.source).toBe('lead_conversion');
        expect(state.conversionProcedure).toBe('dental_implant');
      });

      it('should set preferred language based on phone region', () => {
        const patient = PatientAggregateRoot.fromLeadConversion(defaultConversionParams);

        expect(patient.preferences.preferredLanguage).toBe('ro');
      });

      it('should handle date of birth', () => {
        const dateOfBirth = new Date('1985-06-15');
        const patient = PatientAggregateRoot.fromLeadConversion({
          ...defaultConversionParams,
          dateOfBirth,
        });

        expect(patient.dateOfBirth).toEqual(dateOfBirth);
      });
    });

    describe('create', () => {
      it('should create patient with direct registration', () => {
        const patient = PatientAggregateRoot.create(defaultCreateParams);

        expect(patient.id).toBe('patient-direct-123');
        expect(patient.firstName).toBe('Maria');
        expect(patient.lastName).toBe('Ionescu');
        expect(patient.status).toBe('registered');
        // Direct registration has no leadId (set as empty string in event)
        expect(patient.leadId).toBe('');
      });

      it('should set source to direct_registration by default', () => {
        const patient = PatientAggregateRoot.create(defaultCreateParams);
        const state = patient.getState();

        expect(state.source).toBe('direct_registration');
      });

      it('should respect custom source', () => {
        const patient = PatientAggregateRoot.create({
          ...defaultCreateParams,
          source: 'referral',
        });
        const state = patient.getState();

        expect(state.source).toBe('referral');
      });

      it('should respect custom preferences', () => {
        const patient = PatientAggregateRoot.create({
          ...defaultCreateParams,
          preferredLanguage: 'en',
          preferredChannel: 'phone',
          preferredContactTime: 'morning',
        });

        expect(patient.preferences.preferredLanguage).toBe('en');
        expect(patient.preferences.preferredChannel).toBe('phone');
        expect(patient.preferences.preferredContactTime).toBe('morning');
      });
    });

    describe('reconstitute', () => {
      it('should reconstitute patient from state', () => {
        const state: PatientAggregateState = {
          id: 'patient-reconstitute',
          version: 5,
          phone: testPhone,
          firstName: 'Alexandru',
          lastName: 'Dumitrescu',
          status: 'active',
          registeredAt: new Date('2024-01-01'),
          activatedAt: new Date('2024-01-15'),
          medicalHistory: [],
          allergies: [],
          treatmentPlans: [],
          appointments: [],
          noShowCount: 2,
          consents: {},
          assignedProviders: [],
          preferences: {
            preferredLanguage: 'ro',
            preferredChannel: 'whatsapp',
            preferredContactTime: 'any',
            doNotContact: false,
          },
          source: 'direct_registration',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-02-01'),
          isDeleted: false,
        };

        const patient = PatientAggregateRoot.reconstitute(state);

        expect(patient.id).toBe('patient-reconstitute');
        expect(patient.version).toBe(5);
        expect(patient.status).toBe('active');
        expect(patient.noShowCount).toBe(2);
        expect(patient.getUncommittedEvents()).toHaveLength(0);
      });
    });

    describe('fromEvents', () => {
      it('should reconstitute patient from event history', () => {
        const events = [
          {
            type: 'patient.registered',
            payload: {
              phone: '+40721234567',
              email: 'test@example.com',
              firstName: 'Test',
              lastName: 'Patient',
              leadId: 'lead-123',
              source: 'lead_conversion',
            },
            aggregateId: 'patient-from-events',
            aggregateType: 'Patient' as const,
            version: 1,
            timestamp: new Date('2024-01-01'),
          },
          {
            type: 'patient.activated',
            payload: {
              phone: '+40721234567',
              activationReason: 'First appointment completed',
            },
            aggregateId: 'patient-from-events',
            aggregateType: 'Patient' as const,
            version: 2,
            timestamp: new Date('2024-01-15'),
          },
        ];

        const patient = PatientAggregateRoot.fromEvents('patient-from-events', events);

        expect(patient.id).toBe('patient-from-events');
        expect(patient.status).toBe('active');
        expect(patient.version).toBe(2);
        expect(patient.firstName).toBe('Test');
        expect(patient.lastName).toBe('Patient');
      });
    });
  });

  describe('Query methods', () => {
    let patient: PatientAggregateRoot;

    beforeEach(() => {
      patient = PatientAggregateRoot.fromLeadConversion(defaultConversionParams);
      patient.clearUncommittedEvents();
    });

    describe('isActive', () => {
      it('should return false for registered patient', () => {
        expect(patient.isActive()).toBe(false);
      });

      it('should return true for active patient', () => {
        patient.activate('First visit completed');
        expect(patient.isActive()).toBe(true);
      });

      it('should return true for patient under treatment', () => {
        patient.activate('First visit');
        patient.clearUncommittedEvents();
        patient.startTreatment({
          treatmentPlanId: 'plan-1',
          procedureType: 'all_on_4',
          providerId: 'doctor-1',
        });
        expect(patient.isActive()).toBe(true);
        expect(patient.isUnderTreatment()).toBe(true);
      });
    });

    describe('isNewlyRegistered', () => {
      it('should return true for registered patient', () => {
        expect(patient.isNewlyRegistered()).toBe(true);
      });

      it('should return false after activation', () => {
        patient.activate('First visit');
        expect(patient.isNewlyRegistered()).toBe(false);
      });
    });

    describe('canModify', () => {
      it('should return true for active patient', () => {
        patient.activate('First visit');
        expect(patient.canModify()).toBe(true);
      });

      it('should return false for archived patient', () => {
        patient.archive('gdpr_request');
        expect(patient.canModify()).toBe(false);
      });
    });

    describe('hasActiveTreatmentPlans', () => {
      it('should return false when no treatments', () => {
        expect(patient.hasActiveTreatmentPlans()).toBe(false);
      });

      it('should return true when has active treatment', () => {
        patient.activate('First visit');
        patient.clearUncommittedEvents();
        patient.startTreatment({
          treatmentPlanId: 'plan-1',
          procedureType: 'implant',
          providerId: 'doctor-1',
        });
        expect(patient.hasActiveTreatmentPlans()).toBe(true);
      });
    });

    describe('getUpcomingAppointments', () => {
      it('should return empty array when no appointments', () => {
        expect(patient.getUpcomingAppointments()).toHaveLength(0);
      });

      it('should return only future scheduled appointments', () => {
        patient.activate('First visit');
        const futureDate = new Date(Date.now() + 86400000 * 7); // 7 days from now
        patient.scheduleAppointment({
          appointmentId: 'apt-1',
          appointmentType: 'consultation',
          scheduledFor: futureDate,
          duration: 30,
          providerId: 'doctor-1',
        });

        expect(patient.getUpcomingAppointments()).toHaveLength(1);
      });
    });

    describe('hasHighNoShowRate', () => {
      it('should return false with few appointments', () => {
        expect(patient.hasHighNoShowRate()).toBe(false);
      });
    });

    describe('hasValidInsurance', () => {
      it('should return false when no insurance', () => {
        expect(patient.hasValidInsurance()).toBe(false);
      });
    });

    describe('hasAllergies', () => {
      it('should return false when no allergies', () => {
        expect(patient.hasAllergies()).toBe(false);
      });

      it('should return true when allergies recorded', () => {
        patient.activate('First visit');
        patient.recordAllergy('Penicillin', 'moderate', 'Skin rash');
        expect(patient.hasAllergies()).toBe(true);
      });
    });

    describe('hasLifeThreateningAllergies', () => {
      it('should return false when no life-threatening allergies', () => {
        patient.activate('First visit');
        patient.recordAllergy('Latex', 'mild', 'Minor irritation');
        expect(patient.hasLifeThreateningAllergies()).toBe(false);
      });

      it('should return true when has life-threatening allergy', () => {
        patient.activate('First visit');
        patient.recordAllergy('Penicillin', 'life_threatening', 'Anaphylaxis');
        expect(patient.hasLifeThreateningAllergies()).toBe(true);
      });
    });

    describe('hasConsent', () => {
      it('should return false when no consent', () => {
        expect(patient.hasConsent('marketing')).toBe(false);
      });

      it('should return true when consent granted', () => {
        patient.activate('First visit');
        patient.grantConsent('marketing', 'Email marketing', 'electronic');
        expect(patient.hasConsent('marketing')).toBe(true);
      });

      it('should return false when consent expired', () => {
        patient.activate('First visit');
        const pastDate = new Date(Date.now() - 86400000);
        patient.grantConsent('marketing', 'Email marketing', 'electronic', pastDate);
        expect(patient.hasConsent('marketing')).toBe(false);
      });
    });

    describe('getDaysSinceLastContact', () => {
      it('should return undefined when no contact', () => {
        expect(patient.getDaysSinceLastContact()).toBeUndefined();
      });
    });

    describe('needsFollowUp', () => {
      it('should return false when no contact recorded', () => {
        expect(patient.needsFollowUp()).toBe(false);
      });
    });

    describe('getAge', () => {
      it('should return undefined when no date of birth', () => {
        expect(patient.getAge()).toBeUndefined();
      });

      it('should calculate correct age', () => {
        const dateOfBirth = new Date();
        dateOfBirth.setFullYear(dateOfBirth.getFullYear() - 30);
        const patientWithDob = PatientAggregateRoot.fromLeadConversion({
          ...defaultConversionParams,
          dateOfBirth,
        });

        expect(patientWithDob.getAge()).toBe(30);
      });
    });
  });

  describe('Domain methods', () => {
    let patient: PatientAggregateRoot;

    beforeEach(() => {
      patient = PatientAggregateRoot.fromLeadConversion(defaultConversionParams);
      patient.clearUncommittedEvents();
    });

    describe('activate', () => {
      it('should activate registered patient', () => {
        patient.activate('First appointment completed', 'apt-1', 'doctor-1');

        expect(patient.status).toBe('active');
      });

      it('should emit patient.activated event', () => {
        patient.activate('First visit', 'apt-1', 'doctor-1', 'corr-456');
        const events = patient.getUncommittedEvents();

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('patient.activated');
        expect(events[0].correlationId).toBe('corr-456');
      });

      it('should throw for already active patient', () => {
        patient.activate('First visit');
        patient.clearUncommittedEvents();

        expect(() => patient.activate('Second activation')).toThrow(
          InvalidPatientStatusTransitionError
        );
      });
    });

    describe('startTreatment', () => {
      it('should start treatment for active patient', () => {
        patient.activate('First visit');
        patient.clearUncommittedEvents();

        patient.startTreatment({
          treatmentPlanId: 'plan-1',
          procedureType: 'all_on_4',
          providerId: 'doctor-1',
          estimatedCost: 25000,
        });

        expect(patient.status).toBe('under_treatment');
        expect(patient.treatmentPlans).toHaveLength(1);
        expect(patient.treatmentPlans[0].id).toBe('plan-1');
        expect(patient.treatmentPlans[0].status).toBe('active');
      });

      it('should emit patient.treatment_started event', () => {
        patient.activate('First visit');
        patient.clearUncommittedEvents();

        patient.startTreatment({
          treatmentPlanId: 'plan-1',
          procedureType: 'implant',
          providerId: 'doctor-1',
        });

        const events = patient.getUncommittedEvents();
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('patient.treatment_started');
      });

      it('should allow starting treatment for registered patient', () => {
        // Registered patients can start treatment (they get activated implicitly)
        patient.startTreatment({
          treatmentPlanId: 'plan-1',
          procedureType: 'implant',
          providerId: 'doctor-1',
        });

        expect(patient.status).toBe('under_treatment');
      });

      it('should throw when patient is inactive', () => {
        patient.activate('First visit');
        patient.deactivate('no_activity');
        patient.clearUncommittedEvents();

        expect(() =>
          patient.startTreatment({
            treatmentPlanId: 'plan-2',
            procedureType: 'implant',
            providerId: 'doctor-1',
          })
        ).toThrow(PatientNotActiveError);
      });
    });

    describe('completeTreatment', () => {
      it('should complete active treatment', () => {
        patient.activate('First visit');
        patient.startTreatment({
          treatmentPlanId: 'plan-1',
          procedureType: 'implant',
          providerId: 'doctor-1',
        });
        patient.clearUncommittedEvents();

        patient.completeTreatment({
          treatmentPlanId: 'plan-1',
          outcome: 'successful',
          followUpRequired: true,
        });

        expect(patient.status).toBe('post_treatment');
        const completedPlan = patient.treatmentPlans.find((tp) => tp.id === 'plan-1');
        expect(completedPlan?.status).toBe('completed');
        expect(completedPlan?.outcome).toBe('successful');
      });

      it('should throw when treatment not found', () => {
        patient.activate('First visit');

        expect(() =>
          patient.completeTreatment({
            treatmentPlanId: 'nonexistent',
            outcome: 'successful',
            followUpRequired: false,
          })
        ).toThrow(PatientError);
      });

      it('should throw when treatment is not active', () => {
        patient.activate('First visit');
        patient.startTreatment({
          treatmentPlanId: 'plan-1',
          procedureType: 'implant',
          providerId: 'doctor-1',
        });
        patient.completeTreatment({
          treatmentPlanId: 'plan-1',
          outcome: 'successful',
          followUpRequired: false,
        });
        patient.clearUncommittedEvents();

        expect(() =>
          patient.completeTreatment({
            treatmentPlanId: 'plan-1',
            outcome: 'successful',
            followUpRequired: false,
          })
        ).toThrow(PatientError);
      });
    });

    describe('cancelTreatment', () => {
      it('should cancel active treatment', () => {
        patient.activate('First visit');
        patient.startTreatment({
          treatmentPlanId: 'plan-1',
          procedureType: 'implant',
          providerId: 'doctor-1',
        });
        patient.clearUncommittedEvents();

        patient.cancelTreatment('plan-1', 'patient_request', 'Changed mind');

        expect(patient.status).toBe('active');
        const cancelledPlan = patient.treatmentPlans.find((tp) => tp.id === 'plan-1');
        expect(cancelledPlan?.status).toBe('cancelled');
      });

      it('should throw when treatment not found', () => {
        patient.activate('First visit');

        expect(() => patient.cancelTreatment('nonexistent', 'patient_request')).toThrow(
          PatientError
        );
      });
    });

    describe('scheduleAppointment', () => {
      it('should schedule appointment', () => {
        patient.activate('First visit');
        patient.clearUncommittedEvents();

        const scheduledFor = new Date(Date.now() + 86400000);
        patient.scheduleAppointment({
          appointmentId: 'apt-1',
          appointmentType: 'consultation',
          scheduledFor,
          duration: 60,
          providerId: 'doctor-1',
        });

        expect(patient.appointments).toHaveLength(1);
        expect(patient.appointments[0].id).toBe('apt-1');
        expect(patient.appointments[0].status).toBe('scheduled');
      });
    });

    describe('completeAppointment', () => {
      it('should complete scheduled appointment', () => {
        patient.activate('First visit');
        const scheduledFor = new Date(Date.now() + 86400000);
        patient.scheduleAppointment({
          appointmentId: 'apt-1',
          appointmentType: 'consultation',
          scheduledFor,
          duration: 60,
          providerId: 'doctor-1',
        });
        patient.clearUncommittedEvents();

        patient.completeAppointment('apt-1', 'doctor-1', 'Good progress');

        const apt = patient.appointments.find((a) => a.id === 'apt-1');
        expect(apt?.status).toBe('completed');
      });

      it('should throw when appointment not found', () => {
        patient.activate('First visit');

        expect(() => patient.completeAppointment('nonexistent', 'doctor-1')).toThrow(PatientError);
      });
    });

    describe('cancelAppointment', () => {
      it('should cancel scheduled appointment', () => {
        patient.activate('First visit');
        const scheduledFor = new Date(Date.now() + 86400000 * 3); // 3 days from now
        patient.scheduleAppointment({
          appointmentId: 'apt-1',
          appointmentType: 'consultation',
          scheduledFor,
          duration: 60,
          providerId: 'doctor-1',
        });
        patient.clearUncommittedEvents();

        patient.cancelAppointment('apt-1', 'Scheduling conflict', 'patient');

        const apt = patient.appointments.find((a) => a.id === 'apt-1');
        expect(apt?.status).toBe('cancelled');
      });

      it('should throw when appointment not found', () => {
        patient.activate('First visit');

        expect(() => patient.cancelAppointment('nonexistent', 'reason', 'patient')).toThrow(
          PatientError
        );
      });
    });

    describe('recordNoShow', () => {
      it('should record no-show and increment counter', () => {
        patient.activate('First visit');
        const scheduledFor = new Date(Date.now() - 3600000); // 1 hour ago
        patient.scheduleAppointment({
          appointmentId: 'apt-1',
          appointmentType: 'consultation',
          scheduledFor,
          duration: 60,
          providerId: 'doctor-1',
        });
        patient.clearUncommittedEvents();

        const initialNoShowCount = patient.noShowCount;
        patient.recordNoShow('apt-1', true, 'Left voicemail');

        expect(patient.noShowCount).toBe(initialNoShowCount + 1);
        const apt = patient.appointments.find((a) => a.id === 'apt-1');
        expect(apt?.status).toBe('no_show');
      });
    });

    describe('addMedicalHistory', () => {
      it('should add medical history entry', () => {
        patient.activate('First visit');
        patient.clearUncommittedEvents();

        patient.addMedicalHistory({
          conditionType: 'chronic',
          description: 'Type 2 Diabetes',
          severity: 'moderate',
          currentStatus: 'managed',
        });

        expect(patient.medicalHistory).toHaveLength(1);
        expect(patient.medicalHistory[0].conditionType).toBe('chronic');
        expect(patient.medicalHistory[0].description).toBe('Type 2 Diabetes');
      });
    });

    describe('recordAllergy', () => {
      it('should record new allergy', () => {
        patient.activate('First visit');
        patient.clearUncommittedEvents();

        patient.recordAllergy('Penicillin', 'severe', 'Swelling and hives');

        expect(patient.allergies).toHaveLength(1);
        expect(patient.allergies[0].allergen).toBe('Penicillin');
        expect(patient.allergies[0].severity).toBe('severe');
      });

      it('should throw when allergy already exists', () => {
        patient.activate('First visit');
        patient.recordAllergy('Penicillin', 'severe', 'Swelling');
        patient.clearUncommittedEvents();

        expect(() => patient.recordAllergy('Penicillin', 'moderate', 'Rash')).toThrow(PatientError);
      });

      it('should check case-insensitive for duplicates', () => {
        patient.activate('First visit');
        patient.recordAllergy('Penicillin', 'severe', 'Swelling');
        patient.clearUncommittedEvents();

        expect(() => patient.recordAllergy('PENICILLIN', 'moderate', 'Rash')).toThrow(PatientError);
      });
    });

    describe('addInsurance', () => {
      it('should add insurance information', () => {
        patient.activate('First visit');
        patient.clearUncommittedEvents();

        const effectiveFrom = new Date('2024-01-01');
        patient.addInsurance({
          id: 'ins-1',
          providerId: 'provider-1',
          providerName: 'Health Insurance Co.',
          policyNumber: 'POL-123456',
          coverageType: 'full',
          effectiveFrom,
        });

        expect(patient.insuranceInfo).toBeDefined();
        expect(patient.insuranceInfo?.providerId).toBe('provider-1');
        expect(patient.insuranceInfo?.status).toBe('pending');
      });
    });

    describe('verifyInsurance', () => {
      it('should verify insurance as active', () => {
        patient.activate('First visit');
        patient.addInsurance({
          id: 'ins-1',
          providerId: 'provider-1',
          providerName: 'Health Insurance Co.',
          policyNumber: 'POL-123456',
          coverageType: 'full',
          effectiveFrom: new Date('2024-01-01'),
        });
        patient.clearUncommittedEvents();

        patient.verifyInsurance({ verificationStatus: 'active' });

        expect(patient.insuranceInfo?.status).toBe('verified');
      });

      it('should throw when no insurance to verify', () => {
        patient.activate('First visit');

        expect(() => patient.verifyInsurance({ verificationStatus: 'active' })).toThrow(
          PatientError
        );
      });
    });

    describe('grantConsent', () => {
      it('should grant consent', () => {
        patient.activate('First visit');
        patient.clearUncommittedEvents();

        patient.grantConsent('marketing', 'Email marketing communications', 'electronic');

        expect(patient.hasConsent('marketing')).toBe(true);
      });
    });

    describe('revokeConsent', () => {
      it('should revoke consent', () => {
        patient.activate('First visit');
        patient.grantConsent('marketing', 'Email marketing', 'electronic');
        patient.clearUncommittedEvents();

        patient.revokeConsent('marketing', 'No longer interested');

        expect(patient.hasConsent('marketing')).toBe(false);
      });
    });

    describe('updateDemographics', () => {
      it('should update patient demographics', () => {
        patient.activate('First visit');
        patient.clearUncommittedEvents();

        patient.updateDemographics({
          firstName: 'Ioan',
          email: 'newemail@example.com',
          city: 'Cluj-Napoca',
        });

        expect(patient.firstName).toBe('Ioan');
        expect(patient.email).toBe('newemail@example.com');
        const state = patient.getState();
        expect(state.city).toBe('Cluj-Napoca');
      });
    });

    describe('updatePreferences', () => {
      it('should update patient preferences', () => {
        patient.activate('First visit');
        patient.clearUncommittedEvents();

        patient.updatePreferences({
          preferredLanguage: 'en',
          preferredContactTime: 'evening',
          doNotContact: true,
        });

        expect(patient.preferences.preferredLanguage).toBe('en');
        expect(patient.preferences.preferredContactTime).toBe('evening');
        expect(patient.preferences.doNotContact).toBe(true);
      });
    });

    describe('assignProvider', () => {
      it('should assign provider to patient', () => {
        patient.activate('First visit');
        patient.clearUncommittedEvents();

        patient.assignProvider('doctor-2', 'specialist', 'admin-1', 'Specialist consultation');

        const state = patient.getState();
        expect(state.assignedProviders).toHaveLength(1);
        expect(state.assignedProviders[0].providerId).toBe('doctor-2');
        expect(state.assignedProviders[0].role).toBe('specialist');
      });

      it('should update primary provider when assigning primary role', () => {
        patient.activate('First visit');
        patient.clearUncommittedEvents();

        patient.assignProvider('doctor-new', 'primary');

        expect(patient.primaryProviderId).toBe('doctor-new');
      });
    });

    describe('recordContact', () => {
      it('should record contact with patient', () => {
        patient.activate('First visit');
        patient.clearUncommittedEvents();

        patient.recordContact('whatsapp', 'outbound', 'appointment_reminder', 'reached');

        const state = patient.getState();
        expect(state.lastContactAt).toBeDefined();
      });
    });

    describe('deactivate', () => {
      it('should deactivate patient without active treatments', () => {
        patient.activate('First visit');
        patient.clearUncommittedEvents();

        patient.deactivate('no_activity', 'No appointments in 6 months');

        expect(patient.status).toBe('inactive');
      });

      it('should throw when patient has active treatments', () => {
        patient.activate('First visit');
        patient.startTreatment({
          treatmentPlanId: 'plan-1',
          procedureType: 'implant',
          providerId: 'doctor-1',
        });
        patient.clearUncommittedEvents();

        expect(() => patient.deactivate('no_activity')).toThrow(PatientError);
      });
    });

    describe('archive', () => {
      it('should archive patient without active treatments', () => {
        patient.activate('First visit');
        patient.clearUncommittedEvents();

        patient.archive('gdpr_request', 'Patient requested data deletion');

        expect(patient.status).toBe('archived');
        expect(patient.isDeleted).toBe(true);
        expect(patient.canModify()).toBe(false);
      });

      it('should be idempotent when already archived', () => {
        patient.archive('gdpr_request');
        patient.clearUncommittedEvents();

        // Should not throw
        patient.archive('retention_policy');

        // Should not emit new event
        expect(patient.getUncommittedEvents()).toHaveLength(0);
      });

      it('should throw when patient has active treatments', () => {
        patient.activate('First visit');
        patient.startTreatment({
          treatmentPlanId: 'plan-1',
          procedureType: 'implant',
          providerId: 'doctor-1',
        });
        patient.clearUncommittedEvents();

        expect(() => patient.archive('gdpr_request')).toThrow(PatientError);
      });
    });
  });

  describe('Event sourcing', () => {
    it('should track uncommitted events', () => {
      const patient = PatientAggregateRoot.fromLeadConversion(defaultConversionParams);
      patient.activate('First visit');

      const events = patient.getUncommittedEvents();
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('patient.registered');
      expect(events[1].type).toBe('patient.activated');
    });

    it('should clear uncommitted events', () => {
      const patient = PatientAggregateRoot.fromLeadConversion(defaultConversionParams);
      expect(patient.getUncommittedEvents()).toHaveLength(1);

      patient.clearUncommittedEvents();
      expect(patient.getUncommittedEvents()).toHaveLength(0);
    });

    it('should return state snapshot', () => {
      const patient = PatientAggregateRoot.fromLeadConversion(defaultConversionParams);
      patient.activate('First visit');

      const state = patient.getState();
      expect(state.status).toBe('active');
      expect(state.firstName).toBe('Ion');
    });

    it('should increment version with each event', () => {
      const patient = PatientAggregateRoot.fromLeadConversion(defaultConversionParams);
      expect(patient.version).toBe(1);

      patient.activate('First visit');
      expect(patient.version).toBe(2);
    });
  });

  describe('Error conditions', () => {
    let patient: PatientAggregateRoot;

    beforeEach(() => {
      patient = PatientAggregateRoot.fromLeadConversion(defaultConversionParams);
    });

    it('should throw PatientDeletedError when modifying archived patient', () => {
      // When archived, isDeleted is set to true, so PatientDeletedError is thrown first
      patient.archive('gdpr_request');
      patient.clearUncommittedEvents();

      expect(() => patient.updatePreferences({ preferredLanguage: 'en' })).toThrow(
        PatientDeletedError
      );
    });

    it('should throw PatientDeletedError when updating demographics of archived patient', () => {
      // Archive sets isDeleted=true, so PatientDeletedError takes precedence
      patient.archive('gdpr_request');
      patient.clearUncommittedEvents();

      expect(() => patient.updateDemographics({ firstName: 'New' })).toThrow(PatientDeletedError);
    });

    it('should report canModify as false for archived patient', () => {
      patient.archive('gdpr_request');

      expect(patient.canModify()).toBe(false);
      expect(patient.isDeleted).toBe(true);
      expect(patient.status).toBe('archived');
    });
  });

  describe('Error classes', () => {
    describe('PatientError', () => {
      it('should create error with code and patient id', () => {
        const error = new PatientError('TEST_CODE', 'patient-123', 'Test message');

        expect(error.name).toBe('PatientError');
        expect(error.code).toBe('TEST_CODE');
        expect(error.patientId).toBe('patient-123');
        expect(error.message).toBe('Test message');
      });
    });

    describe('PatientDeletedError', () => {
      it('should create error with correct message', () => {
        const error = new PatientDeletedError('patient-456');

        expect(error.name).toBe('PatientDeletedError');
        expect(error.code).toBe('PATIENT_DELETED');
        expect(error.patientId).toBe('patient-456');
      });
    });

    describe('PatientArchivedError', () => {
      it('should create error with correct message', () => {
        const error = new PatientArchivedError('patient-789');

        expect(error.name).toBe('PatientArchivedError');
        expect(error.code).toBe('PATIENT_ARCHIVED');
        expect(error.patientId).toBe('patient-789');
      });
    });

    describe('PatientNotActiveError', () => {
      it('should create error with status', () => {
        const error = new PatientNotActiveError('patient-not-active', 'registered');

        expect(error.name).toBe('PatientNotActiveError');
        expect(error.code).toBe('PATIENT_NOT_ACTIVE');
        expect(error.status).toBe('registered');
      });
    });

    describe('InvalidPatientStatusTransitionError', () => {
      it('should create error with transition details', () => {
        const error = new InvalidPatientStatusTransitionError(
          'patient-transition',
          'registered',
          'under_treatment'
        );

        expect(error.name).toBe('InvalidPatientStatusTransitionError');
        expect(error.code).toBe('INVALID_STATUS_TRANSITION');
        expect(error.fromStatus).toBe('registered');
        expect(error.toStatus).toBe('under_treatment');
      });
    });
  });
});
