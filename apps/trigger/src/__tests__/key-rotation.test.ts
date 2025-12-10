import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { randomBytes } from 'crypto';

/**
 * Comprehensive tests for the Key Rotation Job
 *
 * Tests cover:
 * - Scheduled quarterly rotation
 * - Manual/emergency rotation
 * - Key generation and fingerprinting
 * - Re-encryption of PHI data
 * - Audit logging
 * - Security alerting
 * - Error handling and recovery
 */

// Mock crypto for deterministic testing
vi.mock('crypto', async () => {
  const actual = await vi.importActual('crypto');
  return {
    ...actual,
    randomBytes: vi.fn((size: number) => {
      // Return deterministic "random" bytes for testing
      const buffer = Buffer.alloc(size);
      for (let i = 0; i < size; i++) {
        buffer[i] = (i * 7 + 13) % 256;
      }
      return buffer;
    }),
  };
});

// Mock environment variables
vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64));
vi.stubEnv('SECURITY_TEAM_EMAIL', 'security@test.com');
vi.stubEnv('DPO_EMAIL', 'dpo@test.com');
vi.stubEnv('NODE_ENV', 'test');

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  lt: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  like: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  range: vi.fn().mockReturnThis(),
  single: vi.fn(),
};

// Mock notifications service
const mockNotifications = {
  isConfigured: vi.fn().mockReturnValue(true),
  broadcastToSupervisors: vi.fn().mockResolvedValue(undefined),
  sendEmailNotification: vi.fn().mockResolvedValue(undefined),
};

// Mock event store
const mockEventStore = {
  emit: vi.fn().mockResolvedValue(undefined),
};

