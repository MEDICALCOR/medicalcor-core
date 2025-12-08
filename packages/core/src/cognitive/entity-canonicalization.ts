/**
 * Entity Canonicalization Service
 *
 * L4: Populates canonical_form for knowledge graph entities to normalize
 * variations of the same concept (e.g., "dental implants" vs "implants").
 *
 * Uses a hybrid approach:
 * 1. Rule-based canonicalization for common patterns (fast, no LLM cost)
 * 2. LLM-based canonicalization for complex/ambiguous cases (expensive, cached)
 */

import type { Pool } from 'pg';
import { createLogger } from '../logger.js';
import type { IOpenAIClient } from './episode-builder.js';
import {
  DEFAULT_CANONICALIZATION_CONFIG,
  type EntityCanonicalizationConfig,
  type CanonicalFormResult,
  type EntityType,
  type BatchCanonicalizationResult,
} from './types.js';

const logger = createLogger({ name: 'cognitive-entity-canonicalization' });

// =============================================================================
// Medical/Dental Domain Mappings
// =============================================================================

/**
 * Dental procedure synonyms mapped to canonical forms.
 * These are common variations used by patients and staff.
 */
const DENTAL_PROCEDURE_MAPPINGS: Record<string, string> = {
  // All-on-X variants
  'all on 4': 'all-on-4 dental implants',
  'all on four': 'all-on-4 dental implants',
  'all-on-4': 'all-on-4 dental implants',
  'all-on-four': 'all-on-4 dental implants',
  allon4: 'all-on-4 dental implants',
  'all on 6': 'all-on-6 dental implants',
  'all on six': 'all-on-6 dental implants',
  'all-on-6': 'all-on-6 dental implants',
  'all-on-x': 'all-on-x dental implants',
  'all on x': 'all-on-x dental implants',
  'full arch implants': 'full-arch dental implants',
  'full arch': 'full-arch dental implants',
  'full-arch': 'full-arch dental implants',
  'full mouth implants': 'full-arch dental implants',

  // Implant variants
  'dental implant': 'dental implants',
  'dental implants': 'dental implants',
  'tooth implant': 'dental implants',
  'tooth implants': 'dental implants',
  implant: 'dental implants',
  implants: 'dental implants',
  'titanium implant': 'dental implants',
  'teeth implants': 'dental implants',

  // Crown variants
  'dental crown': 'dental crown',
  crown: 'dental crown',
  crowns: 'dental crown',
  'tooth crown': 'dental crown',
  'porcelain crown': 'dental crown',
  'ceramic crown': 'dental crown',
  'zirconia crown': 'dental crown',

  // Bridge variants
  'dental bridge': 'dental bridge',
  bridge: 'dental bridge',
  bridges: 'dental bridge',
  'tooth bridge': 'dental bridge',
  'fixed bridge': 'dental bridge',

  // Veneer variants
  veneer: 'dental veneers',
  veneers: 'dental veneers',
  'dental veneer': 'dental veneers',
  'dental veneers': 'dental veneers',
  'porcelain veneers': 'dental veneers',
  'composite veneers': 'dental veneers',

  // Whitening variants
  'teeth whitening': 'teeth whitening',
  'tooth whitening': 'teeth whitening',
  'dental whitening': 'teeth whitening',
  bleaching: 'teeth whitening',
  'teeth bleaching': 'teeth whitening',
  whitening: 'teeth whitening',

  // Extraction variants
  'tooth extraction': 'tooth extraction',
  extraction: 'tooth extraction',
  'tooth removal': 'tooth extraction',
  'teeth extraction': 'tooth extraction',
  'wisdom tooth removal': 'wisdom tooth extraction',
  'wisdom tooth extraction': 'wisdom tooth extraction',
  'wisdom teeth removal': 'wisdom tooth extraction',

  // Root canal variants
  'root canal': 'root canal treatment',
  'root canal treatment': 'root canal treatment',
  'root canal therapy': 'root canal treatment',
  'endodontic treatment': 'root canal treatment',
  endodontics: 'root canal treatment',

  // Cleaning variants
  'dental cleaning': 'dental cleaning',
  'teeth cleaning': 'dental cleaning',
  cleaning: 'dental cleaning',
  prophylaxis: 'dental cleaning',
  prophy: 'dental cleaning',
  'scale and polish': 'dental cleaning',
  'deep cleaning': 'periodontal scaling',
  scaling: 'periodontal scaling',
  'root planing': 'periodontal scaling',

  // Filling variants
  'dental filling': 'dental filling',
  filling: 'dental filling',
  fillings: 'dental filling',
  'cavity filling': 'dental filling',
  'composite filling': 'dental filling',
  'amalgam filling': 'dental filling',

  // Orthodontics
  braces: 'orthodontic braces',
  'dental braces': 'orthodontic braces',
  orthodontics: 'orthodontic treatment',
  invisalign: 'clear aligners',
  'clear aligners': 'clear aligners',
  aligners: 'clear aligners',

  // Dentures
  dentures: 'dentures',
  denture: 'dentures',
  'false teeth': 'dentures',
  'partial denture': 'partial dentures',
  'partial dentures': 'partial dentures',
  'full dentures': 'complete dentures',
  'complete dentures': 'complete dentures',

  // X-ray variants
  'dental x-ray': 'dental x-ray',
  'x-ray': 'dental x-ray',
  xray: 'dental x-ray',
  radiograph: 'dental x-ray',
  'panoramic x-ray': 'panoramic x-ray',
  panoramic: 'panoramic x-ray',
  cbct: 'cone beam ct scan',
  'ct scan': 'cone beam ct scan',
  'cone beam': 'cone beam ct scan',

  // Consultation
  consultation: 'dental consultation',
  consult: 'dental consultation',
  'dental consultation': 'dental consultation',
  checkup: 'dental checkup',
  'check up': 'dental checkup',
  'dental checkup': 'dental checkup',
  'dental check-up': 'dental checkup',
  exam: 'dental examination',
  examination: 'dental examination',
  'dental exam': 'dental examination',

  // Gum disease
  'gum disease': 'periodontal disease',
  'periodontal disease': 'periodontal disease',
  periodontitis: 'periodontal disease',
  gingivitis: 'gingivitis',
  'gum treatment': 'periodontal treatment',
  'periodontal treatment': 'periodontal treatment',

  // Cosmetic
  'smile makeover': 'smile makeover',
  'cosmetic dentistry': 'cosmetic dentistry',
  'aesthetic dentistry': 'cosmetic dentistry',
  'teeth reshaping': 'dental contouring',
  'dental contouring': 'dental contouring',
  bonding: 'dental bonding',
  'dental bonding': 'dental bonding',
};

