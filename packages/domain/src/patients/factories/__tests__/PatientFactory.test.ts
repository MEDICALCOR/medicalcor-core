/**
 * Tests for PatientFactory
 *
 * Covers:
 * - Patient creation from lead conversion
 * - Direct patient creation
 * - Patient creation with generated IDs
 * - Event-sourced reconstitution
 * - Snapshot creation and restoration
 * - Database record hydration
 * - Empty patient creation
 */

import { describe, it, expect, vi } from 'vitest';
import {
  PatientFactory,
  patientFactory,
  type PatientAggregateSnapshot,
  type PatientRecord,
} from '../PatientFactory.js';
import { PhoneNumber } from '../../../shared-kernel/value-objects/phone-number.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createTestPhoneNumber(): PhoneNumber {
  return PhoneNumber.create('+40700000001');
}

function createFromLeadConversionParams() {
  return {
    id: 'patient-123',
    leadId: 'lead-456',
    phone: createTestPhoneNumber(),
    firstName: 'Ion',
    lastName: 'Popescu',
    conversionProcedure: 'dental_implant',
  };
}

function createPatientParams() {
  return {
    id: 'patient-789',
    phone: createTestPhoneNumber(),
    firstName: 'Maria',
    lastName: 'Ionescu',
    source: 'direct_registration' as const,
  };
}

function createPatientRecord(): PatientRecord {
  const now = new Date();
  return {
    id: 'patient-db-123',
    version: 5,
    leadId: 'lead-789',
    phone: createTestPhoneNumber(),
    email: 'patient@example.com',
    hubspotContactId: 'hubspot-contact-123',
    firstName: 'Alexandru',
    lastName: 'Georgescu',
    dateOfBirth: new Date('1985-06-15'),
    address: 'Str. Exemplu 123',
    city: 'București',
    county: 'Ilfov',
    status: 'active',
    registeredAt: now,
    activatedAt: now,
    deactivatedAt: undefined,
    archivedAt: undefined,
    medicalHistory: [
      {
        id: 'mh-1',
        conditionType: 'chronic',
        description: 'Hypertension',
        diagnosedAt: new Date('2020-01-01'),
        severity: 'moderate',
        currentStatus: 'managed',
        addedAt: now,
      },
    ],
    allergies: [
      {
        id: 'allergy-1',
        allergen: 'Penicillin',
        severity: 'severe',
        reaction: 'Anaphylaxis',
        verifiedAt: now,
      },
    ],
    treatmentPlans: [
      {
        id: 'tp-1',
        procedureType: 'dental_implant',
        providerId: 'dr-123',
        status: 'active',
        startedAt: now,
        completedAt: undefined,
        outcome: undefined,
      },
    ],
    appointments: [
      {
        id: 'apt-1',
        appointmentType: 'consultation',
        scheduledFor: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        duration: 60,
        providerId: 'dr-123',
        status: 'scheduled',
        isFollowUp: false,
        treatmentPlanId: 'tp-1',
      },
    ],
    noShowCount: 1,
    insuranceInfo: {
      id: 'ins-1',
      providerId: 'ins-provider-1',
      providerName: 'Allianz',
      policyNumber: 'POL123456',
      groupNumber: 'GRP789',
      coverageType: 'full',
      effectiveFrom: new Date('2024-01-01'),
      effectiveUntil: new Date('2024-12-31'),
      status: 'verified',
      verifiedAt: now,
    },
    consents: {
      treatment: {
        type: 'treatment',
        status: 'granted',
        grantedAt: now,
        expiresAt: new Date(now.getTime() + 2 * 365 * 24 * 60 * 60 * 1000),
        method: 'electronic',
      },
      marketing: {
        type: 'marketing',
        status: 'denied',
      },
    },
    assignedProviders: [
      {
        providerId: 'dr-123',
        role: 'primary',
        assignedAt: now,
      },
    ],
    primaryProviderId: 'dr-123',
    preferences: {
      preferredLanguage: 'ro',
      preferredChannel: 'whatsapp',
      preferredContactTime: 'morning',
      doNotContact: false,
      specialInstructions: 'Call before 10 AM',
    },
    source: 'lead_conversion',
    conversionProcedure: 'all_on_4',
    lastContactAt: now,
    lastAppointmentAt: undefined,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    deletedAt: undefined,
    deletionReason: undefined,
  };
}

function createPatientSnapshot(): PatientAggregateSnapshot {
  const now = new Date();
  return {
    aggregateId: 'patient-snap-123',
    aggregateType: 'Patient',
    version: 3,
    state: {
      leadId: 'lead-snap-456',
      phone: '+40700000002',
      email: 'snapshot@example.com',
      hubspotContactId: 'hubspot-snap-123',
      firstName: 'Elena',
      lastName: 'Vasilescu',
      dateOfBirth: '1990-03-20',
      address: 'Bd. Unirii 50',
      city: 'Cluj-Napoca',
      county: 'Cluj',
      status: 'active',
      registeredAt: now.toISOString(),
      activatedAt: now.toISOString(),
      deactivatedAt: undefined,
      archivedAt: undefined,
      medicalHistory: [],
      allergies: [],
      treatmentPlans: [],
      appointments: [],
      noShowCount: 0,
      insuranceInfo: undefined,
      consents: {},
      assignedProviders: [],
      primaryProviderId: undefined,
      preferences: {
        preferredLanguage: 'ro',
        preferredChannel: 'sms',
        preferredContactTime: 'afternoon',
        doNotContact: false,
      },
      source: 'referral',
      conversionProcedure: undefined,
      lastContactAt: undefined,
      lastAppointmentAt: undefined,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      isDeleted: false,
      deletedAt: undefined,
      deletionReason: undefined,
    },
    createdAt: now.toISOString(),
  };
}

// ============================================================================
// FACTORY TESTS
// ============================================================================

