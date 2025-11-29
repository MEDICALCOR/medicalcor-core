#!/bin/bash
# =============================================================================
# MedicalCor Core - Git Hooks Setup Script
# =============================================================================
# Purpose: Install git hooks for repository protection
#
# This script sets up the following protections:
#   1. pre-push  - Blocks direct pushes to main/staging/production
#   2. commit-msg - Validates Conventional Commits format
#
# Usage:
#   ./scripts/setup-git-hooks.sh          # Install hooks
#   ./scripts/setup-git-hooks.sh --check  # Check if hooks are installed
#   ./scripts/setup-git-hooks.sh --remove # Remove installed hooks
#
# Note: If you're using pnpm, hooks should be installed automatically
# via Husky when running 'pnpm install'. This script is a fallback
# for manual installation or verification.
# =============================================================================

set -e

# Colors for terminal output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Get the repository root
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)

if [ -z "$REPO_ROOT" ]; then
    echo -e "${RED}Error: Not in a git repository${NC}"
    exit 1
fi

# Paths
GIT_HOOKS_DIR="$REPO_ROOT/.git/hooks"
HUSKY_DIR="$REPO_ROOT/.husky"
SCRIPTS_HOOKS_DIR="$REPO_ROOT/scripts/git-hooks"

# Function to print header
print_header() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  ${BOLD}MedicalCor Core - Git Hooks Setup${NC}${CYAN}                             ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Function to check if hooks are installed
check_hooks() {
    local all_installed=true

    echo -e "${CYAN}Checking git hooks installation...${NC}"
    echo ""

    # Check Husky hooks
    echo -e "${YELLOW}Husky hooks (.husky/):${NC}"

    if [ -f "$HUSKY_DIR/pre-push" ] && [ -x "$HUSKY_DIR/pre-push" ]; then
        echo -e "  ${GREEN}[installed]${NC} pre-push"
    else
        echo -e "  ${RED}[missing]${NC} pre-push"
        all_installed=false
    fi

    if [ -f "$HUSKY_DIR/commit-msg" ] && [ -x "$HUSKY_DIR/commit-msg" ]; then
        echo -e "  ${GREEN}[installed]${NC} commit-msg"
    else
        echo -e "  ${RED}[missing]${NC} commit-msg"
        all_installed=false
    fi

    if [ -f "$HUSKY_DIR/pre-commit" ] && [ -x "$HUSKY_DIR/pre-commit" ]; then
        echo -e "  ${GREEN}[installed]${NC} pre-commit"
    else
        echo -e "  ${YELLOW}[optional]${NC} pre-commit (lint-staged)"
    fi

    echo ""

    # Check if Husky is properly configured
    echo -e "${YELLOW}Husky configuration:${NC}"

    if [ -d "$HUSKY_DIR" ]; then
        echo -e "  ${GREEN}[found]${NC} .husky/ directory"
    else
        echo -e "  ${RED}[missing]${NC} .husky/ directory"
        all_installed=false
    fi

    # Check if git hooks are pointing to husky
    if [ -f "$GIT_HOOKS_DIR/husky.sh" ] || [ -d "$HUSKY_DIR/_" ]; then
        echo -e "  ${GREEN}[configured]${NC} Git hooks integrated with Husky"
    else
        # Check for standalone hooks
        if [ -f "$GIT_HOOKS_DIR/pre-push" ] && [ -x "$GIT_HOOKS_DIR/pre-push" ]; then
            echo -e "  ${YELLOW}[standalone]${NC} Using standalone hooks in .git/hooks/"
        else
            echo -e "  ${YELLOW}[note]${NC} Husky integration pending 'pnpm install'"
        fi
    fi

    echo ""

    # Summary
    if $all_installed; then
        echo -e "${GREEN}All required hooks are installed${NC}"
        return 0
    else
        echo -e "${RED}Some hooks are missing. Run 'pnpm install' or this script without --check${NC}"
        return 1
    fi
}

