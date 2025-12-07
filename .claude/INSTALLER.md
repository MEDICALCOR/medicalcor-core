# .claude Setup Installer

The `.claude/setup.sh` script bootstraps the `.claude` configuration into any project.

## Quick Start

```bash
# Install from the current repository into a target project
./.claude/setup.sh --from ./.claude --to /path/to/your-project

# Install and pull documentation (requires docpull)
./.claude/setup.sh --from ./.claude --to /path/to/your-project --pull-docs

# Install with hooks enabled
./.claude/setup.sh --from ./.claude --to /path/to/your-project --enable-hooks
```

## Features

- ✅ **Idempotent** - Backs up existing `.claude` to `.claude.bak` automatically
- ✅ **Safe defaults** - Hooks disabled by default in `settings.local.json`
- ✅ **Smart copying** - Uses `rsync` when available, falls back to `cp -a`
- ✅ **Executable binaries** - Automatically makes TOON binaries and scripts executable
- ✅ **Documentation pulling** - Optional integration with `docpull`
- ✅ **Helpful output** - Clear next steps after installation

## Usage Examples

### Basic Installation

Install from a template directory into the current project:

```bash
./.claude/setup.sh --from ./claude-starter/.claude
```

### Install to Another Directory

Install into a different project directory:

```bash
./.claude/setup.sh --from ./claude-starter/.claude --to ../my-project
```

### Install with Documentation

Pull Stripe, Supabase, and Expo docs after installation:

```bash
./.claude/setup.sh --from ./claude-starter/.claude --pull-docs
```

### Install with Custom Docs List

Pull specific documentation sources:

```bash
./.claude/setup.sh --from ./claude-starter/.claude --pull-docs --docs-list "stripe,plaid,shopify"
```

### Install with Hooks Enabled

Enable hooks for automatic validation:

```bash
./.claude/setup.sh --from ./claude-starter/.claude --enable-hooks
```

### Quiet Mode

Suppress informational messages:

```bash
./.claude/setup.sh --from ./claude-starter/.claude --quiet
```

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--from DIR` | Source `.claude` directory to copy from | *(required)* |
| `--to DIR` | Target directory to install into | Current directory |
| `--pull-docs` | Pull documentation using docpull | `false` |
| `--docs-list LIST` | Comma-separated list of docs to pull | `stripe,supabase,expo` |
| `--enable-hooks` | Enable hooks in settings.local.json | `false` (disabled) |
| `--quiet` | Suppress informational output | `false` |
| `-h, --help` | Show help message | - |

## Supported Documentation Sources

When using `--pull-docs`, the following sources are supported:

- `stripe` - Stripe API documentation
- `supabase` - Supabase backend documentation
- `expo` - Expo React Native documentation
- `plaid` - Plaid banking API documentation
- `shopify` - Shopify e-commerce documentation
- `whop` - Whop digital products documentation

## What Gets Installed

1. **Complete `.claude` directory structure**
   - Skills (auto-activating domain expertise)
   - Commands (slash commands)
   - Hooks (optional automation)
   - Utils (TOON format tools)
   - Documentation

2. **settings.local.json**
   - Local configuration file
   - Hooks disabled by default (safe)
   - Not committed to version control

3. **Executable permissions**
   - TOON binaries marked executable
   - All `.sh` scripts marked executable

4. **Optional documentation** (if `--pull-docs` is used)
   - Pulled to appropriate skill directories
   - Requires `docpull` to be installed

## Prerequisites

### Required

- Bash shell (POSIX compatible)
- `rsync` or `cp` command

### Optional

- `docpull` - For pulling documentation
  ```bash
  pipx install docpull
  ```

## Safety Features

- **Automatic backup**: Existing `.claude` is backed up to `.claude.bak`
- **Hooks disabled**: Hooks are off by default for safety
- **Validation**: Checks source and target directories exist
- **Error handling**: Clear error messages with exit codes

## Next Steps After Installation

After running the installer:

1. Review the installed configuration:
   ```bash
   cat .claude/README.md
   ```

2. Try slash commands:
   ```bash
   /convert-to-toon data.json
   /discover-skills
   ```

3. Let skills auto-activate by mentioning keywords:
   - "Stripe API" → Stripe skill activates
   - "Supabase auth" → Supabase skill activates
   - "data array" → TOON formatter activates

4. Optional - Pull additional documentation:
   ```bash
   pipx install docpull
   docpull https://docs.stripe.com -o .claude/skills/stripe/docs
   ```

5. Optional - Enable hooks (if desired):
   - Edit `.claude/settings.local.json`
   - See `.claude/hooks/README.md` for available hooks

## Troubleshooting

### "Missing required --from argument"

You must specify the source directory with `--from`:

```bash
./.claude/setup.sh --from ./path/to/source/.claude
```

### "Source directory does not exist"

Verify the path to the source `.claude` directory is correct:

```bash
ls -la /path/to/source/.claude
```

### "docpull not found"

Install docpull with pipx:

```bash
pipx install docpull
```

Or skip documentation pulling and install it manually later.

## See Also

- [DIRECTORY.md](./DIRECTORY.md) - Complete directory structure documentation
- [README.md](./README.md) - Quick start and overview
- [hooks/README.md](./hooks/README.md) - Hook configuration guide
