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
});
