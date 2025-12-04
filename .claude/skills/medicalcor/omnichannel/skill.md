# Omnichannel Communication Expert

> Auto-activates when: WhatsApp, voice, Vapi, messaging, SMS, communication channel, webhook, notification, patient communication, call, phone

## Overview

MedicalCor provides omnichannel patient communication through WhatsApp Business API, Voice (Vapi), and Web channels. All channels feed into the same patient profile for unified communication history.

## Architecture

### Integration Locations
```
packages/integrations/
├── whatsapp/        # WhatsApp Business API client
├── vapi/            # Voice AI (Vapi) client
└── index.ts         # Unified exports
```

### Channel Abstraction
```typescript
interface CommunicationChannel {
  sendMessage(to: string, message: MessagePayload): Promise<MessageResult>;
  receiveMessage(webhook: WebhookPayload): Promise<IncomingMessage>;
  getMessageStatus(messageId: string): Promise<MessageStatus>;
}

type ChannelType = 'whatsapp' | 'voice' | 'web' | 'sms';
```

## WhatsApp Business API

### Configuration
```typescript
// Environment variables
WHATSAPP_PHONE_NUMBER_ID=xxxxx
WHATSAPP_ACCESS_TOKEN=xxxxx
WHATSAPP_VERIFY_TOKEN=xxxxx
WHATSAPP_WEBHOOK_SECRET=xxxxx
```

### Webhook Handler
Location: `apps/api/src/routes/webhooks/whatsapp.ts`

```typescript
import { FastifyPluginAsync } from 'fastify';
import { logger } from '@medicalcor/core/logger';

const whatsappWebhook: FastifyPluginAsync = async (fastify) => {
  // Verification endpoint (GET)
  fastify.get('/webhooks/whatsapp', async (request, reply) => {
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return reply.send(challenge);
    }
    return reply.status(403).send('Forbidden');
  });

  // Message webhook (POST)
  fastify.post('/webhooks/whatsapp', async (request, reply) => {
    const { entry } = request.body;

    for (const e of entry) {
      for (const change of e.changes) {
        if (change.value.messages) {
          for (const message of change.value.messages) {
            await processIncomingMessage(message);
          }
        }

        if (change.value.statuses) {
          for (const status of change.value.statuses) {
            await processStatusUpdate(status);
          }
        }
      }
    }

    return reply.send({ status: 'ok' });
  });
};
```

### Sending Messages
```typescript
import axios from 'axios';

const WHATSAPP_API = 'https://graph.facebook.com/v18.0';

export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<string> {
  const response = await axios.post(
    `${WHATSAPP_API}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: message }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data.messages[0].id;
}
```

### Message Templates
```typescript
// Template messages require pre-approval
export async function sendAppointmentReminder(
  to: string,
  appointmentDate: string,
  patientName: string
): Promise<string> {
  const response = await axios.post(
    `${WHATSAPP_API}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to: to,
      type: 'template',
      template: {
        name: 'appointment_reminder',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: patientName },
              { type: 'text', text: appointmentDate }
            ]
          }
        ]
      }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`
      }
    }
  );

  return response.data.messages[0].id;
}
```

## Voice (Vapi)

### Configuration
```typescript
// Environment variables
VAPI_API_KEY=xxxxx
VAPI_ASSISTANT_ID=xxxxx
VAPI_PHONE_NUMBER_ID=xxxxx
```

### Vapi Client
```typescript
import Vapi from '@vapi-ai/server-sdk';

const vapi = new Vapi({
  token: process.env.VAPI_API_KEY
});

