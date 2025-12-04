/**
 * Database Seed Script
 *
 * Populates the database with fictitious leads for local development.
 * Run with: pnpm db:seed
 *
 * This creates realistic test data so developers don't have to work with empty interfaces.
 *
 * SECURITY: This script should NEVER be run in production environments.
 */

import { randomUUID } from 'crypto';
import pg from 'pg';

const { Client } = pg;

// =============================================================================
// Environment Safety Check
// =============================================================================

if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: Cannot run seed script in production environment!');
  console.error('This script is only for development/testing.');
  process.exit(1);
}

// =============================================================================
// Error Tracking for Comprehensive Reporting
// =============================================================================

interface SeedError {
  table: string;
  operation: string;
  error: unknown;
}

const seedErrors: SeedError[] = [];

function logSeedError(table: string, operation: string, error: unknown): void {
  seedErrors.push({ table, operation, error });
  if (process.env.DEBUG === 'true') {
    console.error(
      `  [ERROR] ${table}:${operation}:`,
      error instanceof Error ? error.message : error
    );
  }
}

// =============================================================================
// Configuration
// =============================================================================

// SECURITY FIX: Removed hardcoded credentials - DATABASE_URL must be explicitly set
// For local development, set DATABASE_URL in your .env file or shell environment
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  console.error('Set it in your .env file or shell environment.');
  console.error('Example: DATABASE_URL=postgres://user:pass@localhost:5432/medicalcor_dev');
  process.exit(1);
}

// =============================================================================
// Sample Data
// =============================================================================

const FIRST_NAMES = [
  'Maria',
  'Ion',
  'Elena',
  'Andrei',
  'Ana',
  'Alexandru',
  'Ioana',
  'Mihai',
  'Cristina',
  'George',
  'Daniela',
  'Stefan',
  'Monica',
  'Adrian',
  'Raluca',
  'Florin',
  'Carmen',
  'Radu',
  'Alina',
  'Bogdan',
];

const LAST_NAMES = [
  'Popescu',
  'Ionescu',
  'Popa',
  'Dumitru',
  'Stan',
  'Stoica',
  'Gheorghe',
  'Rusu',
  'Marin',
  'Constantin',
  'Ciobanu',
  'Moldovan',
  'Matei',
  'Dobre',
  'Barbu',
  'Nistor',
  'Toma',
  'Neagu',
  'Stanciu',
  'Ene',
];

const CLASSIFICATIONS = ['HOT', 'WARM', 'COLD', 'UNQUALIFIED'] as const;

const MESSAGE_TEMPLATES = [
  'Buna ziua, as dori informatii despre implant dentar',
  'Cat costa o albire dentara?',
  'Am nevoie de o programare urgenta pentru durere de masea',
  'Vreau sa fac o consultatie pentru aparat dentar',
  'As dori sa stiu preturile pentru coroane dentare',
  'Pot sa vin maine pentru o verificare?',
  'Ce tratamente aveti disponibile pentru parodontoza?',
  'Sunt interesat de implant dentar. Ce optiuni aveti?',
  'Copilul meu are nevoie de ortodontie. Ce recomandati?',
  'Vreau sa inlocuiesc o plomba veche',
];

const SCORING_REASONS = [
  'Lead-ul a mentionat implant dentar - serviciu cu valoare mare',
  'A intrebat despre preturi - semn de interes real',
  'Urgenta mentionata - potential client imediat',
  'Interesat de tratamente complexe',
  'Programare solicitata activ',
  'Mesaj scurt, informatii insuficiente pentru scorare',
  'A mentionat doar consultatie de rutina',
  'Potential client pentru servicii estetice',
];

