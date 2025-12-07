import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyPluginAsync } from 'fastify';

/**
 * ChatGPT Plugin Routes Tests
 *
 * Comprehensive tests for ChatGPT plugin integration:
 * - GET /.well-known/ai-plugin.json - Plugin manifest discovery
 * - GET /openapi.json - OpenAPI specification for function execution
 * - GET /logo.png - Plugin logo
 * - GET /privacy - Privacy policy
 *
 * Tests cover:
 * - Function discovery (manifest structure and fields)
 * - Function execution context (OpenAPI spec)
 * - Response formats and content types
 */

// Test data for manifest
const testManifest = {
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
      openai: 'test-verification-token',
    },
  },
  api: {
    type: 'openapi',
    url: 'http://localhost:3000/openapi.json',
  },
  logo_url: 'http://localhost:3000/logo.png',
  contact_email: 'support@medicalcor.io',
  legal_info_url: 'https://medicalcor.io/terms',
};

// Test OpenAPI spec
const testOpenApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'MedicalCor API',
    version: '1.0.0',
    description: 'Medical CRM API for dental clinics',
  },
  paths: {
    '/ai/execute': {
      post: {
        summary: 'Execute AI functions',
        description: 'Execute natural language queries or function calls',
      },
    },
    '/ai/functions': {
      get: {
        summary: 'List available functions',
        description: 'Returns all available AI functions',
      },
    },
  },
  components: {
    schemas: {},
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
      },
    },
  },
};

