import { describe, it, expect } from 'vitest';
import { TriageService } from '../triage/triage-service.js';

describe('TriageService', () => {
  const service = new TriageService();

  describe('assess', () => {
    it('should return critical urgency for medical emergencies', () => {
      const result = service.assess({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am avut un accident si mi-am spart dintele',
        hasExistingRelationship: false,
      });

      expect(result.urgencyLevel).toBe('critical');
      expect(result.escalationRequired).toBe(true);
      expect(result.routingRecommendation).toBe('immediate_callback');
    });

    it('should return high urgency for critical symptoms', () => {
      const result = service.assess({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am durere puternica si umflatura',
        hasExistingRelationship: false,
      });

      expect(result.urgencyLevel).toBe('high');
      expect(result.medicalFlags).toContain('symptom:durere_puternica');
    });

    it('should prioritize HOT leads', () => {
      const result = service.assess({
        leadScore: 'HOT',
        channel: 'whatsapp',
        messageContent: 'Vreau sa fac all-on-4',
        hasExistingRelationship: false,
      });

      expect(result.urgencyLevel).toBe('high');
      expect(result.routingRecommendation).toBe('same_day');
    });

    it('should prioritize existing patients', () => {
      const result = service.assess({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am o intrebare',
        hasExistingRelationship: true,
        previousAppointments: 3,
      });

      expect(result.urgencyLevel).toBe('high');
      expect(result.medicalFlags).toContain('existing_patient');
    });

    it('should route COLD leads to nurture sequence', () => {
      const result = service.assess({
        leadScore: 'COLD',
        channel: 'whatsapp',
        messageContent: 'Informatii generale',
        hasExistingRelationship: false,
      });

      expect(result.routingRecommendation).toBe('nurture_sequence');
    });

    it('should suggest implant team for procedure interest', () => {
      const result = service.assess({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Ma intereseaza implanturi',
        procedureInterest: ['implant'],
        hasExistingRelationship: false,
      });

      expect(result.suggestedOwner).toBe('dr-implant-team');
    });

    it('should flag re-engagement opportunities', () => {
      const result = service.assess({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Buna, revin cu o intrebare',
        hasExistingRelationship: true,
        previousAppointments: 1,
        lastContactDays: 200,
      });

      expect(result.medicalFlags).toContain('re_engagement_opportunity');
    });

    it('should include comprehensive notes', () => {
      const result = service.assess({
        leadScore: 'HOT',
        channel: 'voice',
        messageContent: 'Urgent, all-on-4',
        procedureInterest: ['All-on-X'],
        hasExistingRelationship: true,
        previousAppointments: 2,
      });

      expect(result.notes).toContain('HOT');
      expect(result.notes).toContain('voice');
      expect(result.notes).toContain('All-on-X');
    });
  });

  describe('getEscalationContacts', () => {
    it('should return doctor and manager for critical', () => {
      const contacts = service.getEscalationContacts('critical');
      expect(contacts).toContain('on-call-doctor');
      expect(contacts).toContain('clinic-manager');
    });

    it('should return supervisor for high', () => {
      const contacts = service.getEscalationContacts('high');
      expect(contacts).toContain('shift-supervisor');
    });

    it('should return empty for normal', () => {
      const contacts = service.getEscalationContacts('normal');
      expect(contacts).toHaveLength(0);
    });
  });
});