// Medical Procedures with realistic prices (in EUR)
const MEDICAL_PROCEDURES = [
  // Implantology - High Value
  {
    name: 'Implant dentar Premium (Nobel Biocare)',
    category: 'implantology',
    priceMin: 800,
    priceMax: 1200,
    duration: 60,
    isHighValue: true,
  },
  {
    name: 'Implant dentar Standard (MegaGen)',
    category: 'implantology',
    priceMin: 500,
    priceMax: 700,
    duration: 60,
    isHighValue: true,
  },
  {
    name: 'All-on-4 (per arcadă)',
    category: 'implantology',
    priceMin: 5000,
    priceMax: 8000,
    duration: 180,
    isHighValue: true,
  },
  {
    name: 'All-on-6 (per arcadă)',
    category: 'implantology',
    priceMin: 7000,
    priceMax: 12000,
    duration: 240,
    isHighValue: true,
  },
  {
    name: 'Sinus lift',
    category: 'implantology',
    priceMin: 600,
    priceMax: 1000,
    duration: 90,
    isHighValue: true,
  },
  {
    name: 'Augmentare osoasă',
    category: 'implantology',
    priceMin: 400,
    priceMax: 800,
    duration: 60,
    isHighValue: true,
  },

  // Prosthodontics
  {
    name: 'Coroană zirconiu',
    category: 'prosthodontics',
    priceMin: 300,
    priceMax: 450,
    duration: 60,
    isHighValue: false,
  },
  {
    name: 'Coroană metalo-ceramică',
    category: 'prosthodontics',
    priceMin: 200,
    priceMax: 300,
    duration: 45,
    isHighValue: false,
  },
  {
    name: 'Fațetă ceramică (e.max)',
    category: 'prosthodontics',
    priceMin: 350,
    priceMax: 500,
    duration: 45,
    isHighValue: true,
  },
  {
    name: 'Proteză totală mobilă',
    category: 'prosthodontics',
    priceMin: 400,
    priceMax: 700,
    duration: 90,
    isHighValue: false,
  },
  {
    name: 'Proteză scheletată',
    category: 'prosthodontics',
    priceMin: 500,
    priceMax: 800,
    duration: 90,
    isHighValue: false,
  },
  {
    name: 'Pod dentar (3 unități)',
    category: 'prosthodontics',
    priceMin: 600,
    priceMax: 1000,
    duration: 90,
    isHighValue: false,
  },

  // Endodontics
  {
    name: 'Tratament de canal monoradicular',
    category: 'endodontics',
    priceMin: 150,
    priceMax: 250,
    duration: 60,
    isHighValue: false,
  },
  {
    name: 'Tratament de canal pluriradicular',
    category: 'endodontics',
    priceMin: 200,
    priceMax: 350,
    duration: 90,
    isHighValue: false,
  },
  {
    name: 'Retratament endodontic',
    category: 'endodontics',
    priceMin: 250,
    priceMax: 400,
    duration: 90,
    isHighValue: false,
  },

  // Orthodontics - High Value
  {
    name: 'Aparat dentar metalic (complet)',
    category: 'orthodontics',
    priceMin: 1500,
    priceMax: 2500,
    duration: 45,
    isHighValue: true,
  },
  {
    name: 'Aparat dentar ceramic (complet)',
    category: 'orthodontics',
    priceMin: 2000,
    priceMax: 3500,
    duration: 45,
    isHighValue: true,
  },
  {
    name: 'Invisalign (tratament complet)',
    category: 'orthodontics',
    priceMin: 3000,
    priceMax: 5000,
    duration: 45,
    isHighValue: true,
  },
  {
    name: 'Gutieră de contenție',
    category: 'orthodontics',
    priceMin: 150,
    priceMax: 250,
    duration: 30,
    isHighValue: false,
  },

  // Aesthetics
  {
    name: 'Albire dentară profesională',
    category: 'aesthetics',
    priceMin: 200,
    priceMax: 350,
    duration: 60,
    isHighValue: false,
  },
  {
    name: 'Albire cu lampă Zoom',
    category: 'aesthetics',
    priceMin: 300,
    priceMax: 450,
    duration: 90,
    isHighValue: false,
  },
  {
    name: 'Bonding estetic (per dinte)',
    category: 'aesthetics',
    priceMin: 80,
    priceMax: 150,
    duration: 30,
    isHighValue: false,
  },

  // Surgery
  {
    name: 'Extractie simplă',
    category: 'surgery',
    priceMin: 50,
    priceMax: 100,
    duration: 30,
    isHighValue: false,
  },
  {
    name: 'Extractie chirurgicală',
    category: 'surgery',
    priceMin: 100,
    priceMax: 200,
    duration: 45,
    isHighValue: false,
  },
  {
    name: 'Extractie molar de minte inclus',
    category: 'surgery',
    priceMin: 200,
    priceMax: 400,
    duration: 60,
    isHighValue: false,
  },

  // General
  {
    name: 'Consultație + plan de tratament',
    category: 'general',
    priceMin: 0,
    priceMax: 50,
    duration: 30,
    isHighValue: false,
  },
  {
    name: 'Detartraj + periaj profesional',
    category: 'general',
    priceMin: 80,
    priceMax: 150,
    duration: 45,
    isHighValue: false,
  },
  {
    name: 'Plomba compozit',
    category: 'general',
    priceMin: 80,
    priceMax: 150,
    duration: 30,
    isHighValue: false,
  },
  {
    name: 'Plomba ceramică (inlay/onlay)',
    category: 'general',
    priceMin: 200,
    priceMax: 350,
    duration: 45,
    isHighValue: false,
  },
];

// WhatsApp Message Templates (Meta-approved format)
const WHATSAPP_TEMPLATES = [
  {
    name: 'appointment_reminder_24h',
    category: 'appointment',
    language: 'ro',
    content: `Bună ziua, {{1}}! 👋

Vă reamintim că aveți o programare mâine, {{2}}, la ora {{3}}.

📍 Clinica {{4}}
🦷 Procedură: {{5}}

Vă rugăm să confirmați prezența răspunzând cu DA sau să anulați cu cel puțin 4 ore înainte.

Cu respect,
Echipa {{4}}`,
    variables: ['patientName', 'date', 'time', 'clinicName', 'procedure'],
    headerType: 'text',
    buttonsType: 'quick_reply',
    buttons: ['Confirm', 'Reprogramează', 'Anulează'],
  },
  {
    name: 'appointment_confirmation',
    category: 'appointment',
    language: 'ro',
    content: `Programare confirmată! ✅

{{1}}, programarea dumneavoastră a fost înregistrată:

📅 Data: {{2}}
🕐 Ora: {{3}}
🦷 Procedură: {{4}}
👨‍⚕️ Doctor: {{5}}

📍 {{6}}

Vă așteptăm cu drag!`,
    variables: ['patientName', 'date', 'time', 'procedure', 'doctorName', 'address'],
    headerType: 'text',
  },
  {
    name: 'welcome_new_lead',
    category: 'marketing',
    language: 'ro',
    content: `Bună ziua! 👋

Mulțumim pentru interesul acordat clinicii noastre dentare!

Suntem aici să vă ajutăm cu:
🦷 Consultații gratuite de evaluare
💎 Tratamente estetice de ultimă generație
🏥 Implanturi și proteze premium

Cum vă putem fi de folos astăzi?`,
    variables: [],
    headerType: 'text',
    buttonsType: 'quick_reply',
    buttons: ['Vreau programare', 'Întrebare prețuri', 'Urgență dentară'],
  },
  {
    name: 'post_treatment_followup',
    category: 'followup',
    language: 'ro',
    content: `Bună ziua, {{1}}! 🌟

Sperăm că vă simțiți bine după tratamentul de {{2}}.

Vă rugăm să ne spuneți cum vă simțiți:
- Aveți dureri sau disconfort?
- Ați urmat indicațiile post-tratament?

Suntem aici pentru orice întrebare!

Echipa {{3}}`,
    variables: ['patientName', 'procedure', 'clinicName'],
    headerType: 'text',
    buttonsType: 'quick_reply',
    buttons: ['Mă simt bine', 'Am o întrebare', 'Am nevoie de ajutor'],
  },
  {
    name: 'payment_reminder',
    category: 'billing',
    language: 'ro',
    content: `Bună ziua, {{1}}.

Vă informăm că aveți o factură restantă în valoare de {{2}} EUR pentru tratamentul din data de {{3}}.

Modalități de plată:
💳 Card la recepție
🏦 Transfer bancar
📱 Plată online

Vă rugăm să ne contactați pentru orice întrebare.`,
    variables: ['patientName', 'amount', 'treatmentDate'],
    headerType: 'text',
  },
  {
    name: 'recall_checkup',
    category: 'recall',
    language: 'ro',
    content: `Bună ziua, {{1}}! 😊

Au trecut {{2}} luni de la ultima vizită la clinica noastră.

Este timpul pentru un control de rutină pentru:
✓ Verificare generală
✓ Detartraj profesional
✓ Evaluare tratament anterior

Programați-vă acum și beneficiați de 10% reducere!`,
    variables: ['patientName', 'monthsSinceLastVisit'],
    headerType: 'text',
    buttonsType: 'call_to_action',
    buttons: ['Programează acum'],
  },
];

