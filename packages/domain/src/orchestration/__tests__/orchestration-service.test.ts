/**
 * @fileoverview OrchestrationService Unit Tests
 *
 * Tests for the multi-agent orchestration domain service.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { createOrchestrationService, type OrchestrationService } from '../orchestration-service.js';

describe('OrchestrationService', () => {
  let service: OrchestrationService;

  beforeEach(() => {
    service = createOrchestrationService();
  });

  describe('createSession', () => {
    it('should create a valid session', () => {
      const session = service.createSession({
        request: 'Add a new domain service for patient scheduling',
        priority: 'HIGH',
      });

      expect(session.id).toBeDefined();
      expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(session.status).toBe('CREATED');
      expect(session.priority).toBe('HIGH');
      expect(session.request).toBe('Add a new domain service for patient scheduling');
      expect(session.directives).toHaveLength(0);
      expect(session.reports).toHaveLength(0);
      expect(session.qualityGates).toHaveLength(0);
      expect(session.conflicts).toHaveLength(0);
      expect(session.auditTrail).toHaveLength(1);
      expect(session.auditTrail[0]?.action).toBe('SESSION_CREATED');
    });

    it('should default priority to MEDIUM', () => {
      const session = service.createSession({
        request: 'Add a simple feature',
      });

      expect(session.priority).toBe('MEDIUM');
    });

    it('should handle optional deadline', () => {
      const deadline = new Date(Date.now() + 86400000).toISOString();
      const session = service.createSession({
        request: 'Time-sensitive task',
        deadline,
      });

      expect(session.deadline).toBe(deadline);
    });

    // Property-based test: request length should be preserved
    it('should preserve request content for any valid input', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 10, maxLength: 10000 }), (request) => {
          const session = service.createSession({ request });
          return session.request === request;
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('analyzeTask', () => {
    it('should identify NEW_DOMAIN_SERVICE pattern', () => {
      const analysis = service.analyzeTask('Add a new domain service for patient management');

      expect(analysis.taskType).toBe('NEW_DOMAIN_SERVICE');
      expect(analysis.requiredAgents).toContain('DOMAIN');
      expect(analysis.requiredAgents).toContain('ARCHITECT');
      expect(analysis.requiredQualityGates).toContain('G1_ARCHITECTURE');
      expect(analysis.requiredQualityGates).toContain('G2_DOMAIN_PURITY');
    });

    it('should identify NEW_INTEGRATION pattern', () => {
      const analysis = service.analyzeTask('Add integration with Stripe payment gateway');

      expect(analysis.taskType).toBe('NEW_INTEGRATION');
      expect(analysis.requiredAgents).toContain('INTEGRATIONS');
      expect(analysis.requiredAgents).toContain('SECURITY');
      expect(analysis.requiredQualityGates).toContain('G4_SECURITY');
    });

    it('should identify DATABASE_MIGRATION pattern', () => {
      const analysis = service.analyzeTask('Create database migration for new patients table');

      expect(analysis.taskType).toBe('DATABASE_MIGRATION');
      expect(analysis.requiredAgents).toContain('INFRA');
      expect(analysis.requiredAgents).toContain('ARCHITECT');
    });

    it('should identify AI_RAG_FEATURE pattern', () => {
      const analysis = service.analyzeTask(
        'Implement RAG-based knowledge retrieval for embeddings'
      );

      expect(analysis.taskType).toBe('AI_RAG_FEATURE');
      expect(analysis.requiredAgents).toContain('AI_RAG');
      expect(analysis.requiredQualityGates).toContain('G6_PERFORMANCE');
    });

    it('should identify UI_COMPONENT pattern', () => {
      const analysis = service.analyzeTask('Create React component for patient dashboard');

      expect(analysis.taskType).toBe('UI_COMPONENT');
      expect(analysis.requiredAgents).toContain('FRONTEND');
    });

    it('should identify SECURITY_FIX pattern', () => {
      const analysis = service.analyzeTask('Fix security vulnerability in authentication flow');

      expect(analysis.taskType).toBe('SECURITY_FIX');
      expect(analysis.requiredAgents).toContain('SECURITY');
      expect(analysis.requiredAgents).toContain('COMPLIANCE');
      expect(analysis.requiredQualityGates).toContain('G3_COMPLIANCE');
      expect(analysis.requiredQualityGates).toContain('G4_SECURITY');
    });

    it('should identify PERFORMANCE_ISSUE pattern', () => {
      const analysis = service.analyzeTask(
        'Optimize slow database queries and improve performance'
      );

      expect(analysis.taskType).toBe('PERFORMANCE_ISSUE');
      expect(analysis.requiredAgents).toContain('QA');
      expect(analysis.requiredAgents).toContain('INFRA');
      expect(analysis.requiredQualityGates).toContain('G6_PERFORMANCE');
    });

    it('should identify DEPLOYMENT pattern', () => {
      const analysis = service.analyzeTask('Deploy latest changes to production environment');

      expect(analysis.taskType).toBe('DEPLOYMENT');
      expect(analysis.requiredAgents).toContain('DEVOPS');
      expect(analysis.requiredQualityGates).toContain('G7_DEPLOYMENT');
    });

    it('should identify COMPLIANCE_AUDIT pattern', () => {
      const analysis = service.analyzeTask('HIPAA audit review for patient data handling');

      expect(analysis.taskType).toBe('COMPLIANCE_AUDIT');
      expect(analysis.requiredAgents).toContain('COMPLIANCE');
      expect(analysis.requiredAgents).toContain('SECURITY');
    });

    it('should identify ARCHITECTURE_REFACTOR pattern', () => {
      const analysis = service.analyzeTask('Refactor codebase to follow hexagonal architecture');

      expect(analysis.taskType).toBe('ARCHITECTURE_REFACTOR');
      expect(analysis.requiredAgents).toContain('ARCHITECT');
      expect(analysis.requiredAgents).toContain('DOMAIN');
    });

    it('should calculate appropriate complexity', () => {
      const simpleTask = service.analyzeTask('Add a UI component for button');
      const complexTask = service.analyzeTask(
        'Implement HIPAA-compliant integration with external API and database migration'
      );

      expect(['TRIVIAL', 'SIMPLE', 'MODERATE']).toContain(simpleTask.complexity);
      expect(['MODERATE', 'COMPLEX', 'CRITICAL']).toContain(complexTask.complexity);
    });

    // Property-based test: analysis should always return valid structure
    it('should always return valid analysis structure', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 10, maxLength: 500 }), (request) => {
          const analysis = service.analyzeTask(request);

          return (
            typeof analysis.id === 'string' &&
            analysis.id.length > 0 &&
            Array.isArray(analysis.requiredAgents) &&
            analysis.requiredAgents.length > 0 &&
            typeof analysis.complexity === 'string' &&
            typeof analysis.parallelizable === 'boolean' &&
            Array.isArray(analysis.requiredQualityGates)
          );
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('createDirectives', () => {
    it('should create directives for all required agents', () => {
      const analysis = service.analyzeTask('Add a new domain service');
      const directives = service.createDirectives(
        'session-123',
        'Add a new domain service',
        analysis
      );

      expect(directives.length).toBe(analysis.requiredAgents.length);

      for (const directive of directives) {
        expect(directive.sessionId).toBe('session-123');
        expect(analysis.requiredAgents).toContain(directive.target);
        expect(directive.task).toBeDefined();
        expect(directive.constraints.length).toBeGreaterThan(0);
      }
    });

    it('should set appropriate priorities for directives', () => {
      const analysis = service.analyzeTask('Fix security vulnerability');
      const directives = service.createDirectives(
        'session-456',
        'Fix security vulnerability',
        analysis
      );

      // Security agents should have higher priority
      const securityDirective = directives.find((d) => d.target === 'SECURITY');
      expect(securityDirective).toBeDefined();
      expect(['CRITICAL', 'HIGH']).toContain(securityDirective?.priority);
    });

    it('should include required quality gates in directives', () => {
      const analysis = service.analyzeTask('Create database migration');
      const directives = service.createDirectives(
        'session-789',
        'Create database migration',
        analysis
      );

      for (const directive of directives) {
        expect(Array.isArray(directive.requiredQualityGates)).toBe(true);
      }
    });
  });

  describe('validateQualityGates', () => {
    it('should pass when all gates pass', () => {
      const results = [
        {
          gate: 'G1_ARCHITECTURE' as const,
          status: 'PASSED' as const,
          checkedAt: new Date().toISOString(),
          checkedBy: 'ARCHITECT' as const,
          durationMs: 1000,
        },
        {
          gate: 'G5_QUALITY' as const,
          status: 'PASSED' as const,
          checkedAt: new Date().toISOString(),
          checkedBy: 'QA' as const,
          durationMs: 2000,
        },
      ];

      const validation = service.validateQualityGates(results);

      expect(validation.passed).toBe(true);
      expect(validation.failedGates).toHaveLength(0);
    });

    it('should fail when any gate fails', () => {
      const results = [
        {
          gate: 'G1_ARCHITECTURE' as const,
          status: 'PASSED' as const,
          checkedAt: new Date().toISOString(),
          checkedBy: 'ARCHITECT' as const,
          durationMs: 1000,
        },
        {
          gate: 'G4_SECURITY' as const,
          status: 'FAILED' as const,
          checkedAt: new Date().toISOString(),
          checkedBy: 'SECURITY' as const,
          durationMs: 1500,
          errors: ['Found hardcoded secrets'],
        },
      ];

      const validation = service.validateQualityGates(results);

      expect(validation.passed).toBe(false);
      expect(validation.failedGates).toContain('G4_SECURITY');
    });

    it('should treat skipped gates as passed', () => {
      const results = [
        {
          gate: 'G1_ARCHITECTURE' as const,
          status: 'SKIPPED' as const,
          checkedAt: new Date().toISOString(),
          checkedBy: 'ARCHITECT' as const,
          durationMs: 0,
          notes: 'Not applicable for this task',
        },
      ];

      const validation = service.validateQualityGates(results);

      expect(validation.passed).toBe(true);
    });
  });

  describe('resolveConflict', () => {
    it('should determine correct resolver for architecture conflicts', () => {
      const resolution = service.resolveConflict({
        type: 'LAYER_VIOLATION',
        severity: 'HIGH',
        description: 'Domain layer imports from infrastructure',
        affectedAgents: ['DOMAIN', 'INFRA'],
        sessionId: 'session-123',
      });

      expect(resolution.resolver).toBe('ARCHITECT');
    });

    it('should determine correct resolver for security conflicts', () => {
      const resolution = service.resolveConflict({
        type: 'SECURITY_RISK',
        severity: 'CRITICAL',
        description: 'Potential SQL injection vulnerability',
        affectedAgents: ['DOMAIN', 'INFRA'],
        sessionId: 'session-123',
      });

      expect(resolution.resolver).toBe('SECURITY');
    });

    it('should determine correct resolver for compliance conflicts', () => {
      const resolution = service.resolveConflict({
        type: 'COMPLIANCE_BREACH',
        severity: 'CRITICAL',
        description: 'HIPAA violation detected in patient data handling',
        affectedAgents: ['DOMAIN'],
        sessionId: 'session-123',
      });

      expect(resolution.resolver).toBe('COMPLIANCE');
    });

    it('should recommend appropriate action based on severity', () => {
      const criticalResolution = service.resolveConflict({
        type: 'SECURITY_RISK',
        severity: 'CRITICAL',
        description: 'Critical security vulnerability',
        affectedAgents: ['SECURITY'],
        sessionId: 'session-123',
      });

      expect(['BLOCK_MERGE', 'REQUIRE_REFACTOR', 'ESCALATE']).toContain(criticalResolution.action);
    });
  });

  describe('generateReport', () => {
    it('should generate report from session data', () => {
      const session = service.createSession({
        request: 'Test task',
        priority: 'MEDIUM',
      });

      const analysis = service.analyzeTask(session.request);
      const sessionWithAnalysis = {
        ...session,
        analysis,
        status: 'COMPLETED' as const,
        directives: [],
        reports: [],
        qualityGates: [
          {
            gate: 'G5_QUALITY' as const,
            status: 'PASSED' as const,
            checkedAt: new Date().toISOString(),
            checkedBy: 'QA' as const,
            durationMs: 1000,
          },
        ],
        conflicts: [],
      };

      const report = service.generateReport(sessionWithAnalysis);

      expect(report.sessionId).toBe(session.id);
      expect(report.status).toBe('COMPLETED');
      expect(report.complexity).toBe(analysis.complexity);
      expect(report.metrics.totalGates).toBe(1);
      expect(report.metrics.passedGates).toBe(1);
    });

    it('should calculate correct metrics', () => {
      const session = service.createSession({
        request: 'Multi-agent test task',
      });

      const analysis = service.analyzeTask(session.request);
      const sessionWithData = {
        ...session,
        analysis,
        status: 'COMPLETED' as const,
        directives: [
          {
            id: 'directive-1',
            sessionId: session.id,
            target: 'DOMAIN' as const,
            priority: 'HIGH' as const,
            task: 'Implement domain logic',
            description: 'Domain implementation',
            constraints: [],
            dependencies: [],
            reportingFrequency: 'ON_COMPLETION' as const,
            requiredQualityGates: [],
            idempotencyKey: 'key-1',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'directive-2',
            sessionId: session.id,
            target: 'QA' as const,
            priority: 'MEDIUM' as const,
            task: 'Write tests',
            description: 'Test implementation',
            constraints: [],
            dependencies: [],
            reportingFrequency: 'ON_COMPLETION' as const,
            requiredQualityGates: [],
            idempotencyKey: 'key-2',
            createdAt: new Date().toISOString(),
          },
        ],
        reports: [
          {
            id: 'report-1',
            directiveId: 'directive-1',
            sessionId: session.id,
            agent: 'DOMAIN' as const,
            task: 'Implement domain logic',
            status: 'COMPLETED' as const,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            findings: [],
            recommendations: [],
            blockers: [],
            nextSteps: [],
            qualityGateResults: [],
            artifacts: {
              filesCreated: ['file1.ts'],
              filesModified: [],
              filesDeleted: [],
              testsAdded: [],
              migrationsAdded: [],
            },
            metrics: {
              linesAdded: 100,
              linesRemoved: 10,
              filesChanged: 1,
              executionTimeMs: 5000,
            },
          },
        ],
        qualityGates: [
          {
            gate: 'G5_QUALITY' as const,
            status: 'PASSED' as const,
            checkedAt: new Date().toISOString(),
            checkedBy: 'QA' as const,
            durationMs: 1000,
          },
          {
            gate: 'G1_ARCHITECTURE' as const,
            status: 'FAILED' as const,
            checkedAt: new Date().toISOString(),
            checkedBy: 'ARCHITECT' as const,
            durationMs: 500,
          },
        ],
        conflicts: [],
      };

      const report = service.generateReport(sessionWithData);

      expect(report.metrics.totalAgents).toBe(2);
      expect(report.metrics.completedAgents).toBe(1);
      expect(report.metrics.totalGates).toBe(2);
      expect(report.metrics.passedGates).toBe(1);
      expect(report.metrics.failedGates).toBe(1);
    });
  });
});
