#!/usr/bin/env bash

# Claude Code Configuration Validator
# Validates that the .claude directory is properly configured

set -uo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
ERRORS=0
WARNINGS=0
CHECKS=0

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
    ((CHECKS++))
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

log_error() {
    echo -e "${RED}✗${NC} $1"
    ((ERRORS++))
}

check_file() {
    local file=$1
    local name=$2
    
    if [[ -f "$file" ]]; then
        log_success "$name exists"
    else
        log_error "$name not found: $file"
    fi
}

check_directory() {
    local dir=$1
    local name=$2
    
    if [[ -d "$dir" ]]; then
        log_success "$name exists"
    else
        log_error "$name not found: $dir"
    fi
}

check_executable() {
    local file=$1
    local name=$2
    
    if [[ -x "$file" ]]; then
        log_success "$name is executable"
    else
        log_warning "$name is not executable: $file"
    fi
}

count_files() {
    local dir=$1
    local pattern=$2
    find "$dir" -name "$pattern" 2>/dev/null | wc -l
}

# Main validation
main() {
    echo "======================================"
    echo "Claude Code Configuration Validator"
    echo "======================================"
    echo ""

    # Change to repository root
    REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
    cd "$REPO_ROOT"

    log_info "Validating Claude Code configuration..."
    echo ""

    # 1. Check .claude directory structure
    echo "📁 Directory Structure"
    echo "---"
    check_directory ".claude" ".claude directory"
    check_directory ".claude/commands" "Commands directory"
    check_directory ".claude/hooks" "Hooks directory"
    check_directory ".claude/skills" "Skills directory"
    check_directory ".claude/utils" "Utils directory"
    check_directory ".claude/scripts" "Scripts directory"
    echo ""

    # 2. Check configuration files
    echo "⚙️  Configuration Files"
    echo "---"
    check_file ".claude/settings.json" "settings.json"
    check_file ".claude/settings.json.example" "settings.json.example"
    check_file ".claude/README.md" "README.md"
    check_file ".claude/DIRECTORY.md" "DIRECTORY.md"
    echo ""

    # 3. Check skills
    echo "🎓 Skills"
    echo "---"
    check_directory ".claude/skills/medicalcor" "MedicalCor skills"
    
    SKILL_COUNT=$(count_files ".claude/skills" "skill.md")
    if [[ $SKILL_COUNT -ge 6 ]]; then
        log_success "Found $SKILL_COUNT skills"
    else
        log_warning "Expected 6+ skills, found $SKILL_COUNT"
    fi
    
    # Check MedicalCor-specific skills
    check_file ".claude/skills/medicalcor/skill.md" "MedicalCor Expert skill"
    check_file ".claude/skills/medicalcor/hipaa-compliance/skill.md" "HIPAA Compliance skill"
    check_file ".claude/skills/medicalcor/gdpr-compliance/skill.md" "GDPR Compliance skill"
    check_file ".claude/skills/medicalcor/fastify-nextjs/skill.md" "Fastify & Next.js skill"
    check_file ".claude/skills/medicalcor/gpt4o-integration/skill.md" "GPT-4o Integration skill"
    check_file ".claude/skills/medicalcor/omnichannel/skill.md" "Omnichannel skill"
    echo ""

    # 4. Check commands
    echo "⚡ Commands"
    echo "---"
    COMMAND_COUNT=$(count_files ".claude/commands" "*.md")
    if [[ $COMMAND_COUNT -ge 7 ]]; then
        log_success "Found $COMMAND_COUNT commands"
    else
        log_warning "Expected 7+ commands, found $COMMAND_COUNT"
    fi
    
    check_file ".claude/commands/convert-to-toon.md" "convert-to-toon command"
    check_file ".claude/commands/toon-encode.md" "toon-encode command"
    check_file ".claude/commands/toon-decode.md" "toon-decode command"
    check_file ".claude/commands/toon-validate.md" "toon-validate command"
    check_file ".claude/commands/analyze-tokens.md" "analyze-tokens command"
    check_file ".claude/commands/discover-skills.md" "discover-skills command"
    check_file ".claude/commands/install-skill.md" "install-skill command"
    echo ""

    # 5. Check hooks
    echo "🪝 Hooks"
    echo "---"
    HOOK_COUNT=$(count_files ".claude/hooks" "*.sh")
    if [[ $HOOK_COUNT -ge 5 ]]; then
        log_success "Found $HOOK_COUNT hooks"
    else
        log_warning "Expected 5+ hooks, found $HOOK_COUNT"
    fi
    
    check_file ".claude/hooks/settings-backup.sh" "settings-backup hook"
    check_executable ".claude/hooks/settings-backup.sh" "settings-backup hook"
    
    check_file ".claude/hooks/secret-scanner.sh" "secret-scanner hook"
    check_executable ".claude/hooks/secret-scanner.sh" "secret-scanner hook"
    
    check_file ".claude/hooks/toon-validator.sh" "toon-validator hook"
    check_executable ".claude/hooks/toon-validator.sh" "toon-validator hook"
    
    check_file ".claude/hooks/markdown-formatter.sh" "markdown-formatter hook"
    check_executable ".claude/hooks/markdown-formatter.sh" "markdown-formatter hook"
    
    check_file ".claude/hooks/file-size-monitor.sh" "file-size-monitor hook"
    check_executable ".claude/hooks/file-size-monitor.sh" "file-size-monitor hook"
    echo ""

    # 6. Check TOON utilities
    echo "🔧 TOON Utilities"
    echo "---"
    check_directory ".claude/utils/toon" "TOON utils directory"
    check_file ".claude/utils/toon/toon-guide.md" "TOON guide"
    check_file ".claude/utils/toon/README.md" "TOON README"
    echo ""

    # 7. Check settings.json validity
    echo "🔍 Settings Validation"
    echo "---"
    if [[ -f ".claude/settings.json" ]]; then
        if command -v jq &> /dev/null; then
            if jq empty ".claude/settings.json" 2>/dev/null; then
                log_success "settings.json is valid JSON"
            else
                log_error "settings.json has invalid JSON syntax"
            fi
        else
            log_warning "jq not installed, skipping JSON validation"
        fi
    fi
    echo ""

    # 8. Check integration with project
    echo "🔗 Project Integration"
    echo "---"
    if grep -q "\.claude" README.md 2>/dev/null; then
        log_success "README.md references .claude directory"
    else
        log_warning "README.md does not reference .claude directory"
    fi
    
    if grep -q "Claude Code" CLAUDE.md 2>/dev/null; then
        log_success "CLAUDE.md references Claude Code"
    else
        log_warning "CLAUDE.md does not reference Claude Code"
    fi
    
    if [[ -f "docs/README/CLAUDE_CODE_SETUP.md" ]]; then
        log_success "Claude Code setup guide exists"
    else
        log_warning "docs/README/CLAUDE_CODE_SETUP.md not found"
    fi
    echo ""

    # Summary
    echo "======================================"
    echo "Validation Summary"
    echo "======================================"
    echo -e "${GREEN}Passed checks: $CHECKS${NC}"
    echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
    echo -e "${RED}Errors: $ERRORS${NC}"
    echo ""

    if [[ $ERRORS -eq 0 && $WARNINGS -eq 0 ]]; then
        echo -e "${GREEN}✓ Configuration is valid!${NC}"
        exit 0
    elif [[ $ERRORS -eq 0 ]]; then
        echo -e "${YELLOW}⚠ Configuration is valid with warnings${NC}"
        exit 0
    else
        echo -e "${RED}✗ Configuration has errors${NC}"
        exit 1
    fi
}

# Run validation
main "$@"
