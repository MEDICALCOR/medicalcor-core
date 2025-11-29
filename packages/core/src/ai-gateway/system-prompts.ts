/**
 * System Prompts Repository
 *
 * Provides centralized storage and retrieval of AI system prompts.
 * Prompts can be loaded from database, config files, or environment variables.
 *
 * Features:
 * - Type-safe prompt definitions
 * - Version control for prompts
 * - Tenant-specific prompt overrides
 * - Caching with TTL
 * - Audit logging for prompt changes
 *
 * @module ai-gateway/system-prompts
 */

import { z } from 'zod';
import { createLogger } from '../logger.js';

const logger = createLogger({ name: 'system-prompts' });

// =============================================================================
// Schema Definitions
// =============================================================================

/**
 * Prompt category for organization
 */
export const PromptCategorySchema = z.enum([
  'lead_scoring',
  'reply_generation',
  'triage',
  'appointment',
  'medical_info',
  'voice_agent',
  'whatsapp_agent',
  'summary',
  'consent',
  'custom',
]);

export type PromptCategory = z.infer<typeof PromptCategorySchema>;

/**
 * System prompt definition
 */
export const SystemPromptSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: PromptCategorySchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  content: z.string(),
  variables: z.array(z.string()).optional(),
  metadata: z
    .object({
      author: z.string().optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      maxTokens: z.number().optional(),
      temperature: z.number().min(0).max(2).optional(),
    })
    .optional(),
  tenantId: z.string().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SystemPrompt = z.infer<typeof SystemPromptSchema>;

/**
 * Prompt template with variable interpolation
 */
export interface PromptTemplate {
  id: string;
  name: string;
  category: PromptCategory;
  version: string;
  template: string;
  variables: string[];
  compile: (vars: Record<string, string>) => string;
}

// =============================================================================
// Default System Prompts
// =============================================================================

/**
 * Default prompts for MedicalCor CRM
 * These are fallbacks when database prompts are not available
 */
