import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

/**
 * ChatGPT Plugin Routes
 *
 * Provides endpoints required for ChatGPT Plugin integration:
 * - /.well-known/ai-plugin.json - Plugin manifest
 * - /openapi.json - OpenAPI specification
 * - /logo.png - Plugin logo (placeholder)
 */

/**
 * ChatGPT Plugin Manifest
 * @see https://platform.openai.com/docs/plugins/getting-started/plugin-manifest
 */
const pluginManifest = {
  schema_version: 'v1',
  name_for_human: 'MedicalCor',
  name_for_model: 'medicalcor',
  description_for_human:
    'Medical CRM and patient communication platform. Manage leads, appointments, and patient interactions for dental clinics.',
  description_for_model: `MedicalCor is a medical CRM API for dental clinics. Use this plugin to:
- Score and qualify leads based on message content
- Generate AI-powered replies to patient inquiries
- Search the medical knowledge base for treatment information, FAQs, and protocols
- Trigger patient journey workflows (appointment booking, follow-ups)
- Check patient history and conversation context

When using this plugin:
1. Always include clinicId when available for clinic-specific results
2. Use the lead scoring endpoint for new patient inquiries
3. Use the reply generation endpoint for follow-up messages
4. Search the knowledge base before generating custom responses

The API supports Romanian (ro), English (en), and German (de) languages.`,
  auth: {
    type: 'service_http',
    authorization_type: 'bearer',
    verification_tokens: {
      // SECURITY: Token is required in production - never use placeholder values
      openai: (() => {
        const token = process.env.CHATGPT_VERIFICATION_TOKEN;
        if (!token && process.env.NODE_ENV === 'production') {
          throw new Error('SECURITY: CHATGPT_VERIFICATION_TOKEN is required in production');
        }
        // In development, use empty string (disabled) instead of predictable placeholder
        return token ?? '';
      })(),
    },
  },
  api: {
    type: 'openapi',
    url: getApiUrl() + '/openapi.json',
  },
  logo_url: getApiUrl() + '/logo.png',
  contact_email: 'support@medicalcor.io',
  legal_info_url: 'https://medicalcor.io/terms',
};

/**
 * Get the API base URL based on environment
 */
function getApiUrl(): string {
  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL;
  }
  if (process.env.NODE_ENV === 'production') {
    return 'https://api.medicalcor.io';
  }
  const port = process.env.PORT ?? '3000';
  return `http://localhost:${port}`;
}

/**
 * ChatGPT Plugin Routes
 */
export const chatgptPluginRoutes: FastifyPluginAsync = async (
  fastify: FastifyInstance
): Promise<void> => {
  // Await is required by the FastifyPluginAsync type
  await Promise.resolve();
  /**
   * Plugin Manifest
   * Required by ChatGPT for plugin discovery
   */
  fastify.get('/.well-known/ai-plugin.json', {
    schema: {
      description: 'ChatGPT plugin manifest',
      tags: ['ChatGPT Plugin'],
      response: {
        200: {
          type: 'object',
          description: 'Plugin manifest JSON',
        },
      },
    },
    handler: async (_request, reply) => {
      // Update URL dynamically based on request host
      const manifest = {
        ...pluginManifest,
        api: {
          ...pluginManifest.api,
          url: getApiUrl() + '/openapi.json',
        },
        logo_url: getApiUrl() + '/logo.png',
      };

      return reply.header('Content-Type', 'application/json').send(manifest);
    },
  });

  /**
   * OpenAPI Specification
   * Returns the full OpenAPI spec for ChatGPT to understand the API
   * Uses Fastify's built-in swagger generation
   */
  fastify.get('/openapi.json', {
    schema: {
      description: 'OpenAPI 3.1.0 specification',
      tags: ['ChatGPT Plugin'],
      response: {
        200: {
          type: 'object',
          description: 'OpenAPI specification JSON',
        },
      },
    },
    handler: async (_request, reply) => {
      // Get the generated OpenAPI spec from Fastify Swagger
      const spec = fastify.swagger();
      return reply.header('Content-Type', 'application/json').send(spec);
    },
  });

  /**
   * Plugin Logo
   * Returns a placeholder SVG logo
   */
  fastify.get('/logo.png', {
    schema: {
      description: 'Plugin logo',
      tags: ['ChatGPT Plugin'],
      produces: ['image/svg+xml'],
    },
    handler: async (_request, reply) => {
      // SVG placeholder logo
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4F46E5"/>
      <stop offset="100%" style="stop-color:#7C3AED"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="64" fill="url(#bg)"/>
  <text x="256" y="280" font-family="Arial, sans-serif" font-size="200" font-weight="bold" fill="white" text-anchor="middle">M</text>
  <circle cx="380" cy="140" r="40" fill="#10B981"/>
  <path d="M365 140 L377 152 L395 128" stroke="white" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

      return reply.header('Content-Type', 'image/svg+xml').send(svg);
    },
  });

  /**
   * Plugin Privacy Policy
   * Simple privacy notice for the plugin
   */
  fastify.get('/privacy', {
    schema: {
      description: 'Privacy policy for ChatGPT plugin',
      tags: ['ChatGPT Plugin'],
      produces: ['text/html'],
    },
    handler: async (_request, reply) => {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MedicalCor Privacy Policy</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
    h1 { color: #4F46E5; }
    h2 { color: #6B7280; margin-top: 2rem; }
  </style>
</head>
<body>
  <h1>MedicalCor ChatGPT Plugin Privacy Policy</h1>
  <p>Last updated: ${new Date().toISOString().split('T')[0]}</p>

  <h2>Data Collection</h2>
  <p>When you use the MedicalCor ChatGPT plugin, we may collect:</p>
  <ul>
    <li>Query content sent through the plugin</li>
    <li>API usage metrics and logs</li>
    <li>Error reports for debugging purposes</li>
  </ul>

  <h2>Data Usage</h2>
  <p>Your data is used to:</p>
  <ul>
    <li>Process your queries and return relevant information</li>
    <li>Improve our services and AI responses</li>
    <li>Maintain security and prevent abuse</li>
  </ul>

  <h2>Data Retention</h2>
  <p>Query logs are retained for 30 days. Aggregated analytics may be retained longer.</p>

  <h2>Contact</h2>
  <p>For questions about this policy, contact: <a href="mailto:support@medicalcor.io">support@medicalcor.io</a></p>
</body>
</html>`;

      return reply.header('Content-Type', 'text/html').send(html);
    },
  });

  fastify.log.info(
    'ChatGPT Plugin routes registered: /.well-known/ai-plugin.json, /openapi.json, /logo.png, /privacy'
  );
};

export default chatgptPluginRoutes;
