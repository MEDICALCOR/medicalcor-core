#!/bin/bash
# =============================================================================
# MedicalCor Core - Supabase Setup Script
# =============================================================================
# This script helps you set up the Supabase connection for MedicalCor Core
#
# Prerequisites:
# - Supabase CLI installed: npm install -g supabase
# - A Supabase project created at https://supabase.com/dashboard
#
# Usage:
#   ./scripts/setup-supabase.sh
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  MedicalCor Supabase Setup${NC}"
echo -e "${BLUE}========================================${NC}"

# Project reference (update this or pass as argument)
PROJECT_REF="${1:-jkdfjjvfjjdwtcboszhs}"

echo -e "${YELLOW}Project Reference:${NC} $PROJECT_REF"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}Error: Supabase CLI not found${NC}"
    echo "Install with: brew install supabase/tap/supabase"
    echo "Or download from: https://github.com/supabase/cli/releases"
    exit 1
fi

echo -e "${GREEN}Supabase CLI found${NC}"

# Step 1: Login to Supabase
echo ""
echo -e "${YELLOW}Step 1: Login to Supabase${NC}"
echo "If not logged in, run: supabase login"
supabase projects list &> /dev/null || {
    echo -e "${RED}Not logged in. Please run: supabase login${NC}"
    exit 1
}
echo -e "${GREEN}Logged in to Supabase${NC}"

# Step 2: Link project
echo ""
echo -e "${YELLOW}Step 2: Linking project...${NC}"
supabase link --project-ref "$PROJECT_REF"
echo -e "${GREEN}Project linked successfully${NC}"

# Step 3: Push migrations
echo ""
echo -e "${YELLOW}Step 3: Pushing migrations...${NC}"
echo "This will apply all 53 migrations to your Supabase database."
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    supabase db push
    echo -e "${GREEN}Migrations applied successfully${NC}"
else
    echo -e "${YELLOW}Skipped migrations. Run 'supabase db push' later.${NC}"
fi

# Step 4: Generate types
echo ""
echo -e "${YELLOW}Step 4: Generating TypeScript types...${NC}"
mkdir -p packages/types/src/generated
supabase gen types typescript --project-id "$PROJECT_REF" > packages/types/src/generated/supabase.ts
echo -e "${GREEN}Types generated at packages/types/src/generated/supabase.ts${NC}"

# Step 5: Display connection info
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Setup Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Get your API keys from Supabase Dashboard:"
echo "   https://supabase.com/dashboard/project/$PROJECT_REF/settings/api"
echo ""
echo "2. Add to your .env.local:"
echo ""
echo "   SUPABASE_URL=https://$PROJECT_REF.supabase.co"
echo "   SUPABASE_ANON_KEY=<your-anon-key>"
echo "   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>"
echo "   DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
echo ""
echo "3. Run the development server:"
echo "   pnpm dev"
echo ""
echo -e "${GREEN}Done!${NC}"
