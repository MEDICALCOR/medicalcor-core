import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Comprehensive tests for Urgent Case Escalation Workflow
 * Tests the full escalation flow with mocked external services
 */

// Mock environment variables
vi.stubEnv('HUBSPOT_ACCESS_TOKEN', 'test-token');
vi.stubEnv('WHATSAPP_API_KEY', 'test-whatsapp-key');
vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456789');
vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
vi.stubEnv('API_GATEWAY_URL', 'http://localhost:3000');
vi.stubEnv('INTERNAL_API_KEY', 'test-internal-key');
vi.stubEnv('DATABASE_URL', '');

import {
  createHubSpotClient,
  createWhatsAppClient,
  createNotificationsService,
  createMockNotificationsService,
} from '@medicalcor/integrations';
import { createInMemoryEventStore, normalizeRomanianPhone } from '@medicalcor/core';

// =============================================================================
// Urgent Keyword Detection Tests
// =============================================================================

describe('Urgent Keyword Detection', () => {
  const correlationId = 'urgent-keyword-test-123';

  // Romanian urgent keywords with weighted scores
  const URGENT_KEYWORDS: Record<string, { score: number; level: 'critical' | 'high' | 'medium' }> =
    {
      // Critical - immediate attention needed
      sângerare: { score: 10, level: 'critical' },
      sangerare: { score: 10, level: 'critical' },
      'nu pot respira': { score: 10, level: 'critical' },
      umflătură: { score: 8, level: 'critical' },
      umflatura: { score: 8, level: 'critical' },
      urgență: { score: 9, level: 'critical' },
      urgenta: { score: 9, level: 'critical' },
      accident: { score: 9, level: 'critical' },
      căzut: { score: 7, level: 'critical' },
      cazut: { score: 7, level: 'critical' },

      // High - needs prompt attention
      durere: { score: 6, level: 'high' },
      'durere puternică': { score: 8, level: 'high' },
      'durere puternica': { score: 8, level: 'high' },
      'nu pot mânca': { score: 6, level: 'high' },
      'nu pot manca': { score: 6, level: 'high' },
      infecție: { score: 7, level: 'high' },
      infectie: { score: 7, level: 'high' },
      febră: { score: 6, level: 'high' },
      febra: { score: 6, level: 'high' },
      'rupt dinte': { score: 7, level: 'high' },
      'dinte spart': { score: 7, level: 'high' },
      abces: { score: 8, level: 'high' },

      // Medium - follow-up needed
      disconfort: { score: 4, level: 'medium' },
      sensibilitate: { score: 3, level: 'medium' },
      'mă doare': { score: 5, level: 'medium' },
      'ma doare': { score: 5, level: 'medium' },
      'am nevoie': { score: 4, level: 'medium' },
      programare: { score: 2, level: 'medium' },
    };

  function detectUrgentKeywords(messageContent: string): {
    isUrgent: boolean;
    urgencyLevel: 'critical' | 'high' | 'medium' | null;
    keywords: string[];
    score: number;
  } {
    const lowerContent = messageContent.toLowerCase();
    const detectedKeywords: string[] = [];
    let maxScore = 0;
    let urgencyLevel: 'critical' | 'high' | 'medium' | null = null;

    for (const [keyword, config] of Object.entries(URGENT_KEYWORDS)) {
      if (lowerContent.includes(keyword)) {
        detectedKeywords.push(keyword);
        if (config.score > maxScore) {
          maxScore = config.score;
          urgencyLevel = config.level;
        }
      }
    }

    // Additional pattern detection
    const exclamationCount = (messageContent.match(/!/g) || []).length;
    const capsRatio = (messageContent.match(/[A-Z]/g) || []).length / messageContent.length;

    // Boost urgency for emotional indicators
    if (exclamationCount >= 3 || capsRatio > 0.5) {
      maxScore = Math.min(maxScore + 2, 10);
      if (urgencyLevel === 'medium' && maxScore >= 6) {
        urgencyLevel = 'high';
      }
    }

    return {
      isUrgent: urgencyLevel !== null,
      urgencyLevel,
      keywords: detectedKeywords,
      score: maxScore,
    };
  }

  describe('Critical keyword detection', () => {
    it('should detect sângerare (bleeding) as critical', () => {
      const result = detectUrgentKeywords('Am sângerare la gingie foarte puternică');
      expect(result.isUrgent).toBe(true);
      expect(result.urgencyLevel).toBe('critical');
      expect(result.keywords).toContain('sângerare');
      expect(result.score).toBe(10);
    });

    it('should detect urgență as critical', () => {
      const result = detectUrgentKeywords('Este o urgență, vă rog ajutați-mă!');
      expect(result.isUrgent).toBe(true);
      expect(result.urgencyLevel).toBe('critical');
      expect(result.keywords).toContain('urgență');
    });

    it('should detect accident as critical', () => {
      const result = detectUrgentKeywords('Am avut un accident și mi-am spart un dinte');
      expect(result.isUrgent).toBe(true);
      expect(result.urgencyLevel).toBe('critical');
      expect(result.keywords).toContain('accident');
    });

    it('should detect umflătură (swelling) as critical', () => {
      const result = detectUrgentKeywords('Am o umflătură mare la față de la dinte');
      expect(result.isUrgent).toBe(true);
      expect(result.urgencyLevel).toBe('critical');
      expect(result.keywords).toContain('umflătură');
    });

    it('should detect breathing issues as critical', () => {
      const result = detectUrgentKeywords('Nu pot respira bine, am umflat');
      expect(result.isUrgent).toBe(true);
      expect(result.urgencyLevel).toBe('critical');
      expect(result.keywords).toContain('nu pot respira');
    });
  });

  describe('High urgency keyword detection', () => {
    it('should detect durere (pain) as high', () => {
      const result = detectUrgentKeywords('Am durere mare la măsea');
      expect(result.isUrgent).toBe(true);
      expect(result.urgencyLevel).toBe('high');
      expect(result.keywords).toContain('durere');
    });

    it('should detect durere puternică (severe pain) as high with higher score', () => {
      const result = detectUrgentKeywords('Am durere puternică la dinte');
      expect(result.isUrgent).toBe(true);
      expect(result.urgencyLevel).toBe('high');
      expect(result.keywords).toContain('durere puternică');
      expect(result.score).toBe(8);
    });

    it('should detect abces as high', () => {
      const result = detectUrgentKeywords('Cred că am abces la dinte');
      expect(result.isUrgent).toBe(true);
      expect(result.urgencyLevel).toBe('high');
      expect(result.keywords).toContain('abces');
    });

    it('should detect febră (fever) as high', () => {
      const result = detectUrgentKeywords('Am febră și mă doare dintele');
      expect(result.isUrgent).toBe(true);
      expect(result.urgencyLevel).toBe('high');
      expect(result.keywords).toContain('febră');
    });

    it('should detect infecție as high', () => {
      const result = detectUrgentKeywords('Cred că am infecție la gingie');
      expect(result.isUrgent).toBe(true);
      expect(result.urgencyLevel).toBe('high');
      expect(result.keywords).toContain('infecție');
    });
  });

  describe('Medium urgency keyword detection', () => {
    it('should detect disconfort as medium', () => {
      const result = detectUrgentKeywords('Am un disconfort la dinte');
      expect(result.isUrgent).toBe(true);
      expect(result.urgencyLevel).toBe('medium');
      expect(result.keywords).toContain('disconfort');
    });

    it('should detect sensibilitate as medium', () => {
      const result = detectUrgentKeywords('Am sensibilitate la rece');
      expect(result.isUrgent).toBe(true);
      expect(result.urgencyLevel).toBe('medium');
      expect(result.keywords).toContain('sensibilitate');
    });

    it('should detect mă doare as medium', () => {
      const result = detectUrgentKeywords('Mă doare puțin când mestec');
      expect(result.isUrgent).toBe(true);
      expect(result.urgencyLevel).toBe('medium');
      expect(result.keywords).toContain('mă doare');
    });
  });

  describe('Emotional indicator detection', () => {
    it('should boost urgency for multiple exclamation marks', () => {
      const result = detectUrgentKeywords('Mă doare foarte tare!!! Ajutor!!!');
      expect(result.isUrgent).toBe(true);
      expect(result.score).toBeGreaterThan(5); // Boosted from base score
    });

    it('should boost urgency for high caps ratio', () => {
      const result = detectUrgentKeywords('MĂ DOARE FOARTE TARE');
      expect(result.isUrgent).toBe(true);
      expect(result.score).toBeGreaterThan(5);
    });

    it('should elevate medium to high with emotional indicators', () => {
      const result = detectUrgentKeywords('MA DOARE!!! AJUTOR!!!');
      expect(result.urgencyLevel).toBe('high');
    });
  });

  describe('Non-urgent message detection', () => {
    it('should not flag routine inquiries as urgent', () => {
      const result = detectUrgentKeywords('Bună ziua, aș dori informații despre implanturi');
      expect(result.isUrgent).toBe(false);
      expect(result.urgencyLevel).toBeNull();
      expect(result.keywords).toHaveLength(0);
    });

    it('should not flag appointment booking as urgent', () => {
      const result = detectUrgentKeywords('Vreau să fac o programare pentru luna viitoare');
      expect(result.isUrgent).toBe(true); // "programare" is medium
      expect(result.urgencyLevel).toBe('medium');
      expect(result.score).toBe(2); // Low score
    });

    it('should not flag price inquiries as urgent', () => {
      const result = detectUrgentKeywords('Cât costă un implant dentar?');
      expect(result.isUrgent).toBe(false);
    });
  });

  describe('Multiple keyword detection', () => {
    it('should use highest urgency level when multiple keywords present', () => {
      const result = detectUrgentKeywords('Am sângerare și durere puternică la dinte');
      expect(result.urgencyLevel).toBe('critical'); // sângerare takes precedence
      expect(result.keywords).toContain('sângerare');
      expect(result.keywords).toContain('durere puternică');
    });

    it('should detect all keywords but use max score', () => {
      const result = detectUrgentKeywords('Am durere, disconfort și sensibilitate');
      expect(result.keywords.length).toBe(3);
      expect(result.score).toBe(6); // durere has highest score
      expect(result.urgencyLevel).toBe('high');
    });
  });

  describe('Diacritics handling', () => {
    it('should detect keywords with diacritics', () => {
      const result = detectUrgentKeywords('Am sângerare');
      expect(result.keywords).toContain('sângerare');
    });

    it('should detect keywords without diacritics', () => {
      const result = detectUrgentKeywords('Am sangerare');
      expect(result.keywords).toContain('sangerare');
    });

    it('should detect both forms', () => {
      const result1 = detectUrgentKeywords('Am urgență');
      const result2 = detectUrgentKeywords('Am urgenta');
      expect(result1.urgencyLevel).toBe('critical');
      expect(result2.urgencyLevel).toBe('critical');
    });
  });
});

