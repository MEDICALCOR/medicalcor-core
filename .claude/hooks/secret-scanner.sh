#!/bin/bash
# Secret Scanner Hook
# Prevents accidentally writing sensitive data to files

set -euo pipefail

FILE_PATH="${TOOL_INPUT_FILE_PATH:-}"

# Skip if file doesn't exist
if [[ ! -f "$FILE_PATH" ]]; then
  exit 0
fi

# Patterns to detect (expanded for MedicalCor)
declare -a PATTERNS=(
  # Cloud & Infrastructure
  "AKIA[0-9A-Z]{16}"                    # AWS Access Key
  "AIza[0-9A-Za-z\\-_]{35}"             # Google API Key
  "ghp_[A-Za-z0-9]{36}"                 # GitHub Personal Access Token
  "-----BEGIN.*PRIVATE KEY-----"         # Private Keys

  # AI & LLM Services
  "sk-[A-Za-z0-9]{48}"                  # OpenAI API Key
  "sk-proj-[A-Za-z0-9_-]+"              # OpenAI Project API Key

  # MedicalCor Integrations
  "pat-[a-z0-9]{2}-[a-f0-9-]{36}"       # HubSpot Private App Token
  "EAA[A-Za-z0-9]+"                     # WhatsApp/Meta Access Token
  "vapi_[A-Za-z0-9]{32}"                # Vapi API Key
  "rk_live_[A-Za-z0-9]+"                # Stripe Restricted Key
  "sk_live_[A-Za-z0-9]+"                # Stripe Secret Key

  # Communication
  "xox[baprs]-[0-9a-zA-Z-]+"            # Slack Token
  "SG\\.[A-Za-z0-9_-]+"                  # SendGrid API Key
  "key-[a-f0-9]{32}"                    # Mailgun API Key

  # Database & Cache
  "postgres://[^:]+:[^@]+@"             # PostgreSQL Connection String
  "redis://[^:]+:[^@]+@"                # Redis Connection String

  # Healthcare Data (PHI indicators)
  "[0-9]{3}-[0-9]{2}-[0-9]{4}"          # SSN Format

  # Generic Credentials
  "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}\\s*:\\s*.{8,}" # Email:Password
)

FOUND_SECRETS=false

for pattern in "${PATTERNS[@]}"; do
  if grep -qE "$pattern" "$FILE_PATH" 2>/dev/null; then
    if [[ "$FOUND_SECRETS" == "false" ]]; then
      echo "⚠️  SECURITY WARNING: Potential secrets detected in $FILE_PATH" >&2
      echo "" >&2
      FOUND_SECRETS=true
    fi

    # Show context without revealing full secret
    echo "  Pattern matched: ${pattern:0:30}..." >&2
    grep -nE "$pattern" "$FILE_PATH" | head -n 1 | sed 's/:.*/: [REDACTED]/' >&2
  fi
done

if [[ "$FOUND_SECRETS" == "true" ]]; then
  echo "" >&2
  echo "Please review the file and remove any sensitive data." >&2
  echo "If this is a false positive, you can proceed." >&2
  exit 2
fi

exit 0
