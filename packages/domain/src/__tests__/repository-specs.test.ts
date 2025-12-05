/**
 * @fileoverview Tests for Repository Specification Factory Functions
 * Tests specification creation and satisfaction predicates
 */

import { describe, it, expect } from 'vitest';
import {
  hotLeadsSpec,
  needsFollowUpSpec,
  byStatusSpec,
  bySourceSpec,
  type Lead,
} from '../shared-kernel/repository-interfaces/lead-repository.js';
import {
  rateLimitedError,
  connectionError,
  notFoundError,
} from '../shared-kernel/repository-interfaces/crm-gateway.js';
import {
  aiRateLimitedError,
  aiQuotaExceededError,
  aiModelUnavailableError,
  aiContentFilteredError,
} from '../shared-kernel/repository-interfaces/ai-gateway.js';
import { LeadScore } from '../shared-kernel/value-objects/lead-score.js';
import { PhoneNumber } from '../shared-kernel/value-objects/phone-number.js';

describe('Lead Repository Specifications', () => {
  describe('hotLeadsSpec', () => {
    it('should create specification for HOT leads', () => {
      const spec = hotLeadsSpec();

      expect(spec.type).toBe('BY_SCORE');
      expect(spec.classification).toBe('HOT');
    });

    it('should satisfy for HOT leads', () => {
      const spec = hotLeadsSpec();
      const hotLead = createMockLead({ score: LeadScore.hot() });

      expect(spec.isSatisfiedBy(hotLead)).toBe(true);
    });

    it('should not satisfy for non-HOT leads', () => {
      const spec = hotLeadsSpec();
      const warmLead = createMockLead({ score: LeadScore.warm() });
      const coldLead = createMockLead({ score: LeadScore.cold() });

      expect(spec.isSatisfiedBy(warmLead)).toBe(false);
      expect(spec.isSatisfiedBy(coldLead)).toBe(false);
    });

    it('should not satisfy for leads without score', () => {
      const spec = hotLeadsSpec();
      const lead = createMockLead({ score: undefined });

      expect(spec.isSatisfiedBy(lead)).toBe(false);
    });
  });

  describe('needsFollowUpSpec', () => {
    it('should create specification for follow-up needed', () => {
      const olderThan = new Date('2025-01-01');
      const spec = needsFollowUpSpec(olderThan);

      expect(spec.type).toBe('NEEDING_FOLLOW_UP');
      expect(spec.olderThan).toBe(olderThan);
    });

    it('should satisfy for old leads without contact', () => {
      const olderThan = new Date('2025-01-15');
      const spec = needsFollowUpSpec(olderThan);

      const lead = createMockLead({
        status: 'new',
        lastContactAt: new Date('2025-01-01'),
      });

      expect(spec.isSatisfiedBy(lead)).toBe(true);
    });

    it('should satisfy for leads never contacted', () => {
      const olderThan = new Date('2025-01-15');
      const spec = needsFollowUpSpec(olderThan);

      const lead = createMockLead({
        status: 'new',
        lastContactAt: undefined,
      });

      expect(spec.isSatisfiedBy(lead)).toBe(true);
    });

    it('should not satisfy for recently contacted leads', () => {
      const olderThan = new Date('2025-01-15');
      const spec = needsFollowUpSpec(olderThan);

      const lead = createMockLead({
        status: 'new',
        lastContactAt: new Date('2025-01-20'),
      });

      expect(spec.isSatisfiedBy(lead)).toBe(false);
    });

    it('should not satisfy for converted leads', () => {
      const olderThan = new Date('2025-01-15');
      const spec = needsFollowUpSpec(olderThan);

      const lead = createMockLead({
        status: 'converted',
        lastContactAt: new Date('2025-01-01'),
      });

      expect(spec.isSatisfiedBy(lead)).toBe(false);
    });

    it('should not satisfy for lost leads', () => {
      const olderThan = new Date('2025-01-15');
      const spec = needsFollowUpSpec(olderThan);

      const lead = createMockLead({
        status: 'lost',
        lastContactAt: new Date('2025-01-01'),
      });

      expect(spec.isSatisfiedBy(lead)).toBe(false);
    });
  });

  describe('byStatusSpec', () => {
    it('should create specification for specific status', () => {
      const spec = byStatusSpec('qualified');

      expect(spec.type).toBe('BY_STATUS');
      expect(spec.status).toBe('qualified');
    });

    it('should satisfy for matching status', () => {
      const spec = byStatusSpec('qualified');
      const lead = createMockLead({ status: 'qualified' });

      expect(spec.isSatisfiedBy(lead)).toBe(true);
    });

    it('should not satisfy for different status', () => {
      const spec = byStatusSpec('qualified');
      const lead = createMockLead({ status: 'new' });

      expect(spec.isSatisfiedBy(lead)).toBe(false);
    });

    it('should work with all status values', () => {
      const statuses: Lead['status'][] = [
        'new',
        'contacted',
        'qualified',
        'nurturing',
        'scheduled',
        'converted',
        'lost',
        'invalid',
      ];

      statuses.forEach((status) => {
        const spec = byStatusSpec(status);
        const matchingLead = createMockLead({ status });
        const differentLead = createMockLead({ status: 'new' });

        expect(spec.isSatisfiedBy(matchingLead)).toBe(true);
        if (status !== 'new') {
          expect(spec.isSatisfiedBy(differentLead)).toBe(status === 'new');
        }
      });
    });
  });

  describe('bySourceSpec', () => {
    it('should create specification for specific source', () => {
      const spec = bySourceSpec('whatsapp');

      expect(spec.type).toBe('BY_SOURCE');
      expect(spec.source).toBe('whatsapp');
    });

    it('should satisfy for matching source', () => {
      const spec = bySourceSpec('whatsapp');
      const lead = createMockLead({ source: 'whatsapp' });

      expect(spec.isSatisfiedBy(lead)).toBe(true);
    });

    it('should not satisfy for different source', () => {
      const spec = bySourceSpec('whatsapp');
      const lead = createMockLead({ source: 'voice' });

      expect(spec.isSatisfiedBy(lead)).toBe(false);
    });
  });
});