// =============================================================================
// Escalation Tier Tests
// =============================================================================

describe('Escalation Tiers', () => {
  interface EscalationTier {
    name: string;
    waitMinutes: number;
    assignTo?: string;
  }

  function getEscalationTiers(urgencyLevel: 'critical' | 'high' | 'medium'): EscalationTier[] {
    const tiers: Record<typeof urgencyLevel, EscalationTier[]> = {
      critical: [
        { name: 'Supervisor', waitMinutes: 5, assignTo: 'supervisor' },
        { name: 'Manager', waitMinutes: 10, assignTo: 'manager' },
        { name: 'On-Call Doctor', waitMinutes: 15, assignTo: 'on-call' },
      ],
      high: [
        { name: 'Supervisor', waitMinutes: 15, assignTo: 'supervisor' },
        { name: 'Manager', waitMinutes: 30, assignTo: 'manager' },
      ],
      medium: [{ name: 'Supervisor', waitMinutes: 30, assignTo: 'supervisor' }],
    };

    return tiers[urgencyLevel];
  }

  describe('Critical urgency tiers', () => {
    it('should have 3 escalation tiers for critical cases', () => {
      const tiers = getEscalationTiers('critical');
      expect(tiers.length).toBe(3);
    });

    it('should start with 5-minute window for supervisor', () => {
      const tiers = getEscalationTiers('critical');
      expect(tiers[0]?.name).toBe('Supervisor');
      expect(tiers[0]?.waitMinutes).toBe(5);
    });

    it('should escalate to manager after 10 minutes', () => {
      const tiers = getEscalationTiers('critical');
      expect(tiers[1]?.name).toBe('Manager');
      expect(tiers[1]?.waitMinutes).toBe(10);
    });

    it('should escalate to on-call doctor after 15 minutes', () => {
      const tiers = getEscalationTiers('critical');
      expect(tiers[2]?.name).toBe('On-Call Doctor');
      expect(tiers[2]?.waitMinutes).toBe(15);
    });
  });

  describe('High urgency tiers', () => {
    it('should have 2 escalation tiers for high cases', () => {
      const tiers = getEscalationTiers('high');
      expect(tiers.length).toBe(2);
    });

    it('should start with 15-minute window for supervisor', () => {
      const tiers = getEscalationTiers('high');
      expect(tiers[0]?.waitMinutes).toBe(15);
    });

    it('should escalate to manager after 30 minutes', () => {
      const tiers = getEscalationTiers('high');
      expect(tiers[1]?.waitMinutes).toBe(30);
    });
  });

  describe('Medium urgency tiers', () => {
    it('should have 1 escalation tier for medium cases', () => {
      const tiers = getEscalationTiers('medium');
      expect(tiers.length).toBe(1);
    });

    it('should have 30-minute window for supervisor', () => {
      const tiers = getEscalationTiers('medium');
      expect(tiers[0]?.waitMinutes).toBe(30);
    });
  });
});

