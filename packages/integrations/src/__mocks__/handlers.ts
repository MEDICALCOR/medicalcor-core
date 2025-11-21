import { http, HttpResponse } from 'msw';

/**
 * MSW Handlers for External Service Mocks
 * Used in tests to mock HubSpot, WhatsApp (360dialog), and OpenAI APIs
 */

// =============================================================================
// HubSpot API Mocks
// =============================================================================

const hubspotHandlers = [
  // Search contacts
  http.post('https://api.hubapi.com/crm/v3/objects/contacts/search', async ({ request }) => {
    const body = await request.json() as { filterGroups?: { filters?: { value: string }[] }[] };
    const phone = body.filterGroups?.[0]?.filters?.[0]?.value;

    // Mock: return existing contact for specific test phone
    if (phone === '+40721000001') {
      return HttpResponse.json({
        total: 1,
        results: [{
          id: 'hs_contact_123',
          properties: {
            phone: '+40721000001',
            firstname: 'Test',
            lastname: 'User',
            email: 'test@example.com',
            lifecyclestage: 'lead',
            lead_score: '3',
          },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }],
      });
    }

    // No contacts found
    return HttpResponse.json({ total: 0, results: [] });
  }),

  // Get contact by ID
  http.get('https://api.hubapi.com/crm/v3/objects/contacts/:contactId', ({ params }) => {
    return HttpResponse.json({
      id: params.contactId,
      properties: {
        phone: '+40721000001',
        firstname: 'Test',
        lastname: 'User',
        email: 'test@example.com',
        lifecyclestage: 'lead',
      },
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    });
  }),

  // Create contact
  http.post('https://api.hubapi.com/crm/v3/objects/contacts', async ({ request }) => {
    const body = await request.json() as { properties: Record<string, string> };
    return HttpResponse.json({
      id: `hs_contact_new_${Date.now()}`,
      properties: body.properties,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 });
  }),

  // Update contact
  http.patch('https://api.hubapi.com/crm/v3/objects/contacts/:contactId', async ({ params, request }) => {
    const body = await request.json() as { properties: Record<string, string> };
    return HttpResponse.json({
      id: params.contactId,
      properties: body.properties,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: new Date().toISOString(),
    });
  }),

  // Create note
  http.post('https://api.hubapi.com/crm/v3/objects/notes', () => {
    return HttpResponse.json({
      id: `note_${Date.now()}`,
      properties: {},
      createdAt: new Date().toISOString(),
    }, { status: 201 });
  }),

  // Create task
  http.post('https://api.hubapi.com/crm/v3/objects/tasks', async ({ request }) => {
    const body = await request.json() as { properties: Record<string, string> };
    return HttpResponse.json({
      id: `task_${Date.now()}`,
      properties: body.properties,
      createdAt: new Date().toISOString(),
    }, { status: 201 });
  }),

  // Create call
  http.post('https://api.hubapi.com/crm/v3/objects/calls', () => {
    return HttpResponse.json({
      id: `call_${Date.now()}`,
      properties: {},
      createdAt: new Date().toISOString(),
    }, { status: 201 });
  }),
];

// =============================================================================
// WhatsApp (360dialog) API Mocks
// =============================================================================

const whatsappHandlers = [
  // Send message
  http.post('https://waba.360dialog.io/v1/messages', async ({ request }) => {
    const body = await request.json() as { to: string };
    return HttpResponse.json({
      messaging_product: 'whatsapp',
      contacts: [{ input: body.to, wa_id: body.to }],
      messages: [{ id: `wamid.${Date.now()}` }],
    });
  }),
];

// =============================================================================
// OpenAI API Mocks
// =============================================================================

const openaiHandlers = [
  // Chat completions
  http.post('https://api.openai.com/v1/chat/completions', async ({ request }) => {
    const body = await request.json() as { messages: { content: string }[] };
    const lastMessage = body.messages[body.messages.length - 1]?.content ?? '';

    // Mock scoring response
    if (lastMessage.includes('Analyze') || lastMessage.includes('score')) {
      return HttpResponse.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify({
              score: 4,
              classification: 'HOT',
              confidence: 0.85,
              reasoning: 'Mock scoring result for testing',
              suggestedAction: 'Contact immediately',
              detectedIntent: 'implant_inquiry',
              urgencyIndicators: [],
              budgetMentioned: true,
              procedureInterest: ['implant'],
            }),
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });
    }

    // Default response
    return HttpResponse.json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Date.now(),
      model: 'gpt-4o',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'Mock response for testing',
        },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
    });
  }),
];

// =============================================================================
// Stripe API Mocks
// =============================================================================

