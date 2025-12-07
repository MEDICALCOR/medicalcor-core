# Claude Code Setup Guide

Complete guide for using the Claude Code configuration in the MedicalCor Core project.

## Overview

This project includes comprehensive Claude Code configuration to enhance AI-assisted development with domain-specific expertise, automated workflows, and token optimization tools.

## What's Included

| Component | Count | Purpose |
|-----------|-------|---------|
| **Skills** | 46 | Auto-activating domain expertise |
| **Commands** | 7 | Manual slash commands for workflows |
| **Hooks** | 5 | Automated validation and security |
| **Utilities** | 2 | TOON format encoder/decoder |

### MedicalCor-Specific Skills (6)

The configuration includes specialized skills for this medical CRM project:

1. **MedicalCor Expert** - Core platform architecture and domain concepts
2. **HIPAA Compliance Expert** - Protected Health Information handling
3. **GDPR Compliance Expert** - EU data protection compliance
4. **Fastify & Next.js Expert** - Tech stack implementation patterns
5. **GPT-4o Integration Expert** - AI-powered features and RAG
6. **Omnichannel Expert** - WhatsApp, Voice AI, web forms integration

## Quick Start

### Prerequisites

- Claude Code CLI installed
- Access to this repository
- Basic understanding of the MedicalCor architecture

### Verify Installation

The `.claude/` directory should be present at the repository root:

```bash
ls -la .claude/
# Should show: commands/, hooks/, skills/, utils/, settings.json
```

### Using Skills

Skills activate automatically based on conversation context. No manual invocation needed.

**Examples:**

```
"How do I handle HIPAA-compliant logging?"
→ HIPAA Compliance Expert activates

"Implement a new Fastify webhook"
→ Fastify & Next.js Expert activates

"Add GPT-4o lead scoring"
→ GPT-4o Integration Expert activates
```

### Using Commands

Invoke commands with slash notation:

```bash
# Convert JSON to TOON format (30-60% token savings)
/convert-to-toon api-response.json

# Analyze token savings without converting
/analyze-tokens large-data.json

# Validate TOON syntax
/toon-validate data.toon

# Browse community skills
/discover-skills react testing

# Install a skill from GitHub
/install-skill https://github.com/user/repo/blob/main/skill.md
```

## Configuration Files

### settings.json

Active configuration with hooks, permissions, and model selection:

```json
{
  "hooks": {
    "PreToolUse": [...],
    "PostToolUse": [...]
  },
  "permissions": {
    "allow": ["Read(*)", "Write(*)", "Edit(*)", "Grep(*)", "Glob(*)"],
    "ask": ["Bash(*)"],
    "deny": []
  },
  "model": "claude-sonnet-4-5"
}
```

**Key settings:**

- **Hooks**: Automated scripts that run before/after tool use
- **Permissions**: Control what Claude Code can access
- **Model**: Default Claude model to use

### Customization

Create `settings.local.json` for personal overrides (gitignored):

```json
{
  "model": "claude-opus-4",
  "hooks": {
    "enabled": false
  }
}
```

## Hooks

Hooks are **disabled by default** for safety. Review before enabling.

Available hooks:

| Hook | Trigger | Purpose |
|------|---------|---------|
| `settings-backup.sh` | Pre-edit | Backup config files |
| `secret-scanner.sh` | Pre-edit | Prevent committing secrets |
| `toon-validator.sh` | Post-edit | Validate TOON syntax |
| `markdown-formatter.sh` | Post-edit | Auto-format markdown |
| `file-size-monitor.sh` | Post-edit | Warn about large files |

### Enabling Hooks

1. Review hook scripts in `.claude/hooks/`
2. Test behavior in isolated environment
3. Enable in `settings.json` or `settings.local.json`

## TOON Format

**TOON** (Token-Oriented Object Notation) reduces token consumption by 30-60% for tabular data.

### When to Use TOON

✅ **Use for:**
- Arrays with 5+ items
- Objects with 60%+ field uniformity
- API responses, logs, metrics
- Large datasets in conversations

❌ **Don't use for:**
- Small arrays (<5 items)
- Non-uniform data
- Deeply nested structures

### Example

**JSON (120 tokens):**
```json
[
  {"method": "GET", "path": "/api/users", "auth": "required"},
  {"method": "POST", "path": "/api/users", "auth": "required"},
  {"method": "DELETE", "path": "/api/users/:id", "auth": "admin"}
]
```

**TOON (70 tokens - 42% savings):**
```
[3]{method,path,auth}:
  GET,/api/users,required
  POST,/api/users,required
  DELETE,/api/users/:id,admin
```

### TOON Commands

```bash
# Full conversion workflow
/convert-to-toon data.json

# Just encode JSON → TOON
/toon-encode data.json

# Decode TOON → JSON
/toon-decode data.toon

# Validate TOON syntax
/toon-validate data.toon

# Analyze token savings
/analyze-tokens data.json
```

## MedicalCor Development Patterns

### Asking for Architecture Guidance

```
"How should I structure a new domain service for appointment scheduling?"
→ MedicalCor Expert provides hexagonal architecture patterns

"What's the proper way to handle patient consent?"
→ GDPR Compliance Expert + HIPAA Compliance Expert activate
```

### Implementing Features

```
"Add a new webhook for Stripe payment events"
→ Fastify & Next.js Expert provides webhook patterns
→ Suggests signature verification and event handling

"Implement AI-powered patient triage"
→ GPT-4o Integration Expert provides RAG patterns
→ Suggests vector search and context retrieval
```