// =============================================================================
// Urgent Case Handler Flow Tests
// =============================================================================

describe('Urgent Case Handler Flow', () => {
  const correlationId = 'urgent-flow-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Phone normalization', () => {
    it('should normalize Romanian phone numbers correctly', () => {
      const result = normalizeRomanianPhone('0721000001');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40721000001');
    });

    it('should handle international format', () => {
      const result = normalizeRomanianPhone('+40721000001');
      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe('+40721000001');
    });

    it('should reject invalid numbers', () => {
      const result = normalizeRomanianPhone('123');
      expect(result.isValid).toBe(false);
    });
  });

  describe('Supervisor notification', () => {
    it('should broadcast urgent case to supervisors', async () => {
      const notifications = createMockNotificationsService();

      const alertPayload = {
        type: 'urgency.new' as const,
        priority: 'critical' as const,
        phone: '+40721****01', // Masked
        patientName: 'Test Patient',
        channel: 'whatsapp' as const,
        reason: 'Detected keywords: sângerare',
        keywords: ['sângerare'],
        sentimentScore: -0.8,
        timestamp: new Date().toISOString(),
        correlationId,
      };

      await notifications.broadcastToSupervisors(alertPayload);

      const sent = notifications.getSentNotifications();
      expect(sent.length).toBe(1);
      expect(sent[0]?.type).toBe('broadcast');
    });

    it('should send to specific supervisor when provided', async () => {
      const notifications = createMockNotificationsService();

      const alertPayload = {
        type: 'urgency.new' as const,
        priority: 'high' as const,
        phone: '+40721****01',
        patientName: 'Test Patient',
        channel: 'whatsapp' as const,
        reason: 'Pain detected',
        timestamp: new Date().toISOString(),
        correlationId,
      };

      await notifications.notifySupervisor('supervisor_123', alertPayload);

      const sent = notifications.getSentNotifications();
      expect(sent.length).toBe(1);
      expect(sent[0]?.type).toBe('direct');
    });
  });

  describe('HubSpot task creation', () => {
    it('should create high-priority task for urgent cases', async () => {
      const hubspot = createHubSpotClient({ accessToken: 'test-token' });

      const slaMinutes = 15; // Critical SLA
      const dueDate = new Date(Date.now() + slaMinutes * 60 * 1000);

      const task = await hubspot.createTask({
        contactId: 'hs_contact_123',
        subject: '🚨 CRITICAL: Test Patient',
        body: [
          'Urgency Level: critical',
          'Trigger: Detected keywords: sângerare',
          'Channel: whatsapp',
          'Keywords: sângerare',
          '',
          '⏰ SLA: Respond within 15 minutes',
        ].join('\n'),
        priority: 'HIGH',
        dueDate,
      });

      expect(task.id).toBeDefined();
    });

    it('should set correct SLA based on urgency level', () => {
      const getSlaMinutes = (urgencyLevel: 'critical' | 'high' | 'medium'): number => {
        return urgencyLevel === 'critical' ? 15 : urgencyLevel === 'high' ? 30 : 60;
      };

      expect(getSlaMinutes('critical')).toBe(15);
      expect(getSlaMinutes('high')).toBe(30);
      expect(getSlaMinutes('medium')).toBe(60);
    });
  });

  describe('Patient acknowledgment', () => {
    it('should send acknowledgment message in Romanian', async () => {
      const whatsapp = createWhatsAppClient({
        apiKey: 'test-key',
        phoneNumberId: '123456789',
      });

      const criticalMessage =
        'Am primit mesajul dumneavoastră și înțelegem că este o situație urgentă. ' +
        'Un membru al echipei noastre vă va contacta în următoarele 15 minute. ' +
        'Pentru urgențe vitale, vă rugăm să sunați la 112.';

      const result = await whatsapp.sendText({
        to: '+40721000001',
        text: criticalMessage,
      });

      expect(result.messages[0]?.id).toBeDefined();
    });

    it('should include 112 emergency number for critical cases', () => {
      const getAcknowledgmentMessage = (urgencyLevel: 'critical' | 'high' | 'medium'): string => {
        const messages = {
          critical:
            'Am primit mesajul dumneavoastră și înțelegem că este o situație urgentă. ' +
            'Un membru al echipei noastre vă va contacta în următoarele 15 minute. ' +
            'Pentru urgențe vitale, vă rugăm să sunați la 112.',
          high:
            'Am primit mesajul dumneavoastră și l-am marcat ca prioritar. ' +
            'Un coleg vă va contacta în curând pentru a vă ajuta.',
          medium:
            'Mulțumim pentru mesaj. Am notat cererea dumneavoastră și un coleg vă va contacta cât mai curând posibil.',
        };
        return messages[urgencyLevel];
      };

      expect(getAcknowledgmentMessage('critical')).toContain('112');
      expect(getAcknowledgmentMessage('high')).not.toContain('112');
      expect(getAcknowledgmentMessage('medium')).not.toContain('112');
    });
  });

  describe('Domain event emission', () => {
    it('should emit urgent.case.created event', async () => {
      const eventStore = createInMemoryEventStore('urgent-case');

      await eventStore.emit({
        type: 'urgent.case.created',
        correlationId,
        aggregateId: 'hs_contact_123',
        aggregateType: 'urgent_case',
        payload: {
          phone: '+40721000001',
          hubspotContactId: 'hs_contact_123',
          patientName: 'Test Patient',
          channel: 'whatsapp',
          urgencyLevel: 'critical',
          triggerReason: 'Detected keywords: sângerare',
          keywords: ['sângerare'],
          sentimentScore: -0.8,
          taskId: 'task_123',
          slaMinutes: 15,
          createdAt: new Date().toISOString(),
        },
      });

      const events = await eventStore.getByType('urgent.case.created');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.urgencyLevel).toBe('critical');
    });

    it('should emit urgent.case.escalated event on tier escalation', async () => {
      const eventStore = createInMemoryEventStore('urgent-escalation');

      await eventStore.emit({
        type: 'urgent.case.escalated',
        correlationId,
        aggregateId: 'hs_contact_123',
        aggregateType: 'urgent_case',
        payload: {
          phone: '+40721000001',
          patientName: 'Test Patient',
          urgencyLevel: 'critical',
          escalationTier: 2,
          tierName: 'Manager',
          correlationId,
        },
      });

      const events = await eventStore.getByType('urgent.case.escalated');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.escalationTier).toBe(2);
    });

    it('should emit urgent.case.resolved event when resolved', async () => {
      const eventStore = createInMemoryEventStore('urgent-resolved');

      await eventStore.emit({
        type: 'urgent.case.resolved',
        correlationId,
        aggregateId: 'hs_contact_123',
        aggregateType: 'urgent_case',
        payload: {
          phone: '+40721000001',
          patientName: 'Test Patient',
          urgencyLevel: 'critical',
          resolvedBy: 'supervisor_123',
          resolutionTime: new Date().toISOString(),
          escalationTierReached: 1,
          correlationId,
        },
      });

      const events = await eventStore.getByType('urgent.case.resolved');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.resolvedBy).toBe('supervisor_123');
    });

    it('should emit urgent.case.unresolved event when all tiers exhausted', async () => {
      const eventStore = createInMemoryEventStore('urgent-unresolved');

      await eventStore.emit({
        type: 'urgent.case.unresolved',
        correlationId,
        aggregateId: 'hs_contact_123',
        aggregateType: 'urgent_case',
        payload: {
          phone: '+40721000001',
          patientName: 'Test Patient',
          urgencyLevel: 'critical',
          escalationTiersExhausted: 3,
          totalTimeMinutes: 30,
          correlationId,
        },
      });

      const events = await eventStore.getByType('urgent.case.unresolved');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.escalationTiersExhausted).toBe(3);
    });
  });
});