// =============================================================================
// Helpers
// =============================================================================

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomPhone(): string {
  // Romanian mobile phone format: +40 7XX XXX XXX
  const prefix = ['72', '73', '74', '75', '76', '77', '78'];
  const num1 = Math.floor(Math.random() * 900) + 100;
  const num2 = Math.floor(Math.random() * 900) + 100;
  return `+40${randomChoice(prefix)}${num1}${num2}`;
}

function randomDate(daysBack: number): Date {
  const now = new Date();
  const pastDate = new Date(now.getTime() - Math.random() * daysBack * 24 * 60 * 60 * 1000);
  return pastDate;
}

function randomScore(): number {
  // Weighted towards middle scores
  const weights = [0.1, 0.25, 0.3, 0.25, 0.1]; // 1-5
  const random = Math.random();
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i]!;
    if (random <= cumulative) return i + 1;
  }
  return 3;
}

function randomConfidence(): number {
  // Confidence between 0.6 and 0.98
  return 0.6 + Math.random() * 0.38;
}

function hashContent(content: string): string {
  // Simple hash for content deduplication
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

// =============================================================================
// Seed Functions
// =============================================================================

interface LeadData {
  phone: string;
  firstName: string;
  lastName: string;
  hubspotId: string;
}

function generateLeads(count: number): LeadData[] {
  const leads: LeadData[] = [];
  const usedPhones = new Set<string>();

  for (let i = 0; i < count; i++) {
    let phone: string;
    do {
      phone = randomPhone();
    } while (usedPhones.has(phone));
    usedPhones.add(phone);

    leads.push({
      phone,
      firstName: randomChoice(FIRST_NAMES),
      lastName: randomChoice(LAST_NAMES),
      hubspotId: `${1000000 + i}`, // Simulated HubSpot contact IDs
    });
  }

  return leads;
}

async function seedDomainEvents(client: pg.Client, leads: LeadData[]): Promise<number> {
  let inserted = 0;

  for (const lead of leads) {
    // Create a lead.created event
    const correlationId = randomUUID();
    const idempotencyKey = `lead.created:${lead.phone}:${Date.now()}`;

    const payload = {
      phone: lead.phone,
      firstName: lead.firstName,
      lastName: lead.lastName,
      hubspotContactId: lead.hubspotId,
      channel: randomChoice(['whatsapp', 'voice', 'booking']),
      source: randomChoice(['organic', 'facebook_ads', 'google_ads', 'referral']),
    };

    try {
      await client.query(
        `INSERT INTO domain_events (type, payload, correlation_id, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        ['lead.created', JSON.stringify(payload), correlationId, idempotencyKey, randomDate(30)]
      );
      inserted++;
    } catch (error) {
      logSeedError('domain_events', 'insert', error);
    }
  }

  return inserted;
}

async function seedMessageLog(client: pg.Client, leads: LeadData[]): Promise<number> {
  let inserted = 0;

  for (const lead of leads) {
    // Generate 1-5 messages per lead
    const messageCount = Math.floor(Math.random() * 5) + 1;

    for (let i = 0; i < messageCount; i++) {
      const direction = Math.random() > 0.4 ? 'IN' : 'OUT';
      const content = randomChoice(MESSAGE_TEMPLATES);
      const messageId = `wamid.${randomUUID().replace(/-/g, '')}`;

      try {
        await client.query(
          `INSERT INTO message_log (external_message_id, phone, direction, channel, content_hash, status, correlation_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            messageId,
            lead.phone,
            direction,
            'whatsapp',
            hashContent(content),
            randomChoice(['delivered', 'read', 'sent', 'received']),
            randomUUID(),
            randomDate(14),
          ]
        );
        inserted++;
      } catch (error) {
        logSeedError('message_log', 'insert', error);
      }
    }
  }

  return inserted;
}

