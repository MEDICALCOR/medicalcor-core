'use server';

import { createOpenAIClient, type OpenAIClient } from '@medicalcor/integrations';
import { createLogger } from '@medicalcor/core';
import type {
  ResponseSuggestion,
  PatientHistorySummary,
  ProcedureRecommendation,
} from '@/lib/ai/types';
import { requirePermission } from '@/lib/auth/server-action-auth';
import { quickReplies } from '@/lib/ai/mock-data';

const logger = createLogger({ name: 'ai-copilot-actions' });

// Lazy-initialized OpenAI client
let openAIClient: OpenAIClient | null = null;

function getOpenAIClient(): OpenAIClient {
  if (!openAIClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openAIClient = createOpenAIClient({
      apiKey,
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 1000,
    });
  }
  return openAIClient;
}

// =============================================================================
// Smart Suggestions Action
// =============================================================================

export interface GetSuggestionsInput {
  currentMessage?: string;
  conversationHistory?: { role: string; content: string }[];
  patientName?: string;
}

export interface GetSuggestionsResult {
  suggestions: ResponseSuggestion[];
  quickReplies: typeof quickReplies;
}

export async function getAISuggestionsAction(
  input: GetSuggestionsInput
): Promise<GetSuggestionsResult> {
  await requirePermission('VIEW_PATIENTS');

  const { currentMessage, conversationHistory = [], patientName } = input;

  // If no OpenAI key, return fallback suggestions
  if (!process.env.OPENAI_API_KEY) {
    logger.warn('OPENAI_API_KEY not set, returning fallback suggestions');
    return {
      suggestions: getFallbackSuggestions(currentMessage),
      quickReplies,
    };
  }

  try {
    const client = getOpenAIClient();

    const systemPrompt = `Ești un asistent AI pentru o clinică dentară/estetică. Generează 2-3 sugestii de răspuns pentru operatorul care comunică cu un pacient.

Răspunde DOAR în format JSON:
{
  "suggestions": [
    {
      "id": "sug-1",
      "content": "Textul răspunsului sugerat în română",
      "tone": "friendly|formal|empathetic|urgent",
      "confidence": 0.0-1.0,
      "category": "greeting|info|scheduling|followup|objection"
    }
  ]
}

Reguli:
- Răspunsurile trebuie să fie în română
- Tonul trebuie să fie profesional dar prietenos
- Nu inventa prețuri specifice - redirecționează către consultație
- Sugestiile trebuie să fie relevante pentru ultima întrebare a pacientului
- Fiecare sugestie trebuie să aibă un ton diferit (formal, prietenos, empatic)`;

    const historyText = conversationHistory
      .slice(-5)
      .map((m) => `${m.role === 'user' ? 'Pacient' : 'Operator'}: ${m.content}`)
      .join('\n');

    const userPrompt = `${patientName ? `Pacient: ${patientName}\n` : ''}
Istoric conversație:
${historyText || 'Nu există istoric.'}

Ultimul mesaj al pacientului: ${currentMessage ?? 'Nu există mesaj recent.'}

Generează sugestii de răspuns pentru operator:`;

    const response = await client.chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      jsonMode: true,
      temperature: 0.7,
      maxTokens: 800,
    });

    const parsed = JSON.parse(response) as { suggestions?: ResponseSuggestion[] };
    const suggestions =
      Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0
        ? parsed.suggestions
        : getFallbackSuggestions(currentMessage);

    return {
      suggestions,
      quickReplies,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to generate AI suggestions');
    return {
      suggestions: getFallbackSuggestions(currentMessage),
      quickReplies,
    };
  }
}

// =============================================================================
// Patient Summary Action
// =============================================================================

export interface GetPatientSummaryInput {
  patientId: string;
  conversationHistory?: { role: string; content: string; timestamp?: string }[];
}

