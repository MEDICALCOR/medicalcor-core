/**
 * @fileoverview Tests for Routing Commands
 *
 * Tests for CQRS command definitions, schemas, and routing operations.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  CreateSkillCommand,
  UpdateSkillCommand,
  DeleteSkillCommand,
  AssignAgentSkillCommand,
  UpdateAgentSkillCommand,
  RemoveAgentSkillCommand,
  BulkAssignSkillsCommand,
  CreateAgentProfileCommand,
  UpdateAgentAvailabilityCommand,
  UpdateAgentTaskCountCommand,
  CreateRoutingRuleCommand,
  UpdateRoutingRuleCommand,
  DeleteRoutingRuleCommand,
  ToggleRoutingRuleCommand,
  RouteTaskCommand,
  ForceAssignTaskCommand,
  RerouteTaskCommand,
  EscalateTaskCommand,
  getRoutingCommandSchemas,
  routeTaskHandler,
} from '../commands.js';

describe('Routing Commands', () => {
  describe('Skill Management Commands', () => {
    describe('CreateSkillCommand', () => {
      it('should validate valid input', () => {
        const input = {
          skillId: 'all-on-x',
          name: 'All-on-X Specialist',
          category: 'procedure' as const,
          description: 'Expertise in All-on-X dental procedures',
        };

        const result = CreateSkillCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should require skillId', () => {
        const input = {
          name: 'Test Skill',
          category: 'procedure' as const,
        };

        const result = CreateSkillCommand.schema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('should validate category enum', () => {
        const input = {
          skillId: 'test',
          name: 'Test Skill',
          category: 'invalid-category',
        };

        const result = CreateSkillCommand.schema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('should accept optional fields', () => {
        const input = {
          skillId: 'premium-sales',
          name: 'Premium Sales',
          category: 'administrative' as const,
          parentSkillId: 'sales-base',
          requiredCertification: 'SALES-PREMIUM-001',
          refreshIntervalDays: 90,
        };

        const result = CreateSkillCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.parentSkillId).toBe('sales-base');
          expect(result.data.refreshIntervalDays).toBe(90);
        }
      });
    });

    describe('UpdateSkillCommand', () => {
      it('should validate valid input', () => {
        const input = {
          skillId: 'all-on-x',
          updates: {
            name: 'Updated Name',
            isActive: false,
          },
        };

        const result = UpdateSkillCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should allow empty updates object', () => {
        const input = {
          skillId: 'test',
          updates: {},
        };

        const result = UpdateSkillCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('DeleteSkillCommand', () => {
      it('should validate valid input', () => {
        const input = {
          skillId: 'skill-to-delete',
          reassignAgentsTo: 'fallback-skill',
        };

        const result = DeleteSkillCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should not require reassignAgentsTo', () => {
        const input = {
          skillId: 'skill-to-delete',
        };

        const result = DeleteSkillCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Agent Skill Assignment Commands', () => {
    describe('AssignAgentSkillCommand', () => {
      it('should validate valid input', () => {
        const input = {
          agentId: 'agent-001',
          skillId: 'all-on-x',
          proficiency: 'expert' as const,
        };

        const result = AssignAgentSkillCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should validate proficiency level', () => {
        const validLevels = ['basic', 'intermediate', 'advanced', 'expert'];

        validLevels.forEach((level) => {
          const input = {
            agentId: 'agent-001',
            skillId: 'test-skill',
            proficiency: level,
          };

          const result = AssignAgentSkillCommand.schema.safeParse(input);
          expect(result.success).toBe(true);
        });
      });

      it('should accept certification info', () => {
        const input = {
          agentId: 'agent-001',
          skillId: 'all-on-x',
          proficiency: 'expert' as const,
          certifiedBy: 'trainer-001',
          certificationExpiresAt: '2025-12-31T23:59:59Z',
          notes: 'Completed advanced training',
        };

        const result = AssignAgentSkillCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('UpdateAgentSkillCommand', () => {
      it('should validate valid input', () => {
        const input = {
          agentId: 'agent-001',
          skillId: 'skill-001',
          updates: {
            proficiency: 'expert' as const,
            isActive: true,
          },
        };

        const result = UpdateAgentSkillCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('RemoveAgentSkillCommand', () => {
      it('should validate valid input', () => {
        const input = {
          agentId: 'agent-001',
          skillId: 'skill-001',
          reason: 'Agent transferred to different team',
        };

        const result = RemoveAgentSkillCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('BulkAssignSkillsCommand', () => {
      it('should validate valid input', () => {
        const input = {
          assignments: [
            { agentId: 'agent-001', skillId: 'skill-001', proficiency: 'intermediate' as const },
            { agentId: 'agent-002', skillId: 'skill-001', proficiency: 'expert' as const },
          ],
          certifiedBy: 'trainer-001',
        };

        const result = BulkAssignSkillsCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.assignments).toHaveLength(2);
        }
      });

      it('should accept empty assignments array', () => {
        const input = {
          assignments: [],
        };

        const result = BulkAssignSkillsCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Agent Profile Commands', () => {
    describe('CreateAgentProfileCommand', () => {
      it('should validate valid input', () => {
        const input = {
          agentId: 'agent-001',
          name: 'John Doe',
          email: 'john.doe@example.com',
          role: 'agent' as const,
        };

        const result = CreateAgentProfileCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should validate role enum', () => {
        const validRoles = ['agent', 'senior_agent', 'supervisor', 'manager', 'admin'];

        validRoles.forEach((role) => {
          const input = {
            agentId: 'agent-001',
            name: 'Test Agent',
            role,
          };

          const result = CreateAgentProfileCommand.schema.safeParse(input);
          expect(result.success).toBe(true);
        });
      });

      it('should validate email format', () => {
        const input = {
          agentId: 'agent-001',
          name: 'Test Agent',
          email: 'invalid-email',
        };

        const result = CreateAgentProfileCommand.schema.safeParse(input);
        expect(result.success).toBe(false);
      });

      it('should accept optional fields', () => {
        const input = {
          agentId: 'agent-001',
          name: 'Maria Garcia',
          workerSid: 'WK1234567890',
          teamId: 'team-dental',
          maxConcurrentTasks: 5,
          primaryLanguages: ['ro', 'en'],
          secondaryLanguages: ['es'],
        };

        const result = CreateAgentProfileCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should validate maxConcurrentTasks range', () => {
        const tooLow = {
          agentId: 'agent-001',
          name: 'Test',
          maxConcurrentTasks: 0,
        };

        const tooHigh = {
          agentId: 'agent-001',
          name: 'Test',
          maxConcurrentTasks: 11,
        };

        expect(CreateAgentProfileCommand.schema.safeParse(tooLow).success).toBe(false);
        expect(CreateAgentProfileCommand.schema.safeParse(tooHigh).success).toBe(false);
      });
    });

    describe('UpdateAgentAvailabilityCommand', () => {
      it('should validate valid input', () => {
        const input = {
          agentId: 'agent-001',
          availability: 'available' as const,
        };

        const result = UpdateAgentAvailabilityCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should validate all availability statuses', () => {
        const validStatuses = [
          'available',
          'busy',
          'away',
          'offline',
          'break',
          'training',
          'wrap-up',
        ];

        validStatuses.forEach((availability) => {
          const input = {
            agentId: 'agent-001',
            availability,
          };

          const result = UpdateAgentAvailabilityCommand.schema.safeParse(input);
          expect(result.success).toBe(true);
        });
      });
    });

    describe('UpdateAgentTaskCountCommand', () => {
      it('should validate valid input', () => {
        const input = {
          agentId: 'agent-001',
          taskCount: 3,
          action: 'set' as const,
        };

        const result = UpdateAgentTaskCountCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should validate action enum', () => {
        const validActions = ['increment', 'decrement', 'set'];

        validActions.forEach((action) => {
          const input = {
            agentId: 'agent-001',
            taskCount: 1,
            action,
          };

          const result = UpdateAgentTaskCountCommand.schema.safeParse(input);
          expect(result.success).toBe(true);
        });
      });

      it('should default action to set', () => {
        const input = {
          agentId: 'agent-001',
          taskCount: 5,
        };

        const result = UpdateAgentTaskCountCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.action).toBe('set');
        }
      });
    });
  });

  describe('Routing Rule Commands', () => {
    describe('CreateRoutingRuleCommand', () => {
      it('should validate valid input', () => {
        const input = {
          name: 'VIP All-on-X Routing',
          description: 'Route VIP All-on-X inquiries to specialists',
          priority: 100,
          conditions: {
            procedureTypes: ['all-on-x'],
            isVIP: true,
          },
          routing: {
            strategy: 'best_match' as const,
            skillRequirements: {
              requiredSkills: [{ skillId: 'all-on-x', minProficiency: 'expert' as const }],
            },
          },
        };

        const result = CreateRoutingRuleCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should apply default values', () => {
        const input = {
          name: 'Basic Routing',
          conditions: {},
          routing: {
            skillRequirements: {},
          },
        };

        const result = CreateRoutingRuleCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.priority).toBe(100);
          expect(result.data.routing.strategy).toBe('best_match');
          expect(result.data.routing.fallbackBehavior).toBe('queue');
          expect(result.data.routing.maxQueueTime).toBe(300);
        }
      });

      it('should validate time range', () => {
        const input = {
          name: 'Business Hours Routing',
          conditions: {
            timeRange: {
              startHour: 9,
              endHour: 18,
              timezone: 'Europe/Bucharest',
              daysOfWeek: [1, 2, 3, 4, 5],
            },
          },
          routing: {
            skillRequirements: {},
          },
        };

        const result = CreateRoutingRuleCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should validate priority range', () => {
        const tooLow = {
          name: 'Test',
          priority: -1,
          conditions: {},
          routing: { skillRequirements: {} },
        };

        const tooHigh = {
          name: 'Test',
          priority: 1001,
          conditions: {},
          routing: { skillRequirements: {} },
        };

        expect(CreateRoutingRuleCommand.schema.safeParse(tooLow).success).toBe(false);
        expect(CreateRoutingRuleCommand.schema.safeParse(tooHigh).success).toBe(false);
      });
    });

    describe('UpdateRoutingRuleCommand', () => {
      it('should validate valid input', () => {
        const input = {
          ruleId: 'rule-001',
          updates: {
            name: 'Updated Rule Name',
            priority: 200,
            isActive: true,
          },
        };

        const result = UpdateRoutingRuleCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('DeleteRoutingRuleCommand', () => {
      it('should validate valid input', () => {
        const input = {
          ruleId: 'rule-to-delete',
        };

        const result = DeleteRoutingRuleCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('ToggleRoutingRuleCommand', () => {
      it('should validate valid input', () => {
        const input = {
          ruleId: 'rule-001',
          isActive: false,
        };

        const result = ToggleRoutingRuleCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Routing Operation Commands', () => {
    describe('RouteTaskCommand', () => {
      it('should validate valid input', () => {
        const input = {
          taskId: 'task-001',
          callSid: 'CA123456',
          requirements: {
            requiredSkills: [{ skillId: 'dental-implants', minProficiency: 'advanced' as const }],
          },
          context: {
            procedureType: 'all-on-x',
            urgencyLevel: 'high' as const,
            channel: 'voice' as const,
            isVIP: true,
          },
        };

        const result = RouteTaskCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should validate urgency levels', () => {
        const validLevels = ['low', 'normal', 'high', 'critical'];

        validLevels.forEach((level) => {
          const input = {
            taskId: 'task-001',
            requirements: {},
            context: {
              urgencyLevel: level,
            },
          };

          const result = RouteTaskCommand.schema.safeParse(input);
          expect(result.success).toBe(true);
        });
      });

      it('should validate channels', () => {
        const validChannels = ['voice', 'whatsapp', 'web', 'chat'];

        validChannels.forEach((channel) => {
          const input = {
            taskId: 'task-001',
            requirements: {},
            context: {
              channel,
            },
          };

          const result = RouteTaskCommand.schema.safeParse(input);
          expect(result.success).toBe(true);
        });
      });

      it('should validate lead scores', () => {
        const validScores = ['HOT', 'WARM', 'COLD', 'UNQUALIFIED'];

        validScores.forEach((leadScore) => {
          const input = {
            taskId: 'task-001',
            requirements: {},
            context: {
              leadScore,
            },
          };

          const result = RouteTaskCommand.schema.safeParse(input);
          expect(result.success).toBe(true);
        });
      });
    });

    describe('ForceAssignTaskCommand', () => {
      it('should validate valid input', () => {
        const input = {
          taskId: 'task-001',
          agentId: 'agent-specialist',
          reason: 'Customer requested specific agent',
          bypassSkillCheck: true,
        };

        const result = ForceAssignTaskCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should default bypassSkillCheck to false', () => {
        const input = {
          taskId: 'task-001',
          agentId: 'agent-001',
          reason: 'Supervisor override',
        };

        const result = ForceAssignTaskCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.bypassSkillCheck).toBe(false);
        }
      });
    });

    describe('RerouteTaskCommand', () => {
      it('should validate valid input', () => {
        const input = {
          taskId: 'task-001',
          reason: 'agent_unavailable' as const,
          excludeAgentIds: ['agent-001', 'agent-002'],
          priorityBoost: 20,
        };

        const result = RerouteTaskCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should validate reason enum', () => {
        const validReasons = [
          'agent_unavailable',
          'skill_mismatch',
          'customer_request',
          'supervisor_override',
          'timeout',
        ];

        validReasons.forEach((reason) => {
          const input = {
            taskId: 'task-001',
            reason,
          };

          const result = RerouteTaskCommand.schema.safeParse(input);
          expect(result.success).toBe(true);
        });
      });

      it('should validate priorityBoost range', () => {
        const tooHigh = {
          taskId: 'task-001',
          reason: 'timeout' as const,
          priorityBoost: 51,
        };

        expect(RerouteTaskCommand.schema.safeParse(tooHigh).success).toBe(false);
      });
    });

    describe('EscalateTaskCommand', () => {
      it('should validate valid input', () => {
        const input = {
          taskId: 'task-001',
          reason: 'Customer complaint requires manager attention',
          escalateToRole: 'manager' as const,
          priority: 'urgent' as const,
        };

        const result = EscalateTaskCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should apply default values', () => {
        const input = {
          taskId: 'task-001',
          reason: 'Escalation needed',
        };

        const result = EscalateTaskCommand.schema.safeParse(input);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.escalateToRole).toBe('supervisor');
          expect(result.data.priority).toBe('high');
        }
      });

      it('should validate escalateToRole', () => {
        const validRoles = ['supervisor', 'manager', 'admin'];

        validRoles.forEach((role) => {
          const input = {
            taskId: 'task-001',
            reason: 'Test',
            escalateToRole: role,
          };

          const result = EscalateTaskCommand.schema.safeParse(input);
          expect(result.success).toBe(true);
        });
      });
    });
  });

  describe('getRoutingCommandSchemas', () => {
    it('should return all command schemas', () => {
      const schemas = getRoutingCommandSchemas();

      expect(schemas.size).toBe(18);
    });

    it('should include skill management commands', () => {
      const schemas = getRoutingCommandSchemas();

      expect(schemas.has('CreateSkill')).toBe(true);
      expect(schemas.has('UpdateSkill')).toBe(true);
      expect(schemas.has('DeleteSkill')).toBe(true);
    });

    it('should include agent skill assignment commands', () => {
      const schemas = getRoutingCommandSchemas();

      expect(schemas.has('AssignAgentSkill')).toBe(true);
      expect(schemas.has('UpdateAgentSkill')).toBe(true);
      expect(schemas.has('RemoveAgentSkill')).toBe(true);
      expect(schemas.has('BulkAssignSkills')).toBe(true);
    });

    it('should include agent profile commands', () => {
      const schemas = getRoutingCommandSchemas();

      expect(schemas.has('CreateAgentProfile')).toBe(true);
      expect(schemas.has('UpdateAgentAvailability')).toBe(true);
      expect(schemas.has('UpdateAgentTaskCount')).toBe(true);
    });

    it('should include routing rule commands', () => {
      const schemas = getRoutingCommandSchemas();

      expect(schemas.has('CreateRoutingRule')).toBe(true);
      expect(schemas.has('UpdateRoutingRule')).toBe(true);
      expect(schemas.has('DeleteRoutingRule')).toBe(true);
      expect(schemas.has('ToggleRoutingRule')).toBe(true);
    });

    it('should include routing operation commands', () => {
      const schemas = getRoutingCommandSchemas();

      expect(schemas.has('RouteTask')).toBe(true);
      expect(schemas.has('ForceAssignTask')).toBe(true);
      expect(schemas.has('RerouteTask')).toBe(true);
      expect(schemas.has('EscalateTask')).toBe(true);
    });
  });

  describe('routeTaskHandler', () => {
    it('should handle successful routing', async () => {
      const mockRoutingService = {
        route: vi.fn().mockResolvedValue({
          decisionId: 'dec-001',
          outcome: 'routed',
          selectedAgentId: 'agent-001',
          selectedAgentName: 'John Doe',
          processingTimeMs: 50,
        }),
      };

      const command = {
        payload: {
          taskId: 'task-001',
          callSid: 'CA123456',
          requirements: {
            requiredSkills: [],
          },
          context: {
            urgencyLevel: 'high' as const,
          },
        },
        metadata: {
          commandId: 'cmd-001',
        },
      };

      const context = {
        routingService: mockRoutingService,
        correlationId: 'corr-001',
      };

      const result = await routeTaskHandler(command as any, context as any);

      expect(result.success).toBe(true);
      expect(result.result.outcome).toBe('routed');
      expect(result.result.agentId).toBe('agent-001');
    });

    it('should handle queued routing', async () => {
      const mockRoutingService = {
        route: vi.fn().mockResolvedValue({
          decisionId: 'dec-002',
          outcome: 'queued',
          queuePosition: 3,
          processingTimeMs: 30,
        }),
      };

      const command = {
        payload: {
          taskId: 'task-002',
          requirements: {},
        },
        metadata: {
          commandId: 'cmd-002',
        },
      };

      const context = {
        routingService: mockRoutingService,
        correlationId: 'corr-002',
      };

      const result = await routeTaskHandler(command as any, context as any);

      expect(result.success).toBe(true);
      expect(result.result.outcome).toBe('queued');
      expect(result.result.queuePosition).toBe(3);
    });

    it('should return failure for rejected routing', async () => {
      const mockRoutingService = {
        route: vi.fn().mockResolvedValue({
          decisionId: 'dec-003',
          outcome: 'rejected',
          processingTimeMs: 10,
        }),
      };

      const command = {
        payload: {
          taskId: 'task-003',
          requirements: {},
        },
        metadata: {
          commandId: 'cmd-003',
        },
      };

      const context = {
        routingService: mockRoutingService,
        correlationId: 'corr-003',
      };

      const result = await routeTaskHandler(command as any, context as any);

      expect(result.success).toBe(false);
      expect(result.result.outcome).toBe('rejected');
    });
  });
});
