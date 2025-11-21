import { describe, it, expect, beforeEach } from 'vitest';
import {
  LeadContextBuilder,
  buildLeadContextFromWhatsApp,
  buildLeadContextFromVoiceCall,
  buildLeadContextFromWebForm,
  type WhatsAppInput,
  type VoiceCallInput,
  type WebFormInput,
} from '../lead-context.js';

describe('LeadContextBuilder', () => {
  describe('fromWhatsApp', () => {
    const whatsappInput: WhatsAppInput = {
      from: '0721123456',
      message: {
        id: 'msg-123',
        body: 'Bună, vreau să fac o programare pentru implant',
        type: 'text',
        timestamp: '1699999999',
      },
      contact: {
        name: 'Ion Popescu',
        wa_id: '40721123456',
      },
      metadata: {
        phone_number_id: 'phone-123',
        display_phone_number: '+40800123456',
      },
    };

    it('should create context from WhatsApp data', () => {
      const context = LeadContextBuilder.fromWhatsApp(whatsappInput).build();

      expect(context.phone).toBe('+40721123456');
      expect(context.phoneIsValid).toBe(true);
      expect(context.channel).toBe('whatsapp');
      expect(context.name).toBe('Ion Popescu');
    });

    it('should normalize Romanian phone number', () => {
      const context = LeadContextBuilder.fromWhatsApp({
        ...whatsappInput,
        from: '0040721123456',
      }).build();

      expect(context.phone).toBe('+40721123456');
      expect(context.phoneIsValid).toBe(true);
    });

    it('should add message to history', () => {
      const context = LeadContextBuilder.fromWhatsApp(whatsappInput).build();

      expect(context.messageHistory).toHaveLength(1);
      expect(context.messageHistory[0]?.role).toBe('user');
      expect(context.messageHistory[0]?.content).toBe(
        'Bună, vreau să fac o programare pentru implant'
      );
    });

    it('should convert Unix timestamp to ISO', () => {
      const context = LeadContextBuilder.fromWhatsApp(whatsappInput).build();

      expect(context.firstTouchTimestamp).toContain('T');
      expect(new Date(context.firstTouchTimestamp).getTime()).toBeGreaterThan(0);
    });

    it('should store WhatsApp metadata', () => {
      const context = LeadContextBuilder.fromWhatsApp(whatsappInput).build();

      expect(context.metadata.whatsapp).toBeDefined();
      const waMeta = context.metadata.whatsapp as Record<string, unknown>;
      expect(waMeta.messageId).toBe('msg-123');
      expect(waMeta.wa_id).toBe('40721123456');
    });

    it('should auto-detect Romanian language', () => {
      const context = LeadContextBuilder.fromWhatsApp(whatsappInput).build();

      expect(context.language).toBe('ro');
    });

    it('should handle missing contact info', () => {
      const { contact: _contact, ...inputWithoutContact } = whatsappInput;
      const context = LeadContextBuilder.fromWhatsApp(inputWithoutContact).build();

      expect(context.name).toBeUndefined();
    });

    it('should handle missing message body', () => {
      const context = LeadContextBuilder.fromWhatsApp({
        ...whatsappInput,
        message: { id: 'msg-123', type: 'image' },
      }).build();

      expect(context.messageHistory).toHaveLength(0);
    });
  });

  describe('fromVoiceCall', () => {
    const voiceInput: VoiceCallInput = {
      from: '+40721123456',
      to: '+40800123456',
      callSid: 'CA123456',
      direction: 'inbound',
      timestamp: '2024-01-15T10:30:00Z',
      callerName: 'Maria Ionescu',
    };

    it('should create context from voice call data', () => {
      const context = LeadContextBuilder.fromVoiceCall(voiceInput).build();

      expect(context.phone).toBe('+40721123456');
      expect(context.channel).toBe('voice');
      expect(context.name).toBe('Maria Ionescu');
    });

    it('should store voice metadata', () => {
      const context = LeadContextBuilder.fromVoiceCall(voiceInput).build();

      expect(context.metadata.voice).toBeDefined();
      const voiceMeta = context.metadata.voice as Record<string, unknown>;
      expect(voiceMeta.callSid).toBe('CA123456');
      expect(voiceMeta.direction).toBe('inbound');
    });
  });

  describe('fromWebForm', () => {
    const webInput: WebFormInput = {
      phone: '0721123456',
      name: 'Andrei Georgescu',
      email: 'andrei@example.com',
      message: 'I would like more information about dental implants',
      timestamp: '2024-01-15T10:30:00Z',
      pageUrl: 'https://clinic.com/contact?utm_source=google&utm_campaign=implants',
      referrer: 'https://google.com',
    };

    it('should create context from web form data', () => {
      const context = LeadContextBuilder.fromWebForm(webInput).build();

      expect(context.phone).toBe('+40721123456');
      expect(context.channel).toBe('web');
      expect(context.name).toBe('Andrei Georgescu');
      expect(context.email).toBe('andrei@example.com');
    });

    it('should add form message to history', () => {
      const context = LeadContextBuilder.fromWebForm(webInput).build();

      expect(context.messageHistory).toHaveLength(1);
      expect(context.messageHistory[0]?.content).toBe(
        'I would like more information about dental implants'
      );
    });

    it('should store web metadata', () => {
      const context = LeadContextBuilder.fromWebForm(webInput).build();

      expect(context.metadata.web).toBeDefined();
      const webMeta = context.metadata.web as Record<string, unknown>;
      expect(webMeta.referrer).toBe('https://google.com');
    });
  });

  describe('create', () => {
    it('should create minimal context', () => {
      const context = LeadContextBuilder.create('0721123456', 'whatsapp').build();

      expect(context.phone).toBe('+40721123456');
      expect(context.channel).toBe('whatsapp');
      expect(context.messageHistory).toEqual([]);
      expect(context.language).toBe('ro');
    });
  });

  describe('builder methods', () => {
    let builder: LeadContextBuilder;

    beforeEach(() => {
      builder = LeadContextBuilder.create('0721123456', 'whatsapp');
    });

    it('withName should set name', () => {
      const context = builder.withName('Test Name').build();
      expect(context.name).toBe('Test Name');
    });

    it('withEmail should set email', () => {
      const context = builder.withEmail('test@example.com').build();
      expect(context.email).toBe('test@example.com');
    });

    it('withLanguage should set language', () => {
      const context = builder.withLanguage('en').build();
      expect(context.language).toBe('en');
    });

    it('withUTM should set UTM params from object', () => {
      const context = builder
        .withUTM({
          utm_source: 'facebook',
          utm_campaign: 'dental_implants',
          gclid: 'abc123',
        })
        .build();

      expect(context.utm?.utm_source).toBe('facebook');
      expect(context.utm?.utm_campaign).toBe('dental_implants');
      expect(context.utm?.gclid).toBe('abc123');
    });

    it('withUTM should parse UTM params from URL', () => {
      const context = builder
        .withUTM('https://clinic.com/page?utm_source=google&utm_medium=cpc&fbclid=xyz')
        .build();

      expect(context.utm?.utm_source).toBe('google');
      expect(context.utm?.utm_medium).toBe('cpc');
      expect(context.utm?.fbclid).toBe('xyz');
    });

    it('withHubSpotContact should set HubSpot ID', () => {
      const context = builder.withHubSpotContact('hs-123').build();
      expect(context.hubspotContactId).toBe('hs-123');
    });

    it('withHubSpotDeal should set deal ID', () => {
      const context = builder.withHubSpotDeal('deal-456').build();
      expect(context.hubspotDealId).toBe('deal-456');
    });

    it('withCorrelationId should set correlation ID', () => {
      const context = builder.withCorrelationId('req-789').build();
      expect(context.correlationId).toBe('req-789');
    });

    it('addMessage should add to history', () => {
      const context = builder
        .addMessage('user', 'Hello')
        .addMessage('assistant', 'Hi there!')
        .build();

      expect(context.messageHistory).toHaveLength(2);
      expect(context.messageHistory[0]?.role).toBe('user');
      expect(context.messageHistory[1]?.role).toBe('assistant');
    });

    it('withMessageHistory should replace history', () => {
      const history = [
        { role: 'user' as const, content: 'Test', timestamp: '2024-01-15T10:00:00Z' },
      ];
      const context = builder.withMessageHistory(history).build();

      expect(context.messageHistory).toHaveLength(1);
      expect(context.messageHistory[0]?.content).toBe('Test');
    });

    it('withFirstTouchTimestamp should set timestamp from Date', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const context = builder.withFirstTouchTimestamp(date).build();

      expect(context.firstTouchTimestamp).toBe('2024-01-15T10:30:00.000Z');
    });

    it('withMetadata should add custom metadata', () => {
      const context = builder.withMetadata('customField', 'customValue').build();
      expect(context.metadata.customField).toBe('customValue');
    });

    it('withMetadataObject should merge metadata', () => {
      const context = builder
        .withMetadataObject({ key1: 'value1', key2: 'value2' })
        .build();

      expect(context.metadata.key1).toBe('value1');
      expect(context.metadata.key2).toBe('value2');
    });

    it('builder should support method chaining', () => {
      const context = builder
        .withName('Test')
        .withEmail('test@example.com')
        .withLanguage('en')
        .withHubSpotContact('hs-123')
        .withCorrelationId('req-456')
        .withUTM({ utm_source: 'test' })
        .addMessage('user', 'Hello')
        .build();

      expect(context.name).toBe('Test');
      expect(context.email).toBe('test@example.com');
      expect(context.language).toBe('en');
      expect(context.hubspotContactId).toBe('hs-123');
      expect(context.correlationId).toBe('req-456');
      expect(context.utm?.utm_source).toBe('test');
      expect(context.messageHistory).toHaveLength(1);
    });
  });

  describe('buildForScoring', () => {
    it('should return scoring-compatible context', () => {
      const scoringContext = LeadContextBuilder.create('0721123456', 'whatsapp')
        .withName('Test')
        .withHubSpotContact('hs-123')
        .addMessage('user', 'Vreau implant')
        .buildForScoring();

      expect(scoringContext.phone).toBe('+40721123456');
      expect(scoringContext.name).toBe('Test');
      expect(scoringContext.channel).toBe('whatsapp');
      expect(scoringContext.hubspotContactId).toBe('hs-123');
      expect(scoringContext.messageHistory).toHaveLength(1);
      expect(scoringContext.language).toBe('ro');
    });
  });

  describe('language detection', () => {
    it('should detect Romanian', () => {
      const context = LeadContextBuilder.create('0721123456', 'whatsapp')
        .addMessage('user', 'Bună ziua, vreau să fac o programare pentru implant')
        .build();

      expect(context.language).toBe('ro');
    });

    it('should detect English', () => {
      const context = LeadContextBuilder.create('0721123456', 'whatsapp')
        .addMessage('user', 'Hello, I would like to make an appointment for dental treatment')
        .build();

      expect(context.language).toBe('en');
    });

    it('should detect German', () => {
      const context = LeadContextBuilder.create('0721123456', 'whatsapp')
        .addMessage('user', 'Guten Tag, ich möchte einen Termin für Zahnbehandlung')
        .build();

      expect(context.language).toBe('de');
    });

    it('should default to Romanian for unknown', () => {
      const context = LeadContextBuilder.create('0721123456', 'whatsapp')
        .addMessage('user', '12345')
        .build();

      expect(context.language).toBe('ro');
    });
  });

  describe('phone validation', () => {
    it('should mark valid phone as valid', () => {
      const context = LeadContextBuilder.create('+40721123456', 'whatsapp').build();
      expect(context.phoneIsValid).toBe(true);
    });

    it('should mark invalid phone as invalid', () => {
      const context = LeadContextBuilder.create('123', 'whatsapp').build();
      expect(context.phoneIsValid).toBe(false);
    });

    it('should preserve original phone when different from normalized', () => {
      const context = LeadContextBuilder.create('0721 123 456', 'whatsapp').build();
      expect(context.originalPhone).toBe('0721 123 456');
      expect(context.phone).toBe('+40721123456');
    });
  });
});

