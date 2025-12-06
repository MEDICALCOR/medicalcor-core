/**
 * Demo Scoring API Endpoint
 *
 * Provides live AI scoring simulation for investor demos.
 * Uses rule-based scoring to demonstrate the AI capabilities
 * without requiring actual OpenAI API calls during demos.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

interface ScoringResult {
  score: number;
  classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
  confidence: number;
  reasoning: string;
  procedureInterest: string[];
  budgetMentioned: boolean;
  urgencyIndicators: string[];
  suggestedAction: string;
  processingTime: number;
}

// Procedure keywords in multiple languages (Romanian, English, German)
const PROCEDURE_KEYWORDS: Record<string, string[]> = {
  'All-on-4': ['all-on-4', 'all on 4', 'allon4', 'all-on-x', 'all on x'],
  'Dental Implants': ['implant', 'implanturi', 'implants', 'zahnimplantat'],
  Veneers: ['fatete', 'fateta', 'veneers', 'veneer', 'furnir'],
  'Dental Crowns': ['coroana', 'coroane', 'crown', 'crowns', 'krone'],
  Whitening: ['albire', 'albi', 'whitening', 'bleaching', 'aufhellung'],
  Orthodontics: ['aparat dentar', 'ortodontie', 'braces', 'invisalign', 'kieferorthopädie'],
  'Root Canal': ['canal', 'endodontie', 'root canal', 'wurzelbehandlung'],
  Extraction: ['extractie', 'scoate', 'extraction', 'extraktion'],
  Consultation: ['consultatie', 'consultare', 'consultation', 'beratung'],
};

// Urgency keywords
const URGENCY_KEYWORDS = [
  'urgent',
  'durere',
  'pain',
  'emergency',
  'imediat',
  'immediately',
  'azi',
  'today',
  'maine',
  'tomorrow',
  'repede',
  'quickly',
  'fast',
  'nu pot manca',
  'cannot eat',
  'sangereaza',
  'bleeding',
  'umflat',
  'swollen',
];

// Budget keywords
const BUDGET_KEYWORDS = [
  'pret',
  'price',
  'cost',
  'costa',
  'cat',
  'how much',
  'buget',
  'budget',
  'rate',
  'installments',
  'financing',
  'finantare',
  'afford',
  'expensive',
];

// Decision keywords
const DECISION_KEYWORDS = [
  'vreau',
  'want',
  'doresc',
  'wish',
  'programare',
  'appointment',
  'cand pot',
  'when can',
  'schedule',
  'book',
  'rezerva',
  'decide',
  'decizie',
  'ready',
];

function detectProcedures(message: string): string[] {
  const lowerMessage = message.toLowerCase();
  const detected: string[] = [];

  for (const [procedure, keywords] of Object.entries(PROCEDURE_KEYWORDS)) {
    if (keywords.some((keyword) => lowerMessage.includes(keyword))) {
      detected.push(procedure);
    }
  }

  return detected;
}

function hasUrgency(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return URGENCY_KEYWORDS.some((keyword) => lowerMessage.includes(keyword));
}

function hasBudgetMention(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return BUDGET_KEYWORDS.some((keyword) => lowerMessage.includes(keyword));
}

function hasDecisionIntent(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return DECISION_KEYWORDS.some((keyword) => lowerMessage.includes(keyword));
}

function calculateScore(message: string): ScoringResult {
  const startTime = Date.now();

  const procedures = detectProcedures(message);
  const isUrgent = hasUrgency(message);
  const mentionsBudget = hasBudgetMention(message);
  const hasIntent = hasDecisionIntent(message);

  const urgencyIndicators: string[] = [];
  if (isUrgent) urgencyIndicators.push('priority_scheduling_requested');
  if (mentionsBudget) urgencyIndicators.push('budget_discussion');
  if (hasIntent) urgencyIndicators.push('ready_to_schedule');

  // Premium procedure detection (All-on-4, implants)
  const isPremiumProcedure = procedures.some((p) =>
    ['All-on-4', 'Dental Implants', 'Veneers'].includes(p)
  );

  // Score calculation
  let score = 1;
  let classification: ScoringResult['classification'] = 'UNQUALIFIED';
  let confidence = 0.7;
  let reasoning = '';
  let suggestedAction = '';

  // Score 5: Premium procedure + budget/decision signals
  if (isPremiumProcedure && (mentionsBudget || hasIntent)) {
    score = 5;
    classification = 'HOT';
    confidence = 0.96;
    reasoning = `High-value lead: Interest in ${procedures.join(', ')} with ${mentionsBudget ? 'budget inquiry' : 'scheduling intent'}`;
    suggestedAction = 'Priority: Contact within 30 minutes';
  }
  // Score 5: Urgent need
  else if (isUrgent && procedures.length > 0) {
    score = 5;
    classification = 'HOT';
    confidence = 0.98;
    reasoning = `Emergency case: ${urgencyIndicators.includes('priority_scheduling_requested') ? 'Pain/urgency indicators detected' : ''} for ${procedures.join(', ')}`;
    suggestedAction = 'Immediate callback required - emergency protocol';
  }
  // Score 4: Clear procedure + timeline
  else if (procedures.length > 0 && hasIntent) {
    score = 4;
    classification = 'HOT';
    confidence = 0.91;
    reasoning = `Strong buying signal: Clear interest in ${procedures.join(', ')} with scheduling intent`;
    suggestedAction = 'Schedule consultation within 2 hours';
  }
  // Score 4: Premium procedure interest
  else if (isPremiumProcedure) {
    score = 4;
    classification = 'HOT';
    confidence = 0.88;
    reasoning = `High-value prospect: Interest in premium procedure (${procedures.join(', ')})`;
    suggestedAction = 'Personalized follow-up with case examples';
  }
  // Score 3: General procedure interest
  else if (procedures.length > 0) {
    score = 3;
    classification = 'WARM';
    confidence = 0.82;
    reasoning = `Active consideration: Interest in ${procedures.join(', ')} - needs nurturing`;
    suggestedAction = 'Add to nurture sequence with educational content';
  }
  // Score 2: Budget inquiry without procedure
  else if (mentionsBudget) {
    score = 2;
    classification = 'COLD';
    confidence = 0.75;
    reasoning = 'Early-stage research: Price shopping without specific procedure interest';
    suggestedAction = 'Send pricing guide and consultation offer';
  }
  // Score 1: No clear intent
  else {
    score = 1;
    classification = 'UNQUALIFIED';
    confidence = 0.7;
    reasoning = 'Low intent: No clear procedure interest or decision signals detected';
    suggestedAction = 'Add to general newsletter list';
  }

  const processingTime = Date.now() - startTime;

  return {
    score,
    classification,
    confidence: Math.round(confidence * 100) / 100,
    reasoning,
    procedureInterest: procedures,
    budgetMentioned: mentionsBudget,
    urgencyIndicators,
    suggestedAction,
    processingTime,
  };
}

interface DemoScoreRequestBody {
  message?: string;
  source?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DemoScoreRequestBody;
    const message = body.message;
    const source = body.source ?? 'demo';

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Add artificial delay to simulate AI processing (300-800ms)
    await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 500));

    const result = calculateScore(message);

    return NextResponse.json({
      success: true,
      leadId: `demo-${Date.now()}`,
      source,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error('Demo scoring error:', error);
    return NextResponse.json({ error: 'Scoring failed' }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'Demo Lead Scoring API',
    version: '1.0.0',
    features: [
      'Multi-language support (RO, EN, DE)',
      'Procedure detection',
      'Urgency classification',
      'Budget signal detection',
      'Decision intent analysis',
    ],
  });
}
