#!/usr/bin/env node

/**
 * Performance Budget Validation Script
 *
 * Validates build output against defined performance budgets.
 * Run after `next build` to check if bundles exceed size limits.
 *
 * Usage: node scripts/validate-budget.mjs [--strict]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

/**
 * Load performance budget configuration
 */
function loadBudget() {
  const budgetPath = path.join(rootDir, '.performance-budget.json');

  if (!fs.existsSync(budgetPath)) {
    console.error(
      `${colors.red}Error: Performance budget file not found at ${budgetPath}${colors.reset}`
    );
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(budgetPath, 'utf-8'));
}

/**
 * Get directory size in bytes
 */
function getDirectorySize(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  let totalSize = 0;

  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      totalSize += getDirectorySize(filePath);
    } else {
      totalSize += stat.size;
    }
  }

  return totalSize;
}

/**
 * Get files by extension with sizes
 */
function getFilesByExtension(dirPath, extension) {
  const files = [];

  if (!fs.existsSync(dirPath)) {
    return files;
  }

  function walkDir(currentPath) {
    const entries = fs.readdirSync(currentPath);

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry);
      const stat = fs.statSync(entryPath);

      if (stat.isDirectory()) {
        walkDir(entryPath);
      } else if (entry.endsWith(extension)) {
        files.push({
          path: entryPath,
          name: entry,
          size: stat.size,
        });
      }
    }
  }

  walkDir(dirPath);
  return files;
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * Check if size exceeds budget
 */
function checkBudget(actual, budget, unit = 'KB') {
  const multiplier = unit === 'MB' ? 1024 * 1024 : 1024;
  const budgetBytes = budget * multiplier;

  return {
    passed: actual <= budgetBytes,
    actual,
    budget: budgetBytes,
    percentage: ((actual / budgetBytes) * 100).toFixed(1),
  };
}

/**
 * Main validation function
 */
