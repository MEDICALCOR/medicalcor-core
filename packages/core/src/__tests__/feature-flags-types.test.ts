import { describe, it, expect, beforeEach } from 'vitest';
import {
  FeatureFlagError,
  InMemoryFeatureFlagService,
  type FeatureFlag,
  type EvaluationContext,
  type TargetingRules,
} from '../feature-flags/types.js';

describe('FeatureFlagError', () => {
  it('should create error with message and code', () => {
    const error = new FeatureFlagError('Flag not found', 'NOT_FOUND');
    expect(error.message).toBe('Flag not found');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.name).toBe('FeatureFlagError');
  });

  it('should support different error codes', () => {
    const notFound = new FeatureFlagError('Not found', 'NOT_FOUND');
    const invalidFlag = new FeatureFlagError('Invalid', 'INVALID_FLAG');
    const evalError = new FeatureFlagError('Eval failed', 'EVALUATION_ERROR');

    expect(notFound.code).toBe('NOT_FOUND');
    expect(invalidFlag.code).toBe('INVALID_FLAG');
    expect(evalError.code).toBe('EVALUATION_ERROR');
  });

  it('should be instanceof Error', () => {
    const error = new FeatureFlagError('Test', 'NOT_FOUND');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(FeatureFlagError);
  });
});