### Compliance Questions

```
"Is it safe to log this patient data?"
→ HIPAA Compliance Expert checks for PHI
→ Suggests PII redaction patterns

"How do I implement right-to-erasure?"
→ GDPR Compliance Expert provides implementation guide
→ References cognitive memory GDPR erasure module
```

## Adding Custom Skills

### Option 1: Use Skill Builder

```
"Create a skill for Trigger.dev workflow patterns"
→ Skill Builder skill activates
→ Helps you create a custom skill
```

### Option 2: Install from SkillsMP

```bash
/discover-skills trigger workflows
/install-skill <github-url>
```

### Option 3: Manual Creation

**Project-level:**
```bash
touch .claude/skills/your-domain/skill.md
```

**Personal (all projects):**
```bash
mkdir -p ~/.claude/skills
touch ~/.claude/skills/your-skill.md
```

**Skill template:**
```markdown
# Your Skill Name

> Auto-activates when: keyword1, keyword2, keyword3

## Overview

Brief description of what this skill provides.

## Key Concepts

### Concept 1
Explanation...

### Concept 2
Explanation...

## Patterns

### Pattern 1
Code examples and guidance...

## References

- Link to documentation
- Link to examples
```

## Troubleshooting

### Skills Not Activating

**Problem:** Skills don't activate when expected

**Solutions:**
1. Use explicit keywords from skill triggers
2. Check `.claude/skills/` directory exists
3. Verify `skill.md` files are properly formatted
4. Restart Claude Code session

### Commands Not Working

**Problem:** Slash commands return errors

**Solutions:**
1. Check command syntax: `/command-name [args]`
2. Verify commands exist in `.claude/commands/`
3. Check script permissions: `chmod +x .claude/hooks/*.sh`
4. Review command documentation in `.claude/commands/`

### Hooks Failing

**Problem:** Hooks cause errors or unexpected behavior

**Solutions:**
1. Disable hooks temporarily in `settings.json`
2. Check hook script logs for errors
3. Verify scripts have execute permissions
4. Test hooks individually in isolation

### TOON Conversion Issues

**Problem:** TOON encoding fails or produces invalid output

**Solutions:**
1. Validate input JSON is well-formed
2. Check data uniformity (60%+ same fields)
3. Try `/analyze-tokens` first to preview
4. Use `/toon-validate` to check output

## Best Practices

### For Development

1. **Start conversations with context**
   - Mention the feature area (e.g., "working on patient scheduling")
   - Skills will activate based on keywords

2. **Use specific terminology**
   - "HIPAA-compliant logging" → HIPAA skill activates
   - "Fastify webhook" → Fastify skill activates

3. **Reference architecture layers**
   - "domain service" vs "infrastructure adapter"
   - Skills understand hexagonal architecture

### For Token Optimization

1. **Use TOON for large datasets**
   - API responses with 5+ items
   - Test results, metrics, logs

2. **Analyze before converting**
   - `/analyze-tokens` shows potential savings
   - Only convert if savings > 30%

3. **Keep originals**
   - TOON is for conversation, not storage
   - Maintain JSON for application use

### For Security

1. **Review hooks before enabling**
   - Understand what each hook does
   - Test in isolated environment first

2. **Use secret scanner**
   - Enable `secret-scanner.sh` hook
   - Prevents accidental credential commits

3. **Follow PII guidelines**
   - HIPAA/GDPR skills provide patterns
   - Never log unredacted patient data

## Resources

### Documentation

- [.claude/README.md](../../.claude/README.md) - Complete configuration guide
- [.claude/DIRECTORY.md](../../.claude/DIRECTORY.md) - Full component reference
- [CLAUDE.md](../../CLAUDE.md) - MedicalCor development guide

### Skills

- [MedicalCor Skills](../../.claude/skills/medicalcor/skill.md) - 6 specialized skills
- [SkillsMP](https://skillsmp.com) - 13,000+ community skills

### TOON Format

- [TOON Guide](./.claude/utils/toon/toon-guide.md) - Complete specification
- [TOON Examples](./.claude/utils/toon/examples/) - Usage examples
- [toonformat.dev](https://toonformat.dev) - Official website

### External Resources

- [Claude Code Docs](https://code.claude.com/docs) - Official documentation
- [Skills Guide](https://code.claude.com/docs/skills) - Creating skills
- [Commands Guide](https://code.claude.com/docs/commands) - Creating commands

## Getting Help

### Within Claude Code

Ask the specialized experts:

```
"How do I configure settings?"
→ Settings Expert skill

"How do I create a new skill?"
→ Skill Builder skill

"How do I create a slash command?"
→ Command Builder skill
```

### Support Channels

- **Claude Code Issues**: https://github.com/anthropics/claude-code/issues
- **MedicalCor Issues**: GitHub issues in this repository
- **TOON Format**: https://github.com/toon-format/spec/issues

---

## Summary

The Claude Code configuration enhances development with:

✅ **Domain expertise** - 46 auto-activating skills including 6 MedicalCor-specific
✅ **Token optimization** - TOON format for 30-60% savings on large datasets
✅ **Automation** - 5 hooks for validation, security, formatting
✅ **Marketplace access** - 13,000+ community skills via SkillsMP
✅ **Medical compliance** - HIPAA/GDPR patterns built-in

Start using Claude Code with this configuration to accelerate development while maintaining medical-grade quality standards.