export async function getPatientSummaryAction(
  input: GetPatientSummaryInput
): Promise<PatientHistorySummary> {
  await requirePermission('VIEW_PATIENTS');

  const { patientId, conversationHistory = [] } = input;

  // If no OpenAI key, return fallback summary
  if (!process.env.OPENAI_API_KEY) {
    logger.warn('OPENAI_API_KEY not set, returning fallback summary');
    return getFallbackSummary(patientId);
  }

  try {
    const client = getOpenAIClient();

    const systemPrompt = `Analizează conversația cu pacientul și generează un rezumat AI.

Răspunde DOAR în format JSON:
{
  "totalInteractions": number,
  "firstContact": "YYYY-MM-DD",
  "lastContact": "YYYY-MM-DD",
  "classification": "HOT|WARM|COLD",
  "score": 0-100,
  "keyInsights": ["insight 1", "insight 2"],
  "proceduresDiscussed": ["procedură 1", "procedură 2"],
  "objections": ["obiecție 1"],
  "appointmentHistory": [{"date": "YYYY-MM-DD", "procedure": "Consultație", "status": "completed|cancelled|scheduled"}],
  "sentiment": "positive|neutral|negative",
  "engagementLevel": "high|medium|low"
}

Criterii clasificare:
- HOT (score 70-100): Interes explicit, a menționat buget sau urgență
- WARM (score 40-69): Interes moderat, pune întrebări
- COLD (score 0-39): Interes vag, cercetare incipientă`;

    const historyText = conversationHistory
      .map((m) => `${m.role === 'user' ? 'Pacient' : 'Operator'}: ${m.content}`)
      .join('\n');

    const userPrompt = `Analizează această conversație și generează un rezumat AI:

${historyText || 'Nu există istoric de conversație pentru acest pacient.'}`;

    const response = await client.chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      jsonMode: true,
      temperature: 0.3,
      maxTokens: 1000,
    });

    const parsed = JSON.parse(response) as Partial<PatientHistorySummary>;

    // Validate and fill missing fields with fallback values
    return {
      totalInteractions: parsed.totalInteractions ?? conversationHistory.length,
      firstContact: parsed.firstContact ?? new Date().toISOString().split('T')[0],
      lastContact: parsed.lastContact ?? new Date().toISOString().split('T')[0],
      classification: parsed.classification ?? 'COLD',
      score: Math.min(100, Math.max(0, parsed.score ?? 30)),
      keyInsights: parsed.keyInsights ?? [],
      proceduresDiscussed: parsed.proceduresDiscussed ?? [],
      objections: parsed.objections ?? [],
      appointmentHistory: parsed.appointmentHistory ?? [],
      sentiment: parsed.sentiment ?? 'neutral',
      engagementLevel: parsed.engagementLevel ?? 'low',
    };
  } catch (error) {
    logger.error({ error, patientId }, 'Failed to generate patient summary');
    return getFallbackSummary(patientId);
  }
}

// =============================================================================
// Procedure Recommendations Action
// =============================================================================

export interface GetProcedureRecommendationsInput {
  patientId?: string;
  conversationHistory?: { role: string; content: string }[];
  proceduresDiscussed?: string[];
}

export async function getProcedureRecommendationsAction(
  input: GetProcedureRecommendationsInput
): Promise<ProcedureRecommendation[]> {
  await requirePermission('VIEW_PATIENTS');

  const { conversationHistory = [], proceduresDiscussed = [] } = input;

  // If no OpenAI key, return fallback recommendations
  if (!process.env.OPENAI_API_KEY) {
    logger.warn('OPENAI_API_KEY not set, returning fallback recommendations');
    return getFallbackRecommendations();
  }

  try {
    const client = getOpenAIClient();

    const systemPrompt = `Analizează conversația și recomandă proceduri relevante pentru pacient.

Răspunde DOAR în format JSON:
{
  "recommendations": [
    {
      "id": "proc-1",
      "name": "Nume procedură",
      "category": "Categorie",
      "relevanceScore": 0.0-1.0,
      "reasoning": "De ce e relevantă",
      "priceRange": {"min": 1000, "max": 3000, "currency": "EUR"},
      "duration": "1-2 ore",
      "relatedProcedures": ["Procedură similară"],
      "commonQuestions": ["Întrebare frecventă?"]
    }
  ]
}

Proceduri disponibile în clinică:
- Rinoplastie (3500-5500 EUR, 2-3 ore)
- Septoplastie (1500-2500 EUR, 1-2 ore)
- Blefaroplastie (1500-2500 EUR, 1-2 ore)
- Lifting facial (4000-8000 EUR, 3-5 ore)
- Implant dentar (800-1500 EUR/implant)
- Coroane dentare (300-800 EUR/coroană)
- Albire dentară (200-500 EUR)
- Consultație generală (gratuit-100 EUR)`;

    const historyText = conversationHistory
      .slice(-10)
      .map((m) => `${m.role === 'user' ? 'Pacient' : 'Operator'}: ${m.content}`)
      .join('\n');

    const userPrompt = `Analizează conversația și recomandă proceduri relevante:

Proceduri deja discutate: ${proceduresDiscussed.join(', ') || 'Niciuna'}

Conversație:
${historyText || 'Nu există istoric.'}`;

    const response = await client.chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      jsonMode: true,
      temperature: 0.5,
      maxTokens: 1200,
    });

    const parsed = JSON.parse(response) as { recommendations?: ProcedureRecommendation[] };
    const recommendations =
      Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0
        ? parsed.recommendations
        : getFallbackRecommendations();

    return recommendations;
  } catch (error) {
    logger.error({ error }, 'Failed to generate procedure recommendations');
    return getFallbackRecommendations();
  }
}