describe('PatientFactory', () => {
  const factory = new PatientFactory();

  // ============================================================================
  // FROM LEAD CONVERSION
  // ============================================================================

  describe('fromLeadConversion', () => {
    it('should create patient from lead conversion', () => {
      const params = createFromLeadConversionParams();

      const patient = factory.fromLeadConversion(params);

      expect(patient).toBeDefined();
      expect(patient.getState().id).toBe('patient-123');
      expect(patient.getState().leadId).toBe('lead-456');
      expect(patient.getState().firstName).toBe('Ion');
      expect(patient.getState().lastName).toBe('Popescu');
      expect(patient.getState().source).toBe('lead_conversion');
    });

    it('should create patient with correlation ID', () => {
      const params = createFromLeadConversionParams();

      const patient = factory.fromLeadConversion(params, 'corr-123');

      expect(patient).toBeDefined();
      const events = patient.getUncommittedEvents();
      expect(events.length).toBeGreaterThan(0);
    });

    it('should create patient with email if provided', () => {
      const params = {
        ...createFromLeadConversionParams(),
        email: 'ion.popescu@example.com',
      };

      const patient = factory.fromLeadConversion(params);

      expect(patient.getState().email).toBe('ion.popescu@example.com');
    });
  });

  // ============================================================================
  // FROM LEAD CONVERSION WITH GENERATED ID
  // ============================================================================

  describe('fromLeadConversionWithGeneratedId', () => {
    it('should create patient with generated ID', () => {
      const params = {
        leadId: 'lead-gen-456',
        phone: createTestPhoneNumber(),
        firstName: 'Andrei',
        lastName: 'Mihai',
        conversionProcedure: 'crown',
      };

      const patient = factory.fromLeadConversionWithGeneratedId(params);

      expect(patient).toBeDefined();
      expect(patient.getState().id).toMatch(/^patient-\d+-[a-z0-9]+$/);
      expect(patient.getState().leadId).toBe('lead-gen-456');
    });

    it('should create patient with correlation ID', () => {
      const params = {
        leadId: 'lead-gen-789',
        phone: createTestPhoneNumber(),
        firstName: 'Diana',
        lastName: 'Popa',
        conversionProcedure: 'veneer',
      };

      const patient = factory.fromLeadConversionWithGeneratedId(params, 'corr-gen-123');

      expect(patient).toBeDefined();
    });
  });

  // ============================================================================
  // DIRECT CREATION
  // ============================================================================

  describe('create', () => {
    it('should create patient directly', () => {
      const params = createPatientParams();

      const patient = factory.create(params);

      expect(patient).toBeDefined();
      expect(patient.getState().id).toBe('patient-789');
      expect(patient.getState().firstName).toBe('Maria');
      expect(patient.getState().lastName).toBe('Ionescu');
      expect(patient.getState().source).toBe('direct_registration');
    });

    it('should create patient with correlation ID', () => {
      const params = createPatientParams();

      const patient = factory.create(params, 'corr-direct-456');

      expect(patient).toBeDefined();
    });
  });

  // ============================================================================
  // CREATE WITH GENERATED ID
  // ============================================================================

  describe('createWithGeneratedId', () => {
    it('should create patient with generated ID', () => {
      const params = {
        phone: createTestPhoneNumber(),
        firstName: 'Cristian',
        lastName: 'Dumitru',
        source: 'referral' as const,
      };

      const patient = factory.createWithGeneratedId(params);

      expect(patient).toBeDefined();
      expect(patient.getState().id).toMatch(/^patient-\d+-[a-z0-9]+$/);
      expect(patient.getState().firstName).toBe('Cristian');
    });

    it('should create patient with correlation ID', () => {
      const params = {
        phone: createTestPhoneNumber(),
        firstName: 'Gabriela',
        lastName: 'Stan',
        source: 'transfer' as const,
      };

      const patient = factory.createWithGeneratedId(params, 'corr-generated-789');

      expect(patient).toBeDefined();
    });
  });

  // ============================================================================
  // RECONSTITUTION FROM EVENTS
  // ============================================================================

  describe('reconstitute', () => {
    it('should reconstitute patient from empty events', () => {
      const patient = factory.reconstitute('patient-recon-123', []);

      expect(patient).toBeDefined();
      expect(patient.getState().id).toBe('patient-recon-123');
    });

    it('should reconstitute patient from events', () => {
      // Create a patient first to get some events
      const original = factory.create(createPatientParams());
      const events = original.getUncommittedEvents();

      // Reconstitute from those events
      const reconstituted = factory.reconstitute('patient-789', events);

      expect(reconstituted).toBeDefined();
      expect(reconstituted.getState().id).toBe('patient-789');
    });
  });

  // ============================================================================
  // FROM DATABASE RECORD
  // ============================================================================

  describe('fromDatabaseRecord', () => {
    it('should hydrate patient from database record', () => {
      const record = createPatientRecord();

      const patient = factory.fromDatabaseRecord(record);

      expect(patient).toBeDefined();
      expect(patient.getState().id).toBe('patient-db-123');
      expect(patient.getState().version).toBe(5);
      expect(patient.getState().firstName).toBe('Alexandru');
      expect(patient.getState().lastName).toBe('Georgescu');
      expect(patient.getState().email).toBe('patient@example.com');
    });

    it('should hydrate medical history', () => {
      const record = createPatientRecord();

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.getState().medicalHistory.length).toBe(1);
      expect(patient.getState().medicalHistory[0].conditionType).toBe('chronic');
      expect(patient.getState().medicalHistory[0].description).toBe('Hypertension');
    });

    it('should hydrate allergies', () => {
      const record = createPatientRecord();

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.getState().allergies.length).toBe(1);
      expect(patient.getState().allergies[0].allergen).toBe('Penicillin');
      expect(patient.getState().allergies[0].severity).toBe('severe');
    });

    it('should hydrate treatment plans', () => {
      const record = createPatientRecord();

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.getState().treatmentPlans.length).toBe(1);
      expect(patient.getState().treatmentPlans[0].procedureType).toBe('dental_implant');
    });

    it('should hydrate appointments', () => {
      const record = createPatientRecord();

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.getState().appointments.length).toBe(1);
      expect(patient.getState().appointments[0].appointmentType).toBe('consultation');
    });

    it('should hydrate insurance info', () => {
      const record = createPatientRecord();

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.getState().insuranceInfo).toBeDefined();
      expect(patient.getState().insuranceInfo?.providerName).toBe('Allianz');
      expect(patient.getState().insuranceInfo?.policyNumber).toBe('POL123456');
    });

    it('should hydrate consents', () => {
      const record = createPatientRecord();

      const patient = factory.fromDatabaseRecord(record);

      expect(Object.keys(patient.getState().consents).length).toBe(2);
      expect(patient.getState().consents['treatment'].status).toBe('granted');
      expect(patient.getState().consents['marketing'].status).toBe('denied');
    });

    it('should hydrate assigned providers', () => {
      const record = createPatientRecord();

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.getState().assignedProviders.length).toBe(1);
      expect(patient.getState().assignedProviders[0].providerId).toBe('dr-123');
      expect(patient.getState().assignedProviders[0].role).toBe('primary');
    });

    it('should hydrate preferences', () => {
      const record = createPatientRecord();

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.getState().preferences.preferredLanguage).toBe('ro');
      expect(patient.getState().preferences.preferredChannel).toBe('whatsapp');
      expect(patient.getState().preferences.preferredContactTime).toBe('morning');
    });

    it('should handle isDeleted flag', () => {
      const record: PatientRecord = {
        ...createPatientRecord(),
        isDeleted: true,
        deletedAt: new Date(),
        deletionReason: 'GDPR erasure request',
      };

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.getState().isDeleted).toBe(true);
      expect(patient.getState().deletedAt).toBeDefined();
      expect(patient.getState().deletionReason).toBe('GDPR erasure request');
    });

    it('should handle record without optional fields', () => {
      const record: PatientRecord = {
        ...createPatientRecord(),
        leadId: undefined,
        email: undefined,
        hubspotContactId: undefined,
        dateOfBirth: undefined,
        address: undefined,
        insuranceInfo: undefined,
      };

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.getState().leadId).toBeUndefined();
      expect(patient.getState().email).toBeUndefined();
      expect(patient.getState().insuranceInfo).toBeUndefined();
    });
  });

  // ============================================================================
  // SNAPSHOT OPERATIONS
  // ============================================================================

  describe('fromSnapshot', () => {
    it('should restore patient from snapshot', () => {
      const snapshot = createPatientSnapshot();

      const patient = factory.fromSnapshot(snapshot);

      expect(patient).toBeDefined();
      expect(patient.getState().id).toBe('patient-snap-123');
      expect(patient.getState().version).toBe(3);
      expect(patient.getState().firstName).toBe('Elena');
      expect(patient.getState().lastName).toBe('Vasilescu');
    });

    it('should restore patient from snapshot with additional events', () => {
      const snapshot = createPatientSnapshot();

      // Create some events to apply after snapshot
      const tempPatient = factory.create(createPatientParams());
      const events = tempPatient.getUncommittedEvents();

      const patient = factory.fromSnapshot(snapshot, events);

      expect(patient).toBeDefined();
      expect(patient.getState().id).toBe('patient-snap-123');
    });

    it('should convert date strings back to Date objects', () => {
      const snapshot = createPatientSnapshot();

      const patient = factory.fromSnapshot(snapshot);

      expect(patient.getState().registeredAt).toBeInstanceOf(Date);
      expect(patient.getState().activatedAt).toBeInstanceOf(Date);
      expect(patient.getState().createdAt).toBeInstanceOf(Date);
      expect(patient.getState().updatedAt).toBeInstanceOf(Date);
    });

    it('should restore phone number', () => {
      const snapshot = createPatientSnapshot();

      const patient = factory.fromSnapshot(snapshot);

      expect(patient.getState().phone.e164).toBe('+40700000002');
    });

    it('should restore preferences', () => {
      const snapshot = createPatientSnapshot();

      const patient = factory.fromSnapshot(snapshot);

      expect(patient.getState().preferences.preferredLanguage).toBe('ro');
      expect(patient.getState().preferences.preferredChannel).toBe('sms');
    });
  });

  describe('createSnapshot', () => {
    it('should create snapshot from patient', () => {
      const patient = factory.create(createPatientParams());

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot).toBeDefined();
      expect(snapshot.aggregateId).toBe('patient-789');
      expect(snapshot.aggregateType).toBe('Patient');
      expect(snapshot.version).toBeDefined();
      expect(snapshot.state).toBeDefined();
      expect(snapshot.createdAt).toBeDefined();
    });

    it('should serialize dates as ISO strings', () => {
      const patient = factory.create(createPatientParams());

      const snapshot = factory.createSnapshot(patient);

      expect(typeof snapshot.state.registeredAt).toBe('string');
      expect(typeof snapshot.state.createdAt).toBe('string');
      expect(typeof snapshot.state.updatedAt).toBe('string');
    });

    it('should serialize phone as E164 string', () => {
      const patient = factory.create(createPatientParams());

      const snapshot = factory.createSnapshot(patient);

      expect(typeof snapshot.state.phone).toBe('string');
      expect(snapshot.state.phone).toMatch(/^\+\d+$/);
    });

    it('should round-trip snapshot correctly', () => {
      const original = factory.create(createPatientParams());
      const snapshot = factory.createSnapshot(original);

      const restored = factory.fromSnapshot(snapshot);

      expect(restored.getState().id).toBe(original.getState().id);
      expect(restored.getState().firstName).toBe(original.getState().firstName);
      expect(restored.getState().lastName).toBe(original.getState().lastName);
      expect(restored.getState().phone.e164).toBe(original.getState().phone.e164);
    });
  });

  // ============================================================================
  // CREATE EMPTY
  // ============================================================================

  describe('createEmpty', () => {
    it('should create empty patient for reconstitution', () => {
      const patient = factory.createEmpty('patient-empty-123');

      expect(patient).toBeDefined();
      expect(patient.getState().id).toBe('patient-empty-123');
    });
  });

  // ============================================================================
  // SINGLETON INSTANCE
  // ============================================================================

  describe('Singleton Instance', () => {
    it('should export default factory instance', () => {
      expect(patientFactory).toBeDefined();
      expect(patientFactory).toBeInstanceOf(PatientFactory);
    });

    it('should work with singleton instance', () => {
      const params = createPatientParams();

      const patient = patientFactory.create(params);

      expect(patient).toBeDefined();
      expect(patient.getState().id).toBe('patient-789');
    });
  });

  // ============================================================================
  // COMPREHENSIVE BRANCH COVERAGE TESTS
  // ============================================================================

  describe('Branch Coverage - fromSnapshot', () => {
    it('should handle snapshot with empty events array', () => {
      const snapshot = createPatientSnapshot();

      const patient = factory.fromSnapshot(snapshot, []);

      expect(patient).toBeDefined();
      expect(patient.getState().id).toBe('patient-snap-123');
    });

    it('should handle snapshot with all optional dates undefined', () => {
      const snapshot: PatientAggregateSnapshot = {
        ...createPatientSnapshot(),
        state: {
          ...createPatientSnapshot().state,
          dateOfBirth: undefined,
          activatedAt: undefined,
          deactivatedAt: undefined,
          archivedAt: undefined,
          lastContactAt: undefined,
          lastAppointmentAt: undefined,
          deletedAt: undefined,
        },
      };

      const patient = factory.fromSnapshot(snapshot);

      expect(patient.getState().dateOfBirth).toBeUndefined();
      expect(patient.getState().activatedAt).toBeUndefined();
      expect(patient.getState().deactivatedAt).toBeUndefined();
      expect(patient.getState().archivedAt).toBeUndefined();
      expect(patient.getState().lastContactAt).toBeUndefined();
      expect(patient.getState().lastAppointmentAt).toBeUndefined();
      expect(patient.getState().deletedAt).toBeUndefined();
    });

    it('should handle snapshot with all optional dates defined', () => {
      const now = new Date();
      const snapshot: PatientAggregateSnapshot = {
        ...createPatientSnapshot(),
        state: {
          ...createPatientSnapshot().state,
          dateOfBirth: now.toISOString(),
          activatedAt: now.toISOString(),
          deactivatedAt: now.toISOString(),
          archivedAt: now.toISOString(),
          lastContactAt: now.toISOString(),
          lastAppointmentAt: now.toISOString(),
          deletedAt: now.toISOString(),
          deletionReason: 'Test deletion',
        },
      };

      const patient = factory.fromSnapshot(snapshot);

      expect(patient.getState().dateOfBirth).toBeInstanceOf(Date);
      expect(patient.getState().activatedAt).toBeInstanceOf(Date);
      expect(patient.getState().deactivatedAt).toBeInstanceOf(Date);
      expect(patient.getState().archivedAt).toBeInstanceOf(Date);
      expect(patient.getState().lastContactAt).toBeInstanceOf(Date);
      expect(patient.getState().lastAppointmentAt).toBeInstanceOf(Date);
      expect(patient.getState().deletedAt).toBeInstanceOf(Date);
    });

    it('should handle snapshot with medical history with undefined diagnosedAt', () => {
      const now = new Date();
      const snapshot: PatientAggregateSnapshot = {
        ...createPatientSnapshot(),
        state: {
          ...createPatientSnapshot().state,
          medicalHistory: [
            {
              id: 'mh-1',
              conditionType: 'chronic',
              description: 'Test condition',
              diagnosedAt: undefined,
              severity: 'moderate',
              currentStatus: 'active',
              addedAt: now.toISOString(),
            },
          ],
        },
      };

      const patient = factory.fromSnapshot(snapshot);

      expect(patient.getState().medicalHistory[0].diagnosedAt).toBeUndefined();
      expect(patient.getState().medicalHistory[0].addedAt).toBeInstanceOf(Date);
    });

    it('should handle snapshot with medical history with defined diagnosedAt', () => {
      const now = new Date();
      const snapshot: PatientAggregateSnapshot = {
        ...createPatientSnapshot(),
        state: {
          ...createPatientSnapshot().state,
          medicalHistory: [
            {
              id: 'mh-1',
              conditionType: 'acute',
              description: 'Test condition',
              diagnosedAt: now.toISOString(),
              severity: 'severe',
              currentStatus: 'resolved',
              addedAt: now.toISOString(),
            },
          ],
        },
      };

      const patient = factory.fromSnapshot(snapshot);

      expect(patient.getState().medicalHistory[0].diagnosedAt).toBeInstanceOf(Date);
    });

    it('should handle snapshot with allergies with undefined verifiedAt', () => {
      const snapshot: PatientAggregateSnapshot = {
        ...createPatientSnapshot(),
        state: {
          ...createPatientSnapshot().state,
          allergies: [
            {
              id: 'allergy-1',
              allergen: 'Latex',
              severity: 'mild',
              reaction: 'Rash',
              verifiedAt: undefined,
            },
          ],
        },
      };

      const patient = factory.fromSnapshot(snapshot);

      expect(patient.getState().allergies[0].verifiedAt).toBeUndefined();
    });

    it('should handle snapshot with allergies with defined verifiedAt', () => {
      const now = new Date();
      const snapshot: PatientAggregateSnapshot = {
        ...createPatientSnapshot(),
        state: {
          ...createPatientSnapshot().state,
          allergies: [
            {
              id: 'allergy-1',
              allergen: 'Sulfa',
              severity: 'moderate',
              reaction: 'Hives',
              verifiedAt: now.toISOString(),
            },
          ],
        },
      };

      const patient = factory.fromSnapshot(snapshot);

      expect(patient.getState().allergies[0].verifiedAt).toBeInstanceOf(Date);
    });

    it('should handle snapshot with treatment plans with undefined completedAt', () => {
      const now = new Date();
      const snapshot: PatientAggregateSnapshot = {
        ...createPatientSnapshot(),
        state: {
          ...createPatientSnapshot().state,
          treatmentPlans: [
            {
              id: 'tp-1',
              procedureType: 'cleaning',
              providerId: 'dr-456',
              status: 'active',
              startedAt: now.toISOString(),
              completedAt: undefined,
              outcome: undefined,
            },
          ],
        },
      };

      const patient = factory.fromSnapshot(snapshot);

      expect(patient.getState().treatmentPlans[0].completedAt).toBeUndefined();
    });

    it('should handle snapshot with treatment plans with defined completedAt', () => {
      const now = new Date();
      const snapshot: PatientAggregateSnapshot = {
        ...createPatientSnapshot(),
        state: {
          ...createPatientSnapshot().state,
          treatmentPlans: [
            {
              id: 'tp-1',
              procedureType: 'root_canal',
              providerId: 'dr-789',
              status: 'completed',
              startedAt: now.toISOString(),
              completedAt: now.toISOString(),
              outcome: 'successful',
            },
          ],
        },
      };

      const patient = factory.fromSnapshot(snapshot);

      expect(patient.getState().treatmentPlans[0].completedAt).toBeInstanceOf(Date);
    });

    it('should handle snapshot with undefined insuranceInfo', () => {
      const snapshot: PatientAggregateSnapshot = {
        ...createPatientSnapshot(),
        state: {
          ...createPatientSnapshot().state,
          insuranceInfo: undefined,
        },
      };

      const patient = factory.fromSnapshot(snapshot);

      expect(patient.getState().insuranceInfo).toBeUndefined();
    });

    it('should handle snapshot with insuranceInfo with undefined effectiveUntil', () => {
      const now = new Date();
      const snapshot: PatientAggregateSnapshot = {
        ...createPatientSnapshot(),
        state: {
          ...createPatientSnapshot().state,
          insuranceInfo: {
            id: 'ins-1',
            providerId: 'provider-1',
            providerName: 'TestInsurance',
            policyNumber: 'POL123',
            groupNumber: 'GRP456',
            coverageType: 'partial',
            effectiveFrom: now.toISOString(),
            effectiveUntil: undefined,
            status: 'verified',
            verifiedAt: undefined,
          },
        },
      };

      const patient = factory.fromSnapshot(snapshot);

      expect(patient.getState().insuranceInfo).toBeDefined();
      expect(patient.getState().insuranceInfo?.effectiveUntil).toBeUndefined();
      expect(patient.getState().insuranceInfo?.verifiedAt).toBeUndefined();
    });

    it('should handle snapshot with insuranceInfo with defined effectiveUntil and verifiedAt', () => {
      const now = new Date();
      const snapshot: PatientAggregateSnapshot = {
        ...createPatientSnapshot(),
        state: {
          ...createPatientSnapshot().state,
          insuranceInfo: {
            id: 'ins-2',
            providerId: 'provider-2',
            providerName: 'AnotherInsurance',
            policyNumber: 'POL789',
            groupNumber: 'GRP123',
            coverageType: 'full',
            effectiveFrom: now.toISOString(),
            effectiveUntil: now.toISOString(),
            status: 'verified',
            verifiedAt: now.toISOString(),
          },
        },
      };

      const patient = factory.fromSnapshot(snapshot);

      expect(patient.getState().insuranceInfo?.effectiveUntil).toBeInstanceOf(Date);
      expect(patient.getState().insuranceInfo?.verifiedAt).toBeInstanceOf(Date);
    });

    it('should handle snapshot with consents with all optional dates undefined', () => {
      const snapshot: PatientAggregateSnapshot = {
        ...createPatientSnapshot(),
        state: {
          ...createPatientSnapshot().state,
          consents: {
            treatment: {
              type: 'treatment',
              status: 'pending',
              grantedAt: undefined,
              revokedAt: undefined,
              expiresAt: undefined,
              method: undefined,
            },
          },
        },
      };

      const patient = factory.fromSnapshot(snapshot);

      expect(patient.getState().consents['treatment'].grantedAt).toBeUndefined();
      expect(patient.getState().consents['treatment'].revokedAt).toBeUndefined();
      expect(patient.getState().consents['treatment'].expiresAt).toBeUndefined();
    });

    it('should handle snapshot with consents with all optional dates defined', () => {
      const now = new Date();
      const snapshot: PatientAggregateSnapshot = {
        ...createPatientSnapshot(),
        state: {
          ...createPatientSnapshot().state,
          consents: {
            marketing: {
              type: 'marketing',
              status: 'granted',
              grantedAt: now.toISOString(),
              revokedAt: now.toISOString(),
              expiresAt: now.toISOString(),
              method: 'electronic',
            },
          },
        },
      };

      const patient = factory.fromSnapshot(snapshot);

      expect(patient.getState().consents['marketing'].grantedAt).toBeInstanceOf(Date);
      expect(patient.getState().consents['marketing'].revokedAt).toBeInstanceOf(Date);
      expect(patient.getState().consents['marketing'].expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('Branch Coverage - createSnapshot', () => {
    it('should create snapshot with all optional dates undefined', () => {
      const record: PatientRecord = {
        ...createPatientRecord(),
        dateOfBirth: undefined,
        activatedAt: undefined,
        deactivatedAt: undefined,
        archivedAt: undefined,
        lastContactAt: undefined,
        lastAppointmentAt: undefined,
        deletedAt: undefined,
      };
      const patient = factory.fromDatabaseRecord(record);

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot.state.dateOfBirth).toBeUndefined();
      expect(snapshot.state.activatedAt).toBeUndefined();
      expect(snapshot.state.deactivatedAt).toBeUndefined();
      expect(snapshot.state.archivedAt).toBeUndefined();
      expect(snapshot.state.lastContactAt).toBeUndefined();
      expect(snapshot.state.lastAppointmentAt).toBeUndefined();
      expect(snapshot.state.deletedAt).toBeUndefined();
    });

    it('should create snapshot with all optional dates defined', () => {
      const now = new Date();
      const record: PatientRecord = {
        ...createPatientRecord(),
        dateOfBirth: now,
        activatedAt: now,
        deactivatedAt: now,
        archivedAt: now,
        lastContactAt: now,
        lastAppointmentAt: now,
        deletedAt: now,
        deletionReason: 'Test deletion',
      };
      const patient = factory.fromDatabaseRecord(record);

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot.state.dateOfBirth).toBeDefined();
      expect(snapshot.state.activatedAt).toBeDefined();
      expect(snapshot.state.deactivatedAt).toBeDefined();
      expect(snapshot.state.archivedAt).toBeDefined();
      expect(snapshot.state.lastContactAt).toBeDefined();
      expect(snapshot.state.lastAppointmentAt).toBeDefined();
      expect(snapshot.state.deletedAt).toBeDefined();
    });

    it('should create snapshot with medical history with undefined diagnosedAt', () => {
      const now = new Date();
      const record: PatientRecord = {
        ...createPatientRecord(),
        medicalHistory: [
          {
            id: 'mh-1',
            conditionType: 'medication',
            description: 'Taking aspirin',
            diagnosedAt: undefined,
            severity: 'mild',
            currentStatus: 'active',
            addedAt: now,
          },
        ],
      };
      const patient = factory.fromDatabaseRecord(record);

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot.state.medicalHistory[0].diagnosedAt).toBeUndefined();
      expect(snapshot.state.medicalHistory[0].addedAt).toBeDefined();
    });

    it('should create snapshot with medical history with defined diagnosedAt', () => {
      const now = new Date();
      const record: PatientRecord = {
        ...createPatientRecord(),
        medicalHistory: [
          {
            id: 'mh-2',
            conditionType: 'surgical',
            description: 'Appendectomy',
            diagnosedAt: now,
            severity: undefined,
            currentStatus: 'resolved',
            addedAt: now,
          },
        ],
      };
      const patient = factory.fromDatabaseRecord(record);

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot.state.medicalHistory[0].diagnosedAt).toBeDefined();
    });

    it('should create snapshot with allergies with undefined verifiedAt', () => {
      const record: PatientRecord = {
        ...createPatientRecord(),
        allergies: [
          {
            id: 'allergy-1',
            allergen: 'Iodine',
            severity: 'life_threatening',
            reaction: 'Anaphylactic shock',
            verifiedAt: undefined,
          },
        ],
      };
      const patient = factory.fromDatabaseRecord(record);

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot.state.allergies[0].verifiedAt).toBeUndefined();
    });

    it('should create snapshot with allergies with defined verifiedAt', () => {
      const now = new Date();
      const record: PatientRecord = {
        ...createPatientRecord(),
        allergies: [
          {
            id: 'allergy-2',
            allergen: 'Amoxicillin',
            severity: 'moderate',
            reaction: 'Skin rash',
            verifiedAt: now,
          },
        ],
      };
      const patient = factory.fromDatabaseRecord(record);

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot.state.allergies[0].verifiedAt).toBeDefined();
    });

    it('should create snapshot with treatment plans with undefined completedAt', () => {
      const now = new Date();
      const record: PatientRecord = {
        ...createPatientRecord(),
        treatmentPlans: [
          {
            id: 'tp-1',
            procedureType: 'braces',
            providerId: 'ortho-123',
            status: 'active',
            startedAt: now,
            completedAt: undefined,
            outcome: undefined,
          },
        ],
      };
      const patient = factory.fromDatabaseRecord(record);

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot.state.treatmentPlans[0].completedAt).toBeUndefined();
    });

    it('should create snapshot with treatment plans with defined completedAt', () => {
      const now = new Date();
      const record: PatientRecord = {
        ...createPatientRecord(),
        treatmentPlans: [
          {
            id: 'tp-2',
            procedureType: 'filling',
            providerId: 'dr-456',
            status: 'completed',
            startedAt: now,
            completedAt: now,
            outcome: 'partial',
          },
        ],
      };
      const patient = factory.fromDatabaseRecord(record);

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot.state.treatmentPlans[0].completedAt).toBeDefined();
    });

    it('should create snapshot with undefined insuranceInfo', () => {
      const record: PatientRecord = {
        ...createPatientRecord(),
        insuranceInfo: undefined,
      };
      const patient = factory.fromDatabaseRecord(record);

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot.state.insuranceInfo).toBeUndefined();
    });

    it('should create snapshot with insuranceInfo with undefined effectiveUntil and verifiedAt', () => {
      const now = new Date();
      const record: PatientRecord = {
        ...createPatientRecord(),
        insuranceInfo: {
          id: 'ins-1',
          providerId: 'provider-1',
          providerName: 'BasicInsurance',
          policyNumber: 'BASIC123',
          groupNumber: undefined,
          coverageType: 'dental_only',
          effectiveFrom: now,
          effectiveUntil: undefined,
          status: 'pending',
          verifiedAt: undefined,
        },
      };
      const patient = factory.fromDatabaseRecord(record);

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot.state.insuranceInfo).toBeDefined();
      expect(snapshot.state.insuranceInfo?.effectiveUntil).toBeUndefined();
      expect(snapshot.state.insuranceInfo?.verifiedAt).toBeUndefined();
    });

    it('should create snapshot with insuranceInfo with defined effectiveUntil and verifiedAt', () => {
      const now = new Date();
      const record: PatientRecord = {
        ...createPatientRecord(),
        insuranceInfo: {
          id: 'ins-2',
          providerId: 'provider-2',
          providerName: 'PremiumInsurance',
          policyNumber: 'PREM456',
          groupNumber: 'PGRP789',
          coverageType: 'full',
          effectiveFrom: now,
          effectiveUntil: now,
          status: 'verified',
          verifiedAt: now,
        },
      };
      const patient = factory.fromDatabaseRecord(record);

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot.state.insuranceInfo?.effectiveUntil).toBeDefined();
      expect(snapshot.state.insuranceInfo?.verifiedAt).toBeDefined();
    });

    it('should create snapshot with consents with undefined optional dates', () => {
      const record: PatientRecord = {
        ...createPatientRecord(),
        consents: {
          research: {
            type: 'research',
            status: 'denied',
            grantedAt: undefined,
            revokedAt: undefined,
            expiresAt: undefined,
            method: undefined,
          },
        },
      };
      const patient = factory.fromDatabaseRecord(record);

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot.state.consents['research'].grantedAt).toBeUndefined();
      expect(snapshot.state.consents['research'].revokedAt).toBeUndefined();
      expect(snapshot.state.consents['research'].expiresAt).toBeUndefined();
    });

    it('should create snapshot with consents with defined optional dates', () => {
      const now = new Date();
      const record: PatientRecord = {
        ...createPatientRecord(),
        consents: {
          data_sharing: {
            type: 'data_sharing',
            status: 'granted',
            grantedAt: now,
            revokedAt: now,
            expiresAt: now,
            method: 'written',
          },
        },
      };
      const patient = factory.fromDatabaseRecord(record);

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot.state.consents['data_sharing'].grantedAt).toBeDefined();
      expect(snapshot.state.consents['data_sharing'].revokedAt).toBeDefined();
      expect(snapshot.state.consents['data_sharing'].expiresAt).toBeDefined();
    });

    it('should create snapshot with multiple medical history entries with mixed optional dates', () => {
      const now = new Date();
      const record: PatientRecord = {
        ...createPatientRecord(),
        medicalHistory: [
          {
            id: 'mh-1',
            conditionType: 'chronic',
            description: 'Diabetes',
            diagnosedAt: now,
            severity: 'severe',
            currentStatus: 'managed',
            addedAt: now,
          },
          {
            id: 'mh-2',
            conditionType: 'allergy',
            description: 'Pollen allergy',
            diagnosedAt: undefined,
            severity: 'mild',
            currentStatus: 'active',
            addedAt: now,
          },
        ],
      };
      const patient = factory.fromDatabaseRecord(record);

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot.state.medicalHistory).toHaveLength(2);
      expect(snapshot.state.medicalHistory[0].diagnosedAt).toBeDefined();
      expect(snapshot.state.medicalHistory[1].diagnosedAt).toBeUndefined();
    });

    it('should create snapshot with multiple allergies with mixed verifiedAt', () => {
      const now = new Date();
      const record: PatientRecord = {
        ...createPatientRecord(),
        allergies: [
          {
            id: 'allergy-1',
            allergen: 'Nuts',
            severity: 'severe',
            reaction: 'Anaphylaxis',
            verifiedAt: now,
          },
          {
            id: 'allergy-2',
            allergen: 'Shellfish',
            severity: 'moderate',
            reaction: 'Hives',
            verifiedAt: undefined,
          },
        ],
      };
      const patient = factory.fromDatabaseRecord(record);

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot.state.allergies).toHaveLength(2);
      expect(snapshot.state.allergies[0].verifiedAt).toBeDefined();
      expect(snapshot.state.allergies[1].verifiedAt).toBeUndefined();
    });

    it('should create snapshot with multiple treatment plans with mixed completedAt', () => {
      const now = new Date();
      const record: PatientRecord = {
        ...createPatientRecord(),
        treatmentPlans: [
          {
            id: 'tp-1',
            procedureType: 'implant',
            providerId: 'dr-123',
            status: 'completed',
            startedAt: now,
            completedAt: now,
            outcome: 'successful',
          },
          {
            id: 'tp-2',
            procedureType: 'whitening',
            providerId: 'dr-456',
            status: 'active',
            startedAt: now,
            completedAt: undefined,
            outcome: undefined,
          },
        ],
      };
      const patient = factory.fromDatabaseRecord(record);

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot.state.treatmentPlans).toHaveLength(2);
      expect(snapshot.state.treatmentPlans[0].completedAt).toBeDefined();
      expect(snapshot.state.treatmentPlans[1].completedAt).toBeUndefined();
    });

    it('should create snapshot with multiple consents with mixed optional dates', () => {
      const now = new Date();
      const record: PatientRecord = {
        ...createPatientRecord(),
        consents: {
          treatment: {
            type: 'treatment',
            status: 'granted',
            grantedAt: now,
            revokedAt: undefined,
            expiresAt: now,
            method: 'electronic',
          },
          marketing: {
            type: 'marketing',
            status: 'expired',
            grantedAt: now,
            revokedAt: now,
            expiresAt: now,
            method: 'verbal',
          },
          communication: {
            type: 'communication',
            status: 'pending',
            grantedAt: undefined,
            revokedAt: undefined,
            expiresAt: undefined,
            method: undefined,
          },
        },
      };
      const patient = factory.fromDatabaseRecord(record);

      const snapshot = factory.createSnapshot(patient);

      expect(Object.keys(snapshot.state.consents)).toHaveLength(3);
      expect(snapshot.state.consents['treatment'].grantedAt).toBeDefined();
      expect(snapshot.state.consents['treatment'].revokedAt).toBeUndefined();
      expect(snapshot.state.consents['marketing'].revokedAt).toBeDefined();
      expect(snapshot.state.consents['communication'].grantedAt).toBeUndefined();
    });
  });

  describe('Branch Coverage - fromDatabaseRecord', () => {
    it('should handle record with isDeleted missing (not just undefined)', () => {
      const record = createPatientRecord();
      // Remove isDeleted property entirely using destructuring
      const { isDeleted, ...recordWithoutIsDeleted } = record;

      const patient = factory.fromDatabaseRecord(recordWithoutIsDeleted as PatientRecord);

      expect(patient.getState().isDeleted).toBe(false);
    });

    it('should handle record with isDeleted explicitly false', () => {
      const record: PatientRecord = {
        ...createPatientRecord(),
        isDeleted: false,
      };

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.getState().isDeleted).toBe(false);
    });

    it('should handle record with isDeleted explicitly true', () => {
      const record: PatientRecord = {
        ...createPatientRecord(),
        isDeleted: true,
        deletedAt: new Date(),
        deletionReason: 'Patient requested data deletion',
      };

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.getState().isDeleted).toBe(true);
      expect(patient.getState().deletedAt).toBeInstanceOf(Date);
      expect(patient.getState().deletionReason).toBe('Patient requested data deletion');
    });

    it('should handle record with all optional timestamps undefined', () => {
      const now = new Date();
      const record: PatientRecord = {
        ...createPatientRecord(),
        dateOfBirth: undefined,
        activatedAt: undefined,
        deactivatedAt: undefined,
        archivedAt: undefined,
        lastContactAt: undefined,
        lastAppointmentAt: undefined,
        deletedAt: undefined,
      };

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.getState().dateOfBirth).toBeUndefined();
      expect(patient.getState().activatedAt).toBeUndefined();
      expect(patient.getState().deactivatedAt).toBeUndefined();
      expect(patient.getState().archivedAt).toBeUndefined();
      expect(patient.getState().lastContactAt).toBeUndefined();
      expect(patient.getState().lastAppointmentAt).toBeUndefined();
      expect(patient.getState().deletedAt).toBeUndefined();
    });

    it('should handle record with empty collections', () => {
      const record: PatientRecord = {
        ...createPatientRecord(),
        medicalHistory: [],
        allergies: [],
        treatmentPlans: [],
        appointments: [],
        assignedProviders: [],
      };

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.getState().medicalHistory).toHaveLength(0);
      expect(patient.getState().allergies).toHaveLength(0);
      expect(patient.getState().treatmentPlans).toHaveLength(0);
      expect(patient.getState().appointments).toHaveLength(0);
      expect(patient.getState().assignedProviders).toHaveLength(0);
    });

    it('should handle record with empty consents object', () => {
      const record: PatientRecord = {
        ...createPatientRecord(),
        consents: {},
      };

      const patient = factory.fromDatabaseRecord(record);

      expect(Object.keys(patient.getState().consents)).toHaveLength(0);
    });

    it('should handle record with multiple appointments', () => {
      const now = new Date();
      const record: PatientRecord = {
        ...createPatientRecord(),
        appointments: [
          {
            id: 'apt-1',
            appointmentType: 'cleaning',
            scheduledFor: now,
            duration: 30,
            providerId: 'hygienist-1',
            status: 'completed',
            isFollowUp: false,
            treatmentPlanId: undefined,
          },
          {
            id: 'apt-2',
            appointmentType: 'checkup',
            scheduledFor: new Date(now.getTime() + 86400000),
            duration: 45,
            providerId: 'dr-123',
            status: 'scheduled',
            isFollowUp: true,
            treatmentPlanId: 'tp-1',
          },
        ],
      };

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.getState().appointments).toHaveLength(2);
      expect(patient.getState().appointments[0].isFollowUp).toBe(false);
      expect(patient.getState().appointments[1].isFollowUp).toBe(true);
    });

    it('should handle record with multiple assigned providers', () => {
      const now = new Date();
      const record: PatientRecord = {
        ...createPatientRecord(),
        assignedProviders: [
          {
            providerId: 'dr-primary',
            role: 'primary',
            assignedAt: now,
          },
          {
            providerId: 'dr-specialist',
            role: 'specialist',
            assignedAt: now,
          },
          {
            providerId: 'hygienist-1',
            role: 'hygienist',
            assignedAt: now,
          },
        ],
      };

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.getState().assignedProviders).toHaveLength(3);
      expect(patient.getState().assignedProviders[0].role).toBe('primary');
      expect(patient.getState().assignedProviders[1].role).toBe('specialist');
      expect(patient.getState().assignedProviders[2].role).toBe('hygienist');
    });

    it('should handle record with all patient sources', () => {
      const sources: Array<'lead_conversion' | 'direct_registration' | 'referral' | 'transfer'> = [
        'lead_conversion',
        'direct_registration',
        'referral',
        'transfer',
      ];

      sources.forEach((source) => {
        const record: PatientRecord = {
          ...createPatientRecord(),
          source,
        };

        const patient = factory.fromDatabaseRecord(record);

        expect(patient.getState().source).toBe(source);
      });
    });

    it('should handle record with all patient statuses', () => {
      const statuses: PatientStatus[] = ['active', 'inactive', 'archived'];

      statuses.forEach((status) => {
        const record: PatientRecord = {
          ...createPatientRecord(),
          status,
        };

        const patient = factory.fromDatabaseRecord(record);

        expect(patient.getState().status).toBe(status);
      });
    });
  });

  describe('Branch Coverage - Edge Cases', () => {
    it('should generate unique IDs on multiple calls', () => {
      const params = {
        phone: createTestPhoneNumber(),
        firstName: 'Test',
        lastName: 'User',
        source: 'direct_registration' as const,
      };

      const patient1 = factory.createWithGeneratedId(params);
      const patient2 = factory.createWithGeneratedId(params);
      const patient3 = factory.createWithGeneratedId(params);

      const id1 = patient1.getState().id;
      const id2 = patient2.getState().id;
      const id3 = patient3.getState().id;

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
      expect(id1).toMatch(/^patient-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^patient-\d+-[a-z0-9]+$/);
      expect(id3).toMatch(/^patient-\d+-[a-z0-9]+$/);
    });

    it('should handle round-trip with complex nested data', () => {
      const now = new Date();
      const record: PatientRecord = {
        id: 'complex-patient',
        version: 10,
        leadId: 'complex-lead',
        phone: createTestPhoneNumber(),
        email: 'complex@example.com',
        hubspotContactId: 'hubspot-complex',
        firstName: 'Complex',
        lastName: 'Patient',
        dateOfBirth: new Date('1980-05-15'),
        address: '123 Complex St',
        city: 'Complexity',
        county: 'Complex County',
        status: 'active',
        registeredAt: now,
        activatedAt: now,
        deactivatedAt: undefined,
        archivedAt: undefined,
        medicalHistory: [
          {
            id: 'mh-1',
            conditionType: 'chronic',
            description: 'Condition 1',
            diagnosedAt: now,
            severity: 'moderate',
            currentStatus: 'managed',
            addedAt: now,
          },
          {
            id: 'mh-2',
            conditionType: 'acute',
            description: 'Condition 2',
            diagnosedAt: undefined,
            severity: undefined,
            currentStatus: 'resolved',
            addedAt: now,
          },
        ],
        allergies: [
          {
            id: 'allergy-1',
            allergen: 'Allergen 1',
            severity: 'severe',
            reaction: 'Reaction 1',
            verifiedAt: now,
          },
          {
            id: 'allergy-2',
            allergen: 'Allergen 2',
            severity: 'mild',
            reaction: 'Reaction 2',
            verifiedAt: undefined,
          },
        ],
        treatmentPlans: [
          {
            id: 'tp-1',
            procedureType: 'procedure-1',
            providerId: 'provider-1',
            status: 'completed',
            startedAt: now,
            completedAt: now,
            outcome: 'successful',
          },
          {
            id: 'tp-2',
            procedureType: 'procedure-2',
            providerId: 'provider-2',
            status: 'active',
            startedAt: now,
            completedAt: undefined,
            outcome: undefined,
          },
        ],
        appointments: [
          {
            id: 'apt-1',
            appointmentType: 'type-1',
            scheduledFor: now,
            duration: 60,
            providerId: 'provider-1',
            status: 'completed',
            isFollowUp: true,
            treatmentPlanId: 'tp-1',
          },
        ],
        noShowCount: 2,
        insuranceInfo: {
          id: 'ins-complex',
          providerId: 'ins-provider',
          providerName: 'Insurance Co',
          policyNumber: 'POLICY123',
          groupNumber: 'GROUP456',
          coverageType: 'full',
          effectiveFrom: now,
          effectiveUntil: now,
          status: 'verified',
          verifiedAt: now,
        },
        consents: {
          treatment: {
            type: 'treatment',
            status: 'granted',
            grantedAt: now,
            revokedAt: undefined,
            expiresAt: now,
            method: 'electronic',
          },
          marketing: {
            type: 'marketing',
            status: 'denied',
            grantedAt: undefined,
            revokedAt: undefined,
            expiresAt: undefined,
            method: undefined,
          },
        },
        assignedProviders: [
          {
            providerId: 'provider-1',
            role: 'primary',
            assignedAt: now,
          },
          {
            providerId: 'provider-2',
            role: 'specialist',
            assignedAt: now,
          },
        ],
        primaryProviderId: 'provider-1',
        preferences: {
          preferredLanguage: 'en',
          preferredChannel: 'email',
          preferredContactTime: 'evening',
          doNotContact: false,
          specialInstructions: 'Call after 6 PM',
        },
        source: 'lead_conversion',
        conversionProcedure: 'all_on_4',
        lastContactAt: now,
        lastAppointmentAt: now,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        deletedAt: undefined,
        deletionReason: undefined,
      };

      // Database -> Aggregate
      const patient = factory.fromDatabaseRecord(record);

      // Aggregate -> Snapshot
      const snapshot = factory.createSnapshot(patient);

      // Snapshot -> Aggregate
      const restored = factory.fromSnapshot(snapshot);

      // Verify round-trip integrity
      expect(restored.getState().id).toBe(record.id);
      expect(restored.getState().firstName).toBe(record.firstName);
      expect(restored.getState().medicalHistory).toHaveLength(2);
      expect(restored.getState().allergies).toHaveLength(2);
      expect(restored.getState().treatmentPlans).toHaveLength(2);
      expect(restored.getState().insuranceInfo).toBeDefined();
      expect(Object.keys(restored.getState().consents)).toHaveLength(2);
    });

    it('should handle snapshot with events applied after restoration', () => {
      const snapshot = createPatientSnapshot();

      // Create a temporary patient to generate some events
      const tempPatient = factory.create(createPatientParams());
      const events = tempPatient.getUncommittedEvents();

      // Restore with events
      const patient = factory.fromSnapshot(snapshot, events);

      expect(patient).toBeDefined();
      // The patient should have the snapshot's ID, not the temp patient's
      expect(patient.getState().id).toBe('patient-snap-123');
    });
  });
});