describe('convenience functions', () => {
  describe('buildLeadContextFromWhatsApp', () => {
    it('should build context with options', () => {
      const context = buildLeadContextFromWhatsApp(
        {
          from: '0721123456',
          message: { id: 'msg-1', body: 'Test' },
        },
        {
          utm: { utm_source: 'facebook' },
          correlationId: 'req-123',
          hubspotContactId: 'hs-456',
          language: 'en',
        }
      );

      expect(context.phone).toBe('+40721123456');
      expect(context.utm?.utm_source).toBe('facebook');
      expect(context.correlationId).toBe('req-123');
      expect(context.hubspotContactId).toBe('hs-456');
      expect(context.language).toBe('en');
    });
  });

  describe('buildLeadContextFromVoiceCall', () => {
    it('should build context with options', () => {
      const context = buildLeadContextFromVoiceCall(
        {
          from: '0721123456',
          callSid: 'CA123',
          direction: 'inbound',
        },
        {
          correlationId: 'req-123',
          language: 'de',
        }
      );

      expect(context.phone).toBe('+40721123456');
      expect(context.channel).toBe('voice');
      expect(context.correlationId).toBe('req-123');
      expect(context.language).toBe('de');
    });
  });

  describe('buildLeadContextFromWebForm', () => {
    it('should build context with options', () => {
      const context = buildLeadContextFromWebForm(
        {
          phone: '0721123456',
          name: 'Test User',
        },
        {
          utm: 'https://example.com?utm_source=test',
          correlationId: 'req-123',
        }
      );

      expect(context.phone).toBe('+40721123456');
      expect(context.channel).toBe('web');
      expect(context.utm?.utm_source).toBe('test');
      expect(context.correlationId).toBe('req-123');
    });
  });
});