// Create outbound call
export async function initiateCall(
  phoneNumber: string,
  context: CallContext
): Promise<string> {
  const call = await vapi.calls.create({
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
    customer: {
      number: phoneNumber
    },
    assistantId: process.env.VAPI_ASSISTANT_ID,
    assistantOverrides: {
      variableValues: {
        patientName: context.patientName,
        appointmentDate: context.appointmentDate,
        reason: context.reason
      }
    }
  });

  return call.id;
}
```

### Webhook Handler
Location: `apps/api/src/routes/webhooks/vapi.ts`

```typescript
fastify.post('/webhooks/vapi', async (request, reply) => {
  const { type, call, message } = request.body;

  switch (type) {
    case 'call-started':
      await handleCallStarted(call);
      break;

    case 'call-ended':
      await handleCallEnded(call);
      break;

    case 'transcript':
      await handleTranscript(call.id, message);
      break;

    case 'function-call':
      const result = await handleFunctionCall(message);
      return reply.send({ result });
  }

  return reply.send({ status: 'ok' });
});
```

### Voice Assistant Configuration
```typescript
const assistantConfig = {
  name: 'MedicalCor Dental Assistant',
  model: {
    provider: 'openai',
    model: 'gpt-4o',
    systemPrompt: `You are a helpful dental clinic assistant for MedicalCor.
Your role is to:
- Answer questions about dental services
- Help schedule appointments
- Collect patient information for callbacks
- Handle appointment reminders

Always be professional, empathetic, and HIPAA-compliant.
Never discuss specific medical conditions over the phone.
Redirect complex medical questions to in-person consultations.`
  },
  voice: {
    provider: '11labs',
    voiceId: 'professional-female'
  },
  functions: [
    {
      name: 'schedule_appointment',
      description: 'Schedule a dental appointment',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date' },
          time: { type: 'string' },
          treatment: { type: 'string' },
          patientPhone: { type: 'string' }
        }
      }
    },
    {
      name: 'transfer_to_human',
      description: 'Transfer the call to a human agent',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' }
        }
      }
    }
  ]
};
```

## Unified Communication Service

### Message Router
```typescript
export class CommunicationService {
  private channels: Map<ChannelType, CommunicationChannel>;

  async sendMessage(
    patientId: string,
    message: string,
    preferredChannel?: ChannelType
  ): Promise<MessageResult> {
    const patient = await this.patientRepo.findById(patientId);
    const channel = preferredChannel ?? patient.preferredChannel ?? 'whatsapp';

    // Log for audit trail (HIPAA)
    await this.auditLog.record({
      action: 'SEND_MESSAGE',
      patientId,
      channel,
      timestamp: new Date()
    });

    const channelClient = this.channels.get(channel);
    return channelClient.sendMessage(patient.contactInfo[channel], { text: message });
  }

  async getConversationHistory(patientId: string): Promise<Message[]> {
    // Unified history across all channels
    return this.messageRepo.findByPatientId(patientId, {
      orderBy: 'timestamp',
      include: ['channel', 'status', 'sender']
    });
  }
}
```

### Channel Preference
```typescript
interface PatientCommunicationPreferences {
  preferredChannel: ChannelType;
  allowedChannels: ChannelType[];
  quietHours?: {
    start: string; // "22:00"
    end: string;   // "08:00"
    timezone: string;
  };
  language: string;
  consentedToMarketing: boolean;
}
```

## Message Queue Integration

### Trigger.dev Jobs
Location: `apps/trigger/src/jobs/`

```typescript
import { task } from '@trigger.dev/sdk/v3';

export const sendMessageTask = task({
  id: 'send-message',
  run: async (payload: SendMessagePayload) => {
    const { patientId, message, channel } = payload;

    const result = await communicationService.sendMessage(
      patientId,
      message,
      channel
    );

    return { messageId: result.id, status: result.status };
  }
});

export const appointmentReminderTask = task({
  id: 'appointment-reminder',
  run: async (payload: AppointmentReminderPayload) => {
    const { patientId, appointmentDate } = payload;
    const patient = await patientRepo.findById(patientId);

    // Send via preferred channel
    await communicationService.sendMessage(
      patientId,
      `Reminder: Your dental appointment is scheduled for ${appointmentDate}`,
      patient.preferredChannel
    );
  }
});
```

## Best Practices

1. **Always obtain consent** before sending messages
2. **Respect quiet hours** - don't message patients late at night
3. **Log all communications** for HIPAA compliance
4. **Handle delivery failures** gracefully with retries
5. **Provide opt-out options** in every message
6. **Use templates** for common messages (approval required for WhatsApp)
7. **Unify patient profiles** - don't create duplicates across channels