async function seedLeadScoringHistory(client: pg.Client, leads: LeadData[]): Promise<number> {
  let inserted = 0;

  for (const lead of leads) {
    // Generate 1-3 scoring events per lead (showing evolution)
    const scoringCount = Math.floor(Math.random() * 3) + 1;
    let lastScore = randomScore();

    for (let i = 0; i < scoringCount; i++) {
      const score = Math.min(5, Math.max(1, lastScore + Math.floor(Math.random() * 3) - 1));
      lastScore = score;

      const classification =
        score >= 4 ? 'HOT' : score === 3 ? 'WARM' : score === 2 ? 'COLD' : 'UNQUALIFIED';

      try {
        await client.query(
          `INSERT INTO lead_scoring_history (phone, hubspot_contact_id, score, classification, confidence, reasoning, model_version, correlation_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            lead.phone,
            lead.hubspotId,
            score,
            classification,
            randomConfidence().toFixed(2),
            randomChoice(SCORING_REASONS),
            'gpt-4o-2024-11-20',
            randomUUID(),
            randomDate(14 - i * 3), // Older events first
          ]
        );
        inserted++;
      } catch (error) {
        logSeedError('lead_scoring_history', 'insert', error);
      }
    }
  }

  return inserted;
}

async function seedConsentRecords(client: pg.Client, leads: LeadData[]): Promise<number> {
  let inserted = 0;

  for (const lead of leads) {
    // 80% of leads have marketing consent
    if (Math.random() < 0.8) {
      try {
        await client.query(
          `INSERT INTO consent_records (phone, hubspot_contact_id, consent_type, granted, consent_text, consent_version, ip_address, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            lead.phone,
            lead.hubspotId,
            'marketing',
            true,
            'Accept sa primesc comunicari de marketing prin WhatsApp si email.',
            '1.0',
            `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            randomDate(60),
          ]
        );
        inserted++;
      } catch (error) {
        logSeedError('consent_records', 'insert', error);
      }
    }

    // 60% have communication consent
    if (Math.random() < 0.6) {
      try {
        await client.query(
          `INSERT INTO consent_records (phone, hubspot_contact_id, consent_type, granted, consent_text, consent_version, ip_address, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            lead.phone,
            lead.hubspotId,
            'communication',
            true,
            'Accept sa fiu contactat pentru programari si informatii medicale.',
            '1.0',
            `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            randomDate(60),
          ]
        );
        inserted++;
      } catch (error) {
        logSeedError('consent_records', 'insert', error);
      }
    }

    // 40% have medical data consent
    if (Math.random() < 0.4) {
      try {
        await client.query(
          `INSERT INTO consent_records (phone, hubspot_contact_id, consent_type, granted, consent_text, consent_version, ip_address, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            lead.phone,
            lead.hubspotId,
            'medical_data',
            true,
            'Accept stocarea si procesarea datelor mele medicale conform GDPR.',
            '1.0',
            `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            randomDate(60),
          ]
        );
        inserted++;
      } catch (error) {
        logSeedError('consent_records', 'insert', error);
      }
    }
  }

  return inserted;
}

async function seedAIBudgetUsage(client: pg.Client): Promise<number> {
  let inserted = 0;
  const today = new Date();

  // Seed some daily usage data for the past 7 days
  for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    const dateStr = date.toISOString().split('T')[0];

    try {
      await client.query(
        `INSERT INTO ai_budget_usage (user_id, tenant_id, period_type, period_start, total_cost, total_tokens, request_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, tenant_id, period_type, period_start) DO NOTHING`,
        [
          'system',
          'default',
          'daily',
          dateStr,
          (5 + Math.random() * 15).toFixed(4), // $5-20 per day
          Math.floor(10000 + Math.random() * 50000), // 10k-60k tokens
          Math.floor(50 + Math.random() * 150), // 50-200 requests
        ]
      );
      inserted++;
    } catch (error) {
      logSeedError('ai_budget_usage', 'insert', error);
    }
  }

  // Seed monthly usage
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  try {
    await client.query(
      `INSERT INTO ai_budget_usage (user_id, tenant_id, period_type, period_start, total_cost, total_tokens, request_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, tenant_id, period_type, period_start) DO NOTHING`,
      [
        'system',
        'default',
        'monthly',
        monthStart.toISOString().split('T')[0],
        (100 + Math.random() * 200).toFixed(4),
        Math.floor(200000 + Math.random() * 300000),
        Math.floor(1000 + Math.random() * 2000),
      ]
    );
    inserted++;
  } catch (error) {
    logSeedError('ai_budget_usage', 'insert', error);
  }

  return inserted;
}

async function seedAIProviderMetrics(client: pg.Client): Promise<number> {
  let inserted = 0;
  const providers = ['openai', 'anthropic'];
  const operations = ['lead_scoring', 'reply_generation', 'summary', 'embedding'];
  const models = ['gpt-4o', 'gpt-4o-mini', 'claude-3-haiku'];

  // Generate 50 provider metrics entries
  for (let i = 0; i < 50; i++) {
    const success = Math.random() > 0.05; // 95% success rate
    const provider = randomChoice(providers);
    const operation = randomChoice(operations);
    const model = randomChoice(models);
    const responseTime = success ? 200 + Math.random() * 2000 : 5000 + Math.random() * 5000;

    try {
      await client.query(
        `INSERT INTO ai_provider_metrics (provider, operation_type, success, response_time_ms, used_fallback, model, input_tokens, output_tokens, cost, correlation_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          provider,
          operation,
          success,
          Math.floor(responseTime),
          !success && Math.random() > 0.5, // 50% use fallback on failure
          model,
          Math.floor(100 + Math.random() * 500),
          Math.floor(50 + Math.random() * 300),
          (0.001 + Math.random() * 0.05).toFixed(6),
          randomUUID(),
          randomDate(7),
        ]
      );
      inserted++;
    } catch (error) {
      logSeedError('ai_provider_metrics', 'insert', error);
    }
  }

  return inserted;
}

// =============================================================================
// Seed Medical Procedures
// =============================================================================

async function seedMedicalProcedures(client: pg.Client): Promise<number> {
  let inserted = 0;

  // Create table if not exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS medical_procedures (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL,
      price_min DECIMAL(10,2) NOT NULL,
      price_max DECIMAL(10,2) NOT NULL,
      duration_minutes INTEGER NOT NULL,
      is_high_value BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(name)
    );

    CREATE INDEX IF NOT EXISTS idx_procedures_category ON medical_procedures(category);
    CREATE INDEX IF NOT EXISTS idx_procedures_high_value ON medical_procedures(is_high_value) WHERE is_high_value = TRUE;
  `);

  for (const proc of MEDICAL_PROCEDURES) {
    try {
      await client.query(
        `INSERT INTO medical_procedures (name, category, price_min, price_max, duration_minutes, is_high_value)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (name) DO UPDATE SET
           price_min = EXCLUDED.price_min,
           price_max = EXCLUDED.price_max,
           duration_minutes = EXCLUDED.duration_minutes,
           is_high_value = EXCLUDED.is_high_value,
           updated_at = NOW()`,
        [proc.name, proc.category, proc.priceMin, proc.priceMax, proc.duration, proc.isHighValue]
      );
      inserted++;
    } catch (error) {
      logSeedError('medical_procedures', 'insert', error);
    }
  }

  return inserted;
}

// =============================================================================
// Seed WhatsApp Templates
// =============================================================================

async function seedWhatsAppTemplates(client: pg.Client): Promise<number> {
  let inserted = 0;

  // Create table if not exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL,
      language VARCHAR(10) NOT NULL DEFAULT 'ro',
      content TEXT NOT NULL,
      variables JSONB DEFAULT '[]',
      header_type VARCHAR(50),
      buttons_type VARCHAR(50),
      buttons JSONB DEFAULT '[]',
      meta_template_id VARCHAR(255),
      meta_status VARCHAR(50) DEFAULT 'pending',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(name, language)
    );

    CREATE INDEX IF NOT EXISTS idx_templates_category ON whatsapp_templates(category);
    CREATE INDEX IF NOT EXISTS idx_templates_active ON whatsapp_templates(is_active) WHERE is_active = TRUE;
  `);

  for (const template of WHATSAPP_TEMPLATES) {
    try {
      await client.query(
        `INSERT INTO whatsapp_templates (name, category, language, content, variables, header_type, buttons_type, buttons)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (name, language) DO UPDATE SET
           content = EXCLUDED.content,
           variables = EXCLUDED.variables,
           header_type = EXCLUDED.header_type,
           buttons_type = EXCLUDED.buttons_type,
           buttons = EXCLUDED.buttons,
           updated_at = NOW()`,
        [
          template.name,
          template.category,
          template.language,
          template.content,
          JSON.stringify(template.variables),
          template.headerType ?? null,
          template.buttonsType ?? null,
          JSON.stringify(template.buttons ?? []),
        ]
      );
      inserted++;
    } catch (error) {
      logSeedError('whatsapp_templates', 'insert', error);
    }
  }

  return inserted;
}

// =============================================================================
// Seed System Prompts (from ai-gateway/system-prompts.ts defaults)
// =============================================================================

async function seedSystemPrompts(client: pg.Client): Promise<number> {
  let inserted = 0;

  // Create table if not exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS system_prompts (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL,
      version VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      variables JSONB DEFAULT '[]',
      metadata JSONB DEFAULT '{}',
      tenant_id VARCHAR(255),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_prompts_category ON system_prompts(category);
    CREATE INDEX IF NOT EXISTS idx_prompts_tenant ON system_prompts(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_prompts_active ON system_prompts(is_active) WHERE is_active = TRUE;
  `);

  // Default system prompts
  const systemPrompts = [
    {
      id: 'lead_scoring_v1',
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
      },
    },
    {
      id: 'reply_generation_v1',
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

Răspunde la mesajul pacientului într-un mod natural și util.`,
      variables: ['clinicName', 'phoneNumber', 'priceList', 'patientMessage'],
      metadata: { description: 'Generare răspunsuri WhatsApp', maxTokens: 300, temperature: 0.7 },
    },
    {
      id: 'triage_v1',
      name: 'Medical Triage',
      category: 'triage',
      version: '1.0.0',
      content: `Ești un sistem de triaj medical pentru stomatologie. Analizezi simptomele raportate și prioritizezi urgența.

NIVELURI DE URGENȚĂ:
- URGENT (roșu): Durere severă, sângerare abundentă, traumatism facial, abces cu febră
- PRIORITAR (portocaliu): Durere moderată persistentă, inflamație vizibilă, proteze rupte
- STANDARD (galben): Durere minoră, consultație de rutină, estetică
- ELECTIV (verde): Curățare, control periodic, informații generale

RĂSPUNS JSON:
{
  "urgencyLevel": "<URGENT|PRIORITY|STANDARD|ELECTIVE>",
  "urgencyScore": <1-10>,
  "symptoms": ["<simptome identificate>"],
  "recommendedTimeframe": "<imediat|24h|3-5 zile|2 săptămâni>",
  "triageNotes": "<note pentru echipa medicală>"
}`,
      variables: ['patientSymptoms', 'patientAge', 'medicalHistory'],
      metadata: {
        description: 'Triaj medical pentru programări urgente',
        maxTokens: 400,
        temperature: 0.2,
      },
    },
  ];

  for (const prompt of systemPrompts) {
    try {
      await client.query(
        `INSERT INTO system_prompts (id, name, category, version, content, variables, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           content = EXCLUDED.content,
           variables = EXCLUDED.variables,
           metadata = EXCLUDED.metadata,
           version = EXCLUDED.version,
           updated_at = NOW()`,
        [
          prompt.id,
          prompt.name,
          prompt.category,
          prompt.version,
          prompt.content,
          JSON.stringify(prompt.variables),
          JSON.stringify(prompt.metadata),
        ]
      );
      inserted++;
    } catch (error) {
      logSeedError('system_prompts', 'insert', error);
    }
  }

  return inserted;
}

// =============================================================================
// Seed Supervisor Data
// =============================================================================

// Sample Supervisors with Romanian names and realistic data
const SUPERVISORS = [
  {
    id: 'sup_ana_popescu',
    name: 'Ana Popescu',
    email: 'ana.popescu@dentalclinic.ro',
    role: 'admin',
    department: 'Operations',
    phone: '+40721234567',
    skills: ['dental', 'implantology', 'orthodontics'],
    languages: ['ro', 'en'],
  },
  {
    id: 'sup_mihai_ionescu',
    name: 'Mihai Ionescu',
    email: 'mihai.ionescu@dentalclinic.ro',
    role: 'manager',
    department: 'Customer Service',
    phone: '+40722345678',
    skills: ['dental', 'general'],
    languages: ['ro', 'en', 'de'],
  },
  {
    id: 'sup_elena_dumitru',
    name: 'Elena Dumitru',
    email: 'elena.dumitru@dentalclinic.ro',
    role: 'supervisor',
    department: 'Voice Support',
    phone: '+40723456789',
    skills: ['dental', 'aesthetics'],
    languages: ['ro', 'en'],
  },
  {
    id: 'sup_george_stan',
    name: 'George Stan',
    email: 'george.stan@dentalclinic.ro',
    role: 'supervisor',
    department: 'AI Oversight',
    phone: '+40724567890',
    skills: ['dental', 'endodontics'],
    languages: ['ro'],
  },
  {
    id: 'sup_cristina_rusu',
    name: 'Cristina Rusu',
    email: 'cristina.rusu@dentalclinic.ro',
    role: 'supervisor',
    department: 'Quality Assurance',
    phone: '+40725678901',
    skills: ['dental', 'prosthodontics'],
    languages: ['ro', 'en', 'fr'],
  },
];

async function seedSupervisors(client: pg.Client): Promise<number> {
  let inserted = 0;

  // Create table if not exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS supervisors (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      role VARCHAR(50) NOT NULL CHECK (role IN ('supervisor', 'manager', 'admin')),
      department VARCHAR(255),
      phone VARCHAR(50),
      skills JSONB DEFAULT '[]',
      languages JSONB DEFAULT '[]',
      is_active BOOLEAN DEFAULT TRUE,
      last_login TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_supervisors_role ON supervisors(role);
    CREATE INDEX IF NOT EXISTS idx_supervisors_active ON supervisors(is_active) WHERE is_active = TRUE;
    CREATE INDEX IF NOT EXISTS idx_supervisors_email ON supervisors(email);
  `);

  for (const sup of SUPERVISORS) {
    try {
      await client.query(
        `INSERT INTO supervisors (id, name, email, role, department, phone, skills, languages, last_login)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           role = EXCLUDED.role,
           department = EXCLUDED.department,
           phone = EXCLUDED.phone,
           skills = EXCLUDED.skills,
           languages = EXCLUDED.languages,
           updated_at = NOW()`,
        [
          sup.id,
          sup.name,
          sup.email,
          sup.role,
          sup.department,
          sup.phone,
          JSON.stringify(sup.skills),
          JSON.stringify(sup.languages),
          randomDate(7), // Recent last login
        ]
      );
      inserted++;
    } catch (error) {
      logSeedError('supervisors', 'insert', error);
    }
  }

  return inserted;
}

async function seedCallMonitoringHistory(client: pg.Client, leads: LeadData[]): Promise<number> {
  let inserted = 0;

  // Create table if not exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS call_monitoring_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      call_sid VARCHAR(255) NOT NULL,
      vapi_call_id VARCHAR(255),
      customer_phone VARCHAR(50) NOT NULL,
      direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
      state VARCHAR(50) NOT NULL,
      duration_seconds INTEGER DEFAULT 0,
      sentiment VARCHAR(20) CHECK (sentiment IN ('positive', 'neutral', 'negative')),
      flags JSONB DEFAULT '[]',
      escalated BOOLEAN DEFAULT FALSE,
      escalation_reason TEXT,
      handoff_to_agent VARCHAR(255),
      supervisor_notes TEXT,
      transcript_summary TEXT,
      ai_confidence DECIMAL(5,4),
      started_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_call_history_phone ON call_monitoring_history(customer_phone);
    CREATE INDEX IF NOT EXISTS idx_call_history_started ON call_monitoring_history(started_at);
    CREATE INDEX IF NOT EXISTS idx_call_history_escalated ON call_monitoring_history(escalated) WHERE escalated = TRUE;
  `);

  const callStates = ['completed', 'transferred', 'abandoned'];
  const sentiments = ['positive', 'neutral', 'negative'];
  const flags = [
    'escalation-requested',
    'high-value-lead',
    'complaint',
    'long-hold',
    'ai-handoff-needed',
  ];
  const escalationReasons = [
    'Customer requested human agent',
    'Complex dental procedure inquiry',
    'Insurance coverage questions',
    'Complaint about previous visit',
    'Emergency dental situation',
    'Multiple negative sentiment messages',
    'High-value lead requiring specialist',
  ];
  const transcriptSummaries = [
    'Patient inquired about dental implant procedure and pricing. AI provided overview and scheduled consultation.',
    'Customer called to confirm appointment for tomorrow. AI verified details and sent confirmation.',
    'New patient asking about orthodontic treatment options for teenager. AI explained different braces types.',
    'Returning patient with billing question. Escalated to human agent for account access.',
    'Emergency call about tooth pain. AI collected symptoms and fast-tracked urgent appointment.',
    'Patient wanted to reschedule cleaning appointment. AI found new slot and confirmed.',
    'Inquiry about teeth whitening services. AI provided pricing range and availability.',
    'Customer complained about wait time during last visit. Escalated to supervisor.',
    'Patient asking about payment plans for implant procedure. AI explained financing options.',
    'Follow-up call after root canal procedure. Patient reporting good recovery.',
  ];

  // Generate 100 historical call records for the past 30 days
  for (let i = 0; i < 100; i++) {
    const lead = randomChoice(leads);
    const startedAt = randomDate(30);
    const duration = Math.floor(Math.random() * 600) + 30; // 30 seconds to 10 minutes
    const endedAt = new Date(startedAt.getTime() + duration * 1000);
    const isEscalated = Math.random() < 0.15; // 15% escalation rate
    const sentiment = randomChoice(sentiments);
    const callFlags = Math.random() < 0.3 ? [randomChoice(flags)] : [];
    if (isEscalated && !callFlags.includes('escalation-requested')) {
      callFlags.push('escalation-requested');
    }

    try {
      await client.query(
        `INSERT INTO call_monitoring_history
         (call_sid, vapi_call_id, customer_phone, direction, state, duration_seconds,
          sentiment, flags, escalated, escalation_reason, handoff_to_agent,
          transcript_summary, ai_confidence, started_at, ended_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          `CA${randomUUID().replace(/-/g, '').slice(0, 32)}`,
          `vapi_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
          lead.phone,
          Math.random() > 0.3 ? 'inbound' : 'outbound',
          randomChoice(callStates),
          duration,
          sentiment,
          JSON.stringify(callFlags),
          isEscalated,
          isEscalated ? randomChoice(escalationReasons) : null,
          isEscalated && Math.random() > 0.3 ? randomChoice(SUPERVISORS).id : null,
          randomChoice(transcriptSummaries),
          (0.7 + Math.random() * 0.25).toFixed(4),
          startedAt,
          endedAt,
        ]
      );
      inserted++;
    } catch (error) {
      logSeedError('call_monitoring_history', 'insert', error);
    }
  }

  return inserted;
}

