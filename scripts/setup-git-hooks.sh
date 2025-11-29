#!/bin/bash
#
# Setup script for MedicalCor git hooks
# Run this after cloning the repository: pnpm setup:hooks
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  MedicalCor Git Hooks Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
GIT_HOOKS_DIR="$PROJECT_ROOT/.git/hooks"
CUSTOM_HOOKS_DIR="$SCRIPT_DIR/git-hooks"

# Check if we're in a git repository
if [ ! -d "$PROJECT_ROOT/.git" ]; then
    echo -e "${RED}Error: Not a git repository!${NC}"
    echo "Please run this script from within the medicalcor-core repository."
    exit 1
fi

# Check if custom hooks directory exists
if [ ! -d "$CUSTOM_HOOKS_DIR" ]; then
    echo -e "${RED}Error: Custom hooks directory not found!${NC}"
    echo "Expected: $CUSTOM_HOOKS_DIR"
    exit 1
fi

# Create hooks directory if it doesn't exist
mkdir -p "$GIT_HOOKS_DIR"

# Install pre-push hook
echo -e "${YELLOW}Installing pre-push hook...${NC}"
if [ -f "$CUSTOM_HOOKS_DIR/pre-push" ]; then
    cp "$CUSTOM_HOOKS_DIR/pre-push" "$GIT_HOOKS_DIR/pre-push"
    chmod +x "$GIT_HOOKS_DIR/pre-push"
    echo -e "  ${GREEN}pre-push hook installed${NC}"
else
    echo -e "  ${RED}pre-push hook source not found${NC}"
fi

# Install commit-msg hook
echo -e "${YELLOW}Installing commit-msg hook...${NC}"
if [ -f "$CUSTOM_HOOKS_DIR/commit-msg" ]; then
    cp "$CUSTOM_HOOKS_DIR/commit-msg" "$GIT_HOOKS_DIR/commit-msg"
    chmod +x "$GIT_HOOKS_DIR/commit-msg"
    echo -e "  ${GREEN}commit-msg hook installed${NC}"
else
    echo -e "  ${RED}commit-msg hook source not found${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Git hooks installed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Protected branches: main, master, production, staging"
echo ""
echo -e "${YELLOW}IMPORTANT:${NC}"
echo "  - Direct push to main is now BLOCKED"
echo "  - Commit messages must follow conventional format"
echo "  - Use feature branches and Pull Requests"
echo ""
echo "See docs/GIT_WORKFLOW.md for the complete workflow."
echo ""
