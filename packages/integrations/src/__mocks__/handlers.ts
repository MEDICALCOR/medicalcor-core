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
    const body = (await request.json()) as { filterGroups?: { filters?: { value: string }[] }[] };
    const phone = body.filterGroups?.[0]?.filters?.[0]?.value;

    // Mock: return existing contact for specific test phone
    if (phone === '+40721000001') {
      return HttpResponse.json({
        total: 1,
        results: [
          {
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
          },
        ],
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

  // Create/Upsert contact
  // Handles both regular create and upsert (with idProperty query param)
  http.post('https://api.hubapi.com/crm/v3/objects/contacts', async ({ request }) => {
    const url = new URL(request.url);
    const idProperty = url.searchParams.get('idProperty');
    const body = (await request.json()) as { properties: Record<string, string> };

    // If using upsert with idProperty, check if contact exists
    if (idProperty === 'phone' && body.properties.phone === '+40721000001') {
      // Return existing contact for upsert
      return HttpResponse.json({
        id: 'hs_contact_123',
        properties: {
          ...body.properties,
          phone: '+40721000001',
          firstname: 'Test',
          lastname: 'User',
          email: 'test@example.com',
          lifecyclestage: 'lead',
          lead_score: '3',
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: new Date().toISOString(),
      });
    }

    // New contact creation
    return HttpResponse.json(
      {
        id: `hs_contact_new_${Date.now()}`,
        properties: body.properties,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { status: 201 }
    );
  }),

  // Update contact
  http.patch(
    'https://api.hubapi.com/crm/v3/objects/contacts/:contactId',
    async ({ params, request }) => {
      const body = (await request.json()) as { properties: Record<string, string> };
      return HttpResponse.json({
        id: params.contactId,
        properties: body.properties,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: new Date().toISOString(),
      });
    }
  ),

  // Create note
  http.post('https://api.hubapi.com/crm/v3/objects/notes', () => {
    return HttpResponse.json(
      {
        id: `note_${Date.now()}`,
        properties: {},
        createdAt: new Date().toISOString(),
      },
      { status: 201 }
    );
  }),

  // Create task
  http.post('https://api.hubapi.com/crm/v3/objects/tasks', async ({ request }) => {
    const body = (await request.json()) as { properties: Record<string, string> };
    return HttpResponse.json(
      {
        id: `task_${Date.now()}`,
        properties: body.properties,
        createdAt: new Date().toISOString(),
      },
      { status: 201 }
    );
  }),

  // Create call
  http.post('https://api.hubapi.com/crm/v3/objects/calls', () => {
    return HttpResponse.json(
      {
        id: `call_${Date.now()}`,
        properties: {},
        createdAt: new Date().toISOString(),
      },
      { status: 201 }
    );
  }),
];

// =============================================================================
// WhatsApp (360dialog) API Mocks
// =============================================================================

const whatsappHandlers = [
  // Send message
  http.post('https://waba.360dialog.io/v1/messages', async ({ request }) => {
    const body = (await request.json()) as { to: string };
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
    const body = (await request.json()) as { messages: { content: string }[] };
    const lastMessage = body.messages[body.messages.length - 1]?.content ?? '';

    // Mock scoring response
    if (lastMessage.includes('Analyze') || lastMessage.includes('score')) {
      return HttpResponse.json({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o',
        choices: [
          {
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
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      });
    }

    // Default response
    return HttpResponse.json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Date.now(),
      model: 'gpt-4o',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Mock response for testing',
          },
          finish_reason: 'stop',
        },
      ],
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
      messages: [
        {
          role: 'assistant',
          message: 'Buna ziua! Cu ce va putem ajuta astazi?',
          timestamp: Date.now() - 180000,
          duration: 3,
        },
        {
          role: 'user',
          message: 'Buna ziua, vreau informatii despre implanturi dentare. Cat costa un implant?',
          timestamp: Date.now() - 175000,
          duration: 5,
        },
        {
          role: 'assistant',
          message:
            'Cu placere! Pretul unui implant incepe de la 600 euro. Doriti o consultatie gratuita?',
          timestamp: Date.now() - 168000,
          duration: 6,
        },
        {
          role: 'user',
          message: 'Da, as dori sa fac o programare pentru saptamana viitoare.',
          timestamp: Date.now() - 160000,
          duration: 4,
        },
        {
          role: 'assistant',
          message: 'Perfect! Va pot programa joi la ora 10:00. Va convine?',
          timestamp: Date.now() - 154000,
          duration: 4,
        },
        {
          role: 'user',
          message: 'Da, perfect. Multumesc!',
          timestamp: Date.now() - 148000,
          duration: 2,
        },
      ],
      duration: 180,
      startedAt: new Date(Date.now() - 180000).toISOString(),
      endedAt: new Date().toISOString(),
    });
  }),

  // Get call details
  http.get('https://api.vapi.ai/call/:callId', ({ params }) => {
    return HttpResponse.json({
      id: params.callId,
      orgId: 'org_test123',
      assistantId: 'ast_test123',
      status: 'ended',
      type: 'inbound',
      phoneNumber: {
        id: 'pn_test123',
        number: '+40212000000',
      },
      customer: {
        number: '+40721000001',
        name: 'Test Patient',
      },
      startedAt: new Date(Date.now() - 180000).toISOString(),
      endedAt: new Date().toISOString(),
      endedReason: 'customer-ended-call',
      cost: 0.15,
    });
  }),

  // Create outbound call
  http.post('https://api.vapi.ai/call', async ({ request }) => {
    const body = (await request.json()) as { customer?: { number: string } };
    return HttpResponse.json(
      {
        id: `call_${Date.now()}`,
        orgId: 'org_test123',
        assistantId: 'ast_test123',
        status: 'queued',
        type: 'outbound',
        customer: body.customer,
        createdAt: new Date().toISOString(),
      },
      { status: 201 }
    );
  }),

  // List calls
  http.get('https://api.vapi.ai/call', () => {
    return HttpResponse.json([
      {
        id: 'call_1',
        orgId: 'org_test123',
        assistantId: 'ast_test123',
        status: 'ended',
        type: 'inbound',
        customer: { number: '+40721000001' },
        startedAt: new Date(Date.now() - 3600000).toISOString(),
        endedAt: new Date(Date.now() - 3420000).toISOString(),
        endedReason: 'customer-ended-call',
      },
      {
        id: 'call_2',
        orgId: 'org_test123',
        assistantId: 'ast_test123',
        status: 'ended',
        type: 'outbound',
        customer: { number: '+40721000002' },
        startedAt: new Date(Date.now() - 7200000).toISOString(),
        endedAt: new Date(Date.now() - 7080000).toISOString(),
        endedReason: 'assistant-ended-call',
      },
    ]);
  }),

  // End call
  http.delete('https://api.vapi.ai/call/:callId', () => {
    return new HttpResponse(null, { status: 204 });
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
    hotLead:
      'Buna ziua, sunt interesat de All-on-4. Cat costa procedura? Am buget de aproximativ 10000 euro.',
    warmLead: 'As vrea sa aflu mai multe despre implanturi dentare.',
    coldLead: 'Informatii generale despre clinica, va rog.',
  },
};

// =============================================================================
// Twilio Flex API Mocks
// =============================================================================

const twilioFlexHandlers = [
  // List Workers
  http.get(/https:\/\/taskrouter\.twilio\.com\/v1\/Workspaces\/WS\w+\/Workers/, () => {
    return HttpResponse.json({
      workers: [
        {
          sid: 'WK12345678901234567890123456789012',
          friendly_name: 'Agent Smith',
          activity_name: 'Available',
          activity_sid: 'WA12345678901234567890123456789012',
          available: true,
          attributes: JSON.stringify({ skills: ['dental'], languages: ['ro', 'en'] }),
          date_created: '2024-01-01T00:00:00Z',
          date_updated: '2024-01-01T00:00:00Z',
        },
      ],
    });
  }),

  // List Task Queues
  http.get(/https:\/\/taskrouter\.twilio\.com\/v1\/Workspaces\/WS\w+\/TaskQueues/, () => {
    return HttpResponse.json({
      task_queues: [
        {
          sid: 'WQ12345678901234567890123456789012',
          friendly_name: 'Dental Inquiries',
          target_workers: "skills HAS 'dental'",
          current_size: 3,
        },
      ],
    });
  }),

  // List Tasks
  http.get(/https:\/\/taskrouter\.twilio\.com\/v1\/Workspaces\/WS\w+\/Tasks/, () => {
    return HttpResponse.json({
      tasks: [
        {
          sid: 'WT12345678901234567890123456789012',
          queue_sid: 'WQ12345678901234567890123456789012',
          worker_sid: 'WK12345678901234567890123456789012',
          attributes: JSON.stringify({ type: 'inbound_call', phone: '+40721000001' }),
          assignment_status: 'assigned',
          priority: 0,
          reason: null,
          date_created: '2024-01-01T00:00:00Z',
          date_updated: '2024-01-01T00:00:00Z',
          timeout: 86400,
        },
      ],
    });
  }),

  // Create Task
  http.post(/https:\/\/taskrouter\.twilio\.com\/v1\/Workspaces\/WS\w+\/Tasks/, () => {
    return HttpResponse.json({
      sid: `WT${Date.now()}`,
      queue_sid: 'WQ12345678901234567890123456789012',
      worker_sid: null,
      attributes: '{}',
      assignment_status: 'pending',
      priority: 0,
      reason: null,
      date_created: new Date().toISOString(),
      date_updated: new Date().toISOString(),
      timeout: 86400,
    });
  }),

  // List Activities
  http.get(/https:\/\/taskrouter\.twilio\.com\/v1\/Workspaces\/WS\w+\/Activities/, () => {
    return HttpResponse.json({
      activities: [
        { sid: 'WA1', friendly_name: 'Available', available: true },
        { sid: 'WA2', friendly_name: 'Busy', available: false },
        { sid: 'WA3', friendly_name: 'Break', available: false },
        { sid: 'WA4', friendly_name: 'Offline', available: false },
      ],
    });
  }),

  // Update Worker Activity
  http.post(/https:\/\/taskrouter\.twilio\.com\/v1\/Workspaces\/WS\w+\/Workers\/WK\w+/, () => {
    return HttpResponse.json({
      sid: 'WK12345678901234567890123456789012',
      friendly_name: 'Agent Smith',
      activity_name: 'Available',
      activity_sid: 'WA1',
      available: true,
      attributes: '{}',
      date_created: '2024-01-01T00:00:00Z',
      date_updated: new Date().toISOString(),
    });
  }),

  // List Reservations
  http.get(
    /https:\/\/taskrouter\.twilio\.com\/v1\/Workspaces\/WS\w+\/Workers\/WK\w+\/Reservations/,
    () => {
      return HttpResponse.json({
        reservations: [
          {
            sid: 'WR12345678901234567890123456789012',
            task_sid: 'WT12345678901234567890123456789012',
            worker_sid: 'WK12345678901234567890123456789012',
            reservation_status: 'accepted',
            date_created: '2024-01-01T00:00:00Z',
            date_updated: '2024-01-01T00:00:00Z',
          },
        ],
      });
    }
  ),

  // Create Reservation
  http.post(
    /https:\/\/taskrouter\.twilio\.com\/v1\/Workspaces\/WS\w+\/Tasks\/WT\w+\/Reservations/,
    () => {
      return HttpResponse.json({
        sid: `WR${Date.now()}`,
        task_sid: 'WT12345678901234567890123456789012',
        worker_sid: 'WK12345678901234567890123456789012',
        reservation_status: 'pending',
        date_created: new Date().toISOString(),
        date_updated: new Date().toISOString(),
      });
    }
  ),

  // Update Reservation
  http.post(
    /https:\/\/taskrouter\.twilio\.com\/v1\/Workspaces\/WS\w+\/Tasks\/WT\w+\/Reservations\/WR\w+/,
    () => {
      return HttpResponse.json({
        sid: 'WR12345678901234567890123456789012',
        task_sid: 'WT12345678901234567890123456789012',
        worker_sid: 'WK12345678901234567890123456789012',
        reservation_status: 'accepted',
        date_created: '2024-01-01T00:00:00Z',
        date_updated: new Date().toISOString(),
      });
    }
  ),

  // List Conferences
  http.get(/https:\/\/api\.twilio\.com\/2010-04-01\/Accounts\/AC\w+\/Conferences\.json/, () => {
    return HttpResponse.json({
      conferences: [
        {
          sid: 'CF12345678901234567890123456789012',
          friendly_name: 'Call-123',
          status: 'in-progress',
          date_created: '2024-01-01T00:00:00Z',
          date_updated: '2024-01-01T00:00:00Z',
        },
      ],
    });
  }),

  // Get Conference Participants
  http.get(
    /https:\/\/api\.twilio\.com\/2010-04-01\/Accounts\/AC\w+\/Conferences\/CF\w+\/Participants\.json/,
    () => {
      return HttpResponse.json({
        participants: [
          {
            call_sid: 'CA12345678901234567890123456789012',
            conference_sid: 'CF12345678901234567890123456789012',
            muted: false,
            hold: false,
            coaching: false,
            status: 'connected',
          },
        ],
      });
    }
  ),

  // Add Participant to Conference
  http.post(
    /https:\/\/api\.twilio\.com\/2010-04-01\/Accounts\/AC\w+\/Conferences\/CF\w+\/Participants\.json/,
    () => {
      return HttpResponse.json({
        call_sid: 'CA_SUPERVISOR',
        conference_sid: 'CF12345678901234567890123456789012',
        muted: true,
        hold: false,
        coaching: false,
        status: 'connected',
      });
    }
  ),

  // Update Participant
  http.post(
    /https:\/\/api\.twilio\.com\/2010-04-01\/Accounts\/AC\w+\/Conferences\/CF\w+\/Participants\/CA\w+\.json/,
    () => {
      return HttpResponse.json({
        call_sid: 'CA12345678901234567890123456789012',
        conference_sid: 'CF12345678901234567890123456789012',
        muted: true,
        hold: false,
        coaching: false,
        status: 'connected',
      });
    }
  ),
];

// =============================================================================
// Export all handlers
// =============================================================================

export const handlers = [
  ...hubspotHandlers,
  ...whatsappHandlers,
  ...openaiHandlers,
  ...stripeHandlers,
  ...vapiHandlers,
  ...twilioFlexHandlers,
];
