#!/usr/bin/env tsx
/**
 * Layer Boundary Check Script
 *
 * Enforces hexagonal architecture layer boundaries:
 *   types → core → domain → application → infrastructure → integrations → apps
 *
 * Lower packages must never import from higher packages.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

// Layer order (lower index = lower layer)
const LAYER_ORDER = [
  '@medicalcor/types',
  '@medicalcor/core',
  '@medicalcor/domain',
  '@medicalcor/application',
  '@medicalcor/infrastructure',
  '@medicalcor/integrations',
] as const;

// Map package names to their directory
const PACKAGE_DIRS: Record<string, string> = {
  '@medicalcor/types': 'packages/types',
  '@medicalcor/core': 'packages/core',
  '@medicalcor/domain': 'packages/domain',
  '@medicalcor/application': 'packages/application',
  '@medicalcor/infrastructure': 'packages/infrastructure',
  '@medicalcor/integrations': 'packages/integrations',
};

// Forbidden imports for specific layers (in addition to layer order violations)
const FORBIDDEN_IMPORTS: Record<string, RegExp[]> = {
  '@medicalcor/domain': [
    // Domain must not import infrastructure concerns
    /from ['"]pg['"]/,
    /from ['"]@supabase\/supabase-js['"]/,
    /from ['"]openai['"]/,
    /from ['"]fastify['"]/,
    /from ['"]express['"]/,
    /from ['"]ioredis['"]/,
    /from ['"]@aws-sdk\//,
  ],
  '@medicalcor/types': [
    // Types should only depend on zod
    /from ['"]@medicalcor\//,
  ],
};

// Known violations that are slated for fixing (technical debt)
// Remove entries as violations are fixed
// Format: 'relative/path/to/file.ts:lineNumber'
const KNOWN_VIOLATIONS = new Set([
  // Domain layer pg imports - need to be refactored to use ports
  'packages/domain/src/agent-performance/agent-performance-repository.ts:10',
  'packages/domain/src/behavioral-insights/behavioral-insights-service.ts:11',
  'packages/domain/src/data-lineage/data-lineage-service.ts:10',
  'packages/domain/src/voice/supervisor-state-repository.ts:10',
  // Domain importing from integrations - needs architectural review
  'packages/domain/src/routing/flex-routing-adapter.ts:11',
]);

interface Violation {
  file: string;
  line: number;
  importStatement: string;
  reason: string;
}

function getLayerIndex(packageName: string): number {
  return LAYER_ORDER.indexOf(packageName as (typeof LAYER_ORDER)[number]);
}

async function* walkDir(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, dist, and test directories
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '__tests__' ||
        entry.name === '.turbo'
      ) {
        continue;
      }
      yield* walkDir(fullPath);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      yield fullPath;
    }
  }
}

function extractImports(content: string): Array<{ line: number; statement: string; from: string }> {
  const imports: Array<{ line: number; statement: string; from: string }> = [];
  const lines = content.split('\n');
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Track block comment state
    if (trimmedLine.startsWith('/*') || trimmedLine.startsWith('/**')) {
      inBlockComment = true;
    }
    if (trimmedLine.endsWith('*/') || trimmedLine.includes('*/')) {
      inBlockComment = false;
      continue; // Skip lines that end block comments
    }

    // Skip lines inside block comments or single-line comments
    if (inBlockComment || trimmedLine.startsWith('*') || trimmedLine.startsWith('//')) {
      continue;
    }

    // Match import statements
    const importMatch = line.match(
      /import\s+(?:type\s+)?(?:{[^}]*}|\*\s+as\s+\w+|\w+)?\s*(?:,\s*(?:{[^}]*}|\w+))?\s*from\s+['"]([^'"]+)['"]/
    );
    if (importMatch) {
      imports.push({
        line: i + 1,
        statement: line.trim(),
        from: importMatch[1],
      });
    }
    // Match dynamic imports
    const dynamicMatch = line.match(/import\(['"]([^'"]+)['"]\)/);
    if (dynamicMatch) {
      imports.push({
        line: i + 1,
        statement: line.trim(),
        from: dynamicMatch[1],
      });
    }
    // Match require statements
    const requireMatch = line.match(/require\(['"]([^'"]+)['"]\)/);
    if (requireMatch) {
      imports.push({
        line: i + 1,
        statement: line.trim(),
        from: requireMatch[1],
      });
    }
  }

  return imports;
}