/**
 * Common abbreviations in medical/dental context
 */
const ABBREVIATION_MAPPINGS: Record<string, string> = {
  // Dental-specific
  ao4: 'all-on-4 dental implants',
  ao6: 'all-on-6 dental implants',
  aox: 'all-on-x dental implants',
  rct: 'root canal treatment',
  ext: 'tooth extraction',
  prophy: 'dental cleaning',

  // Medical
  appt: 'appointment',
  apt: 'appointment',
  rx: 'prescription',
  dx: 'diagnosis',
  tx: 'treatment',
  fx: 'fracture',
  hx: 'history',
  pt: 'patient',
  dr: 'doctor',

  // Time-related
  am: 'morning',
  pm: 'afternoon',
  asap: 'as soon as possible',
  eod: 'end of day',
  eow: 'end of week',
};

/**
 * Pluralization rules for normalization
 */
const SINGULAR_FORMS: Record<string, string> = {
  teeth: 'tooth',
  implants: 'implant',
  crowns: 'crown',
  veneers: 'veneer',
  bridges: 'bridge',
  fillings: 'filling',
  extractions: 'extraction',
  appointments: 'appointment',
  consultations: 'consultation',
  procedures: 'procedure',
  treatments: 'treatment',
  patients: 'patient',
  doctors: 'doctor',
};

