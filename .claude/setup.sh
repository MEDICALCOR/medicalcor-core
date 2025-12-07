#!/usr/bin/env bash
# .claude/setup.sh
#
# Install / bootstrap the .claude configuration into a project.
# - Copies a source .claude directory into the target project (default: current repo)
# - Optionally pulls documentation (using docpull)
# - Writes a safe settings.local.json (hooks disabled)
# - Makes TOON binaries executable if present
# - Idempotent: backs up existing .claude to .claude.bak
#
# Usage:
#   ./.claude/setup.sh [--from /path/to/claude-template] [--to /path/to/target-project]
#                     [--pull-docs] [--docs-list "stripe,supabase,expo"]
#                     [--enable-hooks]
#
# Examples:
#   # Install into current repo from local template folder
#   ./.claude/setup.sh --from ./claude-starter/.claude
#
#   # Install and pull default docs (stripe, supabase, expo)
#   ./.claude/setup.sh --from ./claude-starter/.claude --pull-docs
#
#   # Install into another directory and enable hooks
#   ./.claude/setup.sh --from ./claude-starter/.claude --to ../my-project --enable-hooks
#

set -euo pipefail

# Defaults
FROM_DIR=""
TO_DIR="$(pwd)"
PULL_DOCS=false
DOCS_LIST="stripe,supabase,expo"
ENABLE_HOOKS=false
QUIET=false

# Helpers
info() { if [ "$QUIET" = false ]; then printf "\033[1;34m[info]\033[0m %s\n" "$*"; fi }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*" >&2; }
err()  { printf "\033[1;31m[error]\033[0m %s\n" "$*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Install / bootstrap .claude configuration into a project.

Options:
  --from DIR          Source .claude directory to copy from (required)
  --to DIR            Target directory to install into (default: current directory)
  --pull-docs         Pull documentation using docpull after installation
  --docs-list LIST    Comma-separated list of docs to pull (default: stripe,supabase,expo)
  --enable-hooks      Enable hooks in settings.local.json (default: disabled)
  --quiet             Suppress informational output
  -h, --help          Show this help message

Examples:
  # Install from a template directory
  $0 --from ./claude-starter/.claude

  # Install and pull documentation
  $0 --from ./claude-starter/.claude --pull-docs

  # Install to another directory with hooks enabled
  $0 --from ./claude-starter/.claude --to ../my-project --enable-hooks

EOF
  exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --from)
      FROM_DIR="$2"
      shift 2
      ;;
    --to)
      TO_DIR="$2"
      shift 2
      ;;
    --pull-docs)
      PULL_DOCS=true
      shift
      ;;
    --docs-list)
      DOCS_LIST="$2"
      shift 2
      ;;
    --enable-hooks)
      ENABLE_HOOKS=true
      shift
      ;;
    --quiet)
      QUIET=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      err "Unknown option: $1. Use --help for usage information."
      ;;
  esac
done

# Validation
if [ -z "$FROM_DIR" ]; then
  err "Missing required --from argument. Use --help for usage information."
fi

if [ ! -d "$FROM_DIR" ]; then
  err "Source directory does not exist: $FROM_DIR"
fi

if [ ! -d "$TO_DIR" ]; then
  err "Target directory does not exist: $TO_DIR"
fi

# Resolve absolute paths
FROM_DIR="$(cd "$FROM_DIR" && pwd)"
TO_DIR="$(cd "$TO_DIR" && pwd)"

TARGET_CLAUDE="$TO_DIR/.claude"
BACKUP_CLAUDE="$TO_DIR/.claude.bak"

info "Starting .claude installation"
info "  Source: $FROM_DIR"
info "  Target: $TO_DIR"

# Idempotent backup of existing .claude
if [ -d "$TARGET_CLAUDE" ]; then
  if [ -d "$BACKUP_CLAUDE" ]; then
    warn "Backup already exists at $BACKUP_CLAUDE, removing it first"
    rm -rf "$BACKUP_CLAUDE"
  fi
  info "Backing up existing .claude to .claude.bak"
  mv "$TARGET_CLAUDE" "$BACKUP_CLAUDE"
fi

# Copy .claude directory using rsync or cp
info "Copying .claude configuration..."
if command -v rsync >/dev/null 2>&1; then
  info "Using rsync for efficient copying"
  rsync -a --exclude='.DS_Store' --exclude='*.log' "$FROM_DIR/" "$TARGET_CLAUDE/"
else
  info "Using cp -a (rsync not available)"
  # Create target directory first
  mkdir -p "$TARGET_CLAUDE"
  # Copy contents (not the directory itself)
  cp -a "$FROM_DIR/." "$TARGET_CLAUDE/"
  # Clean up common cruft in one pass
  find "$TARGET_CLAUDE" \( -name '.DS_Store' -o -name '*.log' \) -delete 2>/dev/null || true
fi

