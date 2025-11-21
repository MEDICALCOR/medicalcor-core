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
    const body = await request.json() as { filterGroups: Array<{ filters: Array<{ value: string }> }> };
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
      id: params['contactId'],
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
      id: 'hs_contact_new_' + Date.now(),
      properties: body.properties,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 });
  }),

  // Update contact
  http.patch('https://api.hubapi.com/crm/v3/objects/contacts/:contactId', async ({ params, request }) => {
    const body = await request.json() as { properties: Record<string, string> };
    return HttpResponse.json({
      id: params['contactId'],
      properties: body.properties,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: new Date().toISOString(),
    });
  }),

  // Create note
  http.post('https://api.hubapi.com/crm/v3/objects/notes', () => {
    return HttpResponse.json({
      id: 'note_' + Date.now(),
      properties: {},
      createdAt: new Date().toISOString(),
    }, { status: 201 });
  }),

  // Create task
  http.post('https://api.hubapi.com/crm/v3/objects/tasks', async ({ request }) => {
    const body = await request.json() as { properties: Record<string, string> };
    return HttpResponse.json({
      id: 'task_' + Date.now(),
      properties: body.properties,
      createdAt: new Date().toISOString(),
    }, { status: 201 });
  }),

  // Create call
  http.post('https://api.hubapi.com/crm/v3/objects/calls', () => {
    return HttpResponse.json({
      id: 'call_' + Date.now(),
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
      messages: [{ id: 'wamid.' + Date.now() }],
    });
  }),
];

// =============================================================================
// OpenAI API Mocks
// =============================================================================

const openaiHandlers = [
  // Chat completions
  http.post('https://api.openai.com/v1/chat/completions', async ({ request }) => {
    const body = await request.json() as { messages: Array<{ content: string }> };
    const lastMessage = body.messages[body.messages.length - 1]?.content ?? '';

    // Mock scoring response
    if (lastMessage.includes('Analyze') || lastMessage.includes('score')) {
      return HttpResponse.json({
        id: 'chatcmpl-' + Date.now(),
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
      id: 'chatcmpl-' + Date.now(),
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
  // Webhook events - typically you verify signatures, not call APIs
  // But we can mock any Stripe API calls if needed
  http.get('https://api.stripe.com/v1/customers/:customerId', ({ params }) => {
    return HttpResponse.json({
      id: params['customerId'],
      object: 'customer',
      email: 'test@example.com',
      name: 'Test Customer',
      created: Date.now(),
    });
  }),
];

// =============================================================================
// Export all handlers
// =============================================================================

export const handlers = [
  ...hubspotHandlers,
  ...whatsappHandlers,
  ...openaiHandlers,
  ...stripeHandlers,
];