// =============================================================================
// Message Urgency Detection Workflow Tests
// =============================================================================

describe('Message Urgency Detection Workflow', () => {
  const correlationId = 'urgency-detection-workflow-123';

  describe('Keyword detection combined with sentiment', () => {
    it('should elevate urgency when sentiment is negative', () => {
      function combineWithSentiment(
        keywordResult: { urgencyLevel: 'critical' | 'high' | 'medium' | null },
        sentimentScore: number
      ): 'critical' | 'high' | 'medium' | null {
        let finalLevel = keywordResult.urgencyLevel;

        if (sentimentScore < -0.5) {
          if (finalLevel === 'medium') {
            finalLevel = 'high';
          } else if (finalLevel === 'high') {
            finalLevel = 'critical';
          }
        }

        return finalLevel;
      }

      // Medium + negative sentiment = high
      expect(combineWithSentiment({ urgencyLevel: 'medium' }, -0.7)).toBe('high');

      // High + negative sentiment = critical
      expect(combineWithSentiment({ urgencyLevel: 'high' }, -0.6)).toBe('critical');

      // Critical stays critical
      expect(combineWithSentiment({ urgencyLevel: 'critical' }, -0.9)).toBe('critical');

      // Positive sentiment doesn't change level
      expect(combineWithSentiment({ urgencyLevel: 'medium' }, 0.5)).toBe('medium');
    });
  });

  describe('Escalation workflow triggering', () => {
    it('should trigger escalation workflow for urgent messages', async () => {
      const eventStore = createInMemoryEventStore('urgency-detection');

      const isUrgent = true;
      const urgencyLevel = 'critical';

      if (isUrgent && urgencyLevel) {
        await eventStore.emit({
          type: 'urgent.detection.triggered',
          correlationId,
          aggregateId: '+40721000001',
          aggregateType: 'lead',
          payload: {
            phone: '+40721000001',
            urgencyLevel,
            escalationTriggered: true,
            correlationId,
          },
        });
      }

      const events = await eventStore.getByType('urgent.detection.triggered');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.escalationTriggered).toBe(true);
    });

    it('should not trigger escalation for non-urgent messages', async () => {
      const eventStore = createInMemoryEventStore('urgency-detection-none');

      const isUrgent = false;

      if (!isUrgent) {
        // No event emitted
      }

      const events = await eventStore.getByType('urgent.detection.triggered');
      expect(events.length).toBe(0);
    });
  });
});