# Function to install hooks
install_hooks() {
    echo -e "${CYAN}Installing git hooks...${NC}"
    echo ""

    # Method 1: Husky (preferred)
    if [ -d "$HUSKY_DIR" ]; then
        echo -e "${YELLOW}Husky directory found. Ensuring hooks are in place...${NC}"

        # Check if pre-push exists in husky
        if [ ! -f "$HUSKY_DIR/pre-push" ]; then
            if [ -f "$SCRIPTS_HOOKS_DIR/pre-push" ]; then
                cp "$SCRIPTS_HOOKS_DIR/pre-push" "$HUSKY_DIR/pre-push"
                chmod +x "$HUSKY_DIR/pre-push"
                echo -e "  ${GREEN}[installed]${NC} pre-push hook"
            else
                echo -e "  ${RED}[error]${NC} Source pre-push hook not found at $SCRIPTS_HOOKS_DIR/pre-push"
            fi
        else
            echo -e "  ${GREEN}[exists]${NC} pre-push hook"
        fi

        # commit-msg should already exist via commitlint
        if [ ! -f "$HUSKY_DIR/commit-msg" ]; then
            echo -e "  ${YELLOW}[warning]${NC} commit-msg hook missing - run 'pnpm install' to set up commitlint"
        else
            echo -e "  ${GREEN}[exists]${NC} commit-msg hook"
        fi

    else
        echo -e "${YELLOW}Husky not found. Installing standalone hooks...${NC}"

        # Create .git/hooks if it doesn't exist
        mkdir -p "$GIT_HOOKS_DIR"

        # Copy pre-push
        if [ -f "$SCRIPTS_HOOKS_DIR/pre-push" ]; then
            cp "$SCRIPTS_HOOKS_DIR/pre-push" "$GIT_HOOKS_DIR/pre-push"
            chmod +x "$GIT_HOOKS_DIR/pre-push"
            echo -e "  ${GREEN}[installed]${NC} pre-push hook -> .git/hooks/pre-push"
        else
            echo -e "  ${RED}[error]${NC} Source pre-push hook not found"
        fi

        # Copy commit-msg
        if [ -f "$SCRIPTS_HOOKS_DIR/commit-msg" ]; then
            cp "$SCRIPTS_HOOKS_DIR/commit-msg" "$GIT_HOOKS_DIR/commit-msg"
            chmod +x "$GIT_HOOKS_DIR/commit-msg"
            echo -e "  ${GREEN}[installed]${NC} commit-msg hook -> .git/hooks/commit-msg"
        else
            echo -e "  ${RED}[error]${NC} Source commit-msg hook not found"
        fi
    fi

    echo ""
    echo -e "${GREEN}Git hooks installation complete!${NC}"
    echo ""
    echo -e "${CYAN}Next steps:${NC}"
    echo "  1. Test pre-push protection:"
    echo "     git checkout main && git push origin main  # Should be blocked"
    echo ""
    echo "  2. Test commit message validation:"
    echo "     git commit -m 'bad message'  # Should be rejected"
    echo "     git commit -m 'feat: add new feature'  # Should pass"
    echo ""
}

# Function to remove hooks
remove_hooks() {
    echo -e "${YELLOW}Removing git hooks...${NC}"
    echo ""

    # Remove from Husky
    if [ -f "$HUSKY_DIR/pre-push" ]; then
        rm -f "$HUSKY_DIR/pre-push"
        echo -e "  ${GREEN}[removed]${NC} $HUSKY_DIR/pre-push"
    fi

    # Remove from .git/hooks
    if [ -f "$GIT_HOOKS_DIR/pre-push" ]; then
        rm -f "$GIT_HOOKS_DIR/pre-push"
        echo -e "  ${GREEN}[removed]${NC} $GIT_HOOKS_DIR/pre-push"
    fi

    if [ -f "$GIT_HOOKS_DIR/commit-msg" ]; then
        rm -f "$GIT_HOOKS_DIR/commit-msg"
        echo -e "  ${GREEN}[removed]${NC} $GIT_HOOKS_DIR/commit-msg"
    fi

    echo ""
    echo -e "${YELLOW}Warning: Hooks have been removed. Repository is no longer protected!${NC}"
    echo ""
}

# Main script
print_header

case "${1:-}" in
    --check)
        check_hooks
        exit $?
        ;;
    --remove)
        remove_hooks
        exit 0
        ;;
    --help|-h)
        echo "Usage: $0 [option]"
        echo ""
        echo "Options:"
        echo "  (no option)  Install git hooks"
        echo "  --check      Check if hooks are installed"
        echo "  --remove     Remove installed hooks"
        echo "  --help, -h   Show this help message"
        echo ""
        exit 0
        ;;
    "")
        install_hooks
        exit 0
        ;;
    *)
        echo -e "${RED}Unknown option: $1${NC}"
        echo "Use --help for usage information"
        exit 1
        ;;
esac
