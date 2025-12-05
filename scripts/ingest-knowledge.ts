/**
 * Knowledge Base Ingest Script
 *
 * Ingests markdown documents from docs/knowledge/ into the RAG knowledge base.
 * Processes files, generates embeddings, and stores them in PostgreSQL with pgvector.
 *
 * Features:
 * - Chunking with overlap for better context
 * - Batch embedding for efficiency
 * - Deduplication via content hash
 * - Progress logging
 *
 * Usage:
 *   pnpm tsx scripts/ingest-knowledge.ts
 *   pnpm db:ingest
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
  // Directory containing knowledge files
  docsDir: path.resolve(process.cwd(), 'docs/knowledge'),

  // Chunk settings for long documents
  maxChunkSize: 1500, // Characters per chunk
  chunkOverlap: 200, // Overlap between chunks

  // Embedding settings
  embeddingModel: 'text-embedding-3-small',
  embeddingDimensions: 1536,

  // Batch processing
  batchSize: 10, // Files per batch for embedding

  // Source type mapping based on filename prefix
  sourceTypeMap: {
    'faq-': 'faq',
    'protocol-': 'clinic_protocol',
    'treatment-': 'treatment_info',
    'pricing-': 'pricing_info',
    'policy-': 'appointment_policy',
    'consent-': 'consent_template',
    'marketing-': 'marketing_content',
  } as Record<string, string>,
};

// =============================================================================
// Types
// =============================================================================

interface KnowledgeEntry {
  title: string;
  content: string;
  contentHash: string;
  sourceType: string;
  language: string;
  chunkIndex: number;
  chunkTotal: number;
  metadata: Record<string, unknown>;
  embedding?: number[];
}

interface EmbeddingResponse {
  data: { embedding: number[] }[];
  usage: { total_tokens: number };
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Hash content for deduplication
 */
function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Split text into overlapping chunks
 */
