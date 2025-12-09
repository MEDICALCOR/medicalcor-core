import type { FastifyPluginAsync, FastifyInstance } from 'fastify';

/**
 * API Documentation Portal
 *
 * Provides OpenAPI specification export in multiple formats
 * and a landing page with documentation links.
 */

interface OpenAPIInfo {
  title: string;
  version: string;
  description: string;
  contact?: {
    name?: string;
    email?: string;
    url?: string;
  };
  license?: {
    name: string;
    url?: string;
  };
}

interface OpenAPISpec {
  openapi: string;
  info: OpenAPIInfo;
  servers?: { url: string; description?: string }[];
  paths: Record<string, unknown>;
  components?: Record<string, unknown>;
  tags?: { name: string; description?: string }[];
}

/**
 * Convert OpenAPI spec to YAML format
 */
function toYaml(obj: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);

  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj === 'string') {
    // Check if string needs quoting
    if (
      obj.includes('\n') ||
      obj.includes(':') ||
      obj.includes('#') ||
      obj.startsWith(' ') ||
      obj.endsWith(' ') ||
      obj === '' ||
      /^[0-9]/.test(obj) ||
      ['true', 'false', 'null', 'yes', 'no'].includes(obj.toLowerCase())
    ) {
      // Use literal block style for multiline strings
      if (obj.includes('\n')) {
        const lines = obj.split('\n');
        return `|\n${lines.map((line) => spaces + '  ' + line).join('\n')}`;
      }
      // Quote other special strings
      return `"${obj.replace(/"/g, '\\"')}"`;
    }
    return obj;
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj
      .map((item) => {
        const value = toYaml(item, indent + 1);
        if (typeof item === 'object' && item !== null) {
          return `${spaces}- ${value.trim().replace(/^\s+/, '')}`;
        }
        return `${spaces}- ${value}`;
      })
      .join('\n');
  }

  // obj is an object at this point
  const entries = Object.entries(obj as Record<string, unknown>);
  if (entries.length === 0) return '{}';

  return entries
    .map(([key, value]) => {
      const yamlValue = toYaml(value, indent + 1);
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return `${spaces}${key}:\n${yamlValue}`;
      }
      if (Array.isArray(value) && value.length > 0) {
        return `${spaces}${key}:\n${yamlValue}`;
      }
      return `${spaces}${key}: ${yamlValue}`;
    })
    .join('\n');
}

/**
 * Get OpenAPI spec from Fastify instance
 */
function getOpenAPISpec(fastify: FastifyInstance): OpenAPISpec {
  // @fastify/swagger adds swagger property to fastify instance
  const swaggerFn = (fastify as unknown as { swagger?: () => OpenAPISpec }).swagger;

  if (typeof swaggerFn === 'function') {
    return swaggerFn();
  }

  // Fallback minimal spec if swagger plugin not available
  return {
    openapi: '3.1.0',
    info: {
      title: 'MedicalCor API',
      version: '1.0.0',
      description: 'Medical CRM & Patient Communication Platform API',
    },
    paths: {},
  };
}

/**
 * Generate HTML landing page for API documentation
 */
