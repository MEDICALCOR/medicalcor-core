# Orchestrator Auto-Sync Command

Automatically syncs the orchestrator with the latest main branch before execution.

## Usage
```
/orchestrator-sync
```

## What it does

$ARGUMENTS

1. **Fetch Latest Main**
   ```bash
   git fetch origin main
   ```

2. **Check Current Branch**
   - If on feature branch: rebase on main
   - If on main: pull latest

3. **Verify Orchestrator Types**
   ```bash
   pnpm --filter @medicalcor/types typecheck
   ```

4. **Report Status**
   - Show commits behind/ahead
   - Show any conflicts
   - Confirm ready for orchestration

## Auto-Upgrade Protocol

When activated, the orchestrator will:

1. **Pre-Flight Check**
   - Verify git status is clean
   - Fetch latest from origin/main
   - Check if rebase needed

2. **Sync Execution**
   ```bash
   # Fetch latest
   git fetch origin main

   # Rebase if on feature branch
   git rebase origin/main

   # Verify types compile
   pnpm --filter @medicalcor/types build
   ```

3. **Post-Sync Validation**
   - Run layer boundary check
   - Verify orchestration types export correctly
   - Confirm all quality gates available

## Integration with Orchestrator Skill

The orchestrator skill at `.claude/skills/medicalcor/orchestrator/skill.md` will:

1. Auto-detect if behind main
2. Prompt for sync if needed
3. Ensure latest patterns are used

## Example

```
User: orchestrate the implementation of a new patient scoring feature

Orchestrator:
1. [Auto-Sync] Checking for updates...
2. [Sync] Found 3 new commits on main, rebasing...
3. [Ready] Orchestrator synced to latest (commit abc123)
4. [Analyze] Task complexity: MODERATE
5. [Dispatch] Agents: DOMAIN, ARCHITECT, QA
6. [Execute] Starting surgical execution...
```
