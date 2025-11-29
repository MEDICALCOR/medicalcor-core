import { describe, it, expect } from 'vitest';
import { TriageService, createTriageService } from '../triage/triage-service.js';

describe('TriageService', () => {
  const service = new TriageService();

  describe('assess', () => {
    it('should return high_priority for pain/discomfort keywords (not emergency)', () => {
      const result = service.assessSync({
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
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am nevoie urgent de o programare',
        hasExistingRelationship: false,
      });

      expect(result.urgencyLevel).toBe('high_priority');
      expect(result.medicalFlags).toContain('symptom:urgent');
    });

    it('should prioritize HOT leads', () => {
      const result = service.assessSync({
        leadScore: 'HOT',
        channel: 'whatsapp',
        messageContent: 'Vreau sa fac all-on-4',
        hasExistingRelationship: false,
      });

      expect(result.urgencyLevel).toBe('high');
      expect(result.routingRecommendation).toBe('same_day');
    });

    it('should prioritize existing patients', () => {
      const result = service.assessSync({
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
      const result = service.assessSync({
        leadScore: 'COLD',
        channel: 'whatsapp',
        messageContent: 'Informatii generale',
        hasExistingRelationship: false,
      });

      expect(result.routingRecommendation).toBe('nurture_sequence');
    });

    it('should suggest implant team for procedure interest', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Ma intereseaza implanturi',
        procedureInterest: ['implant'],
        hasExistingRelationship: false,
      });

      expect(result.suggestedOwner).toBe('dr-implant-team');
    });

    it('should flag re-engagement opportunities', () => {
      const result = service.assessSync({
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
      const result = service.assessSync({
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
      const result = service.assessSync({
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
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Vreau informatii despre implanturi',
        hasExistingRelationship: false,
      });

      expect(result.prioritySchedulingRequested).toBe(false);
      expect(result.medicalFlags).not.toContain('priority_scheduling_requested');
    });

    it('should route priority scheduling requests to same_day', () => {
      const result = service.assessSync({
        leadScore: 'COLD',
        channel: 'web',
        messageContent: 'Am nevoie de o programare imediat pentru consultatie',
        hasExistingRelationship: false,
      });

      expect(result.prioritySchedulingRequested).toBe(true);
      expect(result.routingRecommendation).toBe('same_day');
      // Priority scheduling note
      expect(result.notes).toContain('PRIORITY SCHEDULING REQUESTED');
    });

    // =====================================================================
    // NEW TESTS: Extended coverage for triage edge cases
    // =====================================================================

    it('should flag potential emergency for accident keywords', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am avut un accident si mi-am spart un dinte',
        hasExistingRelationship: false,
      });

      expect(result.medicalFlags).toContain('potential_emergency_refer_112');
    });

    it('should detect infection symptoms', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am o infectie la gingie si febra',
        hasExistingRelationship: false,
      });

      expect(result.urgencyLevel).toBe('high_priority');
      expect(result.medicalFlags).toContain('symptom:infectie');
      expect(result.medicalFlags).toContain('symptom:febra');
    });

    it('should detect abscess symptoms', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Cred ca am un abces la masea',
        hasExistingRelationship: false,
      });

      expect(result.urgencyLevel).toBe('high_priority');
      expect(result.medicalFlags).toContain('symptom:abces');
    });

    it('should detect "nu pot manca" symptom', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Nu pot manca de cand mi s-a stricat masea',
        hasExistingRelationship: false,
      });

      expect(result.urgencyLevel).toBe('high_priority');
      expect(result.prioritySchedulingRequested).toBe(true);
    });

    it('should detect "nu pot dormi" symptom', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am durere si nu pot dormi de 2 nopti',
        hasExistingRelationship: false,
      });

      expect(result.urgencyLevel).toBe('high_priority');
    });

    it('should route voice channel to next_business_day for WARM leads', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'voice',
        messageContent: 'Am sunat pentru informatii despre implanturi',
        hasExistingRelationship: false,
      });

      expect(result.routingRecommendation).toBe('next_business_day');
    });

    it('should suggest implant team for All-on-X procedure', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Ma intereseaza',
        procedureInterest: ['All-on-X'],
        hasExistingRelationship: false,
      });

      expect(result.suggestedOwner).toBe('dr-implant-team');
    });

    it('should suggest reception team for general inquiries', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Informatii generale',
        hasExistingRelationship: false,
      });

      expect(result.suggestedOwner).toBe('reception-team');
    });

    it('should suggest scheduling team for high_priority cases', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am durere puternica',
        hasExistingRelationship: false,
      });

      expect(result.suggestedOwner).toBe('scheduling-team');
    });

    it('should not flag re-engagement for recent contacts', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am o intrebare',
        hasExistingRelationship: true,
        previousAppointments: 1,
        lastContactDays: 30, // Recent contact
      });

      expect(result.medicalFlags).not.toContain('re_engagement_opportunity');
    });

    it('should flag re-engagement at 180+ days threshold', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am o intrebare',
        hasExistingRelationship: true,
        previousAppointments: 1,
        lastContactDays: 181, // Just past threshold
      });

      expect(result.medicalFlags).toContain('re_engagement_opportunity');
    });

    it('should include existing patient count in notes', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am o intrebare',
        hasExistingRelationship: true,
        previousAppointments: 5,
      });

      expect(result.notes).toContain('5 previous appointments');
    });

    it('should include safety disclaimer for high_priority cases', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am durere foarte mare',
        hasExistingRelationship: false,
      });

      expect(result.notes).toContain('112');
      expect(result.notes).toContain('life-threatening');
    });

    it('should handle UNQUALIFIED leads with nurture routing', () => {
      const result = service.assessSync({
        leadScore: 'UNQUALIFIED',
        channel: 'web',
        messageContent: 'Test message',
        hasExistingRelationship: false,
      });

      expect(result.routingRecommendation).toBe('nurture_sequence');
    });

    it('should detect "azi" urgency keyword', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Pot veni azi la o consultatie?',
        hasExistingRelationship: false,
      });

      expect(result.prioritySchedulingRequested).toBe(true);
    });

    it('should detect "acum" urgency keyword', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am nevoie de ajutor acum',
        hasExistingRelationship: false,
      });

      expect(result.prioritySchedulingRequested).toBe(true);
    });

    it('should detect "prima programare" urgency keyword', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Vreau prima programare disponibila',
        hasExistingRelationship: false,
      });

      expect(result.prioritySchedulingRequested).toBe(true);
    });

    it('should handle existing patient with no previous appointments', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am o intrebare',
        hasExistingRelationship: true,
        previousAppointments: 0,
      });

      // Should not boost urgency without actual previous appointments
      expect(result.medicalFlags).not.toContain('existing_patient');
    });

    it('should handle email channel', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'email',
        messageContent: 'Informatii despre implanturi',
        hasExistingRelationship: false,
      });

      expect(result.routingRecommendation).toBe('next_business_day');
    });

    it('should include procedure interest in notes', () => {
      const result = service.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Ma intereseaza',
        procedureInterest: ['implant', 'whitening'],
        hasExistingRelationship: false,
      });

      expect(result.notes).toContain('implant');
      expect(result.notes).toContain('whitening');
    });

    it('should combine multiple urgency indicators', () => {
      const result = service.assessSync({
        leadScore: 'HOT',
        channel: 'whatsapp',
        messageContent: 'Am durere urgenta si abces',
        hasExistingRelationship: true,
        previousAppointments: 3,
      });

      expect(result.urgencyLevel).toBe('high_priority');
      expect(result.medicalFlags).toContain('symptom:durere');
      expect(result.medicalFlags).toContain('symptom:urgent');
      expect(result.medicalFlags).toContain('symptom:abces');
      expect(result.medicalFlags).toContain('existing_patient');
    });
  });

  describe('getNotificationContacts', () => {
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

    it('should return empty for low urgency', () => {
      const contacts = service.getNotificationContacts('low');
      expect(contacts).toHaveLength(0);
    });
  });

  describe('isVIP', () => {
    it('should return false when no VIP phones configured', () => {
      expect(service.isVIP('+40721123456')).toBe(false);
    });

    it('should return true for VIP phone when configured', () => {
      const serviceWithVIP = new TriageService({
        vipPhones: ['+40721111111', '+40722222222'],
      });
      expect(serviceWithVIP.isVIP('+40721111111')).toBe(true);
      expect(serviceWithVIP.isVIP('+40722222222')).toBe(true);
    });

    it('should return false for non-VIP phone', () => {
      const serviceWithVIP = new TriageService({
        vipPhones: ['+40721111111'],
      });
      expect(serviceWithVIP.isVIP('+40721999999')).toBe(false);
    });
  });

  describe('custom configuration', () => {
    it('should allow custom priority keywords', () => {
      const customService = new TriageService({
        priorityKeywords: ['custom_symptom'],
      });

      const result = customService.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am custom_symptom',
        hasExistingRelationship: false,
      });

      expect(result.urgencyLevel).toBe('high_priority');
    });

    it('should allow custom default owners', () => {
      const customService = new TriageService({
        defaultOwners: {
          implants: 'custom-implant-team',
          general: 'custom-reception',
          priority: 'custom-priority',
        },
      });

      const result = customService.assessSync({
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Info',
        hasExistingRelationship: false,
      });

      expect(result.suggestedOwner).toBe('custom-reception');
    });
  });

  describe('createTriageService factory', () => {
    it('should create a triage service instance', () => {
      const newService = createTriageService();
      expect(newService).toBeInstanceOf(TriageService);
    });

    it('should accept custom configuration', () => {
      const newService = createTriageService({
        vipPhones: ['+40721000000'],
      });
      expect(newService.isVIP('+40721000000')).toBe(true);
    });
  });
});
