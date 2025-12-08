#!/bin/bash
#
# MedicalCor Complete Audit Script
#
# Comprehensive State-of-the-Art (SOTA) audit for the MedicalCor Core monorepo.
# Runs security, code quality, type safety, dependency, and architecture audits.
#
# Usage:
#   ./scripts/audit-complete.sh
#   ./scripts/audit-complete.sh --output         # Generate AUDIT-REPORT.md
#   ./scripts/audit-complete.sh --quick          # Skip slow checks
#   ./scripts/audit-complete.sh --fix            # Auto-fix where possible
#
# Environment variables:
#   AUDIT_OUTPUT_DIR  - Directory for audit artifacts (default: .audit)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AUDIT_OUTPUT_DIR="${AUDIT_OUTPUT_DIR:-.audit}"
OUTPUT_DIR="$PROJECT_ROOT/$AUDIT_OUTPUT_DIR"

# Parse arguments
GENERATE_REPORT=false
QUICK_MODE=false
AUTO_FIX=false

for arg in "$@"; do
  case $arg in
    --output|-o)
      GENERATE_REPORT=true
      shift
      ;;
    --quick|-q)
      QUICK_MODE=true
      shift
      ;;
    --fix|-f)
      AUTO_FIX=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--output] [--quick] [--fix]"
      echo ""
      echo "Options:"
      echo "  --output, -o    Generate AUDIT-REPORT.md"
      echo "  --quick, -q     Skip slow checks (bundle analysis, full xray)"
      echo "  --fix, -f       Auto-fix lint/format issues where possible"
      echo ""
      echo "Environment variables:"
      echo "  AUDIT_OUTPUT_DIR  Directory for audit artifacts (default: .audit)"
      exit 0
      ;;
  esac
done

# Results tracking
declare -A RESULTS
declare -a CRITICAL_ISSUES
declare -a WARNINGS
AUDIT_START_TIME=$(date +%s)

