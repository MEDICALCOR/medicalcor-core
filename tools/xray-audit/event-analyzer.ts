/**
 * XRAY Audit Engine - Event-Driven Architecture Analyzer
 *
 * Analyzes CQRS, Event Sourcing, Outbox pattern, and event-driven readiness.
 */

import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';
import type {
  EventDrivenAnalysis,
  CQRSAnalysis,
  EventDefinition,
  AuditIssue,
  AnalyzerConfig,
} from './types.js';

export class EventAnalyzer {
  constructor(private config: AnalyzerConfig) {}

  async analyzeEventDriven(): Promise<EventDrivenAnalysis> {
    const events = await this.findEventDefinitions();
    const outboxPresent = await this.checkOutboxPattern();
    const idempotencyGuarantees = await this.checkIdempotency();
    const versioningStrategy = await this.detectVersioningStrategy();
    const issues = await this.detectEventIssues();

    return {
      events,
      outboxPresent,
      idempotencyGuarantees,
      versioningStrategy,
      issues,
    };
  }

  async analyzeCQRS(): Promise<CQRSAnalysis> {
    const commands = await this.findCommands();
    const queries = await this.findQueries();
    const separation = commands.length > 0 && queries.length > 0;
    const issues = await this.detectCQRSIssues(commands, queries);

    return {
      commands,
      queries,
      separation,
      issues,
    };
  }

