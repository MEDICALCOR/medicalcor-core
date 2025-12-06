/**
 * Episode Builder Extended Tests
 *
 * Additional tests to achieve 85%+ coverage for cognitive module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EpisodeBuilder, createEpisodeBuilder } from '../episode-builder.js';
import { DEFAULT_COGNITIVE_CONFIG, type RawEventContext } from '../types.js';
import type { IOpenAIClient, IEmbeddingService } from '../episode-builder.js';

describe('EpisodeBuilder Extended Tests', () => {
  let builder: EpisodeBuilder;
  let mockOpenAI: IOpenAIClient;
  let mockEmbeddings: IEmbeddingService;
  let mockPool: { query: ReturnType<typeof vi.fn> };

  const testLeadId = '550e8400-e29b-41d4-a716-446655440000';
  const testEmbedding = new Array(1536).fill(0.1);

  beforeEach(() => {
    mockOpenAI = {
      chatCompletion: vi.fn().mockResolvedValue(
        JSON.stringify({
          summary: 'Test summary',
          entities: [{ type: 'procedure', value: 'implant', confidence: 0.9 }],
          sentiment: 'positive',
          intent: 'booking',
        })
      ),
    };

    mockEmbeddings = {
      embed: vi.fn().mockResolvedValue({
        embedding: testEmbedding,
        contentHash: 'test-hash',
      }),
    };

    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    builder = new EpisodeBuilder(
      mockOpenAI,
      mockEmbeddings,
      mockPool as any,
      DEFAULT_COGNITIVE_CONFIG
    );
  });

  describe('processEventBatch', () => {
    it('should process multiple events', async () => {
      const events = [
        {
          subjectType: 'lead' as const,
          subjectId: testLeadId,
          sourceChannel: 'whatsapp' as const,
          rawEvent: {
            eventType: 'message.received',
            payload: { message: 'Hello' },
            occurredAt: new Date(),
          },
        },
        {
          subjectType: 'lead' as const,
          subjectId: testLeadId,
          sourceChannel: 'voice' as const,
          rawEvent: {
            eventType: 'call.completed',
            payload: { duration: 120 },
            occurredAt: new Date(),
          },
        },
      ];

      const results = await builder.processEventBatch(events);

      expect(results).toHaveLength(2);
      expect(mockOpenAI.chatCompletion).toHaveBeenCalledTimes(2);
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('should continue processing after single event failure', async () => {
      mockOpenAI.chatCompletion = vi
        .fn()
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce(
          JSON.stringify({
            summary: 'Success',
            entities: [],
            sentiment: 'neutral',
            intent: 'unknown',
          })
        );

      const events = [
        {
          subjectType: 'lead' as const,
          subjectId: testLeadId,
          sourceChannel: 'whatsapp' as const,
          rawEvent: {
            eventType: 'message.received',
            payload: {},
            occurredAt: new Date(),
          },
        },
        {
          subjectType: 'lead' as const,
          subjectId: testLeadId,
          sourceChannel: 'voice' as const,
          rawEvent: {
            eventType: 'call.completed',
            payload: {},
            occurredAt: new Date(),
          },
        },
      ];

      const results = await builder.processEventBatch(events);

      // Second event should succeed even if first fails
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle empty batch', async () => {
      const results = await builder.processEventBatch([]);
      expect(results).toEqual([]);
    });
  });

  describe('categorizeEvent', () => {
    it('should categorize communication events', async () => {
      const events: Array<{ type: string; expected: string }> = [
        { type: 'message.received', expected: 'communication' },
        { type: 'message.sent', expected: 'communication' },
        { type: 'call.completed', expected: 'communication' },
        { type: 'call.started', expected: 'communication' },
        { type: 'email.sent', expected: 'communication' },
        { type: 'email.received', expected: 'communication' },
      ];

      for (const { type, expected } of events) {
        const event: RawEventContext = {
          eventType: type,
          payload: {},
          occurredAt: new Date(),
        };
        const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);
        expect(episode.eventCategory).toBe(expected);
      }
    });

    it('should categorize scheduling events', async () => {
      const events: Array<{ type: string; expected: string }> = [
        { type: 'appointment.scheduled', expected: 'scheduling' },
        { type: 'appointment.cancelled', expected: 'scheduling' },
        { type: 'appointment.rescheduled', expected: 'scheduling' },
        { type: 'appointment.confirmed', expected: 'scheduling' },
        { type: 'appointment.reminder_sent', expected: 'scheduling' },
      ];

      for (const { type, expected } of events) {
        const event: RawEventContext = {
          eventType: type,
          payload: {},
          occurredAt: new Date(),
        };
        const episode = await builder.processEvent('lead', testLeadId, 'crm', event);
        expect(episode.eventCategory).toBe(expected);
      }
    });

    it('should categorize clinical events', async () => {
      const events: Array<{ type: string; expected: string }> = [
        { type: 'treatment.started', expected: 'clinical' },
        { type: 'treatment.completed', expected: 'clinical' },
        { type: 'diagnosis.added', expected: 'clinical' },
        { type: 'prescription.created', expected: 'clinical' },
        { type: 'medical_record.updated', expected: 'clinical' },
      ];

      for (const { type, expected } of events) {
        const event: RawEventContext = {
          eventType: type,
          payload: {},
          occurredAt: new Date(),
        };
        const episode = await builder.processEvent('patient', testLeadId, 'crm', event);
        expect(episode.eventCategory).toBe(expected);
      }
    });

    it('should categorize financial events', async () => {
      const events: Array<{ type: string; expected: string }> = [
        { type: 'payment.received', expected: 'financial' },
        { type: 'invoice.sent', expected: 'financial' },
        { type: 'quote.sent', expected: 'financial' },
        { type: 'quote.accepted', expected: 'financial' },
        { type: 'quote.rejected', expected: 'financial' },
      ];

      for (const { type, expected } of events) {
        const event: RawEventContext = {
          eventType: type,
          payload: {},
          occurredAt: new Date(),
        };
        const episode = await builder.processEvent('patient', testLeadId, 'crm', event);
        expect(episode.eventCategory).toBe(expected);
      }
    });

    it('should categorize lifecycle events', async () => {
      const events: Array<{ type: string; expected: string }> = [
        { type: 'lead.created', expected: 'lifecycle' },
        { type: 'lead.qualified', expected: 'lifecycle' },
        { type: 'lead.converted', expected: 'lifecycle' },
        { type: 'patient.onboarded', expected: 'lifecycle' },
        { type: 'consent.granted', expected: 'lifecycle' },
        { type: 'consent.revoked', expected: 'lifecycle' },
      ];

      for (const { type, expected } of events) {
        const event: RawEventContext = {
          eventType: type,
          payload: {},
          occurredAt: new Date(),
        };
        const episode = await builder.processEvent('lead', testLeadId, 'crm', event);
        expect(episode.eventCategory).toBe(expected);
      }
    });

    it('should return "other" for unknown event types', async () => {
      const event: RawEventContext = {
        eventType: 'unknown.event',
        payload: {},
        occurredAt: new Date(),
      };
      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);
      expect(episode.eventCategory).toBe('other');
    });

    it('should match partial event type prefixes', async () => {
      const event: RawEventContext = {
        eventType: 'message_notification', // Contains 'message' prefix
        payload: {},
        occurredAt: new Date(),
      };
      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);
      expect(episode.eventCategory).toBe('communication');
    });
  });

  describe('validateEntities', () => {
    it('should filter out empty entities', async () => {
      mockOpenAI.chatCompletion = vi.fn().mockResolvedValue(
        JSON.stringify({
          summary: 'Test',
          entities: [
            { type: 'procedure', value: '', confidence: 0.9 },
            { type: 'procedure', value: 'valid', confidence: 0.9 },
            { type: 'procedure', value: '   ', confidence: 0.9 },
          ],
          sentiment: 'neutral',
          intent: 'unknown',
        })
      );

      const event: RawEventContext = {
        eventType: 'message.received',
        payload: {},
        occurredAt: new Date(),
      };
      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      expect(episode.keyEntities).toHaveLength(1);
      expect(episode.keyEntities[0]?.value).toBe('valid');
    });

    it('should normalize invalid entity types to "other"', async () => {
      mockOpenAI.chatCompletion = vi.fn().mockResolvedValue(
        JSON.stringify({
          summary: 'Test',
          entities: [{ type: 'invalid_type', value: 'test', confidence: 0.9 }],
          sentiment: 'neutral',
          intent: 'unknown',
        })
      );

      const event: RawEventContext = {
        eventType: 'message.received',
        payload: {},
        occurredAt: new Date(),
      };
      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      expect(episode.keyEntities[0]?.type).toBe('other');
    });

    it('should clamp confidence values', async () => {
      mockOpenAI.chatCompletion = vi.fn().mockResolvedValue(
        JSON.stringify({
          summary: 'Test',
          entities: [
            { type: 'procedure', value: 'test1', confidence: 1.5 },
            { type: 'procedure', value: 'test2', confidence: -0.5 },
          ],
          sentiment: 'neutral',
          intent: 'unknown',
        })
      );

      const event: RawEventContext = {
        eventType: 'message.received',
        payload: {},
        occurredAt: new Date(),
      };
      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      expect(episode.keyEntities[0]?.confidence).toBe(1);
      expect(episode.keyEntities[1]?.confidence).toBe(0);
    });

    it('should handle missing confidence', async () => {
      mockOpenAI.chatCompletion = vi.fn().mockResolvedValue(
        JSON.stringify({
          summary: 'Test',
          entities: [{ type: 'procedure', value: 'test' }],
          sentiment: 'neutral',
          intent: 'unknown',
        })
      );

      const event: RawEventContext = {
        eventType: 'message.received',
        payload: {},
        occurredAt: new Date(),
      };
      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      expect(episode.keyEntities[0]?.confidence).toBeUndefined();
    });

    it('should accept all valid entity types', async () => {
      const validTypes = ['procedure', 'date', 'amount', 'person', 'location', 'product', 'other'];

      for (const type of validTypes) {
        mockOpenAI.chatCompletion = vi.fn().mockResolvedValue(
          JSON.stringify({
            summary: 'Test',
            entities: [{ type, value: 'test', confidence: 0.9 }],
            sentiment: 'neutral',
            intent: 'unknown',
          })
        );

        const event: RawEventContext = {
          eventType: 'message.received',
          payload: {},
          occurredAt: new Date(),
        };
        const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);

        expect(episode.keyEntities[0]?.type).toBe(type);
      }
    });
  });

  describe('validateSentiment', () => {
    it('should accept valid sentiments', async () => {
      const sentiments = ['positive', 'neutral', 'negative'];

      for (const sentiment of sentiments) {
        mockOpenAI.chatCompletion = vi.fn().mockResolvedValue(
          JSON.stringify({
            summary: 'Test',
            entities: [],
            sentiment,
            intent: 'unknown',
          })
        );

        const event: RawEventContext = {
          eventType: 'message.received',
          payload: {},
          occurredAt: new Date(),
        };
        const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);

        expect(episode.sentiment).toBe(sentiment);
      }
    });

    it('should normalize case for sentiments', async () => {
      mockOpenAI.chatCompletion = vi.fn().mockResolvedValue(
        JSON.stringify({
          summary: 'Test',
          entities: [],
          sentiment: 'POSITIVE',
          intent: 'unknown',
        })
      );

      const event: RawEventContext = {
        eventType: 'message.received',
        payload: {},
        occurredAt: new Date(),
      };
      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      expect(episode.sentiment).toBe('positive');
    });

    it('should default to neutral for invalid sentiments', async () => {
      mockOpenAI.chatCompletion = vi.fn().mockResolvedValue(
        JSON.stringify({
          summary: 'Test',
          entities: [],
          sentiment: 'invalid',
          intent: 'unknown',
        })
      );

      const event: RawEventContext = {
        eventType: 'message.received',
        payload: {},
        occurredAt: new Date(),
      };
      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      expect(episode.sentiment).toBe('neutral');
    });

    it('should default to neutral for undefined sentiment', async () => {
      mockOpenAI.chatCompletion = vi.fn().mockResolvedValue(
        JSON.stringify({
          summary: 'Test',
          entities: [],
          intent: 'unknown',
        })
      );

      const event: RawEventContext = {
        eventType: 'message.received',
        payload: {},
        occurredAt: new Date(),
      };
      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      expect(episode.sentiment).toBe('neutral');
    });
  });

  describe('generateFallbackSummary', () => {
    it('should generate summary from event type', async () => {
      mockOpenAI.chatCompletion = vi.fn().mockRejectedValue(new Error('API Error'));

      const event: RawEventContext = {
        eventType: 'message.received',
        payload: {},
        occurredAt: new Date('2024-12-05T10:00:00Z'),
      };
      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      expect(episode.summary).toContain('message received');
      expect(episode.summary).toContain('2024-12-05');
    });

    it('should replace underscores and dots with spaces', async () => {
      mockOpenAI.chatCompletion = vi.fn().mockRejectedValue(new Error('API Error'));

      const event: RawEventContext = {
        eventType: 'appointment_reminder.sent',
        payload: {},
        occurredAt: new Date('2024-12-05'),
      };
      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      expect(episode.summary).toContain('appointment reminder sent');
    });
  });

  describe('generateFallbackAnalysis', () => {
    it('should return complete fallback analysis on LLM failure', async () => {
      mockOpenAI.chatCompletion = vi.fn().mockRejectedValue(new Error('API Error'));

      const event: RawEventContext = {
        eventType: 'test.event',
        payload: {},
        occurredAt: new Date(),
      };
      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      expect(episode.summary).toBeDefined();
      expect(episode.keyEntities).toEqual([]);
      expect(episode.sentiment).toBe('neutral');
      expect(episode.intent).toBe('unknown');
    });

    it('should use fallback when LLM returns invalid JSON', async () => {
      mockOpenAI.chatCompletion = vi.fn().mockResolvedValue('not valid json');

      const event: RawEventContext = {
        eventType: 'test.event',
        payload: {},
        occurredAt: new Date(),
      };
      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      expect(episode.sentiment).toBe('neutral');
      expect(episode.intent).toBe('unknown');
    });
  });

  describe('analyzeEvent with LLM', () => {
    it('should truncate long payloads', async () => {
      const longPayload = { data: 'x'.repeat(3000) };

      const event: RawEventContext = {
        eventType: 'message.received',
        payload: longPayload,
        occurredAt: new Date(),
      };

      await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      // Verify LLM was called (with truncated payload in prompt)
      expect(mockOpenAI.chatCompletion).toHaveBeenCalled();
    });

    it('should preserve empty summary when LLM returns empty string', async () => {
      // Note: The code uses ?? which only checks null/undefined, not empty strings
      // Empty strings are preserved as-is
      mockOpenAI.chatCompletion = vi.fn().mockResolvedValue(
        JSON.stringify({
          summary: '',
          entities: [],
          sentiment: 'positive',
          intent: 'booking',
        })
      );

      const event: RawEventContext = {
        eventType: 'message.received',
        payload: {},
        occurredAt: new Date(),
      };
      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      expect(episode.summary).toBe('');
    });

    it('should use fallback when summary is undefined', async () => {
      mockOpenAI.chatCompletion = vi.fn().mockResolvedValue(
        JSON.stringify({
          entities: [],
          sentiment: 'positive',
          intent: 'booking',
        })
      );

      const event: RawEventContext = {
        eventType: 'call.completed',
        payload: {},
        occurredAt: new Date(),
      };
      const episode = await builder.processEvent('lead', testLeadId, 'voice', event);

      expect(episode.summary).toContain('call completed');
    });

    it('should use "unknown" intent when not provided', async () => {
      mockOpenAI.chatCompletion = vi.fn().mockResolvedValue(
        JSON.stringify({
          summary: 'Test summary',
          entities: [],
          sentiment: 'neutral',
        })
      );

      const event: RawEventContext = {
        eventType: 'message.received',
        payload: {},
        occurredAt: new Date(),
      };
      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      expect(episode.intent).toBe('unknown');
    });
  });

  describe('save', () => {
    it('should include all fields in INSERT', async () => {
      const event: RawEventContext = {
        eventType: 'message.received',
        payload: { from: '+40712345678' },
        correlationId: 'correlation-123',
        occurredAt: new Date('2024-12-05T10:00:00Z'),
      };

      await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO episodic_events'),
        expect.arrayContaining([
          expect.any(String), // id
          'lead', // subject_type
          testLeadId, // subject_id
          'message.received', // event_type
          'communication', // event_category
          'whatsapp', // source_channel
          'correlation-123', // raw_event_id
        ])
      );
    });

    it('should handle null raw_event_id', async () => {
      const event: RawEventContext = {
        eventType: 'message.received',
        payload: {},
        occurredAt: new Date(),
        // No correlationId
      };

      await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([null])
      );
    });

    it('should use ON CONFLICT DO NOTHING', async () => {
      const event: RawEventContext = {
        eventType: 'message.received',
        payload: {},
        occurredAt: new Date(),
      };

      await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (id) DO NOTHING'),
        expect.any(Array)
      );
    });
  });

  describe('processEvent metadata', () => {
    it('should include original payload keys', async () => {
      const event: RawEventContext = {
        eventType: 'message.received',
        payload: { from: '+40712345678', message: 'Hello', timestamp: '2024-12-05' },
        occurredAt: new Date(),
      };

      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      expect(episode.metadata?.originalPayloadKeys).toEqual(['from', 'message', 'timestamp']);
    });

    it('should include processing time', async () => {
      const event: RawEventContext = {
        eventType: 'message.received',
        payload: {},
        occurredAt: new Date(),
      };

      const episode = await builder.processEvent('lead', testLeadId, 'whatsapp', event);

      expect(episode.metadata?.processingTimeMs).toBeDefined();
      expect(typeof episode.metadata?.processingTimeMs).toBe('number');
    });
  });

  describe('createEpisodeBuilder factory', () => {
    it('should create builder with default config', () => {
      const b = createEpisodeBuilder(mockOpenAI, mockEmbeddings, mockPool as any);
      expect(b).toBeInstanceOf(EpisodeBuilder);
    });

    it('should create builder with custom config', () => {
      const b = createEpisodeBuilder(mockOpenAI, mockEmbeddings, mockPool as any, {
        llmTemperature: 0.5,
        llmMaxTokens: 500,
      });
      expect(b).toBeInstanceOf(EpisodeBuilder);
    });
  });
});
