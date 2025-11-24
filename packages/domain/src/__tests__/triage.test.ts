import { describe, it, expect } from 'vitest';
import { TriageService } from '../triage/triage-service.js';

describe('TriageService', () => {
  const service = new TriageService();

  describe('assess', () => {
    it('should return high_priority for pain/discomfort keywords (not emergency)', () => {
      const result = service.assess({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am durere puternica si umflatura',
        hasExistingRelationship: false,
      });

      // NOTE: Pain/discomfort indicates high purchase intent, not medical emergency
      expect(result.urgencyLevel).toBe('high_priority');
      expect(result.prioritySchedulingRequested).toBe(true);
      expect(result.routingRecommendation).toBe('next_available_slot');
      expect(result.medicalFlags).toContain('priority_scheduling_requested');
    });

    it('should return high_priority for urgent keywords', () => {
      const result = service.assess({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am nevoie urgent de o programare',
        hasExistingRelationship: false,
      });

      expect(result.urgencyLevel).toBe('high_priority');
      expect(result.medicalFlags).toContain('symptom:urgent');
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

    it('should include comprehensive notes with safety disclaimer', () => {
      const result = service.assess({
        leadScore: 'HOT',
        channel: 'voice',
        messageContent: 'Urgent, all-on-4',
        procedureInterest: ['All-on-X'],
        hasExistingRelationship: true,
        previousAppointments: 2,
      });

      expect(result.notes).toContain('HIGH_PRIORITY');
      expect(result.notes).toContain('voice');
      expect(result.notes).toContain('All-on-X');
      expect(result.notes).toContain('PRIORITY SCHEDULING REQUESTED');
    });

    it('should detect priority scheduling request', () => {
      const result = service.assess({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Vreau o programare cat mai repede posibil',
        hasExistingRelationship: false,
      });

      expect(result.prioritySchedulingRequested).toBe(true);
      expect(result.medicalFlags).toContain('priority_scheduling_requested');
      expect(result.urgencyLevel).toBe('high');
      expect(result.routingRecommendation).toBe('same_day');
    });

    it('should not flag priority scheduling for normal requests', () => {
      const result = service.assess({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Vreau informatii despre implanturi',
        hasExistingRelationship: false,
      });

      expect(result.prioritySchedulingRequested).toBe(false);
      expect(result.medicalFlags).not.toContain('priority_scheduling_requested');
    });

    it('should route priority scheduling requests to same_day', () => {
      const result = service.assess({
        leadScore: 'COLD',
        channel: 'web',
        messageContent: 'Am nevoie de o programare imediat pentru consultatie',
        hasExistingRelationship: false,
      });

      expect(result.prioritySchedulingRequested).toBe(true);
      expect(result.routingRecommendation).toBe('same_day');
      // Should include safety disclaimer for priority cases
      expect(result.notes).toContain('112');
    });
  });

  describe('getNotificationContacts', () => {
    it('should return doctor and manager for critical', () => {
      const contacts = service.getNotificationContacts('critical');
      expect(contacts).toContain('on-call-doctor');
      expect(contacts).toContain('clinic-manager');
    });

    it('should return supervisor for high', () => {
      const contacts = service.getNotificationContacts('high');
      expect(contacts).toContain('shift-supervisor');
    it('should return scheduling team for high_priority', () => {
      const contacts = service.getNotificationContacts('high_priority');
      expect(contacts).toContain('scheduling-team');
      expect(contacts).toContain('reception-lead');
    });

    it('should return reception for high', () => {
      const contacts = service.getNotificationContacts('high');
      expect(contacts).toContain('reception-team');
    });

    it('should return empty for normal', () => {
      const contacts = service.getNotificationContacts('normal');
      expect(contacts).toHaveLength(0);
    });
  });
});