async function seedSupervisorSessions(client: pg.Client): Promise<number> {
  let inserted = 0;

  // Create table if not exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS supervisor_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id VARCHAR(255) NOT NULL UNIQUE,
      supervisor_id VARCHAR(255) NOT NULL REFERENCES supervisors(id),
      supervisor_name VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL,
      permissions JSONB NOT NULL,
      monitoring_mode VARCHAR(50) DEFAULT 'none' CHECK (monitoring_mode IN ('none', 'listen', 'whisper', 'barge')),
      active_call_sid VARCHAR(255),
      calls_monitored INTEGER DEFAULT 0,
      interventions INTEGER DEFAULT 0,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      is_active BOOLEAN DEFAULT TRUE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_supervisor ON supervisor_sessions(supervisor_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_active ON supervisor_sessions(is_active) WHERE is_active = TRUE;
    CREATE INDEX IF NOT EXISTS idx_sessions_started ON supervisor_sessions(started_at);
  `);

  const monitoringModes = ['none', 'listen', 'whisper'];

  // Generate session history for past 14 days
  for (const sup of SUPERVISORS) {
    const sessionsCount = Math.floor(Math.random() * 10) + 5; // 5-15 sessions per supervisor

    for (let i = 0; i < sessionsCount; i++) {
      const startedAt = randomDate(14);
      const sessionDuration = Math.floor(Math.random() * 14400) + 1800; // 30 min to 4 hours
      const endedAt = new Date(startedAt.getTime() + sessionDuration * 1000);
      const callsMonitored = Math.floor(Math.random() * 20) + 1;
      const interventions = Math.floor(Math.random() * callsMonitored * 0.3);

      const permissions =
        sup.role === 'admin'
          ? ['listen', 'whisper', 'barge', 'coach']
          : sup.role === 'manager'
            ? ['listen', 'whisper', 'barge']
            : ['listen', 'whisper'];

      try {
        await client.query(
          `INSERT INTO supervisor_sessions
           (session_id, supervisor_id, supervisor_name, role, permissions,
            monitoring_mode, calls_monitored, interventions, started_at, ended_at, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (session_id) DO NOTHING`,
          [
            `sess_${randomUUID().replace(/-/g, '')}`,
            sup.id,
            sup.name,
            sup.role,
            JSON.stringify(permissions),
            randomChoice(monitoringModes),
            callsMonitored,
            interventions,
            startedAt,
            endedAt,
            false, // Historical sessions are not active
          ]
        );
        inserted++;
      } catch (error) {
        logSeedError('supervisor_sessions', 'insert', error);
      }
    }
  }

  return inserted;
}

async function seedEscalationMetrics(client: pg.Client): Promise<number> {
  let inserted = 0;

  // Create daily metrics aggregation table
  await client.query(`
    CREATE TABLE IF NOT EXISTS supervisor_daily_metrics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      date DATE NOT NULL UNIQUE,
      total_calls INTEGER DEFAULT 0,
      ai_handled_calls INTEGER DEFAULT 0,
      escalated_calls INTEGER DEFAULT 0,
      handoffs INTEGER DEFAULT 0,
      average_handle_time_seconds INTEGER DEFAULT 0,
      average_wait_time_seconds INTEGER DEFAULT 0,
      customer_satisfaction_avg DECIMAL(5,2),
      peak_concurrent_calls INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON supervisor_daily_metrics(date);
  `);

  // Seed daily metrics for past 30 days
  const today = new Date();
  for (let daysAgo = 0; daysAgo < 30; daysAgo++) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    const dateStr = date.toISOString().split('T')[0];

    // Realistic dental clinic call volumes
    const totalCalls = Math.floor(Math.random() * 80) + 40; // 40-120 calls per day
    const aiHandled = Math.floor(totalCalls * (0.6 + Math.random() * 0.25)); // 60-85% AI handled
    const escalated = Math.floor(totalCalls * (0.08 + Math.random() * 0.12)); // 8-20% escalation
    const handoffs = Math.floor(escalated * (0.5 + Math.random() * 0.4)); // 50-90% of escalations result in handoff

    try {
      await client.query(
        `INSERT INTO supervisor_daily_metrics
         (date, total_calls, ai_handled_calls, escalated_calls, handoffs,
          average_handle_time_seconds, average_wait_time_seconds,
          customer_satisfaction_avg, peak_concurrent_calls)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (date) DO UPDATE SET
           total_calls = EXCLUDED.total_calls,
           ai_handled_calls = EXCLUDED.ai_handled_calls,
           escalated_calls = EXCLUDED.escalated_calls,
           handoffs = EXCLUDED.handoffs,
           average_handle_time_seconds = EXCLUDED.average_handle_time_seconds,
           average_wait_time_seconds = EXCLUDED.average_wait_time_seconds,
           customer_satisfaction_avg = EXCLUDED.customer_satisfaction_avg,
           peak_concurrent_calls = EXCLUDED.peak_concurrent_calls,
           updated_at = NOW()`,
        [
          dateStr,
          totalCalls,
          aiHandled,
          escalated,
          handoffs,
          Math.floor(Math.random() * 180) + 120, // 2-5 min average handle time
          Math.floor(Math.random() * 45) + 15, // 15-60 sec average wait time
          (3.5 + Math.random() * 1.3).toFixed(2), // 3.5-4.8 satisfaction
          Math.floor(Math.random() * 8) + 3, // 3-11 peak concurrent
        ]
      );
      inserted++;
    } catch (error) {
      logSeedError('supervisor_daily_metrics', 'insert', error);
    }
  }

  return inserted;
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  MedicalCor Database Seed Script');
  console.log('='.repeat(60));
  console.log();

  const client = new Client({ connectionString: DATABASE_URL });

  try {
    console.log(`Connecting to database...`);
    await client.connect();
    console.log('Connected!\n');

    // Generate fictitious leads
    const leadCount = 50;
    console.log(`Generating ${leadCount} fictitious leads...`);
    const leads = generateLeads(leadCount);
    console.log(`Generated ${leads.length} leads\n`);

    // Seed each table
    console.log('Seeding tables...\n');

    const domainEvents = await seedDomainEvents(client, leads);
    console.log(`  domain_events: ${domainEvents} records`);

    const messages = await seedMessageLog(client, leads);
    console.log(`  message_log: ${messages} records`);

    const scoringHistory = await seedLeadScoringHistory(client, leads);
    console.log(`  lead_scoring_history: ${scoringHistory} records`);

    const consents = await seedConsentRecords(client, leads);
    console.log(`  consent_records: ${consents} records`);

    const budgetUsage = await seedAIBudgetUsage(client);
    console.log(`  ai_budget_usage: ${budgetUsage} records`);

    const providerMetrics = await seedAIProviderMetrics(client);
    console.log(`  ai_provider_metrics: ${providerMetrics} records`);

    const procedures = await seedMedicalProcedures(client);
    console.log(`  medical_procedures: ${procedures} records`);

    const templates = await seedWhatsAppTemplates(client);
    console.log(`  whatsapp_templates: ${templates} records`);

    const prompts = await seedSystemPrompts(client);
    console.log(`  system_prompts: ${prompts} records`);

    // Supervisor data (W3 milestone)
    const supervisors = await seedSupervisors(client);
    console.log(`  supervisors: ${supervisors} records`);

    const callHistory = await seedCallMonitoringHistory(client, leads);
    console.log(`  call_monitoring_history: ${callHistory} records`);

    const supervisorSessions = await seedSupervisorSessions(client);
    console.log(`  supervisor_sessions: ${supervisorSessions} records`);

    const dailyMetrics = await seedEscalationMetrics(client);
    console.log(`  supervisor_daily_metrics: ${dailyMetrics} records`);

    console.log();
    console.log('='.repeat(60));
    // Report any errors that occurred during seeding
    if (seedErrors.length > 0) {
      console.log();
      console.log('='.repeat(60));
      console.log(`  ⚠️  Seed completed with ${seedErrors.length} error(s)`);
      console.log('='.repeat(60));
      console.log();

      // Group errors by table
      const errorsByTable = seedErrors.reduce(
        (acc, err) => {
          const key = err.table;
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      console.log('Errors by table:');
      for (const [table, count] of Object.entries(errorsByTable)) {
        console.log(`  ${table}: ${count} error(s)`);
      }

      if (process.env.DEBUG === 'true') {
        console.log();
        console.log('Detailed errors:');
        for (const err of seedErrors.slice(0, 10)) {
          console.log(
            `  - ${err.table}:${err.operation}: ${err.error instanceof Error ? err.error.message : String(err.error)}`
          );
        }
        if (seedErrors.length > 10) {
          console.log(`  ... and ${seedErrors.length - 10} more`);
        }
      } else {
        console.log();
        console.log('Run with DEBUG=true for detailed error output');
      }
    } else {
      console.log('  ✅ Seed completed successfully!');
    }

    console.log('='.repeat(60));
    console.log();
    console.log('Sample leads created:');
    console.log();

    // Show some sample leads
    for (let i = 0; i < Math.min(5, leads.length); i++) {
      const lead = leads[i]!;
      console.log(`  ${lead.firstName} ${lead.lastName}`);
      console.log(`    Phone: ${lead.phone}`);
      console.log(`    HubSpot ID: ${lead.hubspotId}`);
      console.log();
    }
  } catch (error) {
    console.error();
    console.error('='.repeat(60));
    console.error('  ❌ SEED FAILED');
    console.error('='.repeat(60));
    console.error();
    console.error('Error:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error();
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('Database connection closed.');
  }
}

main().catch((error: unknown) => {
  console.error('Unhandled error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
