/**
 * Conversation Context Manager Tests
 *
 * Tests for conversation state management, entity extraction,
 * and intent tracking across AI interactions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ConversationContextManager,
  createConversationContextManager,
} from '../conversation-context.js';

describe('ConversationContextManager', () => {
  let manager: ConversationContextManager;

  beforeEach(() => {
    manager = createConversationContextManager({
      maxMessages: 50,
      sessionTtlMs: 30 * 60 * 1000, // 30 minutes
      autoExtractEntities: true,
    });
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('session management', () => {
    it('should create a new session', () => {
      const session = manager.getOrCreateSession('session-1', {
        channel: 'whatsapp',
        userId: 'user-1',
      });

      expect(session.sessionId).toBe('session-1');
      expect(session.channel).toBe('whatsapp');
      expect(session.userId).toBe('user-1');
      expect(session.messages).toHaveLength(0);
    });

    it('should return existing session', () => {
      const session1 = manager.getOrCreateSession('session-1', {
        channel: 'whatsapp',
      });
      session1.metadata.testValue = 'test';

      const session2 = manager.getOrCreateSession('session-1');

      expect(session2.metadata.testValue).toBe('test');
    });

    it('should update session activity timestamp', () => {
      const session1 = manager.getOrCreateSession('session-1');
      const firstActivity = session1.lastActivityAt;

      // Wait a bit
      const session2 = manager.getOrCreateSession('session-1');

      expect(session2.lastActivityAt.getTime()).toBeGreaterThanOrEqual(firstActivity.getTime());
    });

    it('should track active session count', () => {
      expect(manager.getActiveSessionCount()).toBe(0);

      manager.getOrCreateSession('session-1');
      manager.getOrCreateSession('session-2');

      expect(manager.getActiveSessionCount()).toBe(2);
    });

    it('should delete a session', () => {
      manager.getOrCreateSession('session-1');
      expect(manager.getActiveSessionCount()).toBe(1);

      const deleted = manager.deleteSession('session-1');
      expect(deleted).toBe(true);
      expect(manager.getActiveSessionCount()).toBe(0);
    });
  });

  describe('message management', () => {
    it('should add messages to session', () => {
      const sessionId = 'session-1';
      manager.getOrCreateSession(sessionId);

      const msg1 = manager.addMessage(sessionId, {
        role: 'user',
        content: 'Hello, I want to schedule an appointment',
      });

      manager.addMessage(sessionId, {
        role: 'assistant',
        content: 'Sure, when would you like to come in?',
      });

      const session = manager.getSession(sessionId)!;
      expect(session.messages).toHaveLength(2);
      expect(msg1.id).toBeDefined();
      expect(msg1.timestamp).toBeDefined();
    });

    it('should trim messages when exceeding limit', () => {
      const limitedManager = createConversationContextManager({
        maxMessages: 3,
        autoExtractEntities: false,
      });

      const sessionId = 'session-1';
      limitedManager.getOrCreateSession(sessionId);

      limitedManager.addMessage(sessionId, { role: 'user', content: 'Message 1' });
      limitedManager.addMessage(sessionId, { role: 'assistant', content: 'Message 2' });
      limitedManager.addMessage(sessionId, { role: 'user', content: 'Message 3' });
      limitedManager.addMessage(sessionId, { role: 'assistant', content: 'Message 4' });

      const session = limitedManager.getSession(sessionId)!;
      expect(session.messages).toHaveLength(3);
      expect(session.messages[0]?.content).toBe('Message 2');

      limitedManager.destroy();
    });

    it('should add function results to conversation', () => {
      const sessionId = 'session-1';
      manager.getOrCreateSession(sessionId);

      const msg = manager.addFunctionResult(
        sessionId,
        'schedule_appointment',
        { patientId: 'patient-123', date: '2024-12-15' },
        { appointmentId: 'apt-123', status: 'confirmed' }
      );

      expect(msg.role).toBe('function');
      expect(msg.functionCall?.name).toBe('schedule_appointment');
      expect(msg.functionCall?.result).toBeDefined();
    });
  });

  describe('entity extraction', () => {
    it('should extract phone numbers', () => {
      const entities = manager.extractEntities('My phone number is +40721234567');

      expect(entities).toContainEqual(
        expect.objectContaining({
          type: 'phone',
          value: '+40721234567',
        })
      );
    });

    it('should extract email addresses', () => {
      const entities = manager.extractEntities('Contact me at test@example.com');

      expect(entities).toContainEqual(
        expect.objectContaining({
          type: 'email',
          value: 'test@example.com',
        })
      );
    });

    it('should extract dates', () => {
      const entities = manager.extractEntities('I want to schedule for 2024-12-15');

      expect(entities).toContainEqual(
        expect.objectContaining({
          type: 'date',
          value: '2024-12-15',
        })
      );
    });

    it('should extract Romanian relative dates', () => {
      const entities = manager.extractEntities('Pot veni mâine dimineață');

      expect(entities).toContainEqual(
        expect.objectContaining({
          type: 'date',
        })
      );
      expect(entities).toContainEqual(
        expect.objectContaining({
          type: 'time',
        })
      );
    });

    it('should extract service types', () => {
      const entities = manager.extractEntities('I want information about all-on-4 implants');

      expect(entities).toContainEqual(
        expect.objectContaining({
          type: 'service_type',
        })
      );
    });

    it('should extract amounts', () => {
      const entities = manager.extractEntities('My budget is around 5000 euro');

      expect(entities).toContainEqual(
        expect.objectContaining({
          type: 'amount',
        })
      );
    });

    it('should auto-extract entities from user messages', () => {
      const sessionId = 'session-1';
      manager.getOrCreateSession(sessionId);

      manager.addMessage(sessionId, {
        role: 'user',
        content: 'Call me at +40721234567 for the appointment',
      });

      const phoneEntity = manager.getEntity(sessionId, 'phone');
      expect(phoneEntity?.value).toBe('+40721234567');
    });
  });

  describe('entity management', () => {
    it('should add and retrieve entities', () => {
      const sessionId = 'session-1';
      manager.getOrCreateSession(sessionId);

      manager.addEntity(sessionId, {
        type: 'patient_id',
        value: 'patient-123',
        confidence: 1.0,
        source: 'function_result',
      });

      const entity = manager.getEntity(sessionId, 'patient_id');
      expect(entity?.value).toBe('patient-123');
    });

    it('should update existing entity of same type', () => {
      const sessionId = 'session-1';
      manager.getOrCreateSession(sessionId);

      manager.addEntity(sessionId, {
        type: 'phone',
        value: '+40721111111',
        confidence: 0.8,
        source: 'user_input',
      });

      manager.addEntity(sessionId, {
        type: 'phone',
        value: '+40722222222',
        confidence: 0.95,
        source: 'user_input',
      });

      const entities = manager.getEntities(sessionId, 'phone');
      expect(entities).toHaveLength(1);
      expect(entities[0]?.value).toBe('+40722222222');
    });

    it('should get all entities of a type', () => {
      const sessionId = 'session-1';
      manager.getOrCreateSession(sessionId);

      manager.addEntity(sessionId, {
        type: 'date',
        value: '2024-12-15',
        confidence: 0.9,
        source: 'user_input',
      });

      const dates = manager.getEntities(sessionId, 'date');
      expect(dates).toHaveLength(1);
    });
  });

  describe('intent tracking', () => {
    it('should track intents', () => {
      const sessionId = 'session-1';
      manager.getOrCreateSession(sessionId);

      manager.trackIntent(sessionId, 'schedule_appointment', 0.9);

      const intent = manager.getCurrentIntent(sessionId);
      expect(intent?.intent).toBe('schedule_appointment');
      expect(intent?.confidence).toBe(0.9);
    });

    it('should mark intent as resolved', () => {
      const sessionId = 'session-1';
      manager.getOrCreateSession(sessionId);

      manager.trackIntent(sessionId, 'schedule_appointment', 0.9);
      manager.resolveIntent(sessionId);

      const intent = manager.getCurrentIntent(sessionId);
      expect(intent).toBeUndefined();
    });

    it('should track intent chain', () => {
      const sessionId = 'session-1';
      manager.getOrCreateSession(sessionId);

      manager.trackIntent(sessionId, 'get_patient', 0.8);
      manager.resolveIntent(sessionId);
      manager.trackIntent(sessionId, 'schedule_appointment', 0.9);

      const session = manager.getSession(sessionId)!;
      expect(session.intentChain).toHaveLength(2);
      expect(session.intentChain[0]?.resolved).toBe(true);
      expect(session.intentChain[1]?.resolved).toBe(false);
    });
  });

  describe('context for AI', () => {
    it('should build context for AI', () => {
      const sessionId = 'session-1';
      manager.getOrCreateSession(sessionId, { channel: 'whatsapp' });

      manager.addMessage(sessionId, {
        role: 'user',
        content: 'Hello',
      });
      manager.addMessage(sessionId, {
        role: 'assistant',
        content: 'Hi! How can I help?',
      });

      manager.addEntity(sessionId, {
        type: 'phone',
        value: '+40721234567',
        confidence: 1.0,
        source: 'context',
      });

      manager.trackIntent(sessionId, 'get_info', 0.7);

      const context = manager.getContextForAI(sessionId);

      expect(context.messages).toHaveLength(2);
      expect(context.entities.phone).toBe('+40721234567');
      expect(context.currentIntent).toBe('get_info');
      expect(context.summary).toContain('whatsapp');
    });

    it('should limit context messages', () => {
      const sessionId = 'session-1';
      manager.getOrCreateSession(sessionId);

      for (let i = 0; i < 10; i++) {
        manager.addMessage(sessionId, {
          role: 'user',
          content: `Message ${i}`,
        });
      }

      const context = manager.getContextForAI(sessionId, 5);
      expect(context.messages).toHaveLength(5);
    });
  });

  describe('argument building from context', () => {
    it('should build args from extracted entities', () => {
      const sessionId = 'session-1';
      manager.getOrCreateSession(sessionId);

      manager.addEntity(sessionId, {
        type: 'phone',
        value: '+40721234567',
        confidence: 1.0,
        source: 'user_input',
      });

      manager.addEntity(sessionId, {
        type: 'patient_id',
        value: 'patient-123',
        confidence: 1.0,
        source: 'function_result',
      });

      const { args, missing } = manager.buildArgsFromContext(sessionId, [
        'phone',
        'patientId',
        'serviceType',
      ]);

      expect(args.phone).toBe('+40721234567');
      expect(args.patientId).toBe('patient-123');
      expect(missing).toContain('serviceType');
    });

    it('should report all missing args when no session', () => {
      const { args, missing } = manager.buildArgsFromContext('nonexistent', ['phone', 'patientId']);

      expect(args).toEqual({});
      expect(missing).toContain('phone');
      expect(missing).toContain('patientId');
    });
  });
});