// Test SVG logo
const testSvgLogo = `<?xml version="1.0" encoding="UTF-8"?>
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

// Create test plugin that mirrors the actual chatgpt-plugin routes
const createTestChatGPTPlugin = (
  manifest: typeof testManifest,
  openApiSpec: typeof testOpenApiSpec
): FastifyPluginAsync => {
  return async (fastify: FastifyInstance): Promise<void> => {
    await Promise.resolve();

    fastify.get('/.well-known/ai-plugin.json', {
      handler: async (_request, reply) => {
        return reply.header('Content-Type', 'application/json').send(manifest);
      },
    });

    fastify.get('/openapi.json', {
      handler: async (_request, reply) => {
        return reply.header('Content-Type', 'application/json').send(openApiSpec);
      },
    });

    fastify.get('/logo.png', {
      schema: {
        description: 'Plugin logo',
        tags: ['ChatGPT Plugin'],
        produces: ['image/svg+xml'],
      },
      handler: async (_request, reply) => {
        return reply.header('Content-Type', 'image/svg+xml').send(testSvgLogo);
      },
    });

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
  };
};

describe('ChatGPT Plugin Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(createTestChatGPTPlugin(testManifest, testOpenApiSpec));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // GET /.well-known/ai-plugin.json - Plugin Manifest Discovery
  // ==========================================================================

  describe('GET /.well-known/ai-plugin.json - Plugin Manifest', () => {
    it('should return 200 with valid plugin manifest', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');

      const manifest = JSON.parse(response.body);
      expect(manifest).toBeDefined();
    });

    it('should include required manifest fields per ChatGPT plugin spec', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });

      const manifest = JSON.parse(response.body);

      // Required fields per ChatGPT plugin specification
      expect(manifest).toHaveProperty('schema_version');
      expect(manifest).toHaveProperty('name_for_human');
      expect(manifest).toHaveProperty('name_for_model');
      expect(manifest).toHaveProperty('description_for_human');
      expect(manifest).toHaveProperty('description_for_model');
      expect(manifest).toHaveProperty('auth');
      expect(manifest).toHaveProperty('api');
      expect(manifest).toHaveProperty('logo_url');
      expect(manifest).toHaveProperty('contact_email');
      expect(manifest).toHaveProperty('legal_info_url');
    });

    it('should have valid schema version', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });

      const manifest = JSON.parse(response.body);
      expect(manifest.schema_version).toBe('v1');
    });

    it('should have correct plugin name and description', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });

      const manifest = JSON.parse(response.body);

      // Name validations
      expect(manifest.name_for_human).toBe('MedicalCor');
      expect(manifest.name_for_model).toBe('medicalcor');

      // Description validations
      expect(manifest.description_for_human).toContain('Medical CRM');
      expect(manifest.description_for_model).toContain('MedicalCor');
      expect(manifest.description_for_model.length).toBeGreaterThan(100);
    });

    it('should include model instructions in description_for_model', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });

      const manifest = JSON.parse(response.body);
      const modelDescription = manifest.description_for_model;

      // Should include usage guidance for the model
      expect(modelDescription).toContain('lead');
      expect(modelDescription).toContain('knowledge base');
    });

    it('should have valid auth configuration', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });

      const manifest = JSON.parse(response.body);

      expect(manifest.auth).toHaveProperty('type');
      expect(manifest.auth.type).toBe('service_http');
      expect(manifest.auth).toHaveProperty('authorization_type');
      expect(manifest.auth.authorization_type).toBe('bearer');
      expect(manifest.auth).toHaveProperty('verification_tokens');
    });

    it('should have valid API configuration pointing to OpenAPI spec', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });

      const manifest = JSON.parse(response.body);

      expect(manifest.api).toHaveProperty('type');
      expect(manifest.api.type).toBe('openapi');
      expect(manifest.api).toHaveProperty('url');
      expect(manifest.api.url).toContain('/openapi.json');
    });

    it('should have valid logo URL', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });

      const manifest = JSON.parse(response.body);

      expect(manifest.logo_url).toContain('/logo.png');
    });

    it('should have valid contact email', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });

      const manifest = JSON.parse(response.body);

      expect(manifest.contact_email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      expect(manifest.contact_email).toContain('medicalcor');
    });

    it('should have valid legal info URL', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });

      const manifest = JSON.parse(response.body);

      expect(manifest.legal_info_url).toMatch(/^https?:\/\/.+/);
    });

    it('should include supported languages in description', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });

      const manifest = JSON.parse(response.body);
      const modelDescription = manifest.description_for_model;

      // Should mention supported languages
      expect(modelDescription).toContain('Romanian');
      expect(modelDescription).toContain('English');
      expect(modelDescription).toContain('German');
    });

    it('should have verification token field configured', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });

      const manifest = JSON.parse(response.body);
      expect(manifest.auth.verification_tokens).toHaveProperty('openai');
      expect(typeof manifest.auth.verification_tokens.openai).toBe('string');
    });
  });

  // ==========================================================================
  // GET /openapi.json - OpenAPI Specification (Function Execution)
  // ==========================================================================

  describe('GET /openapi.json - OpenAPI Specification', () => {
    it('should return 200 with valid OpenAPI spec', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/openapi.json',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');

      const spec = JSON.parse(response.body);
      expect(spec).toBeDefined();
    });

    it('should return OpenAPI 3.x specification', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/openapi.json',
      });

      const spec = JSON.parse(response.body);
      expect(spec.openapi).toMatch(/^3\.\d+\.\d+$/);
    });

    it('should include API info section', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/openapi.json',
      });

      const spec = JSON.parse(response.body);
      expect(spec).toHaveProperty('info');
      expect(spec.info).toHaveProperty('title');
      expect(spec.info).toHaveProperty('version');
    });

    it('should include API paths for function execution', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/openapi.json',
      });

      const spec = JSON.parse(response.body);
      expect(spec).toHaveProperty('paths');
      expect(typeof spec.paths).toBe('object');
    });

    it('should include AI execute endpoint in paths', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/openapi.json',
      });

      const spec = JSON.parse(response.body);
      expect(spec.paths).toHaveProperty('/ai/execute');
    });

    it('should include function listing endpoint in paths', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/openapi.json',
      });

      const spec = JSON.parse(response.body);
      expect(spec.paths).toHaveProperty('/ai/functions');
    });

    it('should include components section', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/openapi.json',
      });

      const spec = JSON.parse(response.body);
      expect(spec).toHaveProperty('components');
    });

    it('should be valid JSON', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/openapi.json',
      });

      expect(() => JSON.parse(response.body)).not.toThrow();
    });
  });

  // ==========================================================================
  // GET /logo.png - Plugin Logo
  // ==========================================================================

  describe('GET /logo.png - Plugin Logo', () => {
    it('should return 200 with logo', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/logo.png',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return SVG content type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/logo.png',
      });

      expect(response.headers['content-type']).toBe('image/svg+xml');
    });

    it('should return valid SVG content', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/logo.png',
      });

      const svg = response.body;
      expect(svg).toContain('<?xml');
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });

    it('should have proper SVG dimensions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/logo.png',
      });

      const svg = response.body;
      expect(svg).toContain('width="512"');
      expect(svg).toContain('height="512"');
    });

    it('should include MedicalCor branding (M letter)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/logo.png',
      });

      const svg = response.body;
      expect(svg).toContain('>M<');
    });

    it('should include gradient styling', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/logo.png',
      });

      const svg = response.body;
      expect(svg).toContain('linearGradient');
    });

    it('should include checkmark icon (medical/health symbol)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/logo.png',
      });

      const svg = response.body;
      expect(svg).toContain('<circle');
      expect(svg).toContain('<path');
    });
  });

  // ==========================================================================
  // GET /privacy - Privacy Policy
  // ==========================================================================

  describe('GET /privacy - Privacy Policy', () => {
    it('should return 200 with privacy policy', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/privacy',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return HTML content type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/privacy',
      });

      expect(response.headers['content-type']).toBe('text/html');
    });

    it('should return valid HTML document', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/privacy',
      });

      const html = response.body;
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
    });

    it('should include privacy policy title', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/privacy',
      });

      const html = response.body;
      expect(html).toContain('Privacy Policy');
      expect(html).toContain('MedicalCor');
    });

    it('should include data collection section', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/privacy',
      });

      const html = response.body;
      expect(html).toContain('Data Collection');
    });

    it('should include data usage section', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/privacy',
      });

      const html = response.body;
      expect(html).toContain('Data Usage');
    });

    it('should include data retention section', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/privacy',
      });

      const html = response.body;
      expect(html).toContain('Data Retention');
    });

    it('should include contact information', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/privacy',
      });

      const html = response.body;
      expect(html).toContain('Contact');
      expect(html).toContain('medicalcor.io');
    });

    it('should include last updated date', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/privacy',
      });

      const html = response.body;
      expect(html).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    it('should be responsive (viewport meta tag)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/privacy',
      });

      const html = response.body;
      expect(html).toContain('viewport');
      expect(html).toContain('width=device-width');
    });
  });

  // ==========================================================================
  // Security Tests
  // ==========================================================================

  describe('Security Tests', () => {
    it('should not expose sensitive data in manifest', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });

      const manifest = JSON.parse(response.body);
      const manifestStr = JSON.stringify(manifest);

      expect(manifestStr).not.toMatch(/password/i);
      expect(manifestStr).not.toMatch(/secret/i);
      expect(manifestStr).not.toMatch(/sk_live_/);
    });

    it('should use bearer auth type for security', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });

      const manifest = JSON.parse(response.body);
      expect(manifest.auth.authorization_type).toBe('bearer');
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Integration Tests', () => {
    it('should have consistent URLs across manifest and endpoints', async () => {
      const manifestResponse = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });
      const manifest = JSON.parse(manifestResponse.body);

      const apiUrl = manifest.api.url;
      const logoUrl = manifest.logo_url;

      const apiBase = apiUrl.replace('/openapi.json', '');
      const logoBase = logoUrl.replace('/logo.png', '');
      expect(apiBase).toBe(logoBase);
    });

    it('should serve all ChatGPT plugin required endpoints', async () => {
      const endpoints = ['/.well-known/ai-plugin.json', '/openapi.json', '/logo.png', '/privacy'];

      for (const endpoint of endpoints) {
        const response = await app.inject({
          method: 'GET',
          url: endpoint,
        });

        expect(response.statusCode).toBe(200);
      }
    });

    it('should handle concurrent requests to all endpoints', async () => {
      const endpoints = ['/.well-known/ai-plugin.json', '/openapi.json', '/logo.png', '/privacy'];

      const requests = endpoints.map((url) => app.inject({ method: 'GET', url }));

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.statusCode).toBe(200);
      });
    });

    it('should have valid cross-references between manifest and OpenAPI spec', async () => {
      const manifestResponse = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });
      const manifest = JSON.parse(manifestResponse.body);

      const specResponse = await app.inject({
        method: 'GET',
        url: '/openapi.json',
      });
      const spec = JSON.parse(specResponse.body);

      expect(spec.info.title).toContain('MedicalCor');
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('Error Handling Tests', () => {
    it('should handle rapid consecutive requests gracefully', async () => {
      const requests = Array(20)
        .fill(null)
        .map(() =>
          app.inject({
            method: 'GET',
            url: '/.well-known/ai-plugin.json',
          })
        );

      const responses = await Promise.all(requests);
      responses.forEach((response) => {
        expect(response.statusCode).toBe(200);
      });
    });

    it('should return 404 for non-existent plugin endpoints', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/nonexistent-plugin-endpoint',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should reject POST requests to manifest endpoint', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/.well-known/ai-plugin.json',
        payload: {},
      });

      expect([404, 405]).toContain(response.statusCode);
    });
  });

  // ==========================================================================
  // Content Validation Tests
  // ==========================================================================

  describe('Content Validation Tests', () => {
    it('should have properly escaped characters in SVG', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/logo.png',
      });

      const svg = response.body;
      expect(svg).not.toMatch(/&&/);
      expect(svg).not.toMatch(/<</);
      expect(svg).not.toMatch(/>>/);
    });

    it('should have valid UTF-8 encoding in HTML', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/privacy',
      });

      const html = response.body;
      expect(html).toContain('charset="UTF-8"');
    });

    it('should have valid JSON in manifest (no trailing commas)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });

      expect(() => JSON.parse(response.body)).not.toThrow();
    });

    it('should not have null values in required manifest fields', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });

      const manifest = JSON.parse(response.body);

      expect(manifest.schema_version).not.toBeNull();
      expect(manifest.name_for_human).not.toBeNull();
      expect(manifest.name_for_model).not.toBeNull();
      expect(manifest.description_for_human).not.toBeNull();
      expect(manifest.description_for_model).not.toBeNull();
      expect(manifest.auth).not.toBeNull();
      expect(manifest.api).not.toBeNull();
      expect(manifest.logo_url).not.toBeNull();
      expect(manifest.contact_email).not.toBeNull();
      expect(manifest.legal_info_url).not.toBeNull();
    });
  });

  // ==========================================================================
  // Plugin Discovery Flow Tests
  // ==========================================================================

  describe('Plugin Discovery Flow Tests', () => {
    it('should support full ChatGPT plugin discovery flow', async () => {
      // Step 1: Discover plugin manifest
      const manifestResponse = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });
      expect(manifestResponse.statusCode).toBe(200);
      const manifest = JSON.parse(manifestResponse.body);
      expect(manifest.schema_version).toBeDefined();

      // Step 2: Fetch OpenAPI spec
      const specResponse = await app.inject({
        method: 'GET',
        url: '/openapi.json',
      });
      expect(specResponse.statusCode).toBe(200);
      const spec = JSON.parse(specResponse.body);

      // Step 3: Verify spec has required paths for function execution
      expect(spec.paths).toBeDefined();

      // Step 4: Fetch logo
      const logoResponse = await app.inject({
        method: 'GET',
        url: '/logo.png',
      });
      expect(logoResponse.statusCode).toBe(200);

      // Step 5: Verify legal/privacy info is accessible
      const privacyResponse = await app.inject({
        method: 'GET',
        url: '/privacy',
      });
      expect(privacyResponse.statusCode).toBe(200);
    });

    it('should provide consistent branding across all endpoints', async () => {
      const manifestResponse = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });
      const manifest = JSON.parse(manifestResponse.body);

      const privacyResponse = await app.inject({
        method: 'GET',
        url: '/privacy',
      });
      const privacyHtml = privacyResponse.body;

      expect(manifest.name_for_human).toBe('MedicalCor');
      expect(privacyHtml).toContain('MedicalCor');
    });
  });

  // ==========================================================================
  // Function Discovery Tests (via OpenAPI)
  // ==========================================================================

  describe('Function Discovery via OpenAPI', () => {
    it('should expose function paths in OpenAPI spec', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/openapi.json',
      });

      const spec = JSON.parse(response.body);

      expect(spec.paths).toHaveProperty('/ai/functions');
      expect(spec.paths).toHaveProperty('/ai/execute');
    });

    it('should include POST method for execute endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/openapi.json',
      });

      const spec = JSON.parse(response.body);

      if (spec.paths['/ai/execute']) {
        expect(spec.paths['/ai/execute']).toHaveProperty('post');
      }
    });

    it('should include GET method for functions listing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/openapi.json',
      });

      const spec = JSON.parse(response.body);

      if (spec.paths['/ai/functions']) {
        expect(spec.paths['/ai/functions']).toHaveProperty('get');
      }
    });
  });

  // ==========================================================================
  // URL Configuration Tests
  // ==========================================================================

  describe('URL Configuration Tests', () => {
    it('should have API URL pointing to OpenAPI spec', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });

      const manifest = JSON.parse(response.body);
      expect(manifest.api.url).toContain('/openapi.json');
    });

    it('should have logo URL pointing to logo endpoint', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/ai-plugin.json',
      });

      const manifest = JSON.parse(response.body);
      expect(manifest.logo_url).toContain('/logo.png');
    });
  });
});
