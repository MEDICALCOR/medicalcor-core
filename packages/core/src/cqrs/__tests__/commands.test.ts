/**
 * CQRS Command Handlers Tests
 *
 * Tests for domain command execution via the command bus
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createInMemoryEventStore } from '../../event-store.js';
import { createCommandBus } from '../command-bus.js';
import { getCommandHandlers } from '../commands.js';
import type { EventStore } from '../../event-store.js';
import type { CommandBus } from '../command-bus.js';

describe('CQRS Command Handlers', () => {
  let eventStore: EventStore;
  let commandBus: CommandBus;

  beforeEach(() => {
    eventStore = createInMemoryEventStore('test');
    commandBus = createCommandBus(eventStore);

    // Register all command handlers
    const { handlers, schemas } = getCommandHandlers();
    for (const [commandType, handler] of handlers) {
      commandBus.register(commandType, handler, schemas.get(commandType));
    }
  });

  describe('Lead Commands', () => {
    describe('CreateLead', () => {
      it('should create a new lead', async () => {
        const result = await commandBus.send('CreateLead', {
          phone: '+40721234567',
          channel: 'whatsapp',
        });

        expect(result.success).toBe(true);
        expect(result.result).toMatchObject({
          status: 'created',
        });
        expect(result.aggregateId).toBe('+40721234567');
      });

      it('should return existing lead if already exists', async () => {
        // Create first
        await commandBus.send('CreateLead', {
          phone: '+40721234567',
          channel: 'whatsapp',
        });

        // Try to create again
        const result = await commandBus.send('CreateLead', {
          phone: '+40721234567',
          channel: 'voice',
        });

        expect(result.success).toBe(true);
        expect(result.result).toMatchObject({
          status: 'already_exists',
        });
      });

      it('should emit LeadCreated event', async () => {
        await commandBus.send('CreateLead', {
          phone: '+40721234567',
          channel: 'whatsapp',
        });

        const events = await eventStore.getByType('LeadCreated');
        expect(events.length).toBe(1);
        expect(events[0]?.payload).toMatchObject({
          phone: '+40721234567',
          channel: 'whatsapp',
        });
      });

      it('should emit LeadUtmTracked event when UTM provided', async () => {
        await commandBus.send('CreateLead', {
          phone: '+40721234567',
          channel: 'web',
          utmParams: {
            source: 'google',
            medium: 'cpc',
            campaign: 'dental-implants',
          },
        });

        const events = await eventStore.getByType('LeadUtmTracked');
        expect(events.length).toBe(1);
        expect(events[0]?.payload).toMatchObject({
          source: 'google',
          medium: 'cpc',
        });
      });
    });

    describe('ScoreLead', () => {
      beforeEach(async () => {
        await commandBus.send('CreateLead', {
          phone: '+40721234567',
          channel: 'whatsapp',
        });
      });

      it('should score a lead', async () => {
        const result = await commandBus.send('ScoreLead', {
          phone: '+40721234567',
          channel: 'whatsapp',
          messages: [
            { role: 'user', content: 'Vreau informații despre implant dentar' },
          ],
        });

        expect(result.success).toBe(true);
        expect(result.result).toHaveProperty('score');
        expect(result.result).toHaveProperty('classification');
      });

      it('should detect high-value procedure interest', async () => {
        const result = await commandBus.send('ScoreLead', {
          phone: '+40721234567',
          channel: 'whatsapp',
          messages: [
            { role: 'user', content: 'Cât costă all-on-4? Vreau să fac programare.' },
          ],
        });

        expect(result.success).toBe(true);
        const { score, classification } = result.result as any;
        expect(score).toBeGreaterThanOrEqual(4);
        expect(classification).toBe('HOT');
      });

      it('should create lead if not exists', async () => {
        const result = await commandBus.send('ScoreLead', {
          phone: '+40722222222',
          channel: 'voice',
          messages: [{ role: 'user', content: 'Hello' }],
        });

        expect(result.success).toBe(true);

        const events = await eventStore.getByAggregateId('+40722222222');
        expect(events.some((e) => e.type === 'LeadCreated')).toBe(true);
      });
    });

    describe('QualifyLead', () => {
      beforeEach(async () => {
        await commandBus.send('CreateLead', {
          phone: '+40721234567',
          channel: 'whatsapp',
        });
      });

      it('should qualify a lead', async () => {
        const result = await commandBus.send('QualifyLead', {
          leadId: '+40721234567',
          classification: 'HOT',
        });

        expect(result.success).toBe(true);
        expect(result.result).toMatchObject({ qualified: true });
      });

      it('should fail for non-existent lead', async () => {
        const result = await commandBus.send('QualifyLead', {
          leadId: 'nonexistent',
          classification: 'WARM',
        });

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('LEAD_NOT_FOUND');
      });
    });

    describe('AssignLead', () => {
      beforeEach(async () => {
        await commandBus.send('CreateLead', {
          phone: '+40721234567',
          channel: 'whatsapp',
        });
      });

      it('should assign lead to user', async () => {
        const result = await commandBus.send('AssignLead', {
          leadId: '+40721234567',
          assigneeId: 'user-123',
        });

        expect(result.success).toBe(true);
        expect(result.result).toMatchObject({ assigned: true });
      });
    });

    describe('ConvertLead', () => {
      beforeEach(async () => {
        await commandBus.send('CreateLead', {
          phone: '+40721234567',
          channel: 'whatsapp',
        });
      });

      it('should convert lead to patient', async () => {
        const result = await commandBus.send('ConvertLead', {
          leadId: '+40721234567',
          hubspotContactId: 'hubspot-123',
        });

        expect(result.success).toBe(true);
        expect(result.result).toMatchObject({
          converted: true,
          patientId: 'hubspot-123',
        });
      });

      it('should emit PatientCreatedFromLead event', async () => {
        await commandBus.send('ConvertLead', {
          leadId: '+40721234567',
          hubspotContactId: 'hubspot-123',
        });

        const events = await eventStore.getByType('PatientCreatedFromLead');
        expect(events.length).toBe(1);
        expect(events[0]?.payload).toMatchObject({
          leadId: '+40721234567',
          patientId: 'hubspot-123',
        });
      });
    });
  });

  describe('Appointment Commands', () => {
    describe('ScheduleAppointment', () => {
      it('should schedule an appointment', async () => {
        const result = await commandBus.send('ScheduleAppointment', {
          patientId: 'patient-123',
          serviceType: 'consultation',
          preferredDate: '2024-12-15',
          preferredTimeSlot: 'morning',
        });

        expect(result.success).toBe(true);
        expect(result.result).toHaveProperty('appointmentId');
        expect(result.result).toMatchObject({
          status: 'confirmed',
        });
      });

      it('should emit AppointmentScheduled event', async () => {
        await commandBus.send('ScheduleAppointment', {
          patientId: 'patient-123',
          serviceType: 'implant',
          preferredDate: '2024-12-20',
        });

        const events = await eventStore.getByType('AppointmentScheduled');
        expect(events.length).toBe(1);
        expect(events[0]?.payload).toMatchObject({
          patientId: 'patient-123',
          serviceType: 'implant',
        });
      });
    });

    describe('CancelAppointment', () => {
      it('should cancel an appointment', async () => {
        const result = await commandBus.send('CancelAppointment', {
          appointmentId: 'apt-123',
          reason: 'Patient request',
          notifyPatient: true,
        });

        expect(result.success).toBe(true);
        expect(result.result).toMatchObject({ cancelled: true });
      });

      it('should emit AppointmentCancelled event', async () => {
        await commandBus.send('CancelAppointment', {
          appointmentId: 'apt-456',
          reason: 'Scheduling conflict',
          initiatedBy: 'clinic',
        });

        const events = await eventStore.getByType('AppointmentCancelled');
        expect(events.length).toBe(1);
        expect(events[0]?.payload).toMatchObject({
          appointmentId: 'apt-456',
          reason: 'Scheduling conflict',
          initiatedBy: 'clinic',
        });
      });
    });
  });

  describe('Consent Commands', () => {
    describe('RecordConsent', () => {
      it('should record consent', async () => {
        const result = await commandBus.send('RecordConsent', {
          patientId: 'patient-123',
          phone: '+40721234567',
          consentType: 'marketing_whatsapp',
          status: 'granted',
          source: 'whatsapp',
        });

        expect(result.success).toBe(true);
        expect(result.result).toHaveProperty('consentId');
        expect(result.result).toHaveProperty('recordedAt');
      });

      it('should emit ConsentRecorded event for GDPR audit', async () => {
        await commandBus.send('RecordConsent', {
          patientId: 'patient-123',
          phone: '+40721234567',
          consentType: 'data_processing',
          status: 'granted',
          source: 'web_form',
          ipAddress: '192.168.1.1',
        });

        const events = await eventStore.getByType('ConsentRecorded');
        expect(events.length).toBe(1);
        expect(events[0]?.payload).toMatchObject({
          patientId: 'patient-123',
          consentType: 'data_processing',
          status: 'granted',
          ipAddress: '192.168.1.1',
        });
      });
    });
  });

  describe('Messaging Commands', () => {
    describe('SendWhatsAppMessage', () => {
      it('should send a message', async () => {
        const result = await commandBus.send('SendWhatsAppMessage', {
          to: '+40721234567',
          message: 'Hello from the clinic!',
        });

        expect(result.success).toBe(true);
        expect(result.result).toMatchObject({
          status: 'sent',
        });
        expect(result.result).toHaveProperty('messageId');
      });

      it('should emit WhatsAppMessageSent event', async () => {
        await commandBus.send('SendWhatsAppMessage', {
          to: '+40721234567',
          templateName: 'appointment_reminder',
          templateParams: {
            patient_name: 'Ion',
            date: '15 Dec',
          },
        });

        const events = await eventStore.getByType('WhatsAppMessageSent');
        expect(events.length).toBe(1);
        expect(events[0]?.payload).toMatchObject({
          to: '+40721234567',
          templateName: 'appointment_reminder',
        });
      });
    });
  });

  describe('Command Validation', () => {
    it('should reject invalid phone format', async () => {
      const result = await commandBus.send('CreateLead', {
        phone: 'invalid',
        channel: 'whatsapp',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid channel', async () => {
      const result = await commandBus.send('CreateLead', {
        phone: '+40721234567',
        channel: 'invalid_channel' as any,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid consent type', async () => {
      const result = await commandBus.send('RecordConsent', {
        patientId: 'patient-123',
        phone: '+40721234567',
        consentType: 'invalid_type' as any,
        status: 'granted',
        source: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });
  });
});