function validateBudgets() {
  console.log(`\n${colors.bold}${colors.cyan}Performance Budget Validation${colors.reset}\n`);
  console.log('='.repeat(50));

  const budget = loadBudget();
  const buildDir = path.join(rootDir, '.next');

  if (!fs.existsSync(buildDir)) {
    console.error(
      `${colors.red}Error: Build directory not found. Run 'pnpm build' first.${colors.reset}`
    );
    process.exit(1);
  }

  const results = {
    passed: [],
    warnings: [],
    failed: [],
  };

  const isStrict = process.argv.includes('--strict');

  // ==========================================================================
  // JavaScript Bundle Analysis
  // ==========================================================================
  console.log(`\n${colors.bold}JavaScript Bundles${colors.reset}`);
  console.log('-'.repeat(50));

  const staticDir = path.join(buildDir, 'static');
  const chunksDir = path.join(staticDir, 'chunks');

  const jsFiles = getFilesByExtension(chunksDir, '.js');
  const totalJsSize = jsFiles.reduce((sum, f) => sum + f.size, 0);
  const jsBudget = budget.budgets.bundleSize.javascript;

  // Total JS budget
  const totalJsCheck = checkBudget(totalJsSize, jsBudget.total.maxSize, jsBudget.total.unit);
  const totalJsStatus = totalJsCheck.passed ? colors.green + 'PASS' : colors.red + 'FAIL';

  console.log(
    `Total JS: ${formatBytes(totalJsSize)} / ${jsBudget.total.maxSize}${jsBudget.total.unit} (${totalJsCheck.percentage}%) [${totalJsStatus}${colors.reset}]`
  );

  if (!totalJsCheck.passed) {
    results.failed.push(
      `Total JavaScript (${formatBytes(totalJsSize)}) exceeds budget (${jsBudget.total.maxSize}${jsBudget.total.unit})`
    );
  } else {
    results.passed.push('Total JavaScript within budget');
  }

  // Per-chunk budget
  const largeChunks = jsFiles.filter((f) => f.size > jsBudget.perChunk.maxSize * 1024);

  if (largeChunks.length > 0) {
    console.log(
      `\n${colors.yellow}Large chunks (> ${jsBudget.perChunk.maxSize}KB):${colors.reset}`
    );
    largeChunks.forEach((chunk) => {
      console.log(`  - ${chunk.name}: ${formatBytes(chunk.size)}`);
    });
    results.warnings.push(`${largeChunks.length} chunks exceed per-chunk budget`);
  }

  // Top 5 largest chunks
  console.log(`\n${colors.blue}Top 5 largest chunks:${colors.reset}`);
  jsFiles
    .sort((a, b) => b.size - a.size)
    .slice(0, 5)
    .forEach((chunk, i) => {
      console.log(`  ${i + 1}. ${chunk.name}: ${formatBytes(chunk.size)}`);
    });

  // ==========================================================================
  // CSS Analysis
  // ==========================================================================
  console.log(`\n${colors.bold}CSS Bundles${colors.reset}`);
  console.log('-'.repeat(50));

  const cssDir = path.join(staticDir, 'css');
  const cssFiles = getFilesByExtension(cssDir, '.css');
  const totalCssSize = cssFiles.reduce((sum, f) => sum + f.size, 0);
  const cssBudget = budget.budgets.bundleSize.css;

  const totalCssCheck = checkBudget(totalCssSize, cssBudget.total.maxSize, cssBudget.total.unit);
  const totalCssStatus = totalCssCheck.passed ? colors.green + 'PASS' : colors.red + 'FAIL';

  console.log(
    `Total CSS: ${formatBytes(totalCssSize)} / ${cssBudget.total.maxSize}${cssBudget.total.unit} (${totalCssCheck.percentage}%) [${totalCssStatus}${colors.reset}]`
  );

  if (!totalCssCheck.passed) {
    results.failed.push(
      `Total CSS (${formatBytes(totalCssSize)}) exceeds budget (${cssBudget.total.maxSize}${cssBudget.total.unit})`
    );
  } else {
    results.passed.push('Total CSS within budget');
  }

  // ==========================================================================
  // Total Build Size
  // ==========================================================================
  console.log(`\n${colors.bold}Total Build${colors.reset}`);
  console.log('-'.repeat(50));

  const totalBuildSize = getDirectorySize(buildDir);
  console.log(`Total build size: ${formatBytes(totalBuildSize)}`);

  // ==========================================================================
  // Lighthouse Score Targets
  // ==========================================================================
  console.log(`\n${colors.bold}Lighthouse Score Targets${colors.reset}`);
  console.log('-'.repeat(50));

  const lhScores = budget.budgets.lighthouseScores;
  console.log(`Performance: ${lhScores.performance.min}+ (target: ${lhScores.performance.target})`);
  console.log(
    `Accessibility: ${lhScores.accessibility.min}+ (target: ${lhScores.accessibility.target})`
  );
  console.log(
    `Best Practices: ${lhScores.bestPractices.min}+ (target: ${lhScores.bestPractices.target})`
  );
  console.log(`SEO: ${lhScores.seo.min}+ (target: ${lhScores.seo.target})`);

  // ==========================================================================
  // Core Web Vitals Targets
  // ==========================================================================
  console.log(`\n${colors.bold}Core Web Vitals Targets${colors.reset}`);
  console.log('-'.repeat(50));

  const cwv = budget.budgets.coreWebVitals;
  console.log(`LCP (Largest Contentful Paint): < ${cwv.lcp.good}ms (good)`);
  console.log(`INP (Interaction to Next Paint): < ${cwv.inp.good}ms (good)`);
  console.log(`CLS (Cumulative Layout Shift): < ${cwv.cls.good} (good)`);

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${colors.bold}Summary${colors.reset}`);
  console.log('='.repeat(50));

  console.log(`${colors.green}Passed: ${results.passed.length}${colors.reset}`);
  results.passed.forEach((msg) => console.log(`  ✓ ${msg}`));

  if (results.warnings.length > 0) {
    console.log(`${colors.yellow}Warnings: ${results.warnings.length}${colors.reset}`);
    results.warnings.forEach((msg) => console.log(`  ⚠ ${msg}`));
  }

  if (results.failed.length > 0) {
    console.log(`${colors.red}Failed: ${results.failed.length}${colors.reset}`);
    results.failed.forEach((msg) => console.log(`  ✗ ${msg}`));
  }

  console.log();

  // Exit with error code if any failures (or warnings in strict mode)
  if (results.failed.length > 0) {
    console.log(`${colors.red}${colors.bold}Budget validation failed!${colors.reset}\n`);
    process.exit(1);
  }

  if (isStrict && results.warnings.length > 0) {
    console.log(
      `${colors.yellow}${colors.bold}Budget validation has warnings (strict mode)!${colors.reset}\n`
    );
    process.exit(1);
  }

  console.log(`${colors.green}${colors.bold}Budget validation passed!${colors.reset}\n`);
}

// Run validation
validateBudgets();