# Make TOON binaries executable if present
TOON_BINARY="$TARGET_CLAUDE/utils/toon/zig-out/bin/toon"
if [ -f "$TOON_BINARY" ]; then
  info "Making TOON binary executable"
  chmod +x "$TOON_BINARY"
fi

# Additional scripts that might need executable permissions
find "$TARGET_CLAUDE" -type f -name '*.sh' -exec chmod +x {} \; 2>/dev/null || true

# Write settings.local.json
SETTINGS_LOCAL="$TARGET_CLAUDE/settings.local.json"
HOOKS_STATUS=$([ "$ENABLE_HOOKS" = true ] && echo "enabled" || echo "disabled")
info "Creating settings.local.json with hooks $HOOKS_STATUS"

if [ "$ENABLE_HOOKS" = true ]; then
  cat > "$SETTINGS_LOCAL" <<'EOJSON'
{
  "comment": "Local settings - not committed to version control",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/file-size-monitor.sh"
          },
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/secret-scanner.sh"
          }
        ]
      },
      {
        "matcher": "Edit|Write",
        "pattern": "\\.toon$",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/toon-validator.sh"
          }
        ]
      },
      {
        "matcher": "Edit|Write",
        "pattern": "\\.md$",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/markdown-formatter.sh"
          }
        ]
      }
    ]
  }
}
EOJSON
else
  cat > "$SETTINGS_LOCAL" <<'EOJSON'
{
  "comment": "Local settings - not committed to version control",
  "hooks": {
    "PostToolUse": []
  }
}
EOJSON
fi

info "Installation complete!"

# Pull documentation if requested
if [ "$PULL_DOCS" = true ]; then
  if ! command -v docpull >/dev/null 2>&1; then
    warn "docpull not found. Install it with: pipx install docpull"
    warn "Skipping documentation pull."
  else
    info "Pulling documentation for: $DOCS_LIST"
    IFS=',' read -ra DOCS <<< "$DOCS_LIST"
    for doc in "${DOCS[@]}"; do
      doc="$(echo "$doc" | xargs)" # trim whitespace
      case "$doc" in
        stripe)
          info "  Pulling Stripe documentation (this may take a while)..."
          docpull https://docs.stripe.com -o "$TARGET_CLAUDE/skills/stripe/docs" || warn "Failed to pull Stripe docs"
          ;;
        supabase)
          info "  Pulling Supabase documentation (this may take a while)..."
          docpull https://supabase.com/docs -o "$TARGET_CLAUDE/skills/supabase/docs" || warn "Failed to pull Supabase docs"
          ;;
        expo)
          info "  Pulling Expo documentation (this may take a while)..."
          docpull https://docs.expo.dev -o "$TARGET_CLAUDE/skills/expo/docs" || warn "Failed to pull Expo docs"
          ;;
        plaid)
          info "  Pulling Plaid documentation (this may take a while)..."
          docpull https://plaid.com/docs -o "$TARGET_CLAUDE/skills/plaid/docs" || warn "Failed to pull Plaid docs"
          ;;
        shopify)
          info "  Pulling Shopify documentation (this may take a while)..."
          docpull https://shopify.dev/docs -o "$TARGET_CLAUDE/skills/shopify/docs" || warn "Failed to pull Shopify docs"
          ;;
        whop)
          info "  Pulling Whop documentation (this may take a while)..."
          docpull https://docs.whop.com -o "$TARGET_CLAUDE/skills/whop/docs" || warn "Failed to pull Whop docs"
          ;;
        *)
          warn "Unknown documentation source: $doc (skipping)"
          ;;
      esac
    done
  fi
fi

# Next steps
cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ .claude installation complete!

📁 Location: $TARGET_CLAUDE
📋 Configuration:
   - Hooks: $([ "$ENABLE_HOOKS" = true ] && echo "enabled" || echo "disabled")
   - Documentation: $([ "$PULL_DOCS" = true ] && echo "pulled" || echo "not pulled")

🚀 Next steps:

1. Review the configuration:
   cd $TO_DIR
   cat .claude/README.md

2. Try the slash commands:
   /convert-to-toon data.json
   /discover-skills

3. Skills will auto-activate when you mention relevant keywords:
   - "Stripe API" → activates Stripe skill
   - "Supabase auth" → activates Supabase skill
   - "data array" → activates TOON formatter

4. Optional - Pull additional documentation:
   pipx install docpull  # if not already installed
   docpull https://docs.stripe.com -o .claude/skills/stripe/docs

5. Optional - Enable hooks in .claude/settings.local.json
   $([ "$ENABLE_HOOKS" = true ] && echo "(already enabled)" || echo "(currently disabled for safety)")

6. Optional - Customize skills and commands:
   - Add your own skills to .claude/skills/
   - Create custom commands in .claude/commands/
   - See .claude/DIRECTORY.md for complete documentation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF

info "Done!"