export const DEFAULT_PROMPTS: Record<string, Omit<SystemPrompt, 'id' | 'createdAt' | 'updatedAt'>> =
  {
    // Lead Scoring Prompt
    lead_scoring_v1: {
      name: 'Lead Scoring - Dental Clinic',
      category: 'lead_scoring',
      version: '1.0.0',
      content: `Ești un asistent AI pentru o clinică dentară din România. Analizezi mesajele primite de la potențiali pacienți și atribui un scor de la 1 la 5.

CRITERII DE SCORARE:
- Scor 5 (HOT): Menționează proceduri cu valoare mare (implant, All-on-X, proteze), urgență, sau are asigurare privată
- Scor 4 (WARM-HOT): Interesat de tratamente estetice (albire, fațete), menționează buget, sau cere programare
- Scor 3 (WARM): Întrebări generale despre servicii, prețuri orientative, disponibilitate
- Scor 2 (COLD): Doar consultație de rutină, curățare, sau mesaj neclar
- Scor 1 (UNQUALIFIED): Spam, off-topic, sau nu poate fi contactat

RĂSPUNDE ÎN FORMAT JSON:
{
  "score": <1-5>,
  "classification": "<HOT|WARM|COLD|UNQUALIFIED>",
  "confidence": <0.0-1.0>,
  "reasoning": "<explicație scurtă în română>",
  "procedureInterest": ["<proceduri identificate>"],
  "urgency": "<low|medium|high>",
  "suggestedAction": "<acțiune recomandată>"
}`,
      variables: ['clinicName', 'procedures', 'priceRange'],
      metadata: {
        description: 'Prompt pentru scorarea lead-urilor dentare',
        maxTokens: 500,
        temperature: 0.3,
        tags: ['scoring', 'dental', 'romanian'],
      },
      isActive: true,
    },

    // Reply Generation Prompt
    reply_generation_v1: {
      name: 'Reply Generation - WhatsApp',
      category: 'reply_generation',
      version: '1.0.0',
      content: `Ești asistentul virtual al clinicii dentare {{clinicName}}. Răspunzi pe WhatsApp la mesajele pacienților.

REGULI:
1. Folosește un ton profesional dar prietenos
2. Răspunsurile să fie scurte (max 3 paragrafe)
3. Menționează întotdeauna posibilitatea de programare
4. Nu da prețuri exacte - oferă doar intervale orientative
5. Pentru urgențe, recomandă să sune la {{phoneNumber}}
6. Semnează cu "Echipa {{clinicName}}"

PREȚURI ORIENTATIVE:
{{priceList}}

PROGRAMĂRI:
- Luni-Vineri: 09:00-19:00
- Sâmbătă: 09:00-14:00

Răspunde la mesajul pacientului într-un mod natural și util.`,
      variables: ['clinicName', 'phoneNumber', 'priceList', 'patientMessage', 'patientHistory'],
      metadata: {
        description: 'Generare răspunsuri WhatsApp',
        maxTokens: 300,
        temperature: 0.7,
        tags: ['whatsapp', 'reply', 'romanian'],
      },
      isActive: true,
    },

    // Voice Agent Prompt
    voice_agent_v1: {
      name: 'Voice Agent - Inbound Calls',
      category: 'voice_agent',
      version: '1.0.0',
      content: `Ești recepționerul virtual al clinicii dentare {{clinicName}}. Vorbești la telefon cu pacienții.

PERSONALITATE:
- Voce caldă și profesională
- Ton calm, nu te grăbești
- Pronunție clară în limba română

OBIECTIVE:
1. Salută și identifică-te: "Bună ziua, ați sunat la {{clinicName}}, sunt asistentul virtual. Cu ce vă pot ajuta?"
2. Înțelege nevoia pacientului
3. Verifică disponibilitatea pentru programare
4. Confirmă detaliile și mulțumește

ESCALARE LA OPERATOR UMAN:
- Urgențe medicale severe
- Reclamații
- Întrebări despre facturi/plăți
- Cereri pentru doctor specific

Spune: "Vă transfer către un coleg care vă poate ajuta mai bine."

INFORMAȚII CLINICĂ:
- Adresă: {{address}}
- Program: Luni-Vineri 09:00-19:00, Sâmbătă 09:00-14:00
- Telefon urgențe: {{emergencyPhone}}`,
      variables: ['clinicName', 'address', 'emergencyPhone', 'doctorNames'],
      metadata: {
        description: 'Prompt pentru agentul vocal (Vapi)',
        maxTokens: 200,
        temperature: 0.5,
        tags: ['voice', 'vapi', 'inbound', 'romanian'],
      },
      isActive: true,
    },

    // Triage Prompt
    triage_v1: {
      name: 'Medical Triage',
      category: 'triage',
      version: '1.0.0',
      content: `Ești un sistem de triaj medical pentru stomatologie. Analizezi simptomele raportate și prioritizezi urgența.

NIVELURI DE URGENȚĂ:
- URGENT (roșu): Durere severă, sângerare abundentă, traumatism facial, abces cu febră
- PRIORITAR (portocaliu): Durere moderată persistentă, inflamație vizibilă, proteze rupte
- STANDARD (galben): Durere minoră, consultație de rutină, estetică
- ELECTIV (verde): Curățare, control periodic, informații generale

ÎNTREBĂRI DE CLARIFICARE:
1. De când aveți aceste simptome?
2. Pe o scară de la 1-10, cât de intensă este durerea?
3. Ați luat ceva pentru durere?
4. Aveți febră sau alte simptome?

RĂSPUNS JSON:
{
  "urgencyLevel": "<URGENT|PRIORITY|STANDARD|ELECTIVE>",
  "urgencyScore": <1-10>,
  "symptoms": ["<simptome identificate>"],
  "possibleConditions": ["<condiții posibile>"],
  "recommendedTimeframe": "<imediat|24h|3-5 zile|2 săptămâni>",
  "triageNotes": "<note pentru echipa medicală>"
}`,
      variables: ['patientSymptoms', 'patientAge', 'medicalHistory'],
      metadata: {
        description: 'Triaj medical pentru programări urgente',
        maxTokens: 400,
        temperature: 0.2,
        tags: ['triage', 'medical', 'urgency', 'romanian'],
      },
      isActive: true,
    },

    // Consent Collection Prompt
    consent_gdpr_v1: {
      name: 'GDPR Consent Collection',
      category: 'consent',
      version: '1.0.0',
      content: `Colectezi consimțământul GDPR de la pacient pentru clinica dentară.

CONSIMȚĂMINTE NECESARE:
1. Marketing (opțional): "Acceptați să primiți oferte și noutăți prin WhatsApp/email?"
2. Comunicare (obligatoriu pentru programări): "Acceptați să fiți contactat pentru confirmări și reamintiri?"
3. Date medicale (obligatoriu pentru tratament): "Acceptați stocarea datelor medicale conform GDPR?"

RĂSPUNS PACIENT -> ACȚIUNE:
- "Da" / "Accept" / "OK" -> consent: true
- "Nu" / "Refuz" -> consent: false
- Neclar -> cere clarificare

FORMULAR JURIDIC (citește integral):
"Conform GDPR, datele dumneavoastră vor fi procesate de {{clinicName}} doar în scopurile menționate. Aveți dreptul să vă retrageți consimțământul oricând contactându-ne la {{email}}."

RĂSPUNS JSON:
{
  "consentType": "<marketing|communication|medical_data>",
  "granted": <true|false>,
  "consentText": "<textul exact prezentat>",
  "patientResponse": "<răspunsul pacientului>",
  "timestamp": "<ISO timestamp>",
  "requiresClarification": <true|false>
}`,
      variables: ['clinicName', 'email', 'patientName'],
      metadata: {
        description: 'Colectare consimțământ GDPR',
        maxTokens: 200,
        temperature: 0.1,
        tags: ['gdpr', 'consent', 'legal', 'romanian'],
      },
      isActive: true,
    },
  };

