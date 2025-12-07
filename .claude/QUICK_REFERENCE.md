# Claude Code Quick Reference

One-page cheat sheet for MedicalCor developers using Claude Code.

## 🚀 Quick Start

```bash
# Validate configuration
./.claude/scripts/validate-config.sh

# View complete guide
cat .claude/README.md
```

## 🎓 Auto-Activating Skills

Skills activate based on keywords in your conversation:

| Say This | Skill Activates | Use For |
|----------|----------------|---------|
| "HIPAA compliance" | HIPAA Expert | Protected health info handling |
| "GDPR consent" | GDPR Expert | EU data protection |
| "Fastify webhook" | Fastify Expert | API implementation |
| "GPT-4o scoring" | GPT-4o Expert | AI features & RAG |
| "WhatsApp messaging" | Omnichannel Expert | Multi-channel comm |
| "MedicalCor architecture" | MedicalCor Expert | Platform design |

## ⚡ Slash Commands

### TOON Format (Token Optimization)

```bash
/convert-to-toon data.json        # Full conversion workflow
/analyze-tokens large-file.json   # Preview savings without converting
/toon-encode data.json            # JSON → TOON
/toon-decode data.toon            # TOON → JSON
/toon-validate data.toon          # Check syntax
```

### Skill Marketplace

```bash
/discover-skills [query]          # Browse 13,000+ skills
/install-skill <github-url>       # Install from GitHub
```

## 📊 When to Use TOON

✅ **Use TOON for:**
- Arrays with 5+ items
- 60%+ field uniformity
- API responses, logs, metrics
- Saves 30-60% tokens

❌ **Skip TOON for:**
- Small datasets (<5 items)
- Non-uniform data
- Deeply nested objects

## 🏗️ MedicalCor Patterns

### Architecture Questions

```
"How do I structure a domain service?"
"Where should I put this adapter?"
"What's the hexagonal architecture pattern for X?"
```

### Compliance Questions

```
"Is this PHI? Can I log it?"
"How do I implement right-to-erasure?"
"What consent do I need for WhatsApp?"
```

### Implementation Help

```
"Add a Stripe webhook"
"Implement AI lead scoring"
"Create a Trigger.dev workflow"
```

## 🔧 Configuration Files

```
.claude/
├── settings.json              # Active config
├── settings.local.json        # Personal overrides (gitignored)
├── settings.json.example      # Template
├── README.md                  # Full guide
├── DIRECTORY.md               # Component reference
└── QUICK_REFERENCE.md         # This file
```

## 🪝 Hooks (Disabled by Default)

Review `.claude/hooks/` before enabling:

| Hook | Purpose |
|------|---------|
| `settings-backup.sh` | Backup configs before edit |
| `secret-scanner.sh` | Prevent committing secrets |
| `toon-validator.sh` | Validate TOON syntax |
| `markdown-formatter.sh` | Auto-format markdown |
| `file-size-monitor.sh` | Warn about large files |

Enable in `settings.json` or `settings.local.json`.

## 🎯 Common Tasks

### Start a Feature

```
"I'm building a patient appointment scheduler.
Need to handle:
- Domain model with appointments aggregate
- GDPR consent checks
- WhatsApp reminders
- Trigger.dev background jobs

How should I structure this?"
```

→ MedicalCor + GDPR + Omnichannel skills activate

### Debug an Issue

```
"This Fastify webhook is failing HMAC verification.
Here's the code: [paste code]
Using WhatsApp Business API."
```

→ Fastify + Omnichannel skills activate

### Optimize Token Usage

```
"I have this large API response [paste JSON].
How can I reduce tokens?"
```

→ Use `/analyze-tokens response.json` to see savings
→ Use `/convert-to-toon response.json` if savings > 30%

## 📚 Documentation Hierarchy

1. **Quick Start**: This file
2. **Complete Guide**: `.claude/README.md`
3. **Setup Guide**: `docs/README/CLAUDE_CODE_SETUP.md`
4. **Component Reference**: `.claude/DIRECTORY.md`
5. **Project Rules**: `CLAUDE.md`

## 🔍 Troubleshooting

| Issue | Solution |
|-------|----------|
| Skills not activating | Use explicit keywords from triggers |
| Commands failing | Check syntax: `/command-name [args]` |
| Hooks causing errors | Disable in `settings.json` temporarily |
| TOON conversion issues | Use `/analyze-tokens` first, validate input JSON |

## 🛡️ Security Reminders

- ✅ Enable `secret-scanner.sh` hook
- ✅ Review all hooks before enabling
- ✅ Follow HIPAA/GDPR patterns from skills
- ✅ Never log unredacted patient data
- ✅ Use PII redaction patterns

## 📊 Example: TOON Conversion

**Before (JSON - 180 tokens):**
```json
[
  {"leadId": "L001", "score": 5, "status": "HOT", "procedure": "All-on-X"},
  {"leadId": "L002", "score": 3, "status": "WARM", "procedure": "Implant"},
  {"leadId": "L003", "score": 2, "status": "COLD", "procedure": "Checkup"}
]
```

**After (TOON - 90 tokens, 50% savings):**
```
[3]{leadId,score,status,procedure}:
  L001,5,HOT,All-on-X
  L002,3,WARM,Implant
  L003,2,COLD,Checkup
```

## 🎨 Skill Customization

### Add Project Skill

```bash
touch .claude/skills/your-domain/skill.md
```

### Add Personal Skill (All Projects)

```bash
mkdir -p ~/.claude/skills
touch ~/.claude/skills/your-skill.md
```

### Skill Template

```markdown
# Skill Name

> Auto-activates when: keyword1, keyword2

## Overview
Brief description

## Patterns
Code examples

## References
Links
```

## 🔗 Quick Links

- **Full Setup Guide**: `docs/README/CLAUDE_CODE_SETUP.md`
- **Validate Config**: `./.claude/scripts/validate-config.sh`
- **SkillsMP**: https://skillsmp.com
- **TOON Format**: https://toonformat.dev
- **Claude Code Docs**: https://code.claude.com/docs

## 💡 Pro Tips

1. **Start with context**: Mention the feature area upfront
2. **Use domain terms**: "aggregate", "adapter", "port" activate architecture skills
3. **Ask for patterns**: "What's the pattern for X?" gets better results
4. **Analyze before converting**: `/analyze-tokens` shows TOON savings
5. **Keep originals**: TOON is for conversation, not storage

---

**Need Help?**

```
"How do I [task]?" → Relevant skills activate automatically
/discover-skills [topic] → Browse marketplace
"Create a skill for [domain]" → Skill Builder activates
```

**Validate Everything:**

```bash
./.claude/scripts/validate-config.sh
```

All 44 checks should pass ✅
