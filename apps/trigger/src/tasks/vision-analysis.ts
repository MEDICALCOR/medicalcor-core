import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import OpenAI from 'openai';
import crypto from 'crypto';
import { createIntegrationClients } from '@medicalcor/integrations';

/**
 * Vision AI Task - Medical Image Analysis
 *
 * Analyzes medical images (prescriptions, dermatology photos, lab results)
 * using GPT-4 Vision with cost-optimized model selection.
 *
 * Features:
 * - Economy mode: Uses gpt-4o-mini for documents/PDFs (cheaper)
 * - Premium mode: Uses gpt-4o for photos requiring visual analysis
 * - Structured JSON extraction for medications, diagnoses, abnormal values
 * - Cost tracking per analysis
 */

// =============================================================================
// TYPES & SCHEMAS
// =============================================================================

export const VisionAnalysisIntentSchema = z.enum([
  'prescription',
  'dermatology',
  'lab_result',
  'xray',
  'dental_scan',
  'document',
  'other',
]);

export type VisionAnalysisIntent = z.infer<typeof VisionAnalysisIntentSchema>;

export const VisionAnalysisPayloadSchema = z.object({
  imageUrl: z.string().url(),
  patientId: z.string().min(1),
  intent: VisionAnalysisIntentSchema,
  correlationId: z.string().optional(),
  hubspotContactId: z.string().optional(),
  language: z.enum(['ro', 'en', 'de']).optional().default('ro'),
});

export type VisionAnalysisPayload = z.infer<typeof VisionAnalysisPayloadSchema>;

// Model selection based on intent and content type
type ModelTier = 'premium' | 'economy';

interface ModelConfig {
  model: string;
  tier: ModelTier;
  costPerInputToken: number; // in millicents (1/1000 of a cent)
  costPerOutputToken: number;
}

const MODEL_CONFIGS: Record<ModelTier, ModelConfig> = {
  premium: {
    model: 'gpt-4o',
    tier: 'premium',
    costPerInputToken: 0.25, // $2.50 per 1M tokens = 0.00025 cents/token = 0.25 millicents
    costPerOutputToken: 1.0, // $10 per 1M tokens
  },
  economy: {
    model: 'gpt-4o-mini',
    tier: 'economy',
    costPerInputToken: 0.015, // $0.15 per 1M tokens
    costPerOutputToken: 0.06, // $0.60 per 1M tokens
  },
};