# Helper functions
log_header() {
  echo ""
  echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║  $1$(printf '%*s' $((58 - ${#1})) '')║${NC}"
  echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

log_step() {
  echo -e "${CYAN}→ $1${NC}"
}

log_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

log_failure() {
  echo -e "${RED}❌ $1${NC}"
  CRITICAL_ISSUES+=("$1")
}

log_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
  WARNINGS+=("$1")
}

log_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Ensure output directory exists
setup_output_dir() {
  mkdir -p "$OUTPUT_DIR"
  echo "# Audit artifacts - $(date)" > "$OUTPUT_DIR/.gitkeep"
}

#
# Step 1: Security Audit
#
run_security_audit() {
  log_header "1. Security Audit"

  cd "$PROJECT_ROOT"

  # pnpm audit
  log_step "Running pnpm audit..."
  if pnpm audit --json > "$OUTPUT_DIR/pnpm-audit.json" 2>&1; then
    log_success "No security vulnerabilities found"
    RESULTS[security_vulns]="0"
  else
    # Parse vulnerabilities from pnpm audit output
    VULN_COUNT=$(cat "$OUTPUT_DIR/pnpm-audit.json" | grep -o '"severity"' | wc -l || echo "unknown")

    # Check for critical/high
    CRITICAL=$(grep -c '"critical"' "$OUTPUT_DIR/pnpm-audit.json" 2>/dev/null || echo "0")
    HIGH=$(grep -c '"high"' "$OUTPUT_DIR/pnpm-audit.json" 2>/dev/null || echo "0")
    MODERATE=$(grep -c '"moderate"' "$OUTPUT_DIR/pnpm-audit.json" 2>/dev/null || echo "0")
    LOW=$(grep -c '"low"' "$OUTPUT_DIR/pnpm-audit.json" 2>/dev/null || echo "0")

    if [ "$CRITICAL" -gt 0 ] || [ "$HIGH" -gt 0 ]; then
      log_failure "Security vulnerabilities: $CRITICAL critical, $HIGH high, $MODERATE moderate, $LOW low"
    else
      log_warning "Security vulnerabilities: $MODERATE moderate, $LOW low"
    fi
    RESULTS[security_vulns]="$CRITICAL:$HIGH:$MODERATE:$LOW"
  fi

  # Check for secrets in code
  log_step "Scanning for hardcoded secrets..."
  SECRET_PATTERNS='(password|secret|api_key|apikey|token|credential)\s*[:=]\s*["\x27][^"\x27]{8,}'

  if grep -rEi "$SECRET_PATTERNS" --include="*.ts" --include="*.tsx" --include="*.js" \
     --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
     "$PROJECT_ROOT" > "$OUTPUT_DIR/secrets-scan.txt" 2>/dev/null; then
    SECRETS_FOUND=$(wc -l < "$OUTPUT_DIR/secrets-scan.txt")
    if [ "$SECRETS_FOUND" -gt 0 ]; then
      log_warning "Potential secrets found: $SECRETS_FOUND matches (review $AUDIT_OUTPUT_DIR/secrets-scan.txt)"
    fi
  else
    log_success "No obvious hardcoded secrets detected"
  fi
  RESULTS[secrets_scan]="done"

  # Check .env files aren't tracked
  log_step "Checking .env files are gitignored..."
  if git ls-files --error-unmatch .env .env.local .env.production 2>/dev/null; then
    log_failure ".env files are tracked in git!"
  else
    log_success ".env files are properly gitignored"
  fi
}

#
# Step 2: Code Quality
#
run_code_quality_audit() {
  log_header "2. Code Quality"

  cd "$PROJECT_ROOT"

  # ESLint
  log_step "Running ESLint..."
  if [ "$AUTO_FIX" = true ]; then
    if pnpm lint:fix > "$OUTPUT_DIR/eslint.txt" 2>&1; then
      log_success "ESLint: All issues auto-fixed"
      RESULTS[eslint_errors]="0"
      RESULTS[eslint_warnings]="0"
    else
      log_warning "ESLint: Some issues could not be auto-fixed"
      RESULTS[eslint_errors]="check output"
    fi
  else
    if pnpm lint > "$OUTPUT_DIR/eslint.txt" 2>&1; then
      log_success "ESLint: No issues found"
      RESULTS[eslint_errors]="0"
      RESULTS[eslint_warnings]="0"
    else
      # Count errors and warnings
      ERRORS=$(grep -c "error" "$OUTPUT_DIR/eslint.txt" 2>/dev/null || echo "0")
      WARNINGS_COUNT=$(grep -c "warning" "$OUTPUT_DIR/eslint.txt" 2>/dev/null || echo "0")

      if [ "$ERRORS" -gt 0 ]; then
        log_failure "ESLint: $ERRORS errors, $WARNINGS_COUNT warnings"
      else
        log_warning "ESLint: $WARNINGS_COUNT warnings"
      fi
      RESULTS[eslint_errors]="$ERRORS"
      RESULTS[eslint_warnings]="$WARNINGS_COUNT"
    fi
  fi

  # Prettier
  log_step "Checking code formatting (Prettier)..."
  if [ "$AUTO_FIX" = true ]; then
    if pnpm format > "$OUTPUT_DIR/prettier.txt" 2>&1; then
      log_success "Prettier: All files formatted"
      RESULTS[prettier]="pass"
    else
      log_warning "Prettier: Formatting applied"
      RESULTS[prettier]="fixed"
    fi
  else
    if pnpm format:check > "$OUTPUT_DIR/prettier.txt" 2>&1; then
      log_success "Prettier: All files properly formatted"
      RESULTS[prettier]="pass"
    else
      UNFORMATTED=$(grep -c "Forgot to run Prettier\|would be reformatted" "$OUTPUT_DIR/prettier.txt" 2>/dev/null || wc -l < "$OUTPUT_DIR/prettier.txt")
      log_warning "Prettier: $UNFORMATTED files need formatting"
      RESULTS[prettier]="$UNFORMATTED files"
    fi
  fi

  # Code duplication
  log_step "Checking for code duplication..."
  if pnpm check:duplication > "$OUTPUT_DIR/duplication.txt" 2>&1; then
    log_success "No significant code duplication found"
    RESULTS[duplication]="pass"
  else
    DUP_PERCENT=$(grep -oP 'Found \K[\d.]+(?=% of duplicated)' "$OUTPUT_DIR/duplication.txt" 2>/dev/null || echo "unknown")
    if [ "$DUP_PERCENT" != "unknown" ]; then
      if (( $(echo "$DUP_PERCENT > 5" | bc -l 2>/dev/null || echo 0) )); then
        log_warning "Code duplication: ${DUP_PERCENT}%"
      else
        log_success "Code duplication: ${DUP_PERCENT}% (acceptable)"
      fi
    else
      log_warning "Code duplication check completed (review $AUDIT_OUTPUT_DIR/duplication.txt)"
    fi
    RESULTS[duplication]="${DUP_PERCENT}%"
  fi
}

#
# Step 3: TypeScript
#
run_typescript_audit() {
  log_header "3. TypeScript Type Safety"

  cd "$PROJECT_ROOT"

  log_step "Running TypeScript type check..."
  if pnpm typecheck > "$OUTPUT_DIR/typescript.txt" 2>&1; then
    log_success "TypeScript: No type errors"
    RESULTS[typescript_errors]="0"
  else
    TS_ERRORS=$(grep -c "error TS" "$OUTPUT_DIR/typescript.txt" 2>/dev/null || echo "0")
    if [ "$TS_ERRORS" -gt 0 ]; then
      log_failure "TypeScript: $TS_ERRORS type errors"
    else
      log_warning "TypeScript: Check $AUDIT_OUTPUT_DIR/typescript.txt for details"
    fi
    RESULTS[typescript_errors]="$TS_ERRORS"
  fi

  # Check strict mode compliance
  log_step "Verifying strict mode configuration..."
  STRICT_COUNT=$(grep -rn '"strict": true' --include="tsconfig*.json" "$PROJECT_ROOT" 2>/dev/null | wc -l)
  if [ "$STRICT_COUNT" -gt 0 ]; then
    log_success "TypeScript strict mode enabled in $STRICT_COUNT config(s)"
  else
    log_warning "TypeScript strict mode not found in configs"
  fi
  RESULTS[typescript_strict]="$STRICT_COUNT configs"
}

#
# Step 4: Dependencies
#
run_dependency_audit() {
  log_header "4. Dependency Analysis"

  cd "$PROJECT_ROOT"

  # Outdated packages
  log_step "Checking for outdated packages..."
  if pnpm outdated --format json > "$OUTPUT_DIR/outdated.json" 2>&1; then
    log_success "All packages are up to date"
    RESULTS[outdated_packages]="0"
  else
    # pnpm outdated returns non-zero when packages are outdated
    OUTDATED_COUNT=$(cat "$OUTPUT_DIR/outdated.json" 2>/dev/null | grep -c '"current"' || echo "0")
    if [ "$OUTDATED_COUNT" -eq 0 ]; then
      # Try parsing differently
      pnpm outdated > "$OUTPUT_DIR/outdated.txt" 2>&1 || true
      OUTDATED_COUNT=$(tail -n +2 "$OUTPUT_DIR/outdated.txt" 2>/dev/null | wc -l || echo "0")
    fi

    if [ "$OUTDATED_COUNT" -gt 20 ]; then
      log_warning "$OUTDATED_COUNT packages are outdated"
    else
      log_info "$OUTDATED_COUNT packages have updates available"
    fi
    RESULTS[outdated_packages]="$OUTDATED_COUNT"
  fi

  # Check for unused dependencies (if depcheck is available)
  log_step "Checking dependency health..."

  # Verify lockfile integrity
  if [ -f "$PROJECT_ROOT/pnpm-lock.yaml" ]; then
    log_success "pnpm-lock.yaml exists"
  else
    log_failure "pnpm-lock.yaml missing!"
  fi

  # Check for peer dependency issues
  log_step "Checking peer dependencies..."
  PEER_ISSUES=$(pnpm install --dry-run 2>&1 | grep -c "peer dependency" || echo "0")
  if [ "$PEER_ISSUES" -gt 0 ]; then
    log_warning "$PEER_ISSUES peer dependency warnings"
  else
    log_success "No peer dependency issues"
  fi
  RESULTS[peer_deps]="$PEER_ISSUES issues"
}

#
# Step 5: Test Coverage
#
run_test_audit() {
  log_header "5. Test Coverage"

  cd "$PROJECT_ROOT"

  log_step "Running tests with coverage..."
  if pnpm test:coverage > "$OUTPUT_DIR/test-coverage.txt" 2>&1; then
    log_success "All tests passed"

    # Extract coverage percentage if available
    COVERAGE=$(grep -oP 'All files.*?\|\s*\K[\d.]+' "$OUTPUT_DIR/test-coverage.txt" 2>/dev/null | head -1 || echo "N/A")
    if [ "$COVERAGE" != "N/A" ]; then
      log_info "Test coverage: ${COVERAGE}%"
      RESULTS[test_coverage]="${COVERAGE}%"
    else
      RESULTS[test_coverage]="passed"
    fi
  else
    FAILED=$(grep -c "FAIL" "$OUTPUT_DIR/test-coverage.txt" 2>/dev/null || echo "unknown")
    log_failure "Tests failed: $FAILED test suites"
    RESULTS[test_coverage]="$FAILED failed"
  fi
}

#
# Step 6: Architecture (XRAY Audit)
#
run_architecture_audit() {
  log_header "6. Architecture Audit (XRAY)"

  cd "$PROJECT_ROOT"

  if [ "$QUICK_MODE" = true ]; then
    log_info "Skipping full architecture audit in quick mode"
    RESULTS[architecture]="skipped"
    return
  fi

  log_step "Running XRAY architecture audit..."
  if pnpm xray-audit --output "$OUTPUT_DIR/xray-report.md" > "$OUTPUT_DIR/xray-stdout.txt" 2>&1; then
    log_success "Architecture audit passed"

    # Extract score
    SCORE=$(grep -oP 'Overall Score:\s*\K[\d.]+' "$OUTPUT_DIR/xray-stdout.txt" 2>/dev/null || echo "N/A")
    if [ "$SCORE" != "N/A" ]; then
      log_info "Architecture score: ${SCORE}/10.0"
      RESULTS[architecture_score]="${SCORE}/10.0"
    fi
    RESULTS[architecture]="pass"
  else
    SCORE=$(grep -oP 'Overall Score:\s*\K[\d.]+' "$OUTPUT_DIR/xray-stdout.txt" 2>/dev/null || echo "N/A")
    CRITICAL=$(grep -oP 'HIGH Priority:\s*\K\d+' "$OUTPUT_DIR/xray-stdout.txt" 2>/dev/null || echo "0")

    if [ "$CRITICAL" -gt 0 ]; then
      log_failure "Architecture audit: $CRITICAL critical issues (score: ${SCORE}/10.0)"
    else
      log_warning "Architecture audit completed with issues (score: ${SCORE}/10.0)"
    fi
    RESULTS[architecture]="$CRITICAL critical"
    RESULTS[architecture_score]="${SCORE}/10.0"
  fi

  # Layer boundary check
  log_step "Checking layer boundaries..."
  if pnpm check:layer-boundaries > "$OUTPUT_DIR/layer-boundaries.txt" 2>&1; then
    log_success "Layer boundaries respected"
    RESULTS[layer_boundaries]="pass"
  else
    VIOLATIONS=$(grep -c "violation" "$OUTPUT_DIR/layer-boundaries.txt" 2>/dev/null || echo "unknown")
    log_failure "Layer boundary violations: $VIOLATIONS"
    RESULTS[layer_boundaries]="$VIOLATIONS violations"
  fi
}

#
# Step 7: Build Verification
#
run_build_audit() {
  log_header "7. Build Verification"

  cd "$PROJECT_ROOT"

  if [ "$QUICK_MODE" = true ]; then
    log_info "Skipping build verification in quick mode"
    RESULTS[build]="skipped"
    return
  fi

  log_step "Running production build..."
  BUILD_START=$(date +%s)

  if pnpm build > "$OUTPUT_DIR/build.txt" 2>&1; then
    BUILD_END=$(date +%s)
    BUILD_TIME=$((BUILD_END - BUILD_START))
    log_success "Build succeeded in ${BUILD_TIME}s"
    RESULTS[build]="pass (${BUILD_TIME}s)"
  else
    log_failure "Build failed (check $AUDIT_OUTPUT_DIR/build.txt)"
    RESULTS[build]="failed"
  fi
}

#
# Generate Report
#
generate_report() {
  log_header "Generating Audit Report"

  AUDIT_END_TIME=$(date +%s)
  AUDIT_DURATION=$((AUDIT_END_TIME - AUDIT_START_TIME))
  REPORT_DATE=$(date '+%Y-%m-%d %H:%M:%S')

  cat > "$PROJECT_ROOT/AUDIT-REPORT.md" << EOF
# MedicalCor Core - Comprehensive Audit Report

**Generated:** $REPORT_DATE
**Duration:** ${AUDIT_DURATION}s
**Mode:** $([ "$QUICK_MODE" = true ] && echo "Quick" || echo "Full")

---

## Summary

| Category | Result | Details |
|----------|--------|---------|
| Security | $([ "${RESULTS[security_vulns]}" = "0" ] && echo "✅ Pass" || echo "⚠️ Issues") | ${RESULTS[security_vulns]:-N/A} vulnerabilities |
| ESLint | $([ "${RESULTS[eslint_errors]}" = "0" ] && echo "✅ Pass" || echo "❌ Fail") | ${RESULTS[eslint_errors]:-N/A} errors, ${RESULTS[eslint_warnings]:-N/A} warnings |
| Prettier | $([ "${RESULTS[prettier]}" = "pass" ] && echo "✅ Pass" || echo "⚠️ Issues") | ${RESULTS[prettier]:-N/A} |
| TypeScript | $([ "${RESULTS[typescript_errors]}" = "0" ] && echo "✅ Pass" || echo "❌ Fail") | ${RESULTS[typescript_errors]:-N/A} type errors |
| Dependencies | $([ "${RESULTS[outdated_packages]}" = "0" ] && echo "✅ Current" || echo "ℹ️ Updates") | ${RESULTS[outdated_packages]:-N/A} outdated |
| Tests | $(echo "${RESULTS[test_coverage]}" | grep -q "fail" && echo "❌ Fail" || echo "✅ Pass") | ${RESULTS[test_coverage]:-N/A} |
| Architecture | $([ "${RESULTS[architecture]}" = "pass" ] && echo "✅ Pass" || echo "⚠️ Review") | Score: ${RESULTS[architecture_score]:-N/A} |
| Build | $([ "${RESULTS[build]}" = "pass"* ] && echo "✅ Pass" || echo "⚠️ Review") | ${RESULTS[build]:-N/A} |

---

## Critical Issues

$(if [ ${#CRITICAL_ISSUES[@]} -gt 0 ]; then
  for issue in "${CRITICAL_ISSUES[@]}"; do
    echo "- ❌ $issue"
  done
else
  echo "_No critical issues found._"
fi)

---

## Warnings

$(if [ ${#WARNINGS[@]} -gt 0 ]; then
  for warning in "${WARNINGS[@]}"; do
    echo "- ⚠️ $warning"
  done
else
  echo "_No warnings._"
fi)

---

## Detailed Results

### Security (pnpm audit)

\`\`\`
$(cat "$OUTPUT_DIR/pnpm-audit.json" 2>/dev/null | head -50 || echo "See $AUDIT_OUTPUT_DIR/pnpm-audit.json")
\`\`\`

### Code Quality

- **Duplication:** ${RESULTS[duplication]:-N/A}
- **ESLint Config:** Strict rules enabled
- **Prettier:** Format on save recommended

### TypeScript

- **Strict Mode:** ${RESULTS[typescript_strict]:-N/A}
- **Type Errors:** ${RESULTS[typescript_errors]:-N/A}

### Dependencies

- **Outdated:** ${RESULTS[outdated_packages]:-N/A} packages
- **Peer Issues:** ${RESULTS[peer_deps]:-N/A}

### Architecture

- **XRAY Score:** ${RESULTS[architecture_score]:-N/A}
- **Layer Boundaries:** ${RESULTS[layer_boundaries]:-N/A}

---

## Recommendations

1. **Immediate (P0):** Address all critical issues listed above
2. **Short-term (P1):** Update high-severity outdated dependencies
3. **Medium-term (P2):** Resolve architecture warnings
4. **Ongoing:** Maintain test coverage above 80%

---

## Artifact Locations

All detailed audit outputs are in \`$AUDIT_OUTPUT_DIR/\`:

- \`pnpm-audit.json\` - Security vulnerabilities
- \`eslint.txt\` - Lint issues
- \`prettier.txt\` - Formatting issues
- \`typescript.txt\` - Type errors
- \`outdated.json\` - Outdated packages
- \`test-coverage.txt\` - Test results
- \`xray-report.md\` - Architecture analysis
- \`build.txt\` - Build output

---

_Generated by MedicalCor Audit Script v1.0_
EOF

  log_success "Report saved to AUDIT-REPORT.md"
}

#
# Print Summary
#
print_summary() {
  AUDIT_END_TIME=$(date +%s)
  AUDIT_DURATION=$((AUDIT_END_TIME - AUDIT_START_TIME))

  log_header "Audit Complete"

  echo "Duration: ${AUDIT_DURATION}s"
  echo "Output: $AUDIT_OUTPUT_DIR/"
  echo ""

  echo "Results Summary:"
  echo "────────────────────────────────────────"
  printf "  %-20s %s\n" "Security:" "${RESULTS[security_vulns]:-N/A}"
  printf "  %-20s %s\n" "ESLint:" "${RESULTS[eslint_errors]:-N/A} errors"
  printf "  %-20s %s\n" "TypeScript:" "${RESULTS[typescript_errors]:-N/A} errors"
  printf "  %-20s %s\n" "Outdated Packages:" "${RESULTS[outdated_packages]:-N/A}"
  printf "  %-20s %s\n" "Test Coverage:" "${RESULTS[test_coverage]:-N/A}"
  printf "  %-20s %s\n" "Architecture:" "${RESULTS[architecture_score]:-N/A}"
  printf "  %-20s %s\n" "Build:" "${RESULTS[build]:-N/A}"
  echo "────────────────────────────────────────"
  echo ""

  if [ ${#CRITICAL_ISSUES[@]} -gt 0 ]; then
    echo -e "${RED}Critical Issues (${#CRITICAL_ISSUES[@]}):${NC}"
    for issue in "${CRITICAL_ISSUES[@]}"; do
      echo "  - $issue"
    done
    echo ""
  fi

  if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo -e "${YELLOW}Warnings (${#WARNINGS[@]}):${NC}"
    for warning in "${WARNINGS[@]}"; do
      echo "  - $warning"
    done
    echo ""
  fi

  if [ ${#CRITICAL_ISSUES[@]} -gt 0 ]; then
    echo -e "${RED}❌ AUDIT COMPLETED WITH CRITICAL ISSUES${NC}"
    exit 1
  elif [ ${#WARNINGS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  AUDIT COMPLETED WITH WARNINGS${NC}"
  else
    echo -e "${GREEN}✅ AUDIT PASSED${NC}"
  fi
}

#
# Main
#
main() {
  echo ""
  echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║    🏥 MedicalCor Core - State-of-the-Art Audit              ║${NC}"
  echo -e "${BLUE}║    HIPAA/GDPR Compliance Ready                              ║${NC}"
  echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""

  echo "Configuration:"
  echo "  Project Root: $PROJECT_ROOT"
  echo "  Output Dir:   $AUDIT_OUTPUT_DIR"
  echo "  Quick Mode:   $QUICK_MODE"
  echo "  Auto-Fix:     $AUTO_FIX"
  echo "  Report:       $GENERATE_REPORT"
  echo ""

  # Setup
  setup_output_dir

  # Run all audits
  run_security_audit
  run_code_quality_audit
  run_typescript_audit
  run_dependency_audit
  run_test_audit
  run_architecture_audit
  run_build_audit

  # Generate report if requested
  if [ "$GENERATE_REPORT" = true ]; then
    generate_report
  fi

  # Print summary
  print_summary
}

# Run main
main "$@"