  private async findEventDefinitions(): Promise<EventDefinition[]> {
    const events: EventDefinition[] = [];
    const rootPath = this.config.rootPath;

    const searchPaths = [
      'packages/types/src/events.schema.ts',
      'packages/types/src/lib/events.ts',
      'packages/core/src/events',
      'packages/domain/src',
    ];

    for (const searchPath of searchPaths) {
      const fullPath = join(rootPath, searchPath);

      try {
        const files = await this.getAllFiles(fullPath, ['.ts']);

        for (const file of files) {
          const content = await readFile(file, 'utf-8');
          const relativePath = relative(rootPath, file);

          // Look for event type definitions
          const eventMatches = content.matchAll(
            /(?:export\s+)?(?:interface|type|class)\s+(\w+Event)\s*[{=]/g
          );

          for (const match of eventMatches) {
            const eventName = match[1];
            const properties = this.extractProperties(content, eventName);
            const versioned = content.includes('version') || content.includes('schemaVersion');

            events.push({
              name: eventName,
              filePath: relativePath,
              properties,
              versioned,
            });
          }
        }
      } catch (error) {
        // Path might not exist
        continue;
      }
    }

    return events;
  }

  private async checkOutboxPattern(): Promise<boolean> {
    const rootPath = this.config.rootPath;

    // Check for outbox in code
    const coreFiles = await this.getAllFiles(join(rootPath, 'packages/core/src'), ['.ts']);

    for (const file of coreFiles) {
      const content = await readFile(file, 'utf-8');
      if (content.includes('outbox') || content.includes('Outbox')) {
        return true;
      }
    }

    // Check for outbox table in migrations
    const migrationFiles = await this.getAllFiles(join(rootPath, 'supabase/migrations'), ['.sql']);

    for (const file of migrationFiles) {
      const content = await readFile(file, 'utf-8');
      if (content.toLowerCase().includes('outbox')) {
        return true;
      }
    }

    return false;
  }

  private async checkIdempotency(): Promise<boolean> {
    const rootPath = this.config.rootPath;
    const searchPaths = ['packages/core/src', 'apps/trigger/src'];

    for (const searchPath of searchPaths) {
      const fullPath = join(rootPath, searchPath);

      try {
        const files = await this.getAllFiles(fullPath, ['.ts']);

        for (const file of files) {
          const content = await readFile(file, 'utf-8');

          if (
            content.includes('idempotency') ||
            content.includes('Idempotent') ||
            content.includes('idempotentKey')
          ) {
            return true;
          }
        }
      } catch (error) {
        continue;
      }
    }

    return false;
  }

  private async detectVersioningStrategy(): Promise<string | null> {
    const rootPath = this.config.rootPath;
    const eventFiles = await this.getAllFiles(join(rootPath, 'packages/types/src'), ['.ts']);

    for (const file of eventFiles) {
      const content = await readFile(file, 'utf-8');

      if (content.includes('version:') || content.includes('schemaVersion')) {
        if (content.includes('v1') || content.includes('v2')) {
          return 'Semantic versioning detected';
        }
        return 'Version field present';
      }
    }

    return null;
  }

  private async detectEventIssues(): Promise<AuditIssue[]> {
    const issues: AuditIssue[] = [];
    const events = await this.findEventDefinitions();

    // Check for events without versioning
    const unversionedEvents = events.filter((e) => !e.versioned);
    if (unversionedEvents.length > 0) {
      issues.push({
        category: 'EVENT_DRIVEN',
        title: 'Events without versioning',
        description: `${unversionedEvents.length} events lack version fields`,
        filePath: 'packages/types/src/events.schema.ts',
        impact: 'Cannot safely evolve event schemas over time',
        priority: 'MEDIUM',
        suggestedFix: 'Add version or schemaVersion field to all events',
        suggestedPR: 'feat(events): add versioning to event schemas',
      });
    }

    // Check if outbox is missing
    const outboxPresent = await this.checkOutboxPattern();
    if (!outboxPresent) {
      issues.push({
        category: 'EVENT_DRIVEN',
        title: 'Outbox pattern not implemented',
        description: 'No outbox table or implementation found',
        filePath: 'packages/core/src/architecture/events/',
        impact: 'Events may be lost if publishing fails',
        priority: 'HIGH',
        suggestedFix: 'Implement outbox pattern for reliable event publishing',
        suggestedPR: 'feat(events): implement outbox pattern for reliable delivery',
      });
    }

    return issues;
  }

  private async findCommands(): Promise<string[]> {
    const commands: string[] = [];
    const rootPath = this.config.rootPath;

    const searchPaths = ['packages/application/src', 'packages/core/src/cqrs'];

    for (const searchPath of searchPaths) {
      const fullPath = join(rootPath, searchPath);

      try {
        const files = await this.getAllFiles(fullPath, ['.ts']);

        for (const file of files) {
          const content = await readFile(file, 'utf-8');
          const relativePath = relative(rootPath, file);

          const commandMatches = content.matchAll(
            /(?:export\s+)?(?:class|interface)\s+(\w+Command)\b/g
          );

          for (const match of commandMatches) {
            commands.push(`${match[1]} (${relativePath})`);
          }
        }
      } catch (error) {
        continue;
      }
    }

    return commands;
  }

  private async findQueries(): Promise<string[]> {
    const queries: string[] = [];
    const rootPath = this.config.rootPath;

    const searchPaths = ['packages/application/src', 'packages/core/src/cqrs'];

    for (const searchPath of searchPaths) {
      const fullPath = join(rootPath, searchPath);

      try {
        const files = await this.getAllFiles(fullPath, ['.ts']);

        for (const file of files) {
          const content = await readFile(file, 'utf-8');
          const relativePath = relative(rootPath, file);

          const queryMatches = content.matchAll(
            /(?:export\s+)?(?:class|interface)\s+(\w+Query)\b/g
          );

          for (const match of queryMatches) {
            queries.push(`${match[1]} (${relativePath})`);
          }
        }
      } catch (error) {
        continue;
      }
    }

    return queries;
  }

  private async detectCQRSIssues(commands: string[], queries: string[]): Promise<AuditIssue[]> {
    const issues: AuditIssue[] = [];

    if (commands.length === 0) {
      issues.push({
        category: 'EVENT_DRIVEN',
        title: 'No command definitions found',
        description: 'CQRS pattern requires explicit command definitions',
        filePath: 'packages/application/src',
        impact: 'Write operations not properly separated',
        priority: 'MEDIUM',
        suggestedFix: 'Define command classes for all write operations',
        suggestedPR: 'feat(cqrs): add command definitions for write operations',
      });
    }

    if (queries.length === 0) {
      issues.push({
        category: 'EVENT_DRIVEN',
        title: 'No query definitions found',
        description: 'CQRS pattern requires explicit query definitions',
        filePath: 'packages/application/src',
        impact: 'Read operations not properly separated',
        priority: 'MEDIUM',
        suggestedFix: 'Define query classes for all read operations',
        suggestedPR: 'feat(cqrs): add query definitions for read operations',
      });
    }

    return issues;
  }

  private extractProperties(content: string, typeName: string): string[] {
    const properties: string[] = [];

    // Simple regex to extract property names (not perfect but good enough)
    const typeMatch = content.match(new RegExp(`${typeName}\\s*[={]([^}]+)}`));

    if (typeMatch) {
      const body = typeMatch[1];
      const propMatches = body.matchAll(/(\w+):/g);

      for (const match of propMatches) {
        properties.push(match[1]);
      }
    }

    return properties;
  }

  private async getAllFiles(
    dirPath: string,
    extensions: string[],
    currentDepth: number = 0
  ): Promise<string[]> {
    const maxDepth = 10;

    if (currentDepth > maxDepth) {
      return [];
    }

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const subFiles = await this.getAllFiles(fullPath, extensions, currentDepth + 1);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          if (extensions.some((ext) => entry.name.endsWith(ext))) {
            files.push(fullPath);
          }
        }
      }

      return files;
    } catch (error) {
      return [];
    }
  }
}