// Extraction result structure
interface MedicalExtraction {
  summary: string;
  medications: {
    name: string;
    dosage?: string | undefined;
    frequency?: string | undefined;
    duration?: string | undefined;
    instructions?: string | undefined;
  }[];
  diagnoses: {
    code?: string | undefined;
    description: string;
    severity?: 'mild' | 'moderate' | 'severe' | 'unknown' | undefined;
  }[];
  abnormalValues: {
    metric: string;
    value: string;
    unit?: string | undefined;
    referenceRange?: string | undefined;
    status: 'high' | 'low' | 'critical' | 'borderline';
  }[];
  recommendations: string[];
  confidence: number;
  rawExtraction: Record<string, unknown>;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Determine model tier based on content type and intent
 * Economy mode for text-heavy documents, Premium for visual analysis
 */
function determineModelTier(mimeType: string | null, intent: VisionAnalysisIntent): ModelTier {
  // Use economy model for documents and prescriptions (mostly OCR)
  const economyIntents: VisionAnalysisIntent[] = ['prescription', 'document', 'lab_result'];
  const economyMimeTypes = ['application/pdf', 'image/tiff'];

  if (economyIntents.includes(intent)) {
    return 'economy';
  }

  if (mimeType && economyMimeTypes.includes(mimeType)) {
    return 'economy';
  }

  // Premium for photos requiring visual understanding
  // dermatology, xray, dental_scan need visual analysis
  return 'premium';
}

/**
 * Fetch image and detect MIME type
 */
async function fetchImageMetadata(imageUrl: string): Promise<{
  mimeType: string | null;
  sizeBytes: number;
  base64?: string;
}> {
  try {
    const response = await fetch(imageUrl, { method: 'HEAD' });
    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');

    return {
      mimeType: contentType,
      sizeBytes: contentLength ? parseInt(contentLength, 10) : 0,
    };
  } catch (error) {
    logger.warn('Failed to fetch image metadata, proceeding anyway', { error });
    return { mimeType: null, sizeBytes: 0 };
  }
}

/**
 * Calculate cost in cents from token usage
 */
function calculateCost(inputTokens: number, outputTokens: number, config: ModelConfig): number {
  // Convert millicents to cents
  const inputCost = (inputTokens * config.costPerInputToken) / 1000;
  const outputCost = (outputTokens * config.costPerOutputToken) / 1000;
  return Math.ceil(inputCost + outputCost); // Round up to nearest cent
}

/**
 * Build system prompt for medical extraction
 */
function buildSystemPrompt(intent: VisionAnalysisIntent, language: string): string {
  const basePrompt = `You are a medical assistant AI specializing in extracting structured data from medical documents and images.

Your task is to analyze the provided image and extract relevant medical information.

IMPORTANT RULES:
1. Only extract information that is CLEARLY VISIBLE in the image
2. Do NOT make assumptions or diagnoses - only report what you see
3. If something is unclear or illegible, mark it as "unclear"
4. For medications, extract exact dosages as written
5. For lab results, note if values are outside normal ranges
6. Always respond in ${language === 'ro' ? 'Romanian' : language === 'de' ? 'German' : 'English'}

Response format: JSON object with these fields:
{
  "summary": "Brief description of the document/image",
  "medications": [{"name": "", "dosage": "", "frequency": "", "duration": "", "instructions": ""}],
  "diagnoses": [{"code": "", "description": "", "severity": "mild|moderate|severe|unknown"}],
  "abnormalValues": [{"metric": "", "value": "", "unit": "", "referenceRange": "", "status": "high|low|critical|borderline"}],
  "recommendations": [""],
  "confidence": 0.0-1.0,
  "documentType": "prescription|lab_result|xray|scan|photo|other",
  "additionalNotes": ""
}`;

  const intentSpecificPrompts: Record<VisionAnalysisIntent, string> = {
    prescription: `
FOCUS: Medication extraction
- Extract ALL medication names, dosages, frequencies
- Note any special instructions (with food, before bed, etc.)
- Identify prescribing doctor if visible
- Note prescription date and validity period`,

    dermatology: `
FOCUS: Skin condition analysis
- Describe visible skin conditions WITHOUT diagnosing
- Note location, size, color, texture of lesions
- Describe any patterns or distribution
- DO NOT provide definitive diagnoses - suggest possibilities only`,

    lab_result: `
FOCUS: Laboratory values extraction
- Extract ALL test names and values with units
- Compare to reference ranges if shown
- Flag abnormal values clearly
- Note sample collection date if visible`,

    xray: `
FOCUS: Radiograph description
- Describe visible anatomical structures
- Note any visible abnormalities WITHOUT diagnosing
- Describe image quality and positioning
- DO NOT provide radiological diagnoses`,

    dental_scan: `
FOCUS: Dental imaging analysis
- Describe visible dental structures
- Note missing teeth, fillings, implants
- Describe bone levels if visible
- Identify any obvious pathology locations`,

    document: `
FOCUS: General medical document OCR
- Extract all readable text
- Preserve document structure
- Identify document type and date
- Extract patient identifiers if visible`,

    other: `
FOCUS: General medical image analysis
- Describe what is visible in the image
- Extract any medical information present
- Note document type if applicable`,
  };

  return basePrompt + '\n\n' + intentSpecificPrompts[intent];
}

/**
 * Hash image URL for deduplication
 */
function hashImageUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex');
}

// =============================================================================
// CLIENTS
// =============================================================================

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for vision analysis');
  }
  return new OpenAI({ apiKey });
}

