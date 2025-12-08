/**
 * XRAY Audit Engine - Security & Privacy Analyzer
 *
 * Analyzes security posture including Zero-Trust principles, PII handling,
 * secrets management, RLS policies, and GDPR/HIPAA compliance.
 */

import { readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';
import type { SecurityAnalysis, AuditIssue, AnalyzerConfig } from './types.js';

// PII patterns to detect
const PII_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /\b\d{10,}\b|\+\d{1,3}\s?\d{9,}/g,
  cnp: /\b[1-9]\d{12}\b/g, // Romanian CNP
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g, // US SSN
  creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  ipAddress: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
};

// Secret patterns to detect
const SECRET_PATTERNS = {
  apiKey: /api[_-]?key\s*[=:]\s*['"][a-zA-Z0-9]{20,}['"]/gi,
  password: /password\s*[=:]\s*['"][^'"]{8,}['"]/gi,
  token: /token\s*[=:]\s*['"][a-zA-Z0-9._-]{20,}['"]/gi,
  privateKey: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/gi,
  awsKey: /AKIA[0-9A-Z]{16}/g,
  githubToken: /gh[ps]_[a-zA-Z0-9]{36}/g,
  stripeKey: /sk_live_[a-zA-Z0-9]{24,}/g,
};

export class SecurityAnalyzer {
  constructor(private config: AnalyzerConfig) {}

  async analyze(): Promise<SecurityAnalysis> {
    const [authBoundary, rlsPolicies, piiExposures, secretsFound, missingEncryption] =
      await Promise.all([
        this.analyzeAuthBoundary(),
        this.analyzeRLSPolicies(),
        this.analyzePIIExposures(),
        this.scanForSecrets(),
        this.checkEncryption(),
      ]);

    // Get top 5 security risks
    const allIssues = [...piiExposures, ...secretsFound];
    const topRisks = allIssues.filter((issue) => issue.priority === 'HIGH').slice(0, 5);

    return {
      authBoundary,
      rlsPolicies,
      piiExposures,
      secretsFound,
      missingEncryption,
      topRisks,
    };
  }

  private async analyzeAuthBoundary(): Promise<string[]> {
    const boundaries: string[] = [];
    const apiPath = join(this.config.rootPath, 'apps/api/src');

    try {
      const files = await this.getAllFiles(apiPath, ['.ts']);

      for (const file of files) {
        const content = await readFile(file, 'utf-8');
        const relativePath = relative(this.config.rootPath, file);

        // Check for authentication middleware
        if (
          content.includes('authenticate') ||
          content.includes('verifyToken') ||
          content.includes('checkAuth')
        ) {
          boundaries.push(relativePath);
        }
      }
    } catch (error) {
      if (this.config.verbose) {
        console.warn('Error analyzing auth boundary:', error);
      }
    }

    return boundaries;
  }

  private async analyzeRLSPolicies(): Promise<string[]> {
    const policies: string[] = [];
    const migrationsPath = join(this.config.rootPath, 'supabase/migrations');

    try {
      const files = await this.getAllFiles(migrationsPath, ['.sql']);

      for (const file of files) {
        const content = await readFile(file, 'utf-8');
        const relativePath = relative(this.config.rootPath, file);

        // Check for RLS policies
        if (
          content.toUpperCase().includes('CREATE POLICY') ||
          (content.toUpperCase().includes('ALTER TABLE') &&
            content.toUpperCase().includes('ENABLE ROW LEVEL SECURITY'))
        ) {
          policies.push(relativePath);
        }
      }
    } catch (error) {
      // Directory might not exist
      if (this.config.verbose) {
        console.warn('Error analyzing RLS policies:', error);
      }
    }

    return policies;
  }

  private async analyzePIIExposures(): Promise<AuditIssue[]> {
    const issues: AuditIssue[] = [];
    const rootPath = this.config.rootPath;

    const searchPaths = ['packages/core/src', 'apps/api/src', 'apps/trigger/src'];

    for (const searchPath of searchPaths) {
      const fullPath = join(rootPath, searchPath);

      try {
        const files = await this.getAllFiles(fullPath, ['.ts', '.tsx']);

        for (const file of files) {
          const content = await readFile(file, 'utf-8');
          const relativePath = relative(rootPath, file);

          // Skip test files
          if (relativePath.includes('__tests__') || relativePath.includes('.test.')) {
            continue;
          }

          // Check for console.log with potential PII
          const consoleLogMatches = content.matchAll(/console\.log\([^)]+\)/g);
          for (const match of consoleLogMatches) {
            const logStatement = match[0];

            // Check if logging potentially contains PII
            if (
              logStatement.includes('user') ||
              logStatement.includes('patient') ||
              logStatement.includes('email') ||
              logStatement.includes('phone')
            ) {
              issues.push({
                category: 'PRIVACY',
                title: 'Potential PII exposure in logging',
                description: 'console.log may expose PII without redaction',
                filePath: relativePath,
                impact: 'GDPR/HIPAA violation, patient privacy risk',
                priority: 'HIGH',
                suggestedFix:
                  'Use structured logger with PII redaction from @medicalcor/core/logger',
                suggestedPR: `fix(privacy): add PII redaction to logging in ${relativePath.split('/').pop()}`,
              });
            }
          }

          // Check for hardcoded PII patterns
          for (const [piiType, pattern] of Object.entries(PII_PATTERNS)) {
            if (pattern.test(content)) {
              // Only flag if not in a comment or example
              const lines = content.split('\n');
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (
                  pattern.test(line) &&
                  !line.trim().startsWith('//') &&
                  !line.includes('example')
                ) {
                  issues.push({
                    category: 'PRIVACY',
                    title: `Hardcoded ${piiType} detected`,
                    description: `Line ${i + 1} contains what appears to be ${piiType}`,
                    filePath: relativePath,
                    lineNumber: i + 1,
                    impact: 'Potential privacy breach',
                    priority: 'MEDIUM',
                    suggestedFix:
                      'Remove hardcoded PII and use configuration or environment variables',
                    suggestedPR: `fix(security): remove hardcoded PII from ${relativePath.split('/').pop()}`,
                  });
                }
              }
            }
          }
        }
      } catch (error) {
        if (this.config.verbose) {
          console.warn(`Error analyzing ${searchPath}:`, error);
        }
      }
    }

    return issues;
  }

  private async scanForSecrets(): Promise<AuditIssue[]> {
    const issues: AuditIssue[] = [];
    const rootPath = this.config.rootPath;

    // Scan all source files except .env files and node_modules
    const files = await this.getAllFiles(rootPath, [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.json',
      '.yaml',
      '.yml',
    ]);

    for (const file of files) {
      const relativePath = relative(rootPath, file);

      // Skip safe files
      if (
        relativePath.includes('node_modules') ||
        relativePath.includes('.env.example') ||
        relativePath.includes('__tests__')
      ) {
        continue;
      }

      const content = await readFile(file, 'utf-8');

      // Check for secret patterns
      for (const [secretType, pattern] of Object.entries(SECRET_PATTERNS)) {
        const matches = content.matchAll(pattern);

        for (const match of matches) {
          issues.push({
            category: 'SECURITY',
            title: `Potential ${secretType} in source code`,
            description: `File contains what appears to be a ${secretType}: "${match[0]}"`,
            filePath: relativePath,
            impact: 'Critical security vulnerability, credentials exposure',
            priority: 'HIGH',
            suggestedFix:
              'Remove secret and use environment variables. Rotate compromised credentials immediately.',
            suggestedPR: `fix(security): remove hardcoded ${secretType} from ${relativePath.split('/').pop()}`,
          });
        }
      }
    }

    return issues;
  }

  private async checkEncryption(): Promise<string[]> {
    const missing: string[] = [];
    const rootPath = this.config.rootPath;

    // Check for encryption in database schemas
    const schemaFiles = await this.getAllFiles(join(rootPath, 'supabase/migrations'), ['.sql']);

    for (const file of schemaFiles) {
      const content = await readFile(file, 'utf-8');
      const relativePath = relative(rootPath, file);

      // Check for sensitive columns without encryption
      const sensitiveColumns = ['password', 'ssn', 'cnp', 'medical_history', 'diagnosis'];

      for (const column of sensitiveColumns) {
        if (content.includes(column) && !content.includes('encrypt')) {
          missing.push(`${relativePath}: Column '${column}' may need encryption`);
        }
      }
    }

    return missing;
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