// =============================================================================
// Entity Canonicalization Service
// =============================================================================

export class EntityCanonicalizationService {
  private config: EntityCanonicalizationConfig;
  private cache: Map<string, { canonical: string; timestamp: number }>;

  constructor(
    private pool: Pool,
    private openai: IOpenAIClient | null,
    config: Partial<EntityCanonicalizationConfig> = {}
  ) {
    this.config = { ...DEFAULT_CANONICALIZATION_CONFIG, ...config };
    this.cache = new Map();
  }

  // ===========================================================================
  // Main Canonicalization Methods
  // ===========================================================================

  /**
   * Get the canonical form for an entity value.
   * Uses rule-based matching first, then LLM if enabled and needed.
   */
  async canonicalize(entityValue: string, entityType: EntityType): Promise<CanonicalFormResult> {
    const startTime = Date.now();
    const normalizedValue = this.normalizeForMatching(entityValue);

    // Check cache first
    const cacheKey = `${entityType}:${normalizedValue}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTtlMs) {
      return {
        originalValue: entityValue,
        canonicalForm: cached.canonical,
        method: 'cache',
        confidence: 1.0,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Try rule-based canonicalization first
    const ruleResult = this.applyRuleBasedCanonicalization(normalizedValue, entityType);
    if (ruleResult) {
      this.cacheResult(cacheKey, ruleResult);
      return {
        originalValue: entityValue,
        canonicalForm: ruleResult,
        method: 'rule_based',
        confidence: 1.0,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Apply basic normalization for non-procedure types
    const basicNormalized = this.applyBasicNormalization(entityValue, entityType);

    // For procedures, try LLM if enabled and no rule match
    if (entityType === 'procedure' && this.config.enableLLMCanonicalization && this.openai) {
      try {
        const llmResult = await this.canonicalizeWithLLM(entityValue, entityType);
        if (llmResult) {
          this.cacheResult(cacheKey, llmResult.canonicalForm);
          return {
            originalValue: entityValue,
            canonicalForm: llmResult.canonicalForm,
            method: 'llm',
            confidence: llmResult.confidence,
            processingTimeMs: Date.now() - startTime,
          };
        }
      } catch (error) {
        logger.warn(
          { error, entityValue, entityType },
          'LLM canonicalization failed, using basic normalization'
        );
      }
    }

    // Fallback to basic normalization
    this.cacheResult(cacheKey, basicNormalized);
    return {
      originalValue: entityValue,
      canonicalForm: basicNormalized,
      method: 'basic_normalization',
      confidence: 0.7,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Batch canonicalize multiple entities (more efficient for LLM calls)
   */
  async canonicalizeBatch(
    entities: { value: string; type: EntityType }[]
  ): Promise<CanonicalFormResult[]> {
    const results: CanonicalFormResult[] = [];

    // Separate entities that need LLM vs rule-based
    const needsLLM: { value: string; type: EntityType; index: number }[] = [];
    const preResults = new Map<number, CanonicalFormResult>();

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i]!;
      const normalizedValue = this.normalizeForMatching(entity.value);

      // Check cache
      const cacheKey = `${entity.type}:${normalizedValue}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTtlMs) {
        preResults.set(i, {
          originalValue: entity.value,
          canonicalForm: cached.canonical,
          method: 'cache',
          confidence: 1.0,
          processingTimeMs: 0,
        });
        continue;
      }

      // Try rule-based
      const ruleResult = this.applyRuleBasedCanonicalization(normalizedValue, entity.type);
      if (ruleResult) {
        this.cacheResult(cacheKey, ruleResult);
        preResults.set(i, {
          originalValue: entity.value,
          canonicalForm: ruleResult,
          method: 'rule_based',
          confidence: 1.0,
          processingTimeMs: 0,
        });
        continue;
      }