const stripeHandlers = [
  // Get customer
  http.get('https://api.stripe.com/v1/customers/:customerId', ({ params }) => {
    return HttpResponse.json({
      id: params.customerId,
      object: 'customer',
      email: 'test@example.com',
      name: 'Test Customer',
      phone: '+40721000001',
      created: Date.now(),
    });
  }),

  // List payment intents
  http.get('https://api.stripe.com/v1/payment_intents/:paymentId', ({ params }) => {
    return HttpResponse.json({
      id: params.paymentId,
      object: 'payment_intent',
      amount: 50000, // 500.00 EUR
      currency: 'eur',
      status: 'succeeded',
      customer: 'cus_test123',
      metadata: {
        phone: '+40721000001',
      },
    });
  }),
];

// =============================================================================
// Vapi.ai API Mocks (Voice AI)
// =============================================================================

const vapiHandlers = [
  // Get call transcript
  http.get('https://api.vapi.ai/call/:callId/transcript', ({ params }) => {
    return HttpResponse.json({
      callId: params.callId,
      transcript: 'Mock transcript: Patient asking about dental implants and pricing.',
      summary: 'Patient interested in All-on-4 procedure, mentioned budget concerns.',
      sentiment: 'positive',
      duration: 180,
    });
  }),

  // Get call details
  http.get('https://api.vapi.ai/call/:callId', ({ params }) => {
    return HttpResponse.json({
      id: params.callId,
      status: 'completed',
      duration: 180,
      from: '+40721000001',
      to: '+40212000000',
      recordingUrl: 'https://recordings.vapi.ai/mock-recording.mp3',
    });
  }),
];

// =============================================================================
// Test Helper - Rate Limited Response
// =============================================================================

/**
 * Creates a rate limited handler for testing retry logic
 */
export function createRateLimitedHandler(
  url: string,
  method: 'get' | 'post' | 'patch' = 'post',
  retryAfter = 5
) {
  let callCount = 0;
  return http[method](url, () => {
    callCount++;
    if (callCount <= 2) {
      return new HttpResponse(null, {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      });
    }
    return HttpResponse.json({ success: true });
  });
}

/**
 * Creates a handler that fails N times then succeeds
 */
export function createFailingHandler(
  url: string,
  method: 'get' | 'post' | 'patch' = 'post',
  failCount = 2,
  errorStatus = 503
) {
  let callCount = 0;
  return http[method](url, () => {
    callCount++;
    if (callCount <= failCount) {
      return new HttpResponse(null, { status: errorStatus });
    }
    return HttpResponse.json({ success: true });
  });
}

// =============================================================================
// Test Fixtures
// =============================================================================

export const testFixtures = {
  contacts: {
    existing: {
      id: 'hs_contact_123',
      phone: '+40721000001',
      email: 'test@example.com',
      firstname: 'Test',
      lastname: 'User',
      lifecyclestage: 'lead',
      lead_score: '3',
    },
    hotLead: {
      id: 'hs_contact_hot',
      phone: '+40721000002',
      email: 'hot@example.com',
      firstname: 'Hot',
      lastname: 'Lead',
      lifecyclestage: 'lead',
      lead_score: '5',
    },
  },
  scoring: {
    hot: {
      score: 5,
      classification: 'HOT' as const,
      confidence: 0.95,
      reasoning: 'Explicit All-on-X interest with budget mentioned',
      suggestedAction: 'Contact immediately',
      budgetMentioned: true,
      procedureInterest: ['All-on-X', 'implant'],
    },
    warm: {
      score: 3,
      classification: 'WARM' as const,
      confidence: 0.75,
      reasoning: 'General interest in dental procedures',
      suggestedAction: 'Send more information',
      budgetMentioned: false,
      procedureInterest: ['general'],
    },
    cold: {
      score: 2,
      classification: 'COLD' as const,
      confidence: 0.6,
      reasoning: 'Early research stage',
      suggestedAction: 'Add to nurture sequence',
      budgetMentioned: false,
      procedureInterest: [],
    },
  },
  messages: {
    hotLead: 'Buna ziua, sunt interesat de All-on-4. Cat costa procedura? Am buget de aproximativ 10000 euro.',
    warmLead: 'As vrea sa aflu mai multe despre implanturi dentare.',
    coldLead: 'Informatii generale despre clinica, va rog.',
  },
};

// =============================================================================
// Export all handlers
// =============================================================================

export const handlers = [
  ...hubspotHandlers,
  ...whatsappHandlers,
  ...openaiHandlers,
  ...stripeHandlers,
  ...vapiHandlers,
];