describe('CRM Gateway Error Factories', () => {
  describe('rateLimitedError', () => {
    it('should create rate limited error', () => {
      const resetAt = new Date('2025-01-15T12:00:00Z');
      const error = rateLimitedError(resetAt);

      expect(error.code).toBe('RATE_LIMITED');
      expect(error.message).toContain('rate limit exceeded');
      expect(error.message).toContain(resetAt.toISOString());
      expect(error.retryable).toBe(true);
      expect(error.details?.resetAt).toBe(resetAt.toISOString());
    });
  });

  describe('connectionError', () => {
    it('should create connection error without cause', () => {
      const error = connectionError();

      expect(error.code).toBe('CONNECTION_ERROR');
      expect(error.message).toBe('Failed to connect to CRM');
      expect(error.retryable).toBe(true);
      expect(error.cause).toBeUndefined();
    });

    it('should create connection error with cause', () => {
      const cause = new Error('Network timeout');
      const error = connectionError(cause);

      expect(error.code).toBe('CONNECTION_ERROR');
      expect(error.retryable).toBe(true);
      expect(error.cause).toBe(cause);
    });
  });

  describe('notFoundError', () => {
    it('should create not found error', () => {
      const error = notFoundError('Contact', 'contact-123');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toContain('Contact');
      expect(error.message).toContain('contact-123');
      expect(error.retryable).toBe(false);
      expect(error.details?.entityType).toBe('Contact');
      expect(error.details?.id).toBe('contact-123');
    });
  });
});

describe('AI Gateway Error Factories', () => {
  describe('aiRateLimitedError', () => {
    it('should create rate limited error without retry time', () => {
      const error = aiRateLimitedError();

      expect(error.code).toBe('RATE_LIMITED');
      expect(error.message).toContain('rate limit exceeded');
      expect(error.retryable).toBe(true);
      expect(error.fallbackAvailable).toBe(true);
    });

    it('should create rate limited error with retry time', () => {
      const error = aiRateLimitedError(5000);

      expect(error.details?.retryAfterMs).toBe(5000);
    });
  });

  describe('aiQuotaExceededError', () => {
    it('should create quota exceeded error', () => {
      const error = aiQuotaExceededError();

      expect(error.code).toBe('QUOTA_EXCEEDED');
      expect(error.message).toContain('quota exceeded');
      expect(error.retryable).toBe(false);
      expect(error.fallbackAvailable).toBe(true);
    });
  });

  describe('aiModelUnavailableError', () => {
    it('should create model unavailable error', () => {
      const error = aiModelUnavailableError('gpt-4');

      expect(error.code).toBe('MODEL_UNAVAILABLE');
      expect(error.message).toContain('gpt-4');
      expect(error.retryable).toBe(true);
      expect(error.fallbackAvailable).toBe(true);
      expect(error.details?.model).toBe('gpt-4');
    });
  });

  describe('aiContentFilteredError', () => {
    it('should create content filtered error', () => {
      const error = aiContentFilteredError();

      expect(error.code).toBe('CONTENT_FILTERED');
      expect(error.message).toContain('filtered');
      expect(error.retryable).toBe(false);
      expect(error.fallbackAvailable).toBe(true);
    });
  });
});

// Test Helpers
function createMockLead(overrides?: Partial<Lead>): Lead {
  const phone = PhoneNumber.create('+40700000001');

  return {
    id: 'lead-123',
    phone,
    source: 'whatsapp',
    status: 'new',
    primarySymptoms: [],
    procedureInterest: [],
    conversationHistory: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    ...overrides,
  };
}