      // Mark for LLM if it's a procedure
      if (entity.type === 'procedure' && this.config.enableLLMCanonicalization && this.openai) {
        needsLLM.push({ ...entity, index: i });
      } else {
        // Apply basic normalization
        const basicNormalized = this.applyBasicNormalization(entity.value, entity.type);
        this.cacheResult(cacheKey, basicNormalized);
        preResults.set(i, {
          originalValue: entity.value,
          canonicalForm: basicNormalized,
          method: 'basic_normalization',
          confidence: 0.7,
          processingTimeMs: 0,
        });
      }
    }

    // Process LLM batch if needed
    if (needsLLM.length > 0 && this.openai) {
      try {
        const llmResults = await this.canonicalizeBatchWithLLM(needsLLM);
        for (const result of llmResults) {
          const entity = needsLLM.find((e) => e.index === result.index);
          if (entity) {
            const cacheKey = `${entity.type}:${this.normalizeForMatching(entity.value)}`;
            this.cacheResult(cacheKey, result.canonicalForm);
            preResults.set(result.index, {
              originalValue: entity.value,
              canonicalForm: result.canonicalForm,
              method: 'llm',
              confidence: result.confidence,
              processingTimeMs: 0,
            });
          }
        }
      } catch (error) {
        logger.warn({ error }, 'Batch LLM canonicalization failed, using basic normalization');
        // Fallback for LLM failures
        for (const entity of needsLLM) {
          const basicNormalized = this.applyBasicNormalization(entity.value, entity.type);
          const cacheKey = `${entity.type}:${this.normalizeForMatching(entity.value)}`;
          this.cacheResult(cacheKey, basicNormalized);
          preResults.set(entity.index, {
            originalValue: entity.value,
            canonicalForm: basicNormalized,
            method: 'basic_normalization',
            confidence: 0.7,
            processingTimeMs: 0,
          });
        }
      }
    }

    // Build results array in order
    for (let i = 0; i < entities.length; i++) {
      const result = preResults.get(i);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Canonicalize all existing entities in the database that don't have canonical forms
   */
  async canonicalizeExisting(
    options: {
      entityType?: EntityType;
      batchSize?: number;
      limit?: number;
    } = {}
  ): Promise<BatchCanonicalizationResult> {
    const startTime = Date.now();
    const batchSize = options.batchSize ?? this.config.batchSize;
    const limit = options.limit ?? 1000;

    const result: BatchCanonicalizationResult = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      durationMs: 0,
    };

    // Get entities without canonical forms
    const query = options.entityType
      ? `SELECT id, entity_type, entity_value
         FROM knowledge_entities
         WHERE canonical_form IS NULL AND deleted_at IS NULL AND entity_type = $1
         ORDER BY mention_count DESC
         LIMIT $2`
      : `SELECT id, entity_type, entity_value
         FROM knowledge_entities
         WHERE canonical_form IS NULL AND deleted_at IS NULL
         ORDER BY mention_count DESC
         LIMIT $1`;

    const queryResult = await this.pool.query<{
      id: string;
      entity_type: string;
      entity_value: string;
    }>(query, options.entityType ? [options.entityType, limit] : [limit]);

    const entities = queryResult.rows;
    logger.info({ count: entities.length }, 'Found entities needing canonicalization');

    // Process in batches
    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);
      const batchEntities = batch.map((e) => ({
        value: e.entity_value,
        type: e.entity_type as EntityType,
      }));

      try {
        const canonicalResults = await this.canonicalizeBatch(batchEntities);

        // Update database
        for (let j = 0; j < batch.length; j++) {
          const entity = batch[j]!;
          const canonical = canonicalResults[j];
          result.totalProcessed++;

          if (!canonical) {
            result.skipped++;
            continue;
          }

          try {
            await this.pool.query(
              `UPDATE knowledge_entities
               SET canonical_form = $1, updated_at = NOW()
               WHERE id = $2`,
              [canonical.canonicalForm, entity.id]
            );
            result.successful++;
          } catch (updateError) {
            result.failed++;
            result.errors.push({
              entityId: entity.id,
              error: updateError instanceof Error ? updateError.message : 'Unknown error',
            });
          }
        }

        logger.debug(
          { batchStart: i, batchEnd: i + batch.length, totalProcessed: result.totalProcessed },
          'Processed canonicalization batch'
        );
      } catch (error) {
        logger.error({ error, batchStart: i }, 'Failed to process canonicalization batch');
        result.failed += batch.length;
        for (const entity of batch) {
          result.errors.push({
            entityId: entity.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    result.durationMs = Date.now() - startTime;

    logger.info(result, 'Completed batch canonicalization');

    return result;
  }

  /**
   * Update the canonical form for a specific entity
   */
  async updateCanonicalForm(entityId: string, canonicalForm: string): Promise<void> {
    await this.pool.query(
      `UPDATE knowledge_entities
       SET canonical_form = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL`,
      [canonicalForm, entityId]
    );

    logger.debug({ entityId, canonicalForm }, 'Updated entity canonical form');
  }

  // ===========================================================================
  // Rule-Based Canonicalization
  // ===========================================================================

  /**
   * Apply rule-based canonicalization using predefined mappings
   */
  private applyRuleBasedCanonicalization(
    normalizedValue: string,
    entityType: EntityType
  ): string | null {
    // For procedures, check dental procedure mappings
    if (entityType === 'procedure') {
      const procedureMatch = DENTAL_PROCEDURE_MAPPINGS[normalizedValue];
      if (procedureMatch) {
        return procedureMatch;
      }
    }

    // Check abbreviation mappings for all types
    const abbreviationMatch = ABBREVIATION_MAPPINGS[normalizedValue];
    if (abbreviationMatch) {
      return abbreviationMatch;
    }

    return null;
  }

  /**
   * Apply basic normalization (case, whitespace, common pluralization)
   */
  private applyBasicNormalization(entityValue: string, entityType: EntityType): string {
    let normalized = entityValue.toLowerCase().trim().replace(/\s+/g, ' '); // Collapse multiple spaces

    // Handle pluralization for procedure type
    if (entityType === 'procedure') {
      // Keep plural forms for procedures as they are more commonly used
      // (e.g., "dental implants" not "dental implant")
    } else {
      // For other types, normalize to singular if it's a known plural
      for (const [plural, singular] of Object.entries(SINGULAR_FORMS)) {
        if (normalized.endsWith(` ${plural}`)) {
          normalized = normalized.replace(new RegExp(` ${plural}$`), ` ${singular}`);
        } else if (normalized === plural) {
          normalized = singular;
        }
      }
    }

    // Title case for proper presentation
    return this.toTitleCase(normalized);
  }

  /**
   * Normalize a value for matching (lowercase, trim, collapse spaces)
   */
  private normalizeForMatching(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"');
  }

  /**
   * Convert to title case
   */
  private toTitleCase(str: string): string {
    const lowercaseWords = new Set([
      'a',
      'an',
      'the',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
    ]);
    return str
      .split(' ')
      .map((word, index) => {
        if (index === 0 || !lowercaseWords.has(word)) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }
        return word;
      })
      .join(' ');
  }

  // ===========================================================================
  // LLM-Based Canonicalization
  // ===========================================================================

  /**
   * Use LLM to canonicalize a single entity value
   */
  private async canonicalizeWithLLM(
    entityValue: string,
    entityType: EntityType
  ): Promise<{ canonicalForm: string; confidence: number } | null> {
    if (!this.openai) {
      return null;
    }

    const prompt = this.buildCanonicalizationPrompt([entityValue], entityType);

    try {
      const content = await this.openai.chatCompletion({
        messages: [
          {
            role: 'system',
            content: `You are a medical/dental terminology expert. Your task is to normalize entity names to their canonical forms. Output only valid JSON.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
        maxTokens: 200,
        jsonMode: true,
      });

      if (!content) {
        return null;
      }

      const parsed = JSON.parse(content) as {
        results: { original: string; canonical: string; confidence: number }[];
      };
      const result = parsed.results[0];

      if (result) {
        return {
          canonicalForm: result.canonical,
          confidence: result.confidence,
        };
      }

      return null;
    } catch (error) {
      logger.warn({ error, entityValue }, 'LLM canonicalization failed');
      return null;
    }
  }

  /**
   * Use LLM to canonicalize multiple entity values in a single call
   */
  private async canonicalizeBatchWithLLM(
    entities: { value: string; type: EntityType; index: number }[]
  ): Promise<{ index: number; canonicalForm: string; confidence: number }[]> {
    if (!this.openai || entities.length === 0) {
      return [];
    }

    // Group by entity type for better prompting
    const byType = new Map<EntityType, typeof entities>();
    for (const entity of entities) {
      const list = byType.get(entity.type) ?? [];
      list.push(entity);
      byType.set(entity.type, list);
    }

    const allResults: { index: number; canonicalForm: string; confidence: number }[] = [];

    for (const [entityType, typeEntities] of byType) {
      const values = typeEntities.map((e) => e.value);
      const prompt = this.buildCanonicalizationPrompt(values, entityType);

      try {
        const content = await this.openai.chatCompletion({
          messages: [
            {
              role: 'system',
              content: `You are a medical/dental terminology expert. Your task is to normalize entity names to their canonical forms. Output only valid JSON.`,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.1,
          maxTokens: 500,
          jsonMode: true,
        });

        if (!content) {
          continue;
        }

        const parsed = JSON.parse(content) as {
          results: { original: string; canonical: string; confidence: number }[];
        };

        for (const result of parsed.results) {
          const entity = typeEntities.find(
            (e) => e.value.toLowerCase() === result.original.toLowerCase()
          );
          if (entity) {
            allResults.push({
              index: entity.index,
              canonicalForm: result.canonical,
              confidence: result.confidence,
            });
          }
        }
      } catch (error) {
        logger.warn({ error, entityType }, 'Batch LLM canonicalization failed for type');
      }
    }

    return allResults;
  }

  /**
   * Build the prompt for LLM canonicalization
   */
  private buildCanonicalizationPrompt(values: string[], entityType: EntityType): string {
    const typeDescription =
      entityType === 'procedure'
        ? 'dental/medical procedures'
        : entityType === 'product'
          ? 'dental/medical products'
          : `${entityType} entities`;

    return `Normalize these ${typeDescription} to their canonical forms.

Input values:
${values.map((v, i) => `${i + 1}. "${v}"`).join('\n')}

Rules:
1. Use standard medical/dental terminology
2. Prefer commonly used professional terms
3. Use consistent capitalization (Title Case)
4. Remove unnecessary words but keep context
5. For dental procedures, use standard procedure names

Respond with JSON only:
{
  "results": [
    { "original": "input value", "canonical": "normalized form", "confidence": 0.95 }
  ]
}`;
  }

  // ===========================================================================
  // Cache Management
  // ===========================================================================

  /**
   * Cache a canonicalization result
   */
  private cacheResult(key: string, canonical: string): void {
    // Evict old entries if cache is too large
    if (this.cache.size >= this.config.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { canonical, timestamp: Date.now() });
  }

  /**
   * Clear the canonicalization cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Cleared canonicalization cache');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheSize,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createEntityCanonicalizationService(
  pool: Pool,
  openai: IOpenAIClient | null,
  config?: Partial<EntityCanonicalizationConfig>
): EntityCanonicalizationService {
  return new EntityCanonicalizationService(pool, openai, config);
}
