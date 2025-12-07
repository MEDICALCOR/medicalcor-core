# Claude Code Onboarding Checklist

Quick onboarding for new developers using Claude Code with MedicalCor.

## ✅ Setup (5 minutes)

- [ ] Repository cloned
- [ ] `.claude/` directory exists
- [ ] Run validation: `./.claude/scripts/validate-config.sh`
- [ ] All validation checks passing

## 📖 Essential Reading (15 minutes)

- [ ] Read [Quick Reference](./.claude/QUICK_REFERENCE.md) (5 min)
- [ ] Skim [Main README](./.claude/README.md) (5 min)
- [ ] Review [MedicalCor Skills](./.claude/skills/medicalcor/skill.md) (5 min)

## 🧪 Try It Out (10 minutes)

### Test Skill Activation

Open Claude Code and try these prompts:

- [ ] **Architecture**: "Explain MedicalCor's hexagonal architecture"
  - ✓ MedicalCor Expert should activate

- [ ] **Compliance**: "How do I log patient data safely?"
  - ✓ HIPAA Compliance Expert should activate

- [ ] **Tech Stack**: "How do I add a Fastify webhook?"
  - ✓ Fastify & Next.js Expert should activate

### Test Commands

- [ ] **Validate**: `./.claude/scripts/validate-config.sh`
  - ✓ Should show 44 passed checks

- [ ] **Skills**: `/discover-skills medical`
  - ✓ Should show skill marketplace

- [ ] **TOON**: Create test JSON file and run:
  ```bash
  echo '[{"name":"test","value":1}]' > /tmp/test.json
  /analyze-tokens /tmp/test.json
  ```
  - ✓ Should show token analysis

## 🎓 Learn More (Optional)

- [ ] Read [Complete Setup Guide](../docs/README/CLAUDE_CODE_SETUP.md)
- [ ] Review [TOON Format Guide](./.claude/utils/toon/toon-guide.md)
- [ ] Browse [All Skills](./.claude/DIRECTORY.md#skills)
- [ ] Explore [Commands](./.claude/commands/)

## 🏗️ Start Building

You're ready! Try these real-world scenarios:

### Scenario 1: New Domain Service

```
"I need to create a domain service for patient appointment scheduling.
Requirements:
- Aggregate root for appointments
- Value objects for time slots
- GDPR consent verification
- WhatsApp reminder integration

How should I structure this following hexagonal architecture?"
```

**Expected**: MedicalCor + GDPR + Omnichannel skills activate with structured guidance.

### Scenario 2: Add API Endpoint

```
"Add a new Fastify webhook for Stripe payment events.
Need:
- HMAC signature verification
- Event validation
- Trigger.dev task dispatch
- Error handling

Show me the pattern."
```

**Expected**: Fastify & Next.js Expert provides webhook patterns with security best practices.

### Scenario 3: AI Integration

```
"Implement GPT-4o lead scoring for dental patients.
Score based on:
- Procedure interest (All-on-X = HOT)
- Urgency keywords
- Location matching

Include RAG for patient context from HubSpot."
```

**Expected**: GPT-4o Integration Expert provides scoring patterns and RAG implementation.

## 🔧 Configuration Tips

### Personal Settings

Create `.claude/settings.local.json` for your preferences:

```json
{
  "model": "claude-opus-4",
  "hooks": {
    "enabled": false
  }
}
```

### Enable Hooks (Optional)

After reviewing hook scripts in `.claude/hooks/`:

```json
{
  "hooks": {
    "enabled": true,
    "allowedHooks": ["secret-scanner", "file-size-monitor"]
  }
}
```

## 📊 Productivity Checklist

After 1 week, you should be:

- [ ] Using skills naturally (mention keywords, they activate)
- [ ] Using `/analyze-tokens` before large data conversations
- [ ] Converting uniform datasets to TOON (30-60% savings)
- [ ] Getting architecture guidance from MedicalCor Expert
- [ ] Checking HIPAA/GDPR compliance automatically

## 🎯 Advanced Usage (After 1 Week)

- [ ] Create a custom skill for your domain
- [ ] Install community skills from SkillsMP
- [ ] Enable and customize hooks
- [ ] Contribute improvements to `.claude/` config

## 🆘 Getting Help

### Within Claude Code

Ask the experts:

```
"How do I configure settings?" → Settings Expert
"Create a new skill for X" → Skill Builder
"Build a slash command for Y" → Command Builder
```

### External Resources

- **Quick Issues**: Check [Troubleshooting](../docs/README/CLAUDE_CODE_SETUP.md#troubleshooting)
- **Configuration**: Run `./.claude/scripts/validate-config.sh`
- **Skills**: Browse [DIRECTORY.md](./.claude/DIRECTORY.md)
- **TOON**: See [toon-guide.md](./.claude/utils/toon/toon-guide.md)

## ✨ Pro Tips

1. **Start conversations with "I'm working on..."**
   - Provides context for skill activation

2. **Use domain vocabulary**
   - "aggregate", "port", "adapter" → architecture skills
   - "PHI", "consent", "GDPR" → compliance skills

3. **Paste code for reviews**
   - Skills provide context-aware suggestions

4. **Use `/analyze-tokens` liberally**
   - See savings before converting

5. **Keep TOON for conversations only**
   - Don't store TOON in codebase (JSON remains source of truth)

## 🎓 Certification

You're certified when you can:

- ✅ Activate 3+ skills naturally in a conversation
- ✅ Use `/convert-to-toon` to save 40%+ tokens
- ✅ Get architecture guidance without prompting
- ✅ Validate configuration with validation script
- ✅ Create a custom skill for your domain

## 📈 Metrics

Track your Claude Code adoption:

| Week | Goal | Metric |
|------|------|--------|
| 1 | Setup & Learn | Complete checklist, try all commands |
| 2 | Daily Usage | Use skills 5+ times, convert 3+ files to TOON |
| 3 | Customization | Create 1 custom skill, install 2 from marketplace |
| 4 | Mastery | Enable hooks, contribute improvements |

---

## Summary

**Minimum to start**: 
1. Read [Quick Reference](./.claude/QUICK_REFERENCE.md)
2. Run `./.claude/scripts/validate-config.sh`
3. Try one skill activation
4. Start building!

**Time investment**: 30 minutes to productive, 1 week to expert

**ROI**: 
- 30-60% token savings on large datasets
- Instant access to 6 domain experts
- Automated compliance checks
- Faster development with patterns

---

Welcome to Claude Code on MedicalCor! 🎉

Questions? Ask in conversations: "How do I use [feature]?"
The relevant expert skill will activate automatically.
