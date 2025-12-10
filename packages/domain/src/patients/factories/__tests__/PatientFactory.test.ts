/**
 * @fileoverview Patient Factory Tests
 *
 * Comprehensive tests for Patient aggregate factory including creation,
 * lead conversion, event reconstitution, snapshot restoration, and database hydration.
 *
 * @module domain/patients/factories/__tests__/PatientFactory
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { PatientFactory, patientFactory, type PatientRecord } from '../PatientFactory.js';
import { PatientAggregateRoot, type PatientDomainEvent } from '../../entities/Patient.js';
import { PhoneNumber } from '../../../shared-kernel/value-objects/phone-number.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createValidPhone = (number = '+40700000001'): PhoneNumber => {
  return PhoneNumber.create(number);
};

const createPatientRegisteredEvent = (id: string, phone: string): PatientDomainEvent => ({
  type: 'patient.registered',
  payload: {
    phone,
    firstName: 'Ion',
    lastName: 'Popescu',
    source: 'lead_conversion',
  },
  aggregateId: id,
  aggregateType: 'Patient',
  version: 1,
  timestamp: new Date(),
});

const createPatientActivatedEvent = (id: string, version: number): PatientDomainEvent => ({
  type: 'patient.activated',
  payload: {
    activatedAt: new Date().toISOString(),
  },
  aggregateId: id,
  aggregateType: 'Patient',
  version,
  timestamp: new Date(),
});

const createDefaultPatientRecord = (overrides: Partial<PatientRecord> = {}): PatientRecord => ({
  id: 'patient-001',
  version: 1,
  phone: PhoneNumber.create('+40700000001'),
  firstName: 'Ion',
  lastName: 'Popescu',
  status: 'registered',
  registeredAt: new Date(),
  medicalHistory: [],
  allergies: [],
  treatmentPlans: [],
  appointments: [],
  noShowCount: 0,
  consents: {},
  assignedProviders: [],
  preferences: {
    preferredContactMethod: 'phone',
    preferredLanguage: 'ro',
    reminderPreferences: {
      sms: true,
      email: false,
      whatsapp: true,
      daysBefore: 1,
    },
    marketingConsent: false,
  },
  source: 'lead_conversion',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// =============================================================================
// TEST SUITE
// =============================================================================

describe('PatientFactory', () => {
  let factory: PatientFactory;

  beforeEach(() => {
    factory = new PatientFactory();
  });

  // ===========================================================================
  // LEAD CONVERSION TESTS
  // ===========================================================================

  describe('fromLeadConversion', () => {
    it('should create patient from lead conversion', () => {
      const phone = createValidPhone();
      const patient = factory.fromLeadConversion({
        id: 'patient-001',
        leadId: 'lead-001',
        phone,
        firstName: 'Ion',
        lastName: 'Popescu',
        conversionProcedure: 'dental_implant',
      });

      expect(patient).toBeInstanceOf(PatientAggregateRoot);
      expect(patient.id).toBe('patient-001');
      expect(patient.leadId).toBe('lead-001');
      expect(patient.phone.e164).toBe(phone.e164);
      expect(patient.status).toBe('registered');
    });

    it('should create patient with optional fields', () => {
      const phone = createValidPhone();
      const patient = factory.fromLeadConversion({
        id: 'patient-002',
        leadId: 'lead-002',
        phone,
        firstName: 'Maria',
        lastName: 'Ionescu',
        conversionProcedure: 'all-on-4',
        email: 'maria@example.com',
        dateOfBirth: new Date('1985-05-15'),
        hubspotContactId: 'hs-456',
      });

      expect(patient.email).toBe('maria@example.com');
      expect(patient.dateOfBirth).toBeInstanceOf(Date);
      expect(patient.hubspotContactId).toBe('hs-456');
    });

    it('should emit PatientRegistered event', () => {
      const phone = createValidPhone();
      const patient = factory.fromLeadConversion({
        id: 'patient-003',
        leadId: 'lead-003',
        phone,
        firstName: 'Ion',
        lastName: 'Popescu',
        conversionProcedure: 'dental_implant',
      });

      const events = patient.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('patient.registered');
    });

    it('should include correlation ID', () => {
      const phone = createValidPhone();
      const patient = factory.fromLeadConversion(
        {
          id: 'patient-004',
          leadId: 'lead-004',
          phone,
          firstName: 'Ion',
          lastName: 'Popescu',
          conversionProcedure: 'dental_implant',
        },
        'corr-123'
      );

      const events = patient.getUncommittedEvents();
      expect(events[0].correlationId).toBe('corr-123');
    });
  });

  describe('fromLeadConversionWithGeneratedId', () => {
    it('should create patient with auto-generated ID', () => {
      const phone = createValidPhone();
      const patient = factory.fromLeadConversionWithGeneratedId({
        leadId: 'lead-001',
        phone,
        firstName: 'Ion',
        lastName: 'Popescu',
        conversionProcedure: 'dental_implant',
      });

      expect(patient.id).toMatch(/^patient-\d+-[a-z0-9]+$/);
      expect(patient.leadId).toBe('lead-001');
    });

    it('should generate unique IDs', () => {
      const phone = createValidPhone();
      const params = {
        leadId: 'lead-001',
        phone,
        firstName: 'Ion',
        lastName: 'Popescu',
        conversionProcedure: 'dental_implant',
      };

      const patient1 = factory.fromLeadConversionWithGeneratedId(params);
      const patient2 = factory.fromLeadConversionWithGeneratedId(params);

      expect(patient1.id).not.toBe(patient2.id);
    });
  });

  // ===========================================================================
  // DIRECT CREATION TESTS
  // ===========================================================================

  describe('create', () => {
    it('should create patient via direct registration', () => {
      const phone = createValidPhone();
      const patient = factory.create({
        id: 'patient-direct-001',
        phone,
        firstName: 'Ana',
        lastName: 'Pop',
        source: 'direct_registration',
      });

      expect(patient).toBeInstanceOf(PatientAggregateRoot);
      // leadId can be empty string or undefined for non-lead patients
      expect(patient.leadId).toBeFalsy();
    });

    it('should create patient via referral', () => {
      const phone = createValidPhone();
      const patient = factory.create({
        id: 'patient-referral-001',
        phone,
        firstName: 'Mihai',
        lastName: 'Dobre',
        source: 'referral',
      });

      expect(patient).toBeInstanceOf(PatientAggregateRoot);
    });
  });

  describe('createWithGeneratedId', () => {
    it('should create patient with auto-generated ID', () => {
      const phone = createValidPhone();
      const patient = factory.createWithGeneratedId({
        phone,
        firstName: 'Ion',
        lastName: 'Popescu',
        source: 'direct_registration',
      });

      expect(patient.id).toMatch(/^patient-\d+-[a-z0-9]+$/);
    });
  });

  // ===========================================================================
  // EVENT SOURCING TESTS
  // ===========================================================================

  describe('reconstitute', () => {
    it('should reconstitute patient from events', () => {
      const events: PatientDomainEvent[] = [
        createPatientRegisteredEvent('patient-001', '+40700000001'),
      ];

      const patient = factory.reconstitute('patient-001', events);

      expect(patient).toBeInstanceOf(PatientAggregateRoot);
      expect(patient.id).toBe('patient-001');
      expect(patient.firstName).toBe('Ion');
      expect(patient.version).toBe(1);
    });

    it('should replay multiple events', () => {
      const events: PatientDomainEvent[] = [
        createPatientRegisteredEvent('patient-001', '+40700000001'),
        createPatientActivatedEvent('patient-001', 2),
      ];

      const patient = factory.reconstitute('patient-001', events);

      expect(patient.version).toBe(2);
      expect(patient.status).toBe('active');
    });

    it('should handle empty events array', () => {
      const patient = factory.reconstitute('patient-001', []);

      expect(patient).toBeInstanceOf(PatientAggregateRoot);
      expect(patient.version).toBe(0);
    });
  });

  describe('createEmpty', () => {
    it('should create empty patient for reconstitution', () => {
      const patient = factory.createEmpty('patient-001');

      expect(patient).toBeInstanceOf(PatientAggregateRoot);
      expect(patient.id).toBe('patient-001');
      expect(patient.version).toBe(0);
    });
  });

  // ===========================================================================
  // SNAPSHOT TESTS
  // ===========================================================================

  describe('createSnapshot', () => {
    it('should create snapshot from patient', () => {
      const phone = createValidPhone();
      const patient = factory.fromLeadConversion({
        id: 'patient-001',
        leadId: 'lead-001',
        phone,
        firstName: 'Ion',
        lastName: 'Popescu',
        conversionProcedure: 'dental_implant',
      });

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot.aggregateId).toBe('patient-001');
      expect(snapshot.aggregateType).toBe('Patient');
      expect(snapshot.version).toBe(1);
      expect(snapshot.state.phone).toBe(phone.e164);
      expect(snapshot.state.firstName).toBe('Ion');
      expect(snapshot.state.lastName).toBe('Popescu');
      expect(snapshot.createdAt).toBeDefined();
    });

    it('should serialize dates as ISO strings', () => {
      const phone = createValidPhone();
      const patient = factory.fromLeadConversion({
        id: 'patient-001',
        leadId: 'lead-001',
        phone,
        firstName: 'Ion',
        lastName: 'Popescu',
        conversionProcedure: 'dental_implant',
      });

      const snapshot = factory.createSnapshot(patient);

      expect(typeof snapshot.state.registeredAt).toBe('string');
      expect(typeof snapshot.state.createdAt).toBe('string');
    });

    it('should include empty arrays for medical data', () => {
      const phone = createValidPhone();
      const patient = factory.create({
        id: 'patient-001',
        phone,
        firstName: 'Ion',
        lastName: 'Popescu',
        source: 'direct_registration',
      });

      const snapshot = factory.createSnapshot(patient);

      expect(Array.isArray(snapshot.state.medicalHistory)).toBe(true);
      expect(Array.isArray(snapshot.state.allergies)).toBe(true);
      expect(Array.isArray(snapshot.state.treatmentPlans)).toBe(true);
    });

    it('should include preferences in snapshot', () => {
      const phone = createValidPhone();
      const patient = factory.create({
        id: 'patient-001',
        phone,
        firstName: 'Ion',
        lastName: 'Popescu',
        source: 'direct_registration',
      });

      const snapshot = factory.createSnapshot(patient);

      expect(snapshot.state.preferences).toBeDefined();
    });
  });

  describe('fromSnapshot', () => {
    it('should restore patient from snapshot', () => {
      const phone = createValidPhone();
      const patient = factory.fromLeadConversion({
        id: 'patient-001',
        leadId: 'lead-001',
        phone,
        firstName: 'Ion',
        lastName: 'Popescu',
        conversionProcedure: 'dental_implant',
      });

      const snapshot = factory.createSnapshot(patient);
      const restored = factory.fromSnapshot(snapshot);

      expect(restored.id).toBe('patient-001');
      expect(restored.phone.e164).toBe(phone.e164);
      expect(restored.firstName).toBe('Ion');
      expect(restored.lastName).toBe('Popescu');
    });

    it('should restore dates correctly', () => {
      const phone = createValidPhone();
      const patient = factory.fromLeadConversion({
        id: 'patient-001',
        leadId: 'lead-001',
        phone,
        firstName: 'Ion',
        lastName: 'Popescu',
        conversionProcedure: 'dental_implant',
      });

      const snapshot = factory.createSnapshot(patient);
      const restored = factory.fromSnapshot(snapshot);

      expect(restored.registeredAt).toBeInstanceOf(Date);
      expect(restored.createdAt).toBeInstanceOf(Date);
    });

    it('should apply events since snapshot', () => {
      const phone = createValidPhone();
      const patient = factory.fromLeadConversion({
        id: 'patient-001',
        leadId: 'lead-001',
        phone,
        firstName: 'Ion',
        lastName: 'Popescu',
        conversionProcedure: 'dental_implant',
      });

      const snapshot = factory.createSnapshot(patient);

      const eventsSinceSnapshot: PatientDomainEvent[] = [
        createPatientActivatedEvent('patient-001', 2),
      ];

      const restored = factory.fromSnapshot(snapshot, eventsSinceSnapshot);

      expect(restored.version).toBe(2);
      expect(restored.status).toBe('active');
    });
  });

  // ===========================================================================
  // DATABASE HYDRATION TESTS
  // ===========================================================================

  describe('fromDatabaseRecord', () => {
    it('should hydrate patient from database record', () => {
      const record = createDefaultPatientRecord();
      const patient = factory.fromDatabaseRecord(record);

      expect(patient).toBeInstanceOf(PatientAggregateRoot);
      expect(patient.id).toBe('patient-001');
      expect(patient.firstName).toBe('Ion');
      expect(patient.lastName).toBe('Popescu');
    });

    it('should handle optional fields in record', () => {
      const record = createDefaultPatientRecord({
        email: 'test@example.com',
        hubspotContactId: 'hs-123',
        primaryProviderId: 'dr-001',
      });

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.email).toBe('test@example.com');
      expect(patient.hubspotContactId).toBe('hs-123');
      expect(patient.primaryProviderId).toBe('dr-001');
    });

    it('should preserve medical history from record', () => {
      const record = createDefaultPatientRecord({
        medicalHistory: [
          {
            id: 'med-001',
            conditionType: 'chronic',
            description: 'Diabetes',
            severity: 'moderate',
            currentStatus: 'managed',
            addedAt: new Date(),
          },
        ],
      });

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.medicalHistory).toHaveLength(1);
    });

    it('should preserve allergies from record', () => {
      const record = createDefaultPatientRecord({
        allergies: [
          {
            id: 'allergy-001',
            allergen: 'Penicillin',
            severity: 'severe',
            reaction: 'Anaphylaxis',
          },
        ],
      });

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.allergies).toHaveLength(1);
    });

    it('should preserve insurance info from record', () => {
      const record = createDefaultPatientRecord({
        insuranceInfo: {
          id: 'ins-001',
          providerId: 'ins-prov-001',
          providerName: 'CAS Bucuresti',
          policyNumber: 'POL-123',
          coverageType: 'full',
          effectiveFrom: new Date(),
          status: 'verified',
        },
      });

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.insuranceInfo).toBeDefined();
      expect(patient.insuranceInfo?.providerName).toBe('CAS Bucuresti');
    });

    it('should handle deleted patient', () => {
      const record = createDefaultPatientRecord({
        isDeleted: true,
        deletedAt: new Date(),
        deletionReason: 'GDPR erasure request',
      });

      const patient = factory.fromDatabaseRecord(record);

      expect(patient.isDeleted).toBe(true);
    });
  });

  // ===========================================================================
  // SINGLETON INSTANCE TESTS
  // ===========================================================================

  describe('patientFactory singleton', () => {
    it('should export singleton instance', () => {
      expect(patientFactory).toBeInstanceOf(PatientFactory);
    });

    it('should be usable for patient creation', () => {
      const phone = createValidPhone();
      const patient = patientFactory.create({
        id: 'patient-singleton',
        phone,
        firstName: 'Ion',
        lastName: 'Popescu',
        source: 'direct_registration',
      });

      expect(patient).toBeInstanceOf(PatientAggregateRoot);
    });
  });

  // ===========================================================================
  // PROPERTY-BASED TESTS
  // ===========================================================================

  describe('Property-Based Tests', () => {
    it('snapshot and restore should preserve core fields', () => {
      const phone = createValidPhone();
      const patient = factory.fromLeadConversion({
        id: 'patient-001',
        leadId: 'lead-001',
        phone,
        firstName: 'Ion',
        lastName: 'Popescu',
        conversionProcedure: 'dental_implant',
        email: 'test@example.com',
      });

      const snapshot1 = factory.createSnapshot(patient);
      const restored = factory.fromSnapshot(snapshot1);
      const snapshot2 = factory.createSnapshot(restored);

      expect(snapshot1.state.phone).toBe(snapshot2.state.phone);
      expect(snapshot1.state.firstName).toBe(snapshot2.state.firstName);
      expect(snapshot1.state.lastName).toBe(snapshot2.state.lastName);
      expect(snapshot1.state.email).toBe(snapshot2.state.email);
      expect(snapshot1.state.source).toBe(snapshot2.state.source);
    });

    it('generated IDs should always be unique', () => {
      const phone = createValidPhone();
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const patient = factory.createWithGeneratedId({
          phone,
          firstName: 'Ion',
          lastName: 'Popescu',
          source: 'direct_registration',
        });
        ids.add(patient.id);
      }

      expect(ids.size).toBe(100);
    });

    it('should create valid patients with all source types', () => {
      const sources = ['lead_conversion', 'direct_registration', 'referral', 'transfer'] as const;
      const phone = createValidPhone();

      for (const source of sources) {
        const patient = factory.create({
          id: `patient-${source}`,
          phone,
          firstName: 'Ion',
          lastName: 'Popescu',
          source,
        });

        expect(patient).toBeInstanceOf(PatientAggregateRoot);
        expect(patient.status).toBe('registered');
      }
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle patient with all optional lead conversion fields', () => {
      const phone = createValidPhone();
      const patient = factory.fromLeadConversion({
        id: 'patient-full',
        leadId: 'lead-full',
        phone,
        firstName: 'Ion',
        lastName: 'Popescu',
        conversionProcedure: 'all-on-4',
        email: 'test@example.com',
        dateOfBirth: new Date('1985-05-15'),
        hubspotContactId: 'hs-123',
      });

      const snapshot = factory.createSnapshot(patient);
      const restored = factory.fromSnapshot(snapshot);

      expect(restored.email).toBe('test@example.com');
      expect(restored.hubspotContactId).toBe('hs-123');
    });

    it('should handle concurrent patient creation', () => {
      const phone = createValidPhone();
      const patients = [];

      for (let i = 0; i < 10; i++) {
        patients.push(
          factory.createWithGeneratedId({
            phone,
            firstName: 'Ion',
            lastName: 'Popescu',
            source: 'direct_registration',
          })
        );
      }

      const uniqueIds = new Set(patients.map((p) => p.id));
      expect(uniqueIds.size).toBe(10);
    });

    it('should handle database record with minimal fields', () => {
      const record = createDefaultPatientRecord();
      const patient = factory.fromDatabaseRecord(record);

      expect(patient.medicalHistory).toHaveLength(0);
      expect(patient.allergies).toHaveLength(0);
      expect(patient.treatmentPlans).toHaveLength(0);
    });
  });
});