// =============================================================================
// Fallback Functions
// =============================================================================

function getFallbackSuggestions(currentMessage?: string): ResponseSuggestion[] {
  const message = currentMessage?.toLowerCase() ?? '';

  if (message.includes('pret') || message.includes('cost') || message.includes('cat costa')) {
    return [
      {
        id: 'sug-1',
        content:
          'Prețurile variază în funcție de complexitatea cazului. Pot să vă programez o consultație gratuită pentru o evaluare personalizată?',
        tone: 'friendly',
        confidence: 0.85,
        category: 'info',
      },
      {
        id: 'sug-2',
        content:
          'Oferim și opțiuni de plată în rate fără dobândă. Doriți să discutăm despre acest aspect la consultație?',
        tone: 'empathetic',
        confidence: 0.75,
        category: 'objection',
      },
    ];
  }

  if (
    message.includes('programare') ||
    message.includes('cand') ||
    message.includes('disponibil')
  ) {
    return [
      {
        id: 'sug-3',
        content: 'Avem disponibilitate săptămâna aceasta. Ce zi și oră v-ar conveni mai bine?',
        tone: 'formal',
        confidence: 0.9,
        category: 'scheduling',
      },
      {
        id: 'sug-4',
        content:
          'Pot să vă programez chiar mâine dacă doriți. Preferați dimineața sau după-amiază?',
        tone: 'friendly',
        confidence: 0.82,
        category: 'scheduling',
      },
    ];
  }

  return [
    {
      id: 'sug-default-1',
      content: 'Vă mulțumesc pentru mesaj! Cum vă pot ajuta astăzi?',
      tone: 'friendly',
      confidence: 0.7,
      category: 'greeting',
    },
    {
      id: 'sug-default-2',
      content: 'Bună ziua! Sunt aici să vă răspund la orice întrebare.',
      tone: 'formal',
      confidence: 0.65,
      category: 'greeting',
    },
  ];
}

function getFallbackSummary(_patientId: string): PatientHistorySummary {
  return {
    totalInteractions: 0,
    firstContact: new Date().toISOString().split('T')[0],
    lastContact: new Date().toISOString().split('T')[0],
    classification: 'COLD',
    score: 30,
    keyInsights: ['Pacient nou în sistem', 'Necesită mai multe informații pentru clasificare'],
    proceduresDiscussed: [],
    objections: [],
    appointmentHistory: [],
    sentiment: 'neutral',
    engagementLevel: 'low',
  };
}

function getFallbackRecommendations(): ProcedureRecommendation[] {
  return [
    {
      id: 'proc-consult',
      name: 'Consultație Gratuită',
      category: 'Evaluare',
      relevanceScore: 0.95,
      reasoning: 'Primul pas recomandat pentru toți pacienții noi',
      priceRange: { min: 0, max: 0, currency: 'EUR' },
      duration: '30-45 minute',
      relatedProcedures: [],
      commonQuestions: [
        'Ce include consultația?',
        'Trebuie să pregătesc ceva?',
        'Pot veni însoțit?',
      ],
    },
  ];
}
