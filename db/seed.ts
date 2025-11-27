/**
 * Database Seed Script
 *
 * Populates the database with fictitious leads for local development.
 * Run with: pnpm db:seed
 *
 * This creates realistic test data so developers don't have to work with empty interfaces.
 */

import { randomUUID } from 'crypto';
import pg from 'pg';

const { Client } = pg;

// =============================================================================
// Configuration
// =============================================================================

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/medicalcor_dev';

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
    } catch {
      // Ignore duplicates
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
      } catch {
        // Ignore errors
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
      } catch {
        // Ignore errors
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
      } catch {
        // Ignore errors
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
      } catch {
        // Ignore errors
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
      } catch {
        // Ignore errors
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
    } catch {
      // Ignore errors
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
  } catch {
    // Ignore errors
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
    } catch {
      // Ignore errors
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

    console.log();
    console.log('='.repeat(60));
    console.log('  Seed completed successfully!');
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
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