async function checkPackage(packageName: string, rootDir: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  const packageDir = join(rootDir, PACKAGE_DIRS[packageName]);
  const srcDir = join(packageDir, 'src');

  const currentLayerIndex = getLayerIndex(packageName);

  try {
    for await (const filePath of walkDir(srcDir)) {
      const content = await readFile(filePath, 'utf-8');
      const imports = extractImports(content);
      const relPath = relative(rootDir, filePath);

      for (const imp of imports) {
        // Check for @medicalcor package imports
        const medicalcorMatch = imp.from.match(/^@medicalcor\/([^/]+)/);
        if (medicalcorMatch) {
          const importedPackage = `@medicalcor/${medicalcorMatch[1]}`;
          const importedLayerIndex = getLayerIndex(importedPackage);

          // Check if importing from a higher layer
          if (importedLayerIndex > currentLayerIndex) {
            violations.push({
              file: relPath,
              line: imp.line,
              importStatement: imp.statement,
              reason: `Layer violation: ${packageName} (layer ${currentLayerIndex}) cannot import from ${importedPackage} (layer ${importedLayerIndex})`,
            });
          }
        }

        // Check for forbidden imports for this package
        const forbiddenPatterns = FORBIDDEN_IMPORTS[packageName];
        if (forbiddenPatterns) {
          for (const pattern of forbiddenPatterns) {
            if (pattern.test(imp.statement)) {
              violations.push({
                file: relPath,
                line: imp.line,
                importStatement: imp.statement,
                reason: `Forbidden import in ${packageName}: infrastructure/external dependency not allowed`,
              });
            }
          }
        }
      }
    }
  } catch (error) {
    // Directory might not exist or have src folder
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  return violations;
}

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const allViolations: Violation[] = [];

  console.log('Checking layer boundaries...\n');
  console.log('Layer order (lower → higher):');
  LAYER_ORDER.forEach((pkg, i) => console.log(`  ${i}: ${pkg}`));
  console.log('\n');

  for (const packageName of Object.keys(PACKAGE_DIRS)) {
    const violations = await checkPackage(packageName, rootDir);
    allViolations.push(...violations);
  }

  // Separate known violations from new violations
  const knownViolations: Violation[] = [];
  const newViolations: Violation[] = [];

  for (const v of allViolations) {
    const key = `${v.file}:${v.line}`;
    if (KNOWN_VIOLATIONS.has(key)) {
      knownViolations.push(v);
    } else {
      newViolations.push(v);
    }
  }

  // Report known violations as warnings
  if (knownViolations.length > 0) {
    console.log('Known violations (technical debt - slated for fixing):');
    for (const v of knownViolations) {
      console.log(`  ${v.file}:${v.line}`);
    }
    console.log(`\n  Total known violations: ${knownViolations.length}`);
    console.log('  These are tracked and should be fixed in future refactoring.\n');
  }

  if (newViolations.length === 0) {
    console.log('No new layer boundary violations found.');
    process.exit(0);
  }

  console.error('NEW layer boundary violations found:\n');

  // Group by file
  const byFile = new Map<string, Violation[]>();
  for (const v of newViolations) {
    const existing = byFile.get(v.file) ?? [];
    existing.push(v);
    byFile.set(v.file, existing);
  }

  for (const [file, violations] of byFile) {
    console.error(`${file}:`);
    for (const v of violations) {
      console.error(`  Line ${v.line}: ${v.reason}`);
      console.error(`    ${v.importStatement}`);
    }
    console.error('');
  }

  console.error(`\nTotal NEW violations: ${newViolations.length}`);
  console.error('\nTo add a known violation to the allowlist (temporary), edit:');
  console.error('  scripts/check-layer-boundaries.ts → KNOWN_VIOLATIONS\n');
  process.exit(1);
}

main().catch((error: unknown) => {
  console.error('Error running layer boundary check:', error);
  process.exit(1);
});