function getClients() {
  return createIntegrationClients({
    source: 'vision-analysis',
    includeOpenAI: false, // We use direct OpenAI client for vision
  });
}

// =============================================================================
// MAIN TASK
// =============================================================================

export const analyzeMedicalImage = task({
  id: 'analyze-medical-image',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: VisionAnalysisPayload) => {
    const startTime = Date.now();
    const { imageUrl, patientId, intent, correlationId, hubspotContactId, language } = payload;
    const { eventStore } = getClients();

    logger.info('Starting medical image analysis', {
      patientId,
      intent,
      correlationId,
    });

    // Step 1: Fetch image metadata to determine model tier
    const imageMetadata = await fetchImageMetadata(imageUrl);
    const modelTier = determineModelTier(imageMetadata.mimeType, intent);
    const modelConfig = MODEL_CONFIGS[modelTier];
    const imageHash = hashImageUrl(imageUrl);

    logger.info('Model selection', {
      tier: modelTier,
      model: modelConfig.model,
      mimeType: imageMetadata.mimeType,
      sizeBytes: imageMetadata.sizeBytes,
    });

    // Step 2: Initialize OpenAI client and call Vision API
    const openai = getOpenAIClient();
    const lang = language;
    const systemPrompt = buildSystemPrompt(intent, lang);

    let extraction: MedicalExtraction;
    let tokensInput = 0;
    let tokensOutput = 0;
    let providerRequestId: string | undefined;

    try {
      const response = await openai.chat.completions.create({
        model: modelConfig.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: modelTier === 'premium' ? 'high' : 'low',
                },
              },
              {
                type: 'text',
                text: `Please analyze this medical ${intent.replace('_', ' ')} image and extract the relevant information.`,
              },
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0.1, // Low temperature for consistent extraction
        response_format: { type: 'json_object' },
      });

      // Extract usage data
      tokensInput = response.usage?.prompt_tokens ?? 0;
      tokensOutput = response.usage?.completion_tokens ?? 0;
      providerRequestId = response.id;

      // Parse response
      const firstChoice = response.choices[0];
      if (!firstChoice) {
        throw new Error('Empty response from Vision API: no choices');
      }
      const content = firstChoice.message.content;
      if (!content) {
        throw new Error('Empty response from Vision API: no content');
      }

      const rawExtraction = JSON.parse(content) as Record<string, unknown>;

      // Type assertions with fallbacks for null/undefined from JSON
      const meds = rawExtraction.medications as MedicalExtraction['medications'] | null | undefined;
      const diag = rawExtraction.diagnoses as MedicalExtraction['diagnoses'] | null | undefined;
      const abnorm = rawExtraction.abnormalValues as
        | MedicalExtraction['abnormalValues']
        | null
        | undefined;
      const recs = rawExtraction.recommendations as string[] | null | undefined;
      const conf = rawExtraction.confidence as number | null | undefined;
      const summ = rawExtraction.summary as string | null | undefined;

      extraction = {
        summary: summ ?? 'No summary available',
        medications: meds ?? [],
        diagnoses: diag ?? [],
        abnormalValues: abnorm ?? [],
        recommendations: recs ?? [],
        confidence: conf ?? 0.5,
        rawExtraction,
      };

      logger.info('Vision analysis completed', {
        tokensInput,
        tokensOutput,
        confidence: extraction.confidence,
        medicationsFound: extraction.medications.length,
        diagnosesFound: extraction.diagnoses.length,
        abnormalValuesFound: extraction.abnormalValues.length,
      });
    } catch (error) {
      logger.error('Vision API call failed', { error, patientId, intent });

      // Emit failure event
      await eventStore.emit({
        type: 'vision.analysis.failed',
        correlationId: correlationId ?? `vision-${Date.now()}`,
        aggregateId: patientId,
        aggregateType: 'medical_record',
        payload: {
          patientId,
          imageUrl,
          intent,
          error: error instanceof Error ? error.message : 'Unknown error',
          modelUsed: modelConfig.model,
        },
      });

      throw error;
    }

    // Step 3: Calculate cost
    const costInCents = calculateCost(tokensInput, tokensOutput, modelConfig);
    const processingDurationMs = Date.now() - startTime;

    // Step 4: Emit success event (will be stored by event store)
    const eventCorrelationId = correlationId ?? `vision-${Date.now()}`;
    await eventStore.emit({
      type: 'vision.analysis.completed',
      correlationId: eventCorrelationId,
      aggregateId: patientId,
      aggregateType: 'medical_record',
      payload: {
        patientId,
        hubspotContactId,
        imageUrl,
        imageHash,
        imageMimeType: imageMetadata.mimeType,
        imageSizeBytes: imageMetadata.sizeBytes,
        intent,
        modelTier,
        modelUsed: modelConfig.model,
        status: 'completed',
        extractedData: extraction.rawExtraction,
        summary: extraction.summary,
        confidenceScore: extraction.confidence,
        medications: extraction.medications,
        diagnoses: extraction.diagnoses,
        abnormalValues: extraction.abnormalValues,
        recommendations: extraction.recommendations,
        costInCents,
        tokensInput,
        tokensOutput,
        providerRequestId,
        processingDurationMs,
      },
    });

    logger.info('Medical record saved', {
      patientId,
      costInCents,
      processingDurationMs,
      correlationId: eventCorrelationId,
    });

    // Return structured result
    return {
      success: true,
      patientId,
      intent,
      summary: extraction.summary,
      confidence: extraction.confidence,
      medications: extraction.medications,
      diagnoses: extraction.diagnoses,
      abnormalValues: extraction.abnormalValues,
      recommendations: extraction.recommendations,
      modelUsed: modelConfig.model,
      modelTier,
      costInCents,
      processingDurationMs,
      correlationId: eventCorrelationId,
    };
  },
});

