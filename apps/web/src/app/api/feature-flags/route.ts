import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Zod schemas for validation
const FeatureFlagSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z][a-z0-9_]*$/, 'Key must be lowercase alphanumeric with underscores'),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  enabled: z.boolean().default(false),
  rolloutPercentage: z.number().min(0).max(100).default(0),
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  owner: z.string().email().optional().or(z.literal('')),
  tags: z.array(z.string()).default([]),
  targeting: z.any().optional(),
  variants: z.any().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

const UpdateFeatureFlagSchema = FeatureFlagSchema.partial().extend({
  id: z.string().uuid(),
});

// In-memory store for demo (replace with database in production)
interface StoredFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  environment: 'development' | 'staging' | 'production';
  owner?: string;
  tags: string[];
  targeting?: unknown;
  variants?: unknown;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
}

const flagsStore = new Map<string, StoredFlag>();

// Initialize with sample data
const sampleFlags: StoredFlag[] = [
  {
    id: 'ff-1',
    key: 'ai_copilot',
    name: 'AI Copilot',
    description: 'Activează asistentul AI pentru agenți în conversațiile cu pacienții',
    enabled: true,
    rolloutPercentage: 100,
    environment: 'production',
    owner: 'tech-lead@medicalcor.ro',
    tags: ['ai', 'agents'],
    createdAt: new Date('2024-01-15').toISOString(),
    updatedAt: new Date('2024-02-20').toISOString(),
  },
  {
    id: 'ff-2',
    key: 'new_scheduler_v2',
    name: 'Scheduler v2',
    description: 'Noul sistem de programări cu optimizare automată și sugestii inteligente',
    enabled: true,
    rolloutPercentage: 25,
    environment: 'production',
    owner: 'product@medicalcor.ro',
    tags: ['scheduling', 'beta'],
    createdAt: new Date('2024-02-01').toISOString(),
    updatedAt: new Date('2024-03-10').toISOString(),
  },
];

// Initialize store
sampleFlags.forEach((flag) => flagsStore.set(flag.id, flag));

/**
 * GET /api/feature-flags
 * List all feature flags with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const environment = searchParams.get('environment');
    const enabled = searchParams.get('enabled');
    const key = searchParams.get('key');

    let flags = Array.from(flagsStore.values());

    // Apply filters
    if (environment && environment !== 'all') {
      flags = flags.filter((f) => f.environment === environment);
    }

    if (enabled !== null) {
      const isEnabled = enabled === 'true';
      flags = flags.filter((f) => f.enabled === isEnabled);
    }

    if (key) {
      flags = flags.filter((f) => f.key === key);
    }

    // Sort by updatedAt descending
    flags.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return NextResponse.json({
      success: true,
      data: flags,
      meta: {
        total: flags.length,
        enabled: flags.filter((f) => f.enabled).length,
      },
    });
  } catch (error) {
    console.error('Error fetching feature flags:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch feature flags' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/feature-flags
 * Create a new feature flag
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = FeatureFlagSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: result.error.flatten(),
        },
        { status: 400 }
      );
    }

    const data = result.data;

    // Check for duplicate key
    const existingFlag = Array.from(flagsStore.values()).find((f) => f.key === data.key);
    if (existingFlag) {
      return NextResponse.json(
        { success: false, error: 'A flag with this key already exists' },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const newFlag: StoredFlag = {
      id: `ff-${Date.now()}`,
      key: data.key,
      name: data.name,
      description: data.description || '',
      enabled: data.enabled,
      rolloutPercentage: data.rolloutPercentage,
      environment: data.environment,
      owner: data.owner || undefined,
      tags: data.tags,
      targeting: data.targeting,
      variants: data.variants,
      createdAt: now,
      updatedAt: now,
      expiresAt: data.expiresAt || undefined,
    };

    flagsStore.set(newFlag.id, newFlag);

    return NextResponse.json({ success: true, data: newFlag }, { status: 201 });
  } catch (error) {
    console.error('Error creating feature flag:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create feature flag' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/feature-flags
 * Update an existing feature flag
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const result = UpdateFeatureFlagSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: result.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { id, ...updateData } = result.data;

    const existingFlag = flagsStore.get(id);
    if (!existingFlag) {
      return NextResponse.json({ success: false, error: 'Flag not found' }, { status: 404 });
    }

    // Check for duplicate key if key is being changed
    if (updateData.key && updateData.key !== existingFlag.key) {
      const duplicateFlag = Array.from(flagsStore.values()).find((f) => f.key === updateData.key);
      if (duplicateFlag) {
        return NextResponse.json(
          { success: false, error: 'A flag with this key already exists' },
          { status: 409 }
        );
      }
    }

    const updatedFlag = {
      ...existingFlag,
      ...updateData,
      updatedAt: new Date().toISOString(),
    } as StoredFlag;

    flagsStore.set(id, updatedFlag);

    return NextResponse.json({ success: true, data: updatedFlag });
  } catch (error) {
    console.error('Error updating feature flag:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update feature flag' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/feature-flags
 * Delete a feature flag by ID
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Flag ID is required' }, { status: 400 });
    }

    const existingFlag = flagsStore.get(id);
    if (!existingFlag) {
      return NextResponse.json({ success: false, error: 'Flag not found' }, { status: 404 });
    }

    flagsStore.delete(id);

    return NextResponse.json({ success: true, message: 'Flag deleted successfully' });
  } catch (error) {
    console.error('Error deleting feature flag:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete feature flag' },
      { status: 500 }
    );
  }
}