function chunkText(text: string, maxSize: number, overlap: number): string[] {
  if (text.length <= maxSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxSize;

    // Try to break at a sentence or paragraph boundary
    if (end < text.length) {
      const lastNewline = text.lastIndexOf('\n', end);
      const lastPeriod = text.lastIndexOf('. ', end);

      if (lastNewline > start + maxSize / 2) {
        end = lastNewline + 1;
      } else if (lastPeriod > start + maxSize / 2) {
        end = lastPeriod + 2;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;

    // Ensure we make progress
    if (start <= chunks.length * maxSize - (chunks.length - 1) * overlap - maxSize) {
      start = end;
    }
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

/**
 * Detect source type from filename
 */
function detectSourceType(filename: string): string {
  const lowerFilename = filename.toLowerCase();

  for (const [prefix, sourceType] of Object.entries(CONFIG.sourceTypeMap)) {
    if (lowerFilename.startsWith(prefix)) {
      return sourceType;
    }
  }

  return 'custom';
}

/**
 * Detect language from content
 */
function detectLanguage(content: string): string {
  const lowerContent = content.toLowerCase();

  const romanianIndicators = ['și', 'că', 'pentru', 'este', 'sunt', 'într-', 'după'];
  const englishIndicators = ['the', 'and', 'for', 'this', 'with', 'that', 'from'];
  const germanIndicators = ['und', 'der', 'die', 'das', 'für', 'mit', 'bei'];

  const roScore = romanianIndicators.filter((w) => lowerContent.includes(w)).length;
  const enScore = englishIndicators.filter((w) => lowerContent.includes(w)).length;
  const deScore = germanIndicators.filter((w) => lowerContent.includes(w)).length;

  if (roScore > enScore && roScore > deScore) return 'ro';
  if (enScore > roScore && enScore > deScore) return 'en';
  if (deScore > roScore && deScore > enScore) return 'de';

  return 'ro'; // Default to Romanian
}

/**
 * Extract title from markdown file
 */
function extractTitle(content: string, filename: string): string {
  // Look for # heading
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    return headingMatch[1]!.trim();
  }

  // Use filename without extension
  return filename.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
}

/**
 * Generate embeddings via OpenAI API
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set - skipping embedding generation');
    return texts.map(() => []);
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: CONFIG.embeddingModel,
      input: texts,
      dimensions: CONFIG.embeddingDimensions,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as EmbeddingResponse;
  return data.data.map((d) => d.embedding);
}

/**
 * Convert embedding to PostgreSQL vector format
 */
function vectorToString(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

// =============================================================================
// Main Ingest Function
// =============================================================================

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('================================================');
  console.log('  MedicalCor Knowledge Base Ingest');
  console.log('================================================\n');

  // Check for DATABASE_URL
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  // Check if docs directory exists
  if (!fs.existsSync(CONFIG.docsDir)) {
    console.log(`Creating docs/knowledge directory at: ${CONFIG.docsDir}`);
    fs.mkdirSync(CONFIG.docsDir, { recursive: true });
    console.log('No documents to ingest. Add .md files to docs/knowledge/');
    process.exit(0);
  }

  // Get markdown files
  const files = fs
    .readdirSync(CONFIG.docsDir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  if (files.length === 0) {
    console.log('No markdown files found in docs/knowledge/');
    console.log('Add .md files with your knowledge base content.');
    process.exit(0);
  }

  console.log(`Found ${files.length} file(s) to process:\n`);
  files.forEach((f) => console.log(`  - ${f}`));
  console.log('');

  // Connect to database
  const pool = new Pool({
    connectionString,
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: true }
        : process.env.DATABASE_SSL === 'true'
          ? { rejectUnauthorized: false }
          : undefined,
  });

  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('Connected to database\n');

    // Process files and create entries
    const entries: KnowledgeEntry[] = [];

    for (const file of files) {
      const filePath = path.join(CONFIG.docsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const title = extractTitle(content, file);
      const sourceType = detectSourceType(file);
      const language = detectLanguage(content);

      // Chunk content if needed
      const chunks = chunkText(content, CONFIG.maxChunkSize, CONFIG.chunkOverlap);

      console.log(`Processing: ${file} (${chunks.length} chunk(s))`);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        const chunkTitle = chunks.length > 1 ? `${title} (Part ${i + 1})` : title;

        entries.push({
          title: chunkTitle,
          content: chunk,
          contentHash: hashContent(chunk),
          sourceType,
          language,
          chunkIndex: i,
          chunkTotal: chunks.length,
          metadata: {
            filename: file,
            ingestedAt: new Date().toISOString(),
          },
        });
      }
    }

    console.log(`\nTotal entries to process: ${entries.length}\n`);

    // Generate embeddings in batches
    console.log('Generating embeddings...');
    const hasOpenAI = !!process.env.OPENAI_API_KEY;

    for (let i = 0; i < entries.length; i += CONFIG.batchSize) {
      const batch = entries.slice(i, i + CONFIG.batchSize);
      const texts = batch.map((e) => `${e.title}\n\n${e.content}`);

      if (hasOpenAI) {
        try {
          const embeddings = await generateEmbeddings(texts);
          for (let j = 0; j < batch.length; j++) {
            batch[j]!.embedding = embeddings[j];
          }
          console.log(
            `  Batch ${Math.floor(i / CONFIG.batchSize) + 1}: ${batch.length} embeddings generated`
          );
        } catch (error) {
          console.error(
            `  Batch ${Math.floor(i / CONFIG.batchSize) + 1}: Embedding failed -`,
            error
          );
        }
      }
    }

    // Insert/update entries in database
    console.log('\nInserting into database...');
    let inserted = 0;
    let updated = 0;

    for (const entry of entries) {
      const query = `
        INSERT INTO knowledge_base (
          source_type, title, content, content_hash,
          chunk_index, chunk_total, embedding,
          language, metadata, version, is_active
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9, 1, TRUE
        )
        ON CONFLICT (content_hash, chunk_index) DO UPDATE SET
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_insert
      `;

      const values = [
        entry.sourceType,
        entry.title,
        entry.content,
        entry.contentHash,
        entry.chunkIndex,
        entry.chunkTotal,
        entry.embedding ? vectorToString(entry.embedding) : null,
        entry.language,
        JSON.stringify(entry.metadata),
      ];

      const result = await pool.query(query, values);
      const row = result.rows[0] as { is_insert: boolean } | undefined;

      if (row?.is_insert) {
        inserted++;
      } else {
        updated++;
      }
    }

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n================================================');
    console.log('  Ingest Complete');
    console.log('================================================');
    console.log(`  Files processed: ${files.length}`);
    console.log(`  Entries inserted: ${inserted}`);
    console.log(`  Entries updated: ${updated}`);
    console.log(`  Duration: ${duration}s`);
    console.log(`  Embeddings: ${hasOpenAI ? 'Generated' : 'Skipped (no API key)'}`);
    console.log('================================================\n');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('ERROR:', error);
    await pool.end();
    process.exit(1);
  }
}

// Run
main();