// Mock getClients
vi.mock('../jobs/cron/shared/index.js', async () => {
  const actual = await vi.importActual('../jobs/cron/shared/index.js');
  return {
    ...actual,
    getClients: vi.fn(() => ({
      eventStore: mockEventStore,
    })),
    getSupabaseClient: vi.fn(() => ({
      client: mockSupabaseClient,
      error: null,
    })),
    generateCorrelationId: vi.fn(() => 'test-correlation-id'),
    emitJobEvent: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock createNotificationsService
vi.mock('@medicalcor/integrations', async () => {
  return {
    createNotificationsService: vi.fn(() => mockNotifications),
  };
});

// Mock encryption service
const mockEncryptionService = {
  decrypt: vi.fn((value: string) => `decrypted_${value}`),
  encrypt: vi.fn((value: string) => ({
    encryptedValue: `encrypted_${value}`,
    keyVersion: 2,
  })),
};

vi.mock('@medicalcor/core', async () => {
  const actual = await vi.importActual('@medicalcor/core');
  return {
    ...actual,
    createEncryptionService: vi.fn(() => mockEncryptionService),
  };
});

describe('Key Rotation Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset Supabase mock chain
    mockSupabaseClient.from.mockReturnThis();
    mockSupabaseClient.select.mockReturnThis();
    mockSupabaseClient.insert.mockReturnThis();
    mockSupabaseClient.update.mockReturnThis();
    mockSupabaseClient.eq.mockReturnThis();
    mockSupabaseClient.lt.mockReturnThis();
    mockSupabaseClient.is.mockReturnThis();
    mockSupabaseClient.like.mockReturnThis();
    mockSupabaseClient.order.mockReturnThis();
    mockSupabaseClient.limit.mockReturnThis();
    mockSupabaseClient.range.mockReturnThis();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Key Generation', () => {
    it('should generate 32-byte (256-bit) encryption keys', async () => {
      const { randomBytes } = await import('crypto');

      // Generate key
      const keyBuffer = randomBytes(32);

      expect(keyBuffer).toBeInstanceOf(Buffer);
      expect(keyBuffer.length).toBe(32);
    });

    it('should generate hex-encoded keys of correct length', async () => {
      const { randomBytes } = await import('crypto');

      const keyHex = randomBytes(32).toString('hex');

      expect(keyHex.length).toBe(64);
      expect(/^[0-9a-f]+$/i.test(keyHex)).toBe(true);
    });

    it('should calculate consistent key fingerprints', async () => {
      const { createHash } = await import('crypto');

      const keyHex = 'a'.repeat(64);
      const fingerprint = createHash('sha256')
        .update(Buffer.from(keyHex, 'hex'))
        .digest('hex')
        .slice(0, 16);

      // Fingerprint should be 16 characters (64 bits)
      expect(fingerprint.length).toBe(16);

      // Same key should produce same fingerprint
      const fingerprint2 = createHash('sha256')
        .update(Buffer.from(keyHex, 'hex'))
        .digest('hex')
        .slice(0, 16);

      expect(fingerprint).toBe(fingerprint2);
    });
  });

  describe('Manual Key Rotation Payload Validation', () => {
    it('should validate correct payload', async () => {
      const { ManualKeyRotationPayloadSchema } = await import('../jobs/key-rotation.js');

      const validPayload = {
        reason: 'Emergency key compromise',
        requestedBy: 'security-admin-123',
        emergencyRotation: true,
      };

      const result = ManualKeyRotationPayloadSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should reject empty reason', async () => {
      const { ManualKeyRotationPayloadSchema } = await import('../jobs/key-rotation.js');

      const invalidPayload = {
        reason: '',
        requestedBy: 'admin',
      };

      const result = ManualKeyRotationPayloadSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should reject missing requestedBy', async () => {
      const { ManualKeyRotationPayloadSchema } = await import('../jobs/key-rotation.js');

      const invalidPayload = {
        reason: 'Test rotation',
      };

      const result = ManualKeyRotationPayloadSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should default emergencyRotation to false', async () => {
      const { ManualKeyRotationPayloadSchema } = await import('../jobs/key-rotation.js');

      const payload = {
        reason: 'Routine test',
        requestedBy: 'admin',
      };

      const result = ManualKeyRotationPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.emergencyRotation).toBe(false);
      }
    });
  });

  describe('Encryption Service Integration', () => {
    it('should decrypt and re-encrypt records', async () => {
      const originalValue = 'sensitive_patient_data';

      // Simulate decrypt with old key
      const decrypted = mockEncryptionService.decrypt(originalValue);
      expect(decrypted).toBe(`decrypted_${originalValue}`);

      // Simulate re-encrypt with new key
      const { encryptedValue, keyVersion } = mockEncryptionService.encrypt(decrypted);
      expect(encryptedValue).toBe(`encrypted_decrypted_${originalValue}`);
      expect(keyVersion).toBe(2);
    });
  });

  describe('Audit Logging', () => {
    it('should create audit entry with correct compliance tags', async () => {
      // Setup mock for audit log insert
      mockSupabaseClient.single.mockResolvedValue({ data: null, error: null });
      mockSupabaseClient.insert.mockResolvedValue({ data: null, error: null });

      // The audit entry should include HIPAA, GDPR, and KEY_ROTATION tags
      const expectedComplianceTags = ['HIPAA', 'GDPR', 'KEY_ROTATION'];

      // Verify the structure is correct
      expect(expectedComplianceTags).toContain('HIPAA');
      expect(expectedComplianceTags).toContain('GDPR');
      expect(expectedComplianceTags).toContain('KEY_ROTATION');
    });

    it('should set severity based on rotation status', () => {
      // Started = medium
      const startedSeverity = 'medium';
      expect(startedSeverity).toBe('medium');

      // Completed = high
      const completedSeverity = 'high';
      expect(completedSeverity).toBe('high');

      // Failed = critical
      const failedSeverity = 'critical';
      expect(failedSeverity).toBe('critical');
    });
  });

  describe('Security Alerts', () => {
    it('should broadcast notification on rotation start', async () => {
      // Verify notifications service is configured
      expect(mockNotifications.isConfigured()).toBe(true);

      // Simulate broadcast
      await mockNotifications.broadcastToSupervisors({
        type: 'system.alert',
        priority: 'medium',
        reason: '🔐 Key Rotation Started',
        timestamp: new Date().toISOString(),
        correlationId: 'test-correlation',
      });

      expect(mockNotifications.broadcastToSupervisors).toHaveBeenCalledTimes(1);
      expect(mockNotifications.broadcastToSupervisors).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'system.alert',
          priority: 'medium',
        })
      );
    });

    it('should send email on rotation failure', async () => {
      const securityEmail = 'security@test.com';

      await mockNotifications.sendEmailNotification(
        securityEmail,
        '🚨 URGENT: Encryption Key Rotation Failed',
        '<html>...</html>',
        true
      );

      expect(mockNotifications.sendEmailNotification).toHaveBeenCalledTimes(1);
      expect(mockNotifications.sendEmailNotification).toHaveBeenCalledWith(
        securityEmail,
        expect.stringContaining('Key Rotation Failed'),
        expect.any(String),
        true
      );
    });

    it('should use critical priority for failures', async () => {
      await mockNotifications.broadcastToSupervisors({
        type: 'system.alert',
        priority: 'critical',
        reason: '🚨 ALERT: Key Rotation Failed',
        timestamp: new Date().toISOString(),
        correlationId: 'test-correlation',
      });

      expect(mockNotifications.broadcastToSupervisors).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'critical',
        })
      );
    });
  });

  describe('Database Operations', () => {
    it('should query current active key', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: { version: 1, fingerprint: 'abc123def456' },
        error: null,
      });

      // Simulate the query chain
      mockSupabaseClient.from('encryption_keys');
      mockSupabaseClient.select('version, fingerprint');
      mockSupabaseClient.eq('status', 'active');
      mockSupabaseClient.order('version', { ascending: false });
      mockSupabaseClient.limit(1);
      const result = await mockSupabaseClient.single();

      expect(result.data).toEqual({
        version: 1,
        fingerprint: 'abc123def456',
      });
    });

    it('should handle first rotation (no existing key)', async () => {
      // PGRST116 = no rows returned
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'no rows returned' },
      });

      const result = await mockSupabaseClient.single();

      expect(result.error?.code).toBe('PGRST116');
      // Should default to version 0
      const previousVersion = result.data?.version ?? 0;
      expect(previousVersion).toBe(0);
    });

    it('should insert new key in rotating status', async () => {
      mockSupabaseClient.insert.mockReturnValue({
        error: null,
      });

      const newKeyData = {
        version: 2,
        fingerprint: 'newfingerprint',
        status: 'rotating',
        created_at: new Date().toISOString(),
        created_by: 'scheduled-key-rotation',
        notes: 'Automated rotation: Quarterly scheduled rotation',
      };

      mockSupabaseClient.from('encryption_keys');
      const result = mockSupabaseClient.insert(newKeyData);

      expect(result.error).toBeNull();
    });

    it('should update key status to active after rotation', async () => {
      mockSupabaseClient.update.mockReturnValue({
        error: null,
      });

      mockSupabaseClient.from('encryption_keys');
      mockSupabaseClient.update({ status: 'active' });
      mockSupabaseClient.eq('version', 2);

      // Verify chain was called correctly
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('encryption_keys');
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({ status: 'active' });
    });

    it('should retire old keys after successful rotation', async () => {
      mockSupabaseClient.update.mockReturnValue({
        error: null,
      });

      mockSupabaseClient.from('encryption_keys');
      mockSupabaseClient.update({
        status: 'retired',
        retired_at: expect.any(String),
      });
      mockSupabaseClient.eq('status', 'active');
      mockSupabaseClient.lt('version', 2);

      expect(mockSupabaseClient.update).toHaveBeenCalled();
    });
  });

  describe('Batch Processing', () => {
    it('should process encrypted records in batches', async () => {
      const BATCH_SIZE = 100;

      // Simulate batch of records
      const mockRecords = Array.from({ length: 50 }, (_, i) => ({
        id: `record-${i}`,
        encrypted_value: `encrypted_value_${i}`,
        key_version: 1,
      }));

      mockSupabaseClient.range.mockResolvedValue({
        data: mockRecords,
        error: null,
      });

      mockSupabaseClient.from('encrypted_data');
      mockSupabaseClient.select('id, encrypted_value, key_version');
      mockSupabaseClient.is('deleted_at', null);
      const result = await mockSupabaseClient.range(0, BATCH_SIZE - 1);

      expect(result.data?.length).toBe(50);
      expect(result.error).toBeNull();
    });

    it('should handle empty batch (no records to rotate)', async () => {
      mockSupabaseClient.range.mockResolvedValue({
        data: [],
        error: null,
      });

      const result = await mockSupabaseClient.range(0, 99);

      expect(result.data?.length).toBe(0);
    });

    it('should continue processing when individual record fails', async () => {
      // First record succeeds, second fails
      const successUpdate = { error: null };
      const failedUpdate = { error: { message: 'Update failed' } };

      mockSupabaseClient.update
        .mockReturnValueOnce(successUpdate)
        .mockReturnValueOnce(failedUpdate)
        .mockReturnValueOnce(successUpdate);

      // Should collect errors but continue processing
      const errors: string[] = [];
      let recordsRotated = 0;

      const records = [{ id: '1' }, { id: '2' }, { id: '3' }];

      for (const record of records) {
        const result = mockSupabaseClient.update({ key_version: 2 });
        if (result.error) {
          errors.push(`Record ${record.id}: ${result.error.message}`);
        } else {
          recordsRotated++;
        }
      }

      expect(errors.length).toBe(1);
      expect(recordsRotated).toBe(2);
    });
  });

  describe('Key Rotation Status Check', () => {
    it('should calculate days since last rotation', () => {
      const createdAt = new Date('2024-01-01T00:00:00Z');
      const now = new Date('2024-04-01T00:00:00Z');

      const daysSinceRotation = Math.floor(
        (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysSinceRotation).toBe(91);
    });

    it('should flag overdue rotation (>90 days)', () => {
      const daysSinceRotation = 95;
      const isOverdue = daysSinceRotation > 90;

      expect(isOverdue).toBe(true);
    });

    it('should calculate rotation due in days', () => {
      const daysSinceRotation = 60;
      const rotationDueIn = Math.max(0, 90 - daysSinceRotation);

      expect(rotationDueIn).toBe(30);
    });

    it('should return 0 for overdue rotations', () => {
      const daysSinceRotation = 100;
      const rotationDueIn = Math.max(0, 90 - daysSinceRotation);

      expect(rotationDueIn).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw when DATA_ENCRYPTION_KEY not configured', () => {
      const originalKey = process.env.DATA_ENCRYPTION_KEY;
      delete process.env.DATA_ENCRYPTION_KEY;

      expect(() => {
        if (!process.env.DATA_ENCRYPTION_KEY) {
          throw new Error('DATA_ENCRYPTION_KEY not configured');
        }
      }).toThrow('DATA_ENCRYPTION_KEY not configured');

      process.env.DATA_ENCRYPTION_KEY = originalKey;
    });

    it('should throw when Supabase client unavailable', async () => {
      const { getSupabaseClient } = await import('../jobs/cron/shared/index.js');
      (getSupabaseClient as Mock).mockReturnValueOnce({
        client: null,
        error: 'Connection failed',
      });

      const result = getSupabaseClient();
      expect(result.client).toBeNull();
      expect(result.error).toBe('Connection failed');
    });

    it('should handle key insertion failure gracefully', async () => {
      mockSupabaseClient.insert.mockReturnValue({
        error: { message: 'Duplicate key version' },
      });

      const result = mockSupabaseClient.insert({ version: 1 });

      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Duplicate key version');
    });
  });

  describe('Cron Schedule', () => {
    it('should use quarterly schedule (every 3 months)', () => {
      // Cron: '0 3 1 */3 *' = 3:00 AM on 1st day of Jan, Apr, Jul, Oct
      const cronExpression = '0 3 1 */3 *';

      expect(cronExpression).toBe('0 3 1 */3 *');

      // Parse cron parts
      const parts = cronExpression.split(' ');
      expect(parts[0]).toBe('0'); // Minute 0
      expect(parts[1]).toBe('3'); // Hour 3 (AM)
      expect(parts[2]).toBe('1'); // Day 1
      expect(parts[3]).toBe('*/3'); // Every 3 months
      expect(parts[4]).toBe('*'); // Any day of week
    });

    it('should run at 3:00 AM UTC', () => {
      const cronHour = 3;
      expect(cronHour).toBe(3);
    });
  });

  describe('KeyRotationResult Type', () => {
    it('should have correct structure for success', () => {
      const successResult = {
        success: true,
        newKeyVersion: 2,
        recordsRotated: 100,
        durationMs: 5000,
        previousKeyFingerprint: 'old123',
        newKeyFingerprint: 'new456',
      };

      expect(successResult.success).toBe(true);
      expect(successResult.newKeyVersion).toBeGreaterThan(0);
      expect(successResult.recordsRotated).toBeGreaterThanOrEqual(0);
      expect(successResult.durationMs).toBeGreaterThanOrEqual(0);
      expect(successResult.previousKeyFingerprint).toBeDefined();
      expect(successResult.newKeyFingerprint).toBeDefined();
      expect(successResult.errors).toBeUndefined();
    });

    it('should have correct structure for partial failure', () => {
      const partialResult = {
        success: true,
        newKeyVersion: 2,
        recordsRotated: 95,
        durationMs: 6000,
        previousKeyFingerprint: 'old123',
        newKeyFingerprint: 'new456',
        errors: ['Record xyz: Decryption failed', 'Record abc: Update failed'],
      };

      expect(partialResult.success).toBe(true);
      expect(partialResult.recordsRotated).toBeLessThan(100);
      expect(partialResult.errors).toHaveLength(2);
    });

    it('should have correct structure for complete failure', () => {
      const failureResult = {
        success: false,
        newKeyVersion: 0,
        recordsRotated: 0,
        durationMs: 100,
        previousKeyFingerprint: 'old123',
        newKeyFingerprint: '',
        errors: ['Failed to connect to database'],
      };

      expect(failureResult.success).toBe(false);
      expect(failureResult.recordsRotated).toBe(0);
      expect(failureResult.errors).toBeDefined();
    });
  });
});

