#!/bin/bash
# Schema Validation Script
# Detects drift between dev and prod database schemas
# Usage: ./scripts/validate-schema.sh [dev_url] [prod_url]

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== MedicalCor Schema Validation ==="
echo ""

# Configuration
DEV_URL="${1:-$DATABASE_URL_DEV}"
PROD_URL="${2:-$DATABASE_URL_PROD}"
SCHEMA_DIR="./db"
TEMP_DIR=$(mktemp -d)

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Function to dump schema from database
dump_schema() {
    local url=$1
    local output=$2
    local name=$3

    echo "Dumping schema from $name..."

    # Extract connection params from URL
    if [[ "$url" =~ postgres://([^:]+):([^@]+)@([^:]+):([^/]+)/([^?]+) ]]; then
        PGUSER="${BASH_REMATCH[1]}"
        PGPASSWORD="${BASH_REMATCH[2]}"
        PGHOST="${BASH_REMATCH[3]}"
        PGPORT="${BASH_REMATCH[4]}"
        PGDATABASE="${BASH_REMATCH[5]}"
    else
        echo -e "${RED}ERROR: Invalid database URL format${NC}"
        exit 1
    fi

    PGPASSWORD="$PGPASSWORD" pg_dump \
        -h "$PGHOST" \
        -p "$PGPORT" \
        -U "$PGUSER" \
        -d "$PGDATABASE" \
        --schema-only \
        --no-owner \
        --no-privileges \
        --no-comments \
        --no-tablespaces \
        | grep -v "^--" \
        | grep -v "^SET" \
        | grep -v "^SELECT pg_catalog" \
        | sed '/^$/d' \
        > "$output"
}

# Function to normalize schema for comparison
normalize_schema() {
    local input=$1
    local output=$2

    # Sort tables and normalize whitespace
    cat "$input" \
        | tr '\n' ' ' \
        | sed 's/  */ /g' \
        | sed 's/; /;\n/g' \
        | sort \
        | sed '/^$/d' \
        > "$output"
}

# Check for required tools
check_requirements() {
    if ! command -v pg_dump &> /dev/null; then
        echo -e "${YELLOW}WARNING: pg_dump not found. Skipping live schema comparison.${NC}"
        echo "Install PostgreSQL client tools or run in CI with services."
        return 1
    fi
    return 0
}

# Validate migration files
validate_migrations() {
    echo ""
    echo "=== Validating Migration Files ==="

    local migration_count=0
    local errors=0

    for file in "$SCHEMA_DIR"/migrations/*.sql; do
        if [[ -f "$file" ]]; then
            ((migration_count++))

            # Check for migrate:up and migrate:down markers
            if ! grep -q "migrate:up" "$file"; then
                echo -e "${RED}ERROR: Missing 'migrate:up' in $file${NC}"
                ((errors++))
            fi

            if ! grep -q "migrate:down" "$file"; then
                echo -e "${RED}ERROR: Missing 'migrate:down' in $file${NC}"
                ((errors++))
            fi

            # Check file naming convention (YYYYMMDDHHMMSS_description.sql)
            filename=$(basename "$file")
            if ! [[ "$filename" =~ ^[0-9]{14}_[a-z0-9_]+\.sql$ ]]; then
                echo -e "${YELLOW}WARNING: Non-standard filename: $filename${NC}"
                echo "  Expected format: YYYYMMDDHHMMSS_description.sql"
            fi
        fi
    done

    echo ""
    echo "Found $migration_count migration files"

    if [[ $errors -gt 0 ]]; then
        echo -e "${RED}Found $errors errors in migration files${NC}"
        return 1
    fi

    echo -e "${GREEN}All migration files are valid${NC}"
    return 0
}

# Check for dangerous operations in migrations
check_dangerous_operations() {
    echo ""
    echo "=== Checking for Dangerous Operations ==="

    local warnings=0

    for file in "$SCHEMA_DIR"/migrations/*.sql; do
        if [[ -f "$file" ]]; then
            filename=$(basename "$file")

            # Check for DROP TABLE without IF EXISTS
            if grep -qE "DROP TABLE [^I]" "$file" 2>/dev/null; then
                echo -e "${YELLOW}WARNING: $filename contains DROP TABLE without IF EXISTS${NC}"
                ((warnings++))
            fi

            # Check for ALTER TABLE ... DROP COLUMN
            if grep -qi "DROP COLUMN" "$file" 2>/dev/null; then
                echo -e "${YELLOW}WARNING: $filename contains DROP COLUMN (data loss risk)${NC}"
                ((warnings++))
            fi

            # Check for TRUNCATE
            if grep -qi "TRUNCATE" "$file" 2>/dev/null; then
                echo -e "${RED}WARNING: $filename contains TRUNCATE (data loss)${NC}"
                ((warnings++))
            fi
        fi
    done

    if [[ $warnings -eq 0 ]]; then
        echo -e "${GREEN}No dangerous operations detected${NC}"
    else
        echo ""
        echo -e "${YELLOW}Found $warnings potential issues (review manually)${NC}"
    fi

    return 0
}

# Compare dev and prod schemas
compare_schemas() {
    if ! check_requirements; then
        echo "Skipping schema comparison (pg_dump not available)"
        return 0
    fi

    if [[ -z "${DEV_URL:-}" ]] || [[ -z "${PROD_URL:-}" ]]; then
        echo -e "${YELLOW}Skipping schema comparison (DATABASE_URL_DEV/PROD not set)${NC}"
        return 0
    fi

    echo ""
    echo "=== Comparing Dev vs Prod Schemas ==="

    local dev_schema="$TEMP_DIR/dev_schema.sql"
    local prod_schema="$TEMP_DIR/prod_schema.sql"
    local dev_normalized="$TEMP_DIR/dev_normalized.sql"
    local prod_normalized="$TEMP_DIR/prod_normalized.sql"

    dump_schema "$DEV_URL" "$dev_schema" "dev"
    dump_schema "$PROD_URL" "$prod_schema" "prod"

    normalize_schema "$dev_schema" "$dev_normalized"
    normalize_schema "$prod_schema" "$prod_normalized"

    echo ""
    if diff -q "$dev_normalized" "$prod_normalized" > /dev/null 2>&1; then
        echo -e "${GREEN}Schemas are identical${NC}"
    else
        echo -e "${RED}Schema drift detected!${NC}"
        echo ""
        echo "Differences:"
        diff "$dev_normalized" "$prod_normalized" || true
        echo ""
        echo "Run 'dbmate migrate' on prod to sync schemas"
        return 1
    fi

    return 0
}

# Main execution
main() {
    local exit_code=0

    validate_migrations || exit_code=1
    check_dangerous_operations
    compare_schemas || exit_code=1

    echo ""
    echo "=== Summary ==="
    if [[ $exit_code -eq 0 ]]; then
        echo -e "${GREEN}All schema validations passed${NC}"
    else
        echo -e "${RED}Schema validation failed${NC}"
    fi

    exit $exit_code
}

main "$@"