describe('InMemoryFeatureFlagService', () => {
  let service: InMemoryFeatureFlagService;

  const createFlag = (overrides: Partial<FeatureFlag> = {}): FeatureFlag => ({
    key: 'test-flag',
    name: 'Test Flag',
    description: 'A test feature flag',
    enabled: true,
    metadata: {
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      owner: 'test-team',
      tags: ['test'],
    },
    ...overrides,
  });

  beforeEach(() => {
    service = new InMemoryFeatureFlagService();
  });

  describe('upsertFlag', () => {
    it('should add a new flag', async () => {
      const flag = createFlag();
      const result = await service.upsertFlag(flag);

      expect(result.isOk).toBe(true);
      const flags = await service.getAllFlags();
      expect(flags).toHaveLength(1);
      expect(flags[0].key).toBe('test-flag');
    });

    it('should update existing flag', async () => {
      const flag1 = createFlag({ name: 'Original' });
      await service.upsertFlag(flag1);

      const flag2 = createFlag({ name: 'Updated' });
      await service.upsertFlag(flag2);

      const flags = await service.getAllFlags();
      expect(flags).toHaveLength(1);
      expect(flags[0].name).toBe('Updated');
    });

    it('should handle multiple flags', async () => {
      await service.upsertFlag(createFlag({ key: 'flag-1' }));
      await service.upsertFlag(createFlag({ key: 'flag-2' }));
      await service.upsertFlag(createFlag({ key: 'flag-3' }));

      const flags = await service.getAllFlags();
      expect(flags).toHaveLength(3);
    });
  });

  describe('deleteFlag', () => {
    it('should delete existing flag', async () => {
      const flag = createFlag();
      await service.upsertFlag(flag);

      const result = await service.deleteFlag('test-flag');
      expect(result.isOk).toBe(true);

      const flags = await service.getAllFlags();
      expect(flags).toHaveLength(0);
    });

    it('should return error for non-existent flag', async () => {
      const result = await service.deleteFlag('non-existent');
      expect(result.isErr).toBe(true);
      if (result.isErr) {
        expect(result.error.code).toBe('NOT_FOUND');
        expect(result.error.message).toBe('Flag not found');
      }
    });
  });

  describe('getAllFlags', () => {
    it('should return empty array when no flags', async () => {
      const flags = await service.getAllFlags();
      expect(flags).toEqual([]);
    });

    it('should return all flags', async () => {
      await service.upsertFlag(createFlag({ key: 'a' }));
      await service.upsertFlag(createFlag({ key: 'b' }));

      const flags = await service.getAllFlags();
      expect(flags).toHaveLength(2);
      expect(flags.map((f) => f.key).sort()).toEqual(['a', 'b']);
    });
  });

  describe('isEnabled', () => {
    it('should return false for non-existent flag', async () => {
      const result = await service.isEnabled('non-existent');
      expect(result).toBe(false);
    });

    it('should return false for disabled flag', async () => {
      await service.upsertFlag(createFlag({ enabled: false }));
      const result = await service.isEnabled('test-flag');
      expect(result).toBe(false);
    });

    it('should return true for enabled flag without targeting', async () => {
      await service.upsertFlag(createFlag({ enabled: true }));
      const result = await service.isEnabled('test-flag');
      expect(result).toBe(true);
    });

    it('should evaluate targeting rules', async () => {
      const targeting: TargetingRules = {
        rules: [
          {
            id: 'rule-1',
            conditions: [{ attribute: 'userId', operator: 'equals', values: ['user-123'] }],
            serve: {},
          },
        ],
        defaultServe: {},
      };
      await service.upsertFlag(createFlag({ targeting }));

      const enabledForUser = await service.isEnabled('test-flag', {
        userId: 'user-123',
        attributes: {},
      });
      expect(enabledForUser).toBe(true);

      const disabledForOther = await service.isEnabled('test-flag', {
        userId: 'user-456',
        attributes: {},
      });
      expect(disabledForOther).toBe(true); // Falls back to default
    });
  });

  describe('getValue', () => {
    it('should return default value for non-existent flag', async () => {
      const result = await service.getValue('non-existent', 'default');
      expect(result).toBe('default');
    });

    it('should return flag value when enabled', async () => {
      await service.upsertFlag(createFlag({ enabled: true }));
      const result = await service.getValue('test-flag', false);
      expect(result).toBe(true);
    });

    it('should return false for disabled flag', async () => {
      await service.upsertFlag(createFlag({ enabled: false }));
      const result = await service.getValue('test-flag', true);
      expect(result).toBe(false);
    });
  });

  describe('evaluate', () => {
    it('should return not_found for missing flag', async () => {
      const result = await service.evaluate('missing');
      expect(result.flagKey).toBe('missing');
      expect(result.value).toBe(false);
      expect(result.reason).toBe('not_found');
    });

    it('should return disabled for disabled flag', async () => {
      await service.upsertFlag(createFlag({ enabled: false }));
      const result = await service.evaluate('test-flag');
      expect(result.reason).toBe('disabled');
      expect(result.value).toBe(false);
    });

    it('should return default for enabled flag without targeting', async () => {
      await service.upsertFlag(createFlag({ enabled: true }));
      const result = await service.evaluate('test-flag');
      expect(result.reason).toBe('default');
      expect(result.value).toBe(true);
    });

    describe('targeting rules', () => {
      it('should match equals operator', async () => {
        const targeting: TargetingRules = {
          rules: [
            {
              id: 'rule-1',
              conditions: [{ attribute: 'tenantId', operator: 'equals', values: ['tenant-A'] }],
              serve: { variant: 'v1' },
            },
          ],
          defaultServe: {},
        };
        await service.upsertFlag(
          createFlag({
            targeting,
            variants: [{ name: 'v1', value: 'variant-value' }],
          })
        );

        const result = await service.evaluate('test-flag', {
          tenantId: 'tenant-A',
          attributes: {},
        });
        expect(result.reason).toBe('targeting_match');
        expect(result.variant).toBe('v1');
        expect(result.value).toBe('variant-value');
      });

      it('should match not_equals operator', async () => {
        const targeting: TargetingRules = {
          rules: [
            {
              id: 'rule-1',
              conditions: [
                { attribute: 'userId', operator: 'not_equals', values: ['blocked-user'] },
              ],
              serve: {},
            },
          ],
          defaultServe: {},
        };
        await service.upsertFlag(createFlag({ targeting }));

        const result = await service.evaluate('test-flag', {
          userId: 'regular-user',
          attributes: {},
        });
        expect(result.reason).toBe('targeting_match');
      });

      it('should match contains operator', async () => {
        const targeting: TargetingRules = {
          rules: [
            {
              id: 'rule-1',
              conditions: [{ attribute: 'email', operator: 'contains', values: ['@company.com'] }],
              serve: {},
            },
          ],
          defaultServe: {},
        };
        await service.upsertFlag(createFlag({ targeting }));

        const result = await service.evaluate('test-flag', {
          attributes: { email: 'user@company.com' },
        });
        expect(result.reason).toBe('targeting_match');
      });

      it('should not match contains when value is not string', async () => {
        const targeting: TargetingRules = {
          rules: [
            {
              id: 'rule-1',
              conditions: [{ attribute: 'count', operator: 'contains', values: ['5'] }],
              serve: {},
            },
          ],
          defaultServe: {},
        };
        await service.upsertFlag(createFlag({ targeting }));

        const result = await service.evaluate('test-flag', {
          attributes: { count: 5 },
        });
        expect(result.reason).toBe('default'); // Didn't match the rule
      });

      it('should match in operator', async () => {
        const targeting: TargetingRules = {
          rules: [
            {
              id: 'rule-1',
              conditions: [{ attribute: 'role', operator: 'in', values: ['admin', 'superuser'] }],
              serve: {},
            },
          ],
          defaultServe: {},
        };
        await service.upsertFlag(createFlag({ targeting }));

        const result = await service.evaluate('test-flag', {
          attributes: { role: 'admin' },
        });
        expect(result.reason).toBe('targeting_match');
      });

      it('should match not_in operator', async () => {
        const targeting: TargetingRules = {
          rules: [
            {
              id: 'rule-1',
              conditions: [{ attribute: 'region', operator: 'not_in', values: ['blocked-region'] }],
              serve: {},
            },
          ],
          defaultServe: {},
        };
        await service.upsertFlag(createFlag({ targeting }));

        const result = await service.evaluate('test-flag', {
          attributes: { region: 'allowed-region' },
        });
        expect(result.reason).toBe('targeting_match');
      });

      it('should require all conditions to match (AND logic)', async () => {
        const targeting: TargetingRules = {
          rules: [
            {
              id: 'rule-1',
              conditions: [
                { attribute: 'userId', operator: 'equals', values: ['user-123'] },
                { attribute: 'tenantId', operator: 'equals', values: ['tenant-A'] },
              ],
              serve: {},
            },
          ],
          defaultServe: {},
        };
        await service.upsertFlag(createFlag({ targeting }));

        // Both match
        const bothMatch = await service.evaluate('test-flag', {
          userId: 'user-123',
          tenantId: 'tenant-A',
          attributes: {},
        });
        expect(bothMatch.reason).toBe('targeting_match');

        // Only userId matches
        const onlyUserMatch = await service.evaluate('test-flag', {
          userId: 'user-123',
          tenantId: 'tenant-B',
          attributes: {},
        });
        expect(onlyUserMatch.reason).toBe('default');
      });

      it('should return default when no context provided', async () => {
        const targeting: TargetingRules = {
          rules: [
            {
              id: 'rule-1',
              conditions: [{ attribute: 'userId', operator: 'equals', values: ['user-123'] }],
              serve: {},
            },
          ],
          defaultServe: {},
        };
        await service.upsertFlag(createFlag({ targeting }));

        const result = await service.evaluate('test-flag');
        expect(result.reason).toBe('default');
      });

      it('should use context attributes', async () => {
        const targeting: TargetingRules = {
          rules: [
            {
              id: 'rule-1',
              conditions: [{ attribute: 'customAttr', operator: 'equals', values: ['special'] }],
              serve: {},
            },
          ],
          defaultServe: {},
        };
        await service.upsertFlag(createFlag({ targeting }));

        const result = await service.evaluate('test-flag', {
          attributes: { customAttr: 'special' },
        });
        expect(result.reason).toBe('targeting_match');
      });

      it('should use sessionId from context', async () => {
        const targeting: TargetingRules = {
          rules: [
            {
              id: 'rule-1',
              conditions: [{ attribute: 'sessionId', operator: 'equals', values: ['session-abc'] }],
              serve: {},
            },
          ],
          defaultServe: {},
        };
        await service.upsertFlag(createFlag({ targeting }));

        const result = await service.evaluate('test-flag', {
          sessionId: 'session-abc',
          attributes: {},
        });
        expect(result.reason).toBe('targeting_match');
      });

      it('should evaluate multiple rules and return first match', async () => {
        const targeting: TargetingRules = {
          rules: [
            {
              id: 'rule-1',
              conditions: [{ attribute: 'userId', operator: 'equals', values: ['vip-user'] }],
              serve: { variant: 'vip' },
            },
            {
              id: 'rule-2',
              conditions: [{ attribute: 'userId', operator: 'equals', values: ['user-123'] }],
              serve: { variant: 'standard' },
            },
          ],
          defaultServe: {},
        };
        await service.upsertFlag(
          createFlag({
            targeting,
            variants: [
              { name: 'vip', value: 'VIP Treatment' },
              { name: 'standard', value: 'Standard' },
            ],
          })
        );

        const vipResult = await service.evaluate('test-flag', {
          userId: 'vip-user',
          attributes: {},
        });
        expect(vipResult.variant).toBe('vip');
        expect(vipResult.value).toBe('VIP Treatment');

        const standardResult = await service.evaluate('test-flag', {
          userId: 'user-123',
          attributes: {},
        });
        expect(standardResult.variant).toBe('standard');
        expect(standardResult.value).toBe('Standard');
      });

      it('should return true when variant is matched but not found', async () => {
        const targeting: TargetingRules = {
          rules: [
            {
              id: 'rule-1',
              conditions: [{ attribute: 'userId', operator: 'equals', values: ['user-123'] }],
              serve: { variant: 'non-existent' },
            },
          ],
          defaultServe: {},
        };
        await service.upsertFlag(
          createFlag({
            targeting,
            // No variants defined
          })
        );

        const result = await service.evaluate('test-flag', { userId: 'user-123', attributes: {} });
        expect(result.reason).toBe('targeting_match');
        expect(result.value).toBe(true); // Falls back to true
      });

      it('should handle flag with no variants array', async () => {
        const targeting: TargetingRules = {
          rules: [
            {
              id: 'rule-1',
              conditions: [{ attribute: 'userId', operator: 'equals', values: ['user-123'] }],
              serve: { variant: 'some-variant' },
            },
          ],
          defaultServe: {},
        };
        await service.upsertFlag(
          createFlag({
            targeting,
            variants: undefined,
          })
        );

        const result = await service.evaluate('test-flag', { userId: 'user-123', attributes: {} });
        expect(result.value).toBe(true);
      });
    });
  });

  describe('complex scenarios', () => {
    it('should handle feature flag lifecycle', async () => {
      // Create
      const flag = createFlag({ key: 'new-feature', enabled: false });
      await service.upsertFlag(flag);

      let result = await service.isEnabled('new-feature');
      expect(result).toBe(false);

      // Enable
      await service.upsertFlag({ ...flag, enabled: true });
      result = await service.isEnabled('new-feature');
      expect(result).toBe(true);

      // Add targeting
      const targeting: TargetingRules = {
        rules: [
          {
            id: 'beta-users',
            conditions: [{ attribute: 'beta', operator: 'equals', values: [true] }],
            serve: {},
          },
        ],
        defaultServe: {},
      };
      await service.upsertFlag({ ...flag, enabled: true, targeting });

      const betaUser = await service.isEnabled('new-feature', { attributes: { beta: true } });
      expect(betaUser).toBe(true);

      // Delete
      await service.deleteFlag('new-feature');
      result = await service.isEnabled('new-feature');
      expect(result).toBe(false);
    });

    it('should handle A/B testing with variants', async () => {
      const targeting: TargetingRules = {
        rules: [
          {
            id: 'variant-a',
            conditions: [{ attribute: 'group', operator: 'equals', values: ['A'] }],
            serve: { variant: 'control' },
          },
          {
            id: 'variant-b',
            conditions: [{ attribute: 'group', operator: 'equals', values: ['B'] }],
            serve: { variant: 'treatment' },
          },
        ],
        defaultServe: {},
      };

      await service.upsertFlag(
        createFlag({
          key: 'ab-test',
          targeting,
          variants: [
            { name: 'control', value: { showNewUI: false } },
            { name: 'treatment', value: { showNewUI: true } },
          ],
        })
      );

      const groupA = await service.evaluate<{ showNewUI: boolean }>('ab-test', {
        attributes: { group: 'A' },
      });
      expect(groupA.value).toEqual({ showNewUI: false });

      const groupB = await service.evaluate<{ showNewUI: boolean }>('ab-test', {
        attributes: { group: 'B' },
      });
      expect(groupB.value).toEqual({ showNewUI: true });
    });
  });
});

describe('EvaluationContext', () => {
  it('should support all context fields', async () => {
    const service = new InMemoryFeatureFlagService();

    const targeting: TargetingRules = {
      rules: [
        {
          id: 'rule-1',
          conditions: [
            { attribute: 'userId', operator: 'equals', values: ['user-1'] },
            { attribute: 'sessionId', operator: 'equals', values: ['session-1'] },
            { attribute: 'tenantId', operator: 'equals', values: ['tenant-1'] },
          ],
          serve: {},
        },
      ],
      defaultServe: {},
    };

    const flag: FeatureFlag = {
      key: 'full-context-flag',
      name: 'Full Context Flag',
      description: 'Tests all context fields',
      enabled: true,
      targeting,
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    await service.upsertFlag(flag);

    const context: EvaluationContext = {
      userId: 'user-1',
      sessionId: 'session-1',
      tenantId: 'tenant-1',
      attributes: {},
    };

    const result = await service.evaluate('full-context-flag', context);
    expect(result.reason).toBe('targeting_match');
  });
});
