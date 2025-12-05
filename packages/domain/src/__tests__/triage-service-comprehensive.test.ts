/**
 * @fileoverview Comprehensive Tests for Triage Service
 * Tests routing logic, priority detection, and configuration loading
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TriageService,
  createTriageService,
  type TriageInput,
  type TriageConfig,
  type TriageConfigClient,
  type SchedulingServiceInterface,
} from '../triage/triage-service.js';

describe('TriageService', () => {
  describe('Basic Triage Assessment', () => {
    let service: TriageService;

    beforeEach(() => {
      service = createTriageService();
    });

    it('should assess normal lead as normal priority', async () => {
      const input: TriageInput = {
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Vreau informatii despre servicii',
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      expect(result.urgencyLevel).toBe('normal');
      expect(result.routingRecommendation).toBe('next_business_day');
      expect(result.prioritySchedulingRequested).toBe(false);
    });

    it('should detect priority keywords for pain/discomfort', async () => {
      const input: TriageInput = {
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am durere puternica la dinte',
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      expect(result.urgencyLevel).toBe('high_priority');
      expect(result.routingRecommendation).toBe('next_available_slot');
      expect(result.prioritySchedulingRequested).toBe(true);
      expect(result.medicalFlags).toContain('priority_scheduling_requested');
      expect(result.medicalFlags.some((f) => f.startsWith('symptom:'))).toBe(true);
    });

    it('should detect priority scheduling keywords', async () => {
      const input: TriageInput = {
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Vreau programare urgent, cat mai repede',
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      // "urgent" is both a priority keyword (pain/discomfort) and scheduling keyword
      // Priority keywords take precedence and set urgency to high_priority
      expect(result.urgencyLevel).toBe('high_priority');
      expect(result.prioritySchedulingRequested).toBe(true);
      expect(result.medicalFlags).toContain('priority_scheduling_requested');
    });

    it('should detect medical emergency keywords', async () => {
      const input: TriageInput = {
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Am avut accident, mi-am spart dintele',
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      expect(result.medicalFlags).toContain('potential_emergency_refer_112');
    });

    it('should prioritize HOT leads', async () => {
      const input: TriageInput = {
        leadScore: 'HOT',
        channel: 'whatsapp',
        messageContent: 'Vreau informatii',
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      expect(result.urgencyLevel).toBe('high');
      expect(result.routingRecommendation).toBe('same_day');
    });

    it('should prioritize existing patients', async () => {
      const input: TriageInput = {
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Vreau programare',
        hasExistingRelationship: true,
        previousAppointments: 3,
      };

      const result = await service.assess(input);

      expect(result.urgencyLevel).toBe('high');
      expect(result.medicalFlags).toContain('existing_patient');
    });

    it('should flag re-engagement opportunities', async () => {
      const input: TriageInput = {
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Salut',
        hasExistingRelationship: true,
        lastContactDays: 200,
      };

      const result = await service.assess(input);

      expect(result.medicalFlags).toContain('re_engagement_opportunity');
    });

    it('should use sync assess method', () => {
      const input: TriageInput = {
        leadScore: 'HOT',
        channel: 'whatsapp',
        messageContent: 'Urgent, am durere',
        hasExistingRelationship: false,
      };

      const result = service.assessSync(input);

      expect(result.urgencyLevel).toBe('high_priority');
      expect(result.prioritySchedulingRequested).toBe(true);
    });
  });

  describe('Routing Recommendations', () => {
    let service: TriageService;

    beforeEach(() => {
      service = createTriageService();
    });

    it('should route high_priority to next_available_slot', async () => {
      const input: TriageInput = {
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Durere puternica',
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      expect(result.urgencyLevel).toBe('high_priority');
      expect(result.routingRecommendation).toBe('next_available_slot');
    });

    it('should route HOT leads to same_day', async () => {
      const input: TriageInput = {
        leadScore: 'HOT',
        channel: 'whatsapp',
        messageContent: 'Vreau implant',
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      expect(result.routingRecommendation).toBe('same_day');
    });

    it('should route WARM leads to next_business_day', async () => {
      const input: TriageInput = {
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Vreau informatii',
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      expect(result.routingRecommendation).toBe('next_business_day');
    });

    it('should route voice leads to next_business_day', async () => {
      const input: TriageInput = {
        leadScore: 'COLD',
        channel: 'voice',
        messageContent: 'Informatii generale',
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      expect(result.routingRecommendation).toBe('next_business_day');
    });

    it('should route COLD/UNQUALIFIED to nurture_sequence', async () => {
      const input: TriageInput = {
        leadScore: 'COLD',
        channel: 'whatsapp',
        messageContent: 'Info',
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      expect(result.routingRecommendation).toBe('nurture_sequence');
    });
  });

  describe('Owner Assignment', () => {
    let service: TriageService;

    beforeEach(() => {
      service = createTriageService();
    });

    it('should assign priority team for high_priority cases', async () => {
      const input: TriageInput = {
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Durere urgenta',
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      expect(result.suggestedOwner).toBe('scheduling-team');
    });

    it('should assign implant team for implant interest', async () => {
      const input: TriageInput = {
        leadScore: 'HOT',
        channel: 'whatsapp',
        messageContent: 'Vreau informatii',
        procedureInterest: ['implant'],
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      expect(result.suggestedOwner).toBe('dr-implant-team');
    });

    it('should assign implant team for All-on-X interest', async () => {
      const input: TriageInput = {
        leadScore: 'HOT',
        channel: 'whatsapp',
        messageContent: 'Vreau informatii',
        procedureInterest: ['All-on-X'],
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      expect(result.suggestedOwner).toBe('dr-implant-team');
    });

    it('should assign reception team for general cases', async () => {
      const input: TriageInput = {
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Vreau informatii',
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      expect(result.suggestedOwner).toBe('reception-team');
    });
  });

  describe('Configuration Loading', () => {
    it('should use default config when no database client provided', async () => {
      const service = createTriageService();
      const config = service.getConfig();

      expect(config.priorityKeywords.length).toBeGreaterThan(0);
      expect(config.medicalEmergencyKeywords.length).toBeGreaterThan(0);
    });

    it('should load config from database', async () => {
      const mockClient: TriageConfigClient = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('triage_rules')) {
            return {
              rows: [
                { rule_type: 'priority_keyword', value: 'durere_custom' },
                { rule_type: 'emergency_keyword', value: 'urgenta_custom' },
                { rule_type: 'scheduling_keyword', value: 'urgent_custom' },
                { rule_type: 'vip_phone', value: '+40700000001' },
              ],
            };
          }
          if (sql.includes('triage_owners')) {
            return {
              rows: [
                { owner_key: 'implants', owner_value: 'custom-implant-team' },
                { owner_key: 'general', owner_value: 'custom-reception-team' },
              ],
            };
          }
          return { rows: [] };
        }),
      };

      const service = createTriageService({}, { configClient: mockClient });
      await service.loadConfigFromDatabase();

      const config = service.getConfig();
      expect(config.priorityKeywords).toContain('durere_custom');
      expect(config.medicalEmergencyKeywords).toContain('urgenta_custom');
      expect(config.vipPhones).toContain('+40700000001');
    });

    it('should reload config', async () => {
      const mockClient: TriageConfigClient = {
        query: vi.fn(async () => ({ rows: [] })),
      };

      const service = createTriageService({}, { configClient: mockClient });
      await service.reloadConfig();

      expect(mockClient.query).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      const mockClient: TriageConfigClient = {
        query: vi.fn(async () => {
          throw new Error('Database error');
        }),
      };

      const service = createTriageService({}, { configClient: mockClient });

      // Should not throw
      await expect(service.loadConfigFromDatabase()).resolves.not.toThrow();
    });
  });

  describe('Slot Validation', () => {
    it('should find available slot for next_available_slot routing', async () => {
      const mockSchedulingService: SchedulingServiceInterface = {
        getAvailableSlots: vi.fn(async () => [
          {
            id: 'slot-123',
            date: '2025-01-15',
            startTime: '10:00',
            practitioner: 'Dr. Smith',
            procedureTypes: ['general'],
          },
        ]),
      };

      const service = createTriageService({}, { schedulingService: mockSchedulingService });

      const input: TriageInput = {
        leadScore: 'HOT',
        channel: 'whatsapp',
        messageContent: 'Durere puternica',
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      expect(result.availableSlot).toBeDefined();
      expect(result.availableSlot?.id).toBe('slot-123');
      expect(result.availableSlot?.date).toBe('2025-01-15');
      expect(result.availableSlot?.startTime).toBe('10:00');
    });

    it('should downgrade routing if no slot available', async () => {
      const mockSchedulingService: SchedulingServiceInterface = {
        getAvailableSlots: vi.fn(async () => []),
      };

      const service = createTriageService({}, { schedulingService: mockSchedulingService });

      const input: TriageInput = {
        leadScore: 'HOT',
        channel: 'whatsapp',
        messageContent: 'Durere puternica',
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      // Should try to downgrade from next_available_slot -> same_day -> next_business_day
      expect(result.medicalFlags).toContain('no_immediate_slot_available');
    });

    it('should handle scheduling service errors gracefully', async () => {
      const mockSchedulingService: SchedulingServiceInterface = {
        getAvailableSlots: vi.fn(async () => {
          throw new Error('Scheduling service error');
        }),
      };

      const service = createTriageService({}, { schedulingService: mockSchedulingService });

      const input: TriageInput = {
        leadScore: 'HOT',
        channel: 'whatsapp',
        messageContent: 'Durere',
        hasExistingRelationship: false,
      };

      // Should not throw
      const result = await service.assess(input);
      expect(result.availableSlot).toBeUndefined();
    });
  });

  describe('VIP Detection', () => {
    it('should detect VIP phone numbers', () => {
      const service = createTriageService({
        vipPhones: ['+40700000001', '+40700000002'],
      });

      expect(service.isVIP('+40700000001')).toBe(true);
      expect(service.isVIP('+40700000002')).toBe(true);
      expect(service.isVIP('+40700000003')).toBe(false);
    });
  });

  describe('Notification Contacts', () => {
    let service: TriageService;

    beforeEach(() => {
      service = createTriageService();
    });

    it('should return scheduling team for high_priority', () => {
      const contacts = service.getNotificationContacts('high_priority');
      expect(contacts).toContain('scheduling-team');
      expect(contacts).toContain('reception-lead');
    });

    it('should return reception team for high urgency', () => {
      const contacts = service.getNotificationContacts('high');
      expect(contacts).toEqual(['reception-team']);
    });

    it('should return empty array for normal urgency', () => {
      const contacts = service.getNotificationContacts('normal');
      expect(contacts).toEqual([]);
    });

    it('should return empty array for low urgency', () => {
      const contacts = service.getNotificationContacts('low');
      expect(contacts).toEqual([]);
    });
  });

  describe('Triage Notes', () => {
    let service: TriageService;

    beforeEach(() => {
      service = createTriageService();
    });

    it('should include priority in notes', async () => {
      const input: TriageInput = {
        leadScore: 'HOT',
        channel: 'whatsapp',
        messageContent: 'Vreau implant',
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      expect(result.notes).toContain('Priority: HIGH');
      expect(result.notes).toContain('Lead Score: HOT');
      expect(result.notes).toContain('Channel: whatsapp');
    });

    it('should include procedure interest in notes', async () => {
      const input: TriageInput = {
        leadScore: 'HOT',
        channel: 'whatsapp',
        messageContent: 'Vreau implant',
        procedureInterest: ['implant', 'coroana'],
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      expect(result.notes).toContain('Procedures: implant, coroana');
    });

    it('should include safety disclaimer for high_priority cases', async () => {
      const input: TriageInput = {
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Durere puternica',
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      expect(result.notes).toContain('Patient reported discomfort');
      expect(result.notes).toContain('For life-threatening emergencies, advise calling 112');
    });

    it('should include existing patient info', async () => {
      const input: TriageInput = {
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Programare',
        hasExistingRelationship: true,
        previousAppointments: 5,
      };

      const result = await service.assess(input);

      expect(result.notes).toContain('Existing patient with 5 previous appointments');
    });

    it('should include available slot in notes', async () => {
      const mockSchedulingService: SchedulingServiceInterface = {
        getAvailableSlots: vi.fn(async () => [
          {
            id: 'slot-123',
            date: '2025-01-15',
            startTime: '10:00',
            practitioner: 'Dr. Smith',
            procedureTypes: ['general'],
          },
        ]),
      };

      const service = createTriageService({}, { schedulingService: mockSchedulingService });

      const input: TriageInput = {
        leadScore: 'HOT',
        channel: 'whatsapp',
        messageContent: 'Durere',
        hasExistingRelationship: false,
      };

      const result = await service.assess(input);

      expect(result.notes).toContain('Available Slot: 2025-01-15 10:00');
      expect(result.notes).toContain('Practitioner: Dr. Smith');
    });
  });
});
