#!/bin/bash
#
# Check if MedicalCor git hooks are properly installed
# Run: pnpm hooks:check
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  MedicalCor Git Hooks Status${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
GIT_HOOKS_DIR="$PROJECT_ROOT/.git/hooks"
CUSTOM_HOOKS_DIR="$SCRIPT_DIR/git-hooks"

HOOKS_OK=true
HOOKS_INSTALLED=0
HOOKS_MISSING=0

check_hook() {
    local hook_name=$1
    local installed_hook="$GIT_HOOKS_DIR/$hook_name"
    local source_hook="$CUSTOM_HOOKS_DIR/$hook_name"

    if [ ! -f "$source_hook" ]; then
        return
    fi

    if [ -f "$installed_hook" ] && [ -x "$installed_hook" ]; then
        # Check if it's our hook (contains "MedicalCor" or "Triple-Guard")
        if grep -q "MedicalCor\|Triple-Guard" "$installed_hook" 2>/dev/null; then
            echo -e "  ${GREEN}✓${NC} $hook_name - installed"
            HOOKS_INSTALLED=$((HOOKS_INSTALLED + 1))
        else
            echo -e "  ${YELLOW}⚠${NC} $hook_name - exists but not MedicalCor hook"
            HOOKS_MISSING=$((HOOKS_MISSING + 1))
            HOOKS_OK=false
        fi
    else
        echo -e "  ${RED}✗${NC} $hook_name - NOT installed"
        HOOKS_MISSING=$((HOOKS_MISSING + 1))
        HOOKS_OK=false
    fi
}

echo -e "${YELLOW}Checking installed hooks:${NC}"
echo ""

# Check each hook
check_hook "pre-push"
check_hook "commit-msg"
check_hook "pre-commit"

echo ""
echo -e "${YELLOW}Summary:${NC}"
echo "  Installed: $HOOKS_INSTALLED"
echo "  Missing:   $HOOKS_MISSING"
echo ""

if [ "$HOOKS_OK" = true ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  All hooks are properly installed!${NC}"
    echo -e "${GREEN}========================================${NC}"
    exit 0
else
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}  Some hooks are missing!${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo "Run the following command to install hooks:"
    echo ""
    echo -e "  ${BLUE}pnpm setup:hooks${NC}"
    echo ""
    exit 1
fi