function generateDocsLandingPage(baseUrl: string, spec: OpenAPISpec): string {
  const endpointCount = Object.keys(spec.paths).length;
  const tags = spec.tags ?? [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${spec.info.title} - API Documentation</title>
  <style>
    :root {
      --primary: #2563eb;
      --primary-dark: #1d4ed8;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #1e293b;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --success: #10b981;
      --warning: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    header {
      text-align: center;
      margin-bottom: 3rem;
    }
    h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      color: var(--primary);
    }
    .version {
      display: inline-block;
      background: var(--primary);
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
    .description {
      color: var(--text-muted);
      max-width: 600px;
      margin: 0 auto;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
      margin-bottom: 3rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      transition: box-shadow 0.2s, transform 0.2s;
    }
    .card:hover {
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
      transform: translateY(-2px);
    }
    .card h3 {
      font-size: 1.25rem;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .card p {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-bottom: 1rem;
    }
    .card a {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--primary);
      text-decoration: none;
      font-weight: 500;
    }
    .card a:hover {
      color: var(--primary-dark);
      text-decoration: underline;
    }
    .stats {
      display: flex;
      justify-content: center;
      gap: 3rem;
      margin-bottom: 3rem;
      flex-wrap: wrap;
    }
    .stat {
      text-align: center;
    }
    .stat-value {
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--primary);
    }
    .stat-label {
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    .tags {
      margin-bottom: 3rem;
    }
    .tags h2 {
      margin-bottom: 1rem;
      font-size: 1.5rem;
    }
    .tag-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .tag {
      background: var(--card-bg);
      border: 1px solid var(--border);
      padding: 0.5rem 1rem;
      border-radius: 8px;
      font-size: 0.875rem;
      color: var(--text);
    }
    .auth-info {
      background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%);
      color: white;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 3rem;
    }
    .auth-info h2 {
      margin-bottom: 0.75rem;
    }
    .auth-info code {
      background: rgba(255,255,255,0.2);
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-family: 'Monaco', 'Consolas', monospace;
    }
    footer {
      text-align: center;
      color: var(--text-muted);
      font-size: 0.875rem;
      padding-top: 2rem;
      border-top: 1px solid var(--border);
    }
    .icon {
      width: 24px;
      height: 24px;
    }
    @media (max-width: 640px) {
      body { padding: 1rem; }
      h1 { font-size: 1.75rem; }
      .stats { gap: 1.5rem; }
      .stat-value { font-size: 2rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🏥 ${spec.info.title}</h1>
      <span class="version">v${spec.info.version}</span>
      <p class="description">${spec.info.description.split('\n')[0]}</p>
    </header>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">${endpointCount}</div>
        <div class="stat-label">Endpoints</div>
      </div>
      <div class="stat">
        <div class="stat-value">${tags.length}</div>
        <div class="stat-label">Categories</div>
      </div>
      <div class="stat">
        <div class="stat-value">3.1</div>
        <div class="stat-label">OpenAPI Version</div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h3>📖 Interactive Docs</h3>
        <p>Explore and test the API with Swagger UI. Try requests directly from your browser.</p>
        <a href="${baseUrl}/docs">Open Swagger UI →</a>
      </div>

      <div class="card">
        <h3>📄 OpenAPI JSON</h3>
        <p>Download the complete OpenAPI 3.1 specification in JSON format for code generation.</p>
        <a href="${baseUrl}/api-docs/openapi.json" download="medicalcor-openapi.json">Download JSON →</a>
      </div>

      <div class="card">
        <h3>📋 OpenAPI YAML</h3>
        <p>Download the specification in YAML format, ideal for documentation tools.</p>
        <a href="${baseUrl}/api-docs/openapi.yaml" download="medicalcor-openapi.yaml">Download YAML →</a>
      </div>

      <div class="card">
        <h3>🔧 Postman Collection</h3>
        <p>Import the API directly into Postman for testing and development.</p>
        <a href="${baseUrl}/api-docs/postman" download="medicalcor-postman.json">Download Collection →</a>
      </div>
    </div>

    <div class="auth-info">
      <h2>🔐 Authentication</h2>
      <p>Most endpoints require API key authentication. Include your API key in the request header:</p>
      <p style="margin-top: 0.75rem;"><code>X-API-Key: your-api-key-here</code></p>
    </div>

    ${
      tags.length > 0
        ? `
    <div class="tags">
      <h2>📂 API Categories</h2>
      <div class="tag-grid">
        ${tags.map((tag) => `<span class="tag">${tag.name}</span>`).join('\n        ')}
      </div>
    </div>
    `
        : ''
    }

    <footer>
      <p>MedicalCor API Documentation Portal</p>
      <p style="margin-top: 0.5rem;">
        ${spec.info.contact?.email ? `Contact: ${spec.info.contact.email}` : ''}
      </p>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Convert OpenAPI spec to Postman Collection v2.1 format
 */
function toPostmanCollection(spec: OpenAPISpec, baseUrl: string): object {
  const items: {
    name: string;
    request: {
      method: string;
      header: { key: string; value: string; type: string }[];
      url: { raw: string; host: string[]; path: string[] };
      body?: { mode: string; raw: string; options: { raw: { language: string } } };
      description?: string;
    };
  }[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    for (const [method, operation] of Object.entries(pathItem as Record<string, unknown>)) {
      if (!operation || typeof operation !== 'object') continue;
      const op = operation as {
        summary?: string;
        description?: string;
        requestBody?: { content?: { 'application/json'?: { schema?: { example?: unknown } } } };
      };

      const pathParts = path.split('/').filter(Boolean);
      const url = `${baseUrl}${path}`;

      const item: (typeof items)[0] = {
        name: op.summary ?? `${method.toUpperCase()} ${path}`,
        request: {
          method: method.toUpperCase(),
          header: [
            { key: 'Content-Type', value: 'application/json', type: 'text' },
            { key: 'X-API-Key', value: '{{api_key}}', type: 'text' },
          ],
          url: {
            raw: url,
            host: [baseUrl],
            path: pathParts,
          },
        },
      };

      if (op.description) {
        item.request.description = op.description;
      }

      // Add example body for POST/PUT/PATCH requests
      if (['post', 'put', 'patch'].includes(method)) {
        const exampleBody = op.requestBody?.content?.['application/json']?.schema?.example;
        if (exampleBody) {
          item.request.body = {
            mode: 'raw',
            raw: JSON.stringify(exampleBody, null, 2),
            options: { raw: { language: 'json' } },
          };
        }
      }

      items.push(item);
    }
  }

  // Group items by tag
  const tagGroups: Record<string, typeof items> = {};
  for (const item of items) {
    // Extract tag from path (first segment after /)
    const pathMatch = /\/([^/]+)/.exec(item.request.url.raw);
    const tag = pathMatch?.[1] ?? 'Other';
    tagGroups[tag] ??= [];
    tagGroups[tag].push(item);
  }

  return {
    info: {
      name: spec.info.title,
      description: spec.info.description,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: Object.entries(tagGroups).map(([name, groupItems]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      item: groupItems,
    })),
    variable: [
      {
        key: 'baseUrl',
        value: baseUrl,
        type: 'string',
      },
      {
        key: 'api_key',
        value: '',
        type: 'string',
      },
    ],
  };
}

export const apiDocsRoutes: FastifyPluginAsync = async (fastify) => {
  const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3000';

  /**
   * GET /api-docs
   *
   * Landing page for API documentation with links to all formats.
   */
  fastify.get(
    '/api-docs',
    {
      schema: {
        description: 'API Documentation Portal landing page',
        tags: ['Documentation'],
        response: {
          200: {
            description: 'HTML landing page',
            type: 'string',
          },
        },
      },
    },
    async (_request, reply) => {
      const spec = getOpenAPISpec(fastify);
      const html = generateDocsLandingPage(baseUrl, spec);

      return reply.type('text/html').send(html);
    }
  );

  /**
   * GET /api-docs/openapi.json
   *
   * Returns the complete OpenAPI specification in JSON format.
   */
  fastify.get(
    '/api-docs/openapi.json',
    {
      schema: {
        description: 'OpenAPI 3.1 specification in JSON format',
        tags: ['Documentation'],
        response: {
          200: {
            description: 'OpenAPI specification',
            type: 'object',
          },
        },
      },
    },
    async (_request, reply) => {
      const spec = getOpenAPISpec(fastify);

      return reply
        .header('Content-Disposition', 'attachment; filename="medicalcor-openapi.json"')
        .type('application/json')
        .send(spec);
    }
  );

  /**
   * GET /api-docs/openapi.yaml
   *
   * Returns the complete OpenAPI specification in YAML format.
   */
  fastify.get(
    '/api-docs/openapi.yaml',
    {
      schema: {
        description: 'OpenAPI 3.1 specification in YAML format',
        tags: ['Documentation'],
        response: {
          200: {
            description: 'OpenAPI specification in YAML',
            type: 'string',
          },
        },
      },
    },
    async (_request, reply) => {
      const spec = getOpenAPISpec(fastify);
      const yaml = `# OpenAPI Specification for ${spec.info.title}\n# Version: ${spec.info.version}\n# Generated: ${new Date().toISOString()}\n\n${toYaml(spec)}`;

      return reply
        .header('Content-Disposition', 'attachment; filename="medicalcor-openapi.yaml"')
        .type('text/yaml')
        .send(yaml);
    }
  );

  /**
   * GET /api-docs/postman
   *
   * Returns a Postman Collection for the API.
   */
  fastify.get(
    '/api-docs/postman',
    {
      schema: {
        description: 'Postman Collection v2.1 export',
        tags: ['Documentation'],
        response: {
          200: {
            description: 'Postman Collection JSON',
            type: 'object',
          },
        },
      },
    },
    async (_request, reply) => {
      const spec = getOpenAPISpec(fastify);
      const collection = toPostmanCollection(spec, baseUrl);

      return reply
        .header('Content-Disposition', 'attachment; filename="medicalcor-postman.json"')
        .type('application/json')
        .send(collection);
    }
  );

  /**
   * GET /api-docs/stats
   *
   * Returns API statistics and summary.
   */
  fastify.get(
    '/api-docs/stats',
    {
      schema: {
        description: 'API documentation statistics',
        tags: ['Documentation'],
        response: {
          200: {
            description: 'API statistics',
            type: 'object',
            properties: {
              title: { type: 'string' },
              version: { type: 'string' },
              endpointCount: { type: 'number' },
              tagCount: { type: 'number' },
              methods: {
                type: 'object',
                additionalProperties: { type: 'number' },
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      },
    },
    () => {
      const spec = getOpenAPISpec(fastify);
      const methods: Record<string, number> = {};

      for (const pathItem of Object.values(spec.paths)) {
        if (!pathItem || typeof pathItem !== 'object') continue;
        for (const method of Object.keys(pathItem as Record<string, unknown>)) {
          const upperMethod = method.toUpperCase();
          methods[upperMethod] = (methods[upperMethod] ?? 0) + 1;
        }
      }

      return {
        title: spec.info.title,
        version: spec.info.version,
        endpointCount: Object.keys(spec.paths).length,
        tagCount: spec.tags?.length ?? 0,
        methods,
        tags: spec.tags?.map((t) => t.name) ?? [],
      };
    }
  );
};