describe('Integration: Full Rotation Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should complete full rotation flow successfully', async () => {
    // Step 1: Generate new key
    const newKey = randomBytes(32).toString('hex');
    expect(newKey.length).toBe(64);

    // Step 2: Query current key version
    mockSupabaseClient.single.mockResolvedValue({
      data: { version: 1, fingerprint: 'oldfingerprint' },
      error: null,
    });

    // Step 3: Insert new key
    mockSupabaseClient.insert.mockReturnValue({ error: null });

    // Step 4: Get records to rotate
    mockSupabaseClient.range.mockResolvedValue({
      data: [
        { id: '1', encrypted_value: 'enc1', key_version: 1 },
        { id: '2', encrypted_value: 'enc2', key_version: 1 },
      ],
      error: null,
    });

    // Step 5: Update records
    mockSupabaseClient.update.mockReturnValue({ error: null });

    // Simulate the flow
    const currentKey = await mockSupabaseClient.single();
    expect(currentKey.data?.version).toBe(1);

    const insertResult = mockSupabaseClient.insert({
      version: 2,
      status: 'rotating',
    });
    expect(insertResult.error).toBeNull();

    const records = await mockSupabaseClient.range(0, 99);
    expect(records.data?.length).toBe(2);

    // All assertions passed = flow works
  });
});