/**
 * Batch analysis task for multiple images
 */
export const analyzeMedicalImageBatch = task({
  id: 'analyze-medical-image-batch',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 60000,
    factor: 2,
  },
  run: async (payload: {
    images: {
      imageUrl: string;
      intent: VisionAnalysisIntent;
    }[];
    patientId: string;
    correlationId?: string;
    hubspotContactId?: string;
    language?: 'ro' | 'en' | 'de';
  }) => {
    const { images, patientId, correlationId, hubspotContactId, language } = payload;
    const { eventStore } = getClients();

    logger.info('Starting batch image analysis', {
      imageCount: images.length,
      patientId,
      correlationId,
    });

    const results = [];
    let totalCostCents = 0;
    let successCount = 0;
    let failCount = 0;

    for (const image of images) {
      try {
        const result = await analyzeMedicalImage.triggerAndWait({
          imageUrl: image.imageUrl,
          patientId,
          intent: image.intent,
          correlationId,
          hubspotContactId,
          language: language ?? 'ro',
        });

        if (result.ok) {
          results.push({
            imageUrl: image.imageUrl,
            intent: image.intent,
            success: true,
            result: result.output,
          });
          totalCostCents += result.output.costInCents;
          successCount++;
        } else {
          throw new Error('Task failed');
        }
      } catch (error) {
        results.push({
          imageUrl: image.imageUrl,
          intent: image.intent,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        failCount++;
      }
    }

    // Emit batch completion event
    await eventStore.emit({
      type: 'vision.batch.completed',
      correlationId: correlationId ?? `vision-batch-${Date.now()}`,
      aggregateId: patientId,
      aggregateType: 'medical_record',
      payload: {
        patientId,
        imageCount: images.length,
        successCount,
        failCount,
        totalCostCents,
      },
    });

    return {
      success: failCount === 0,
      patientId,
      totalImages: images.length,
      successCount,
      failCount,
      totalCostCents,
      results,
    };
  },
});

export default analyzeMedicalImage;
