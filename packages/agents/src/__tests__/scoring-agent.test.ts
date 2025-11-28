/**
 * Tests for ScoringAgent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createGDPRHook,
  createAuditHook,
  createInMemoryAuditStore,
  redactPII,
  type ConsentCheckResult,
} from '../hooks/index.js';

describe('ScoringAgent Hooks', () => {
  describe('GDPR Hook', () => {
    it('should allow operations when consent is granted', async () => {
      const checkConsent = vi.fn().mockResolvedValue({
        allowed: true,
        status: 'granted',
      } satisfies ConsentCheckResult);

      const gdprHook = createGDPRHook({ checkConsent });

      const result = await gdprHook.beforeToolCall('test-agent', 'get_patient', {
        patientId: 'patient-123',
      });

      expect(result.allowed).toBe(true);
      expect(checkConsent).toHaveBeenCalledWith('patient-123');
    });

    it('should block operations when consent is withdrawn', async () => {
      const checkConsent = vi.fn().mockResolvedValue({
        allowed: false,
        status: 'withdrawn',
        reason: 'Patient withdrew consent on 2024-01-15',
      } satisfies ConsentCheckResult);

      const gdprHook = createGDPRHook({ checkConsent });

      const result = await gdprHook.beforeToolCall('test-agent', 'get_patient', {
        patientId: 'patient-456',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('withdrawn');
    });

    it('should allow operations for tools not requiring consent', async () => {
      const checkConsent = vi.fn();
      const gdprHook = createGDPRHook({
        checkConsent,
        consentRequiredTools: ['get_patient'],
      });

      const result = await gdprHook.beforeToolCall('test-agent', 'calculate_score', { score: 5 });

      expect(result.allowed).toBe(true);
      expect(checkConsent).not.toHaveBeenCalled();
    });

    it('should extract patient ID from various field names', async () => {
      const checkConsent = vi.fn().mockResolvedValue({
        allowed: true,
        status: 'granted',
      } satisfies ConsentCheckResult);

      const gdprHook = createGDPRHook({ checkConsent });

      // Test with phone
      await gdprHook.beforeToolCall('test-agent', 'send_whatsapp', {
        phone: '+40712345678',
      });
      expect(checkConsent).toHaveBeenLastCalledWith('+40712345678');

      // Test with hubspotContactId
      await gdprHook.beforeToolCall('test-agent', 'get_patient', {
        hubspotContactId: 'hs-123',
      });
      expect(checkConsent).toHaveBeenLastCalledWith('hs-123');

      // Test with leadId
      await gdprHook.beforeToolCall('test-agent', 'update_patient', {
        leadId: 'lead-789',
      });
      expect(checkConsent).toHaveBeenLastCalledWith('lead-789');
    });

    it('should log access events when logger is provided', async () => {
      const checkConsent = vi.fn().mockResolvedValue({
        allowed: true,
        status: 'granted',
      } satisfies ConsentCheckResult);

      const logAccess = vi.fn();

      const gdprHook = createGDPRHook({ checkConsent, logAccess });

      await gdprHook.beforeToolCall('test-agent', 'get_patient', {
        patientId: 'patient-123',
      });

      expect(logAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'test-agent',
          toolName: 'get_patient',
          patientId: 'patient-123',
          action: 'allowed',
          consentStatus: 'granted',
        })
      );
    });

    it('should block on unknown consent when configured', async () => {
      const checkConsent = vi.fn().mockResolvedValue({
        allowed: true,
        status: 'unknown',
      } satisfies ConsentCheckResult);

      const gdprHook = createGDPRHook({
        checkConsent,
        blockOnUnknown: true,
      });

      const result = await gdprHook.beforeToolCall('test-agent', 'get_patient', {
        patientId: 'patient-123',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('unknown');
    });

    it('should handle consent check errors safely', async () => {
      const checkConsent = vi.fn().mockRejectedValue(new Error('Database error'));
      const logAccess = vi.fn();

      const gdprHook = createGDPRHook({ checkConsent, logAccess });

      const result = await gdprHook.beforeToolCall('test-agent', 'get_patient', {
        patientId: 'patient-123',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Failed to verify consent');
      expect(logAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'error',
        })
      );
    });
  });

  describe('Audit Hook', () => {
    let auditStore: ReturnType<typeof createInMemoryAuditStore>;

    beforeEach(() => {
      auditStore = createInMemoryAuditStore();
    });

    it('should log agent start and end events', async () => {
      const auditHook = createAuditHook({
        agentId: 'scoring-agent-001',
        agentType: 'lead_scoring',
        persistEvent: auditStore.persistEvent,
      });

      await auditHook.logAgentStart({ context: 'test' });
      await auditHook.logAgentEnd({ success: true, tokensUsed: 500 });

      const events = auditStore.getEvents();
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('agent_start');
      expect(events[1].type).toBe('agent_end');
      expect(events[1].tokensUsed).toBe(500);
    });

    it('should log tool calls with duration', async () => {
      const auditHook = createAuditHook({
        agentId: 'scoring-agent-001',
        agentType: 'lead_scoring',
        persistEvent: auditStore.persistEvent,
      });

      await auditHook.beforeToolCall('get_patient', { patientId: '123' });

      // Simulate some processing time
      await new Promise((resolve) => setTimeout(resolve, 50));

      await auditHook.afterToolCall('get_patient', { patientId: '123' }, { name: 'John Doe' });

      const events = auditStore.getEvents();
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('tool_call_start');
      expect(events[1].type).toBe('tool_call_end');
      expect(events[1].durationMs).toBeGreaterThanOrEqual(40);
    });

    it('should log errors correctly', async () => {
      const auditHook = createAuditHook({
        agentId: 'scoring-agent-001',
        agentType: 'lead_scoring',
        persistEvent: auditStore.persistEvent,
      });

      await auditHook.onToolError(
        'get_patient',
        { patientId: '123' },
        new Error('Patient not found')
      );

      const events = auditStore.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('tool_call_error');
      expect(events[0].error?.message).toBe('Patient not found');
    });

    it('should log decisions with reasoning', async () => {
      const auditHook = createAuditHook({
        agentId: 'scoring-agent-001',
        agentType: 'lead_scoring',
        persistEvent: auditStore.persistEvent,
      });

      await auditHook.logDecision(
        'score_5',
        'Explicit All-on-4 interest with budget discussion',
        0.92,
        { classification: 'HOT' }
      );

      const events = auditStore.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('decision_made');
      expect(events[0].decision?.action).toBe('score_5');
      expect(events[0].decision?.confidence).toBe(0.92);
    });

    it('should log escalations', async () => {
      const auditHook = createAuditHook({
        agentId: 'scoring-agent-001',
        agentType: 'lead_scoring',
        persistEvent: auditStore.persistEvent,
      });

      await auditHook.logEscalation('Complex case requiring human review', {
        leadId: 'lead-123',
      });

      const events = auditStore.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('escalation');
      expect(events[0].metadata?.reason).toBe('Complex case requiring human review');
    });

    it('should redact PII when configured', async () => {
      const auditHook = createAuditHook({
        agentId: 'scoring-agent-001',
        agentType: 'lead_scoring',
        persistEvent: auditStore.persistEvent,
        redactPII: true,
      });

      await auditHook.beforeToolCall('get_patient', {
        phone: '+40712345678',
        email: 'patient@example.com',
      });

      const events = auditStore.getEvents();
      expect(events[0].toolInput?.phone).toBe('[REDACTED]');
      expect(events[0].toolInput?.email).toBe('[REDACTED]');
    });

    it('should include correlation and session IDs', async () => {
      const auditHook = createAuditHook({
        agentId: 'scoring-agent-001',
        agentType: 'lead_scoring',
        persistEvent: auditStore.persistEvent,
        sessionId: 'session-abc',
        correlationId: 'req-xyz',
      });

      await auditHook.logAgentStart();

      const events = auditStore.getEvents();
      expect(events[0].sessionId).toBe('session-abc');
      expect(events[0].correlationId).toBe('req-xyz');
    });
  });

  describe('PII Redaction', () => {
    it('should redact common PII fields', () => {
      const data = {
        id: '123',
        phone: '+40712345678',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        score: 5,
      };

      const redacted = redactPII(data);

      expect(redacted.id).toBe('123');
      expect(redacted.phone).toBe('[REDACTED]');
      expect(redacted.email).toBe('[REDACTED]');
      expect(redacted.firstName).toBe('[REDACTED]');
      expect(redacted.lastName).toBe('[REDACTED]');
      expect(redacted.dateOfBirth).toBe('[REDACTED]');
      expect(redacted.score).toBe(5);
    });

    it('should redact nested PII fields', () => {
      const data = {
        lead: {
          phone: '+40712345678',
          contact: {
            email: 'nested@example.com',
          },
        },
        score: 3,
      };

      const redacted = redactPII(data);

      expect((redacted.lead as Record<string, unknown>).phone).toBe('[REDACTED]');
      expect(
        ((redacted.lead as Record<string, unknown>).contact as Record<string, unknown>).email
      ).toBe('[REDACTED]');
      expect(redacted.score).toBe(3);
    });

    it('should handle Romanian CNP field', () => {
      const data = {
        cnp: '1900115123456',
        name: 'Patient Name',
      };

      const redacted = redactPII(data);

      expect(redacted.cnp).toBe('[REDACTED]');
      expect(redacted.name).toBe('[REDACTED]');
    });

    it('should not modify the original object', () => {
      const original = {
        phone: '+40712345678',
        score: 5,
      };

      const redacted = redactPII(original);

      expect(original.phone).toBe('+40712345678');
      expect(redacted.phone).toBe('[REDACTED]');
    });
  });
});

describe('Scoring Agent Input Validation', () => {
  // Import the schema
  const { ScoringAgentInputSchema } = await import('../scoring-agent.js');

  it('should validate valid scoring input', () => {
    const input = {
      phone: '+40712345678',
      channel: 'whatsapp' as const,
      firstTouchTimestamp: '2024-01-15T10:30:00Z',
      language: 'ro' as const,
      messageHistory: [
        {
          role: 'user' as const,
          content: 'Bună, mă interesează implanturile',
          timestamp: '2024-01-15T10:30:00Z',
        },
      ],
    };

    const result = ScoringAgentInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject invalid channel', () => {
    const input = {
      phone: '+40712345678',
      channel: 'invalid_channel',
      firstTouchTimestamp: '2024-01-15T10:30:00Z',
    };

    const result = ScoringAgentInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should allow optional fields', () => {
    const input = {
      phone: '+40712345678',
      channel: 'voice' as const,
      firstTouchTimestamp: '2024-01-15T10:30:00Z',
    };

    const result = ScoringAgentInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should validate UTM parameters', () => {
    const input = {
      phone: '+40712345678',
      channel: 'web' as const,
      firstTouchTimestamp: '2024-01-15T10:30:00Z',
      utm: {
        utm_source: 'google',
        utm_campaign: 'implants_2024',
      },
    };

    const result = ScoringAgentInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});