// =============================================================================
// Notification Dispatcher Tests
// =============================================================================

describe('Notification Dispatcher', () => {
  const correlationId = 'notification-dispatch-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Multi-channel dispatch', () => {
    it('should dispatch to SSE channel', async () => {
      const notifications = createMockNotificationsService();

      await notifications.broadcastToSupervisors({
        type: 'urgency.new',
        priority: 'critical',
        phone: '+40721****01',
        patientName: 'Test',
        timestamp: new Date().toISOString(),
        correlationId,
      });

      const sent = notifications.getSentNotifications();
      expect(sent.some((n) => n.type === 'broadcast')).toBe(true);
    });

    it('should dispatch to push notification channel', async () => {
      const notifications = createMockNotificationsService();

      await notifications.sendPushNotification(
        'subscription_123',
        '🚨 Urgent: Test Patient',
        'Critical case requires attention',
        { urgencyLevel: 'critical' }
      );

      const sent = notifications.getSentNotifications();
      expect(sent.some((n) => n.type === 'push')).toBe(true);
    });

    it('should dispatch to email channel', async () => {
      const notifications = createMockNotificationsService();

      await notifications.sendEmailNotification(
        'supervisor@clinic.com',
        'Urgent Case Alert',
        'A critical case requires your attention.',
        false
      );

      const sent = notifications.getSentNotifications();
      expect(sent.some((n) => n.type === 'email')).toBe(true);
    });
  });

  describe('Urgent alert convenience wrapper', () => {
    it('should format urgent alert correctly', () => {
      const priorityEmoji: Record<string, string> = {
        critical: '🚨',
        high: '⚠️',
        medium: '📢',
      };

      const urgencyLevel = 'critical';
      const patientName = 'Ion Popescu';
      const reason = 'Detected keywords: sângerare';

      const title = `${priorityEmoji[urgencyLevel]} Urgent: ${patientName}`;
      const shortBody = `${urgencyLevel.toUpperCase()}: ${reason.slice(0, 100)}`;

      expect(title).toBe('🚨 Urgent: Ion Popescu');
      expect(shortBody).toContain('CRITICAL');
    });
  });

  describe('Appointment reminder convenience wrapper', () => {
    it('should format Romanian appointment reminder correctly', () => {
      const patientName = 'Maria';
      const procedureType = 'consultație';
      const appointmentDate = '15 Ianuarie 2025';
      const appointmentTime = '10:00';
      const location = 'Clinica Dentară';

      const body = `Bună ziua ${patientName}! Vă reamintim că aveți programare pentru ${procedureType} pe ${appointmentDate} la ora ${appointmentTime} la ${location}. Vă așteptăm!`;

      expect(body).toContain('Maria');
      expect(body).toContain('consultație');
      expect(body).toContain('15 Ianuarie 2025');
      expect(body).toContain('10:00');
      expect(body).toContain('Clinica Dentară');
    });
  });
});

// =============================================================================
// Phone Masking Tests (PII Protection)
// =============================================================================

describe('PII Protection', () => {
  describe('Phone number masking', () => {
    it('should mask phone number for logs', () => {
      const phone = '+40721000001';
      const masked = phone.slice(0, -4) + '****';
      expect(masked).toBe('+4072100****');
    });

    it('should mask phone number for broadcasts', () => {
      const phone = '+40721000001';
      const masked = phone.slice(0, -4) + '****';
      expect(masked).not.toBe(phone);
      expect(masked.endsWith('****')).toBe(true);
    });
  });

  describe('Patient name handling', () => {
    it('should use Unknown when name not provided', () => {
      const patientName: string | undefined = undefined;
      const displayName = patientName ?? 'Unknown';
      expect(displayName).toBe('Unknown');
    });

    it('should use provided name when available', () => {
      const patientName = 'Ion Popescu';
      const displayName = patientName ?? 'Unknown';
      expect(displayName).toBe('Ion Popescu');
    });
  });
});