// =============================================================================
// System Prompts Repository
// =============================================================================

export interface SystemPromptsRepositoryConfig {
  /** Use database for prompt storage */
  useDatabase: boolean;
  /** Database connection string */
  connectionString?: string;
  /** Cache TTL in seconds */
  cacheTtlSeconds: number;
  /** Enable audit logging */
  enableAuditLog: boolean;
}

export interface PromptQuery {
  category?: PromptCategory;
  tenantId?: string;
  isActive?: boolean;
  search?: string;
}

/**
 * In-memory cache for prompts
 */
interface CacheEntry {
  prompt: SystemPrompt;
  expiresAt: number;
}

/**
 * System Prompts Repository
 *
 * Manages storage, retrieval, and versioning of AI system prompts.
 */
export class SystemPromptsRepository {
  private config: SystemPromptsRepositoryConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private initialized = false;

  constructor(config: Partial<SystemPromptsRepositoryConfig> = {}) {
    this.config = {
      useDatabase: config.useDatabase ?? false,
      connectionString: config.connectionString,
      cacheTtlSeconds: config.cacheTtlSeconds ?? 300, // 5 minutes
      enableAuditLog: config.enableAuditLog ?? true,
    };
  }

  /**
   * Initialize repository with database connection
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.useDatabase && this.config.connectionString) {
      // TODO: Initialize database connection and create table if not exists
      logger.info('System prompts repository initialized with database');
    } else {
      // Load default prompts into cache
      for (const [key, prompt] of Object.entries(DEFAULT_PROMPTS)) {
        const fullPrompt: SystemPrompt = {
          ...prompt,
          id: key,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.setCache(key, fullPrompt);
      }
      logger.info('System prompts repository initialized with defaults', {
        promptCount: Object.keys(DEFAULT_PROMPTS).length,
      });
    }

    this.initialized = true;
  }

  /**
   * Get a prompt by ID
   */
  async getPrompt(id: string, tenantId?: string): Promise<SystemPrompt | null> {
    // Check cache first
    const cacheKey = tenantId ? `${tenantId}:${id}` : id;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    // If using database, query it
    if (this.config.useDatabase) {
      // TODO: Database query
      // const prompt = await this.queryDatabase(id, tenantId);
      // if (prompt) this.setCache(cacheKey, prompt);
      // return prompt;
    }

    // Fallback to default prompts
    const defaultPrompt = DEFAULT_PROMPTS[id];
    if (defaultPrompt) {
      const fullPrompt: SystemPrompt = {
        ...defaultPrompt,
        id,
        tenantId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return fullPrompt;
    }

    return null;
  }

  /**
   * Get prompts by category
   */
  async getPromptsByCategory(
    category: PromptCategory,
    tenantId?: string
  ): Promise<SystemPrompt[]> {
    const prompts: SystemPrompt[] = [];

    // Check defaults
    for (const [id, prompt] of Object.entries(DEFAULT_PROMPTS)) {
      if (prompt.category === category) {
        prompts.push({
          ...prompt,
          id,
          tenantId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // TODO: Query database for tenant-specific prompts

    return prompts;
  }

  /**
   * Get the active prompt for a category (with tenant override support)
   */
  async getActivePrompt(category: PromptCategory, tenantId?: string): Promise<SystemPrompt | null> {
    // First check for tenant-specific prompt
    if (tenantId) {
      const tenantPrompts = await this.getPromptsByCategory(category, tenantId);
      const activePrompt = tenantPrompts.find((p) => p.isActive && p.tenantId === tenantId);
      if (activePrompt) return activePrompt;
    }

    // Fall back to default prompt for category
    const defaultPrompts = await this.getPromptsByCategory(category);
    return defaultPrompts.find((p) => p.isActive) ?? null;
  }

  /**
   * Create or update a prompt
   */
  async upsertPrompt(
    prompt: Omit<SystemPrompt, 'createdAt' | 'updatedAt'>
  ): Promise<SystemPrompt> {
    const now = new Date();
    const existing = await this.getPrompt(prompt.id, prompt.tenantId);

    const fullPrompt: SystemPrompt = {
      ...prompt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    // Validate prompt
    SystemPromptSchema.parse(fullPrompt);

    if (this.config.useDatabase) {
      // TODO: Database upsert
    }

    // Update cache
    const cacheKey = prompt.tenantId ? `${prompt.tenantId}:${prompt.id}` : prompt.id;
    this.setCache(cacheKey, fullPrompt);

    if (this.config.enableAuditLog) {
      logger.info('System prompt upserted', {
        promptId: prompt.id,
        category: prompt.category,
        version: prompt.version,
        tenantId: prompt.tenantId,
      });
    }

    return fullPrompt;
  }

  /**
   * Compile a prompt template with variables
   */
  compilePrompt(prompt: SystemPrompt, variables: Record<string, string>): string {
    let content = prompt.content;

    // Replace {{variable}} patterns
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      content = content.replace(pattern, value);
    }

    // Warn about unresolved variables
    const unresolvedMatches = content.match(/\{\{[^}]+\}\}/g);
    if (unresolvedMatches) {
      logger.warn('Unresolved variables in prompt', {
        promptId: prompt.id,
        unresolved: unresolvedMatches,
      });
    }

    return content;
  }

  /**
   * Create a template from a prompt
   */
  createTemplate(prompt: SystemPrompt): PromptTemplate {
    return {
      id: prompt.id,
      name: prompt.name,
      category: prompt.category,
      version: prompt.version,
      template: prompt.content,
      variables: prompt.variables ?? [],
      compile: (vars: Record<string, string>) => this.compilePrompt(prompt, vars),
    };
  }

  /**
   * List all available prompts
   */
  async listPrompts(query?: PromptQuery): Promise<SystemPrompt[]> {
    let prompts: SystemPrompt[] = [];

    // Get all default prompts
    for (const [id, prompt] of Object.entries(DEFAULT_PROMPTS)) {
      prompts.push({
        ...prompt,
        id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Filter by query
    if (query) {
      if (query.category) {
        prompts = prompts.filter((p) => p.category === query.category);
      }
      if (query.isActive !== undefined) {
        prompts = prompts.filter((p) => p.isActive === query.isActive);
      }
      if (query.search) {
        const searchLower = query.search.toLowerCase();
        prompts = prompts.filter(
          (p) =>
            p.name.toLowerCase().includes(searchLower) ||
            p.content.toLowerCase().includes(searchLower)
        );
      }
    }

    return prompts;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('System prompts cache cleared');
  }

  // Private helpers

  private getFromCache(key: string): SystemPrompt | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.prompt;
  }

  private setCache(key: string, prompt: SystemPrompt): void {
    this.cache.set(key, {
      prompt,
      expiresAt: Date.now() + this.config.cacheTtlSeconds * 1000,
    });
  }
}

// =============================================================================
// Factory and Singleton
// =============================================================================

let repositoryInstance: SystemPromptsRepository | null = null;

/**
 * Create a new system prompts repository
 */
export function createSystemPromptsRepository(
  config?: Partial<SystemPromptsRepositoryConfig>
): SystemPromptsRepository {
  return new SystemPromptsRepository(config);
}

/**
 * Get the singleton repository instance
 */
export function getSystemPromptsRepository(): SystemPromptsRepository {
  if (!repositoryInstance) {
    repositoryInstance = createSystemPromptsRepository();
  }
  return repositoryInstance;
}

/**
 * Initialize the singleton repository
 */
export async function initializeSystemPrompts(
  config?: Partial<SystemPromptsRepositoryConfig>
): Promise<SystemPromptsRepository> {
  if (!repositoryInstance) {
    repositoryInstance = createSystemPromptsRepository(config);
  }
  await repositoryInstance.initialize();
  return repositoryInstance;
}
