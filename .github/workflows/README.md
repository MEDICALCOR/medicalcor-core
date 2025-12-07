# GitHub Actions Workflows

This directory contains GitHub Actions workflow definitions for MedicalCor Core.

## Available Workflows

### CI/CD Workflows

- **`ci.yml`** - Continuous Integration: Runs tests, linting, type checking on PRs and commits
- **`deploy.yml`** - Deployment workflow for staging and production
- **`trigger-deploy.yml`** - Manual deployment trigger
- **`rollback.yml`** - Rollback to previous deployment

### Maintenance Workflows

- **`bulk-create-issues.yml`** - Bulk create GitHub issues from YAML file
- **`dependabot-automerge.yml`** - Auto-merge Dependabot PRs
- **`release.yml`** - Create releases and changelogs

### Quality & Security

- **`codeql-analysis.yml`** - CodeQL security scanning
- **`security-ci.yml`** - Security-focused CI checks
- **`security-monitoring.yml`** - Continuous security monitoring
- **`oss-security.yml`** - Open source dependency security
- **`lighthouse-ci.yml`** - Lighthouse performance audits

### Testing & Performance

- **`smoke-tests.yml`** - Automated smoke testing
- **`performance.yml`** - Performance benchmarking with k6

### Metadata

- **`repo-meta.yml`** - Repository metadata updates

---

## Bulk Create Issues Workflow

### Overview

The `bulk-create-issues.yml` workflow enables bulk creation of GitHub issues from a YAML file. It's idempotent (skips existing issues) and supports dry-run mode.

### Usage

#### Via GitHub UI

1. Go to your repository on GitHub
2. Navigate to **Actions** → **Bulk Create Issues**
3. Click **Run workflow**
4. Fill in the inputs:
   - **backlog_file**: Path to YAML file (default: `BACKLOG.yml`)
   - **dry_run**: Set to `true` to preview without creating (default: `false`)
5. Click **Run workflow**

#### Via GitHub CLI

```bash
# Dry run with default file (BACKLOG.yml)
gh workflow run bulk-create-issues.yml -f dry_run=true

# Dry run with BACKLOG_IMPORT.yml
gh workflow run bulk-create-issues.yml \
  -f backlog_file=BACKLOG_IMPORT.yml \
  -f dry_run=true

# Actually create issues
gh workflow run bulk-create-issues.yml \
  -f backlog_file=BACKLOG_IMPORT.yml \
  -f dry_run=false
```

### Input Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `backlog_file` | Yes | `BACKLOG.yml` | Path to backlog YAML in repo |
| `dry_run` | No | `false` | If `true`, only prints what would be created |

### YAML File Format

The workflow expects a YAML file with the following structure:

#### Multi-Document Format (Recommended)

```yaml
---
title: "[H1] First Issue Title"
labels: ["priority: critical", "type: feature"]
milestone: "Sprint 1"
body: |
  ### Description
  Detailed issue description here.
  
  ### Acceptance Criteria
  - [ ] Criteria 1
  - [ ] Criteria 2
  
  ### Effort
  2-3 hours

---
title: "[H2] Second Issue Title"
labels: ["priority: high", "type: bug"]
body: |
  Bug description...
```

#### Single Document Format

```yaml
issues:
  - title: "[H1] First Issue"
    labels: ["priority: critical"]
    milestone: "Sprint 1"
    body: "Issue description"
    
  - title: "[H2] Second Issue"
    labels: ["priority: high"]
    body: "Issue description"
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Issue title |
| `body` | string | No | Issue description (supports Markdown) |
| `labels` | array | No | List of label names |
| `milestone` | string | No | Milestone title (must exist) |

### Features

1. **Idempotent**: Won't create duplicate issues
   - Checks for existing issues by exact title match
   - Skips issues that already exist

2. **Dry Run Mode**: Preview without creating
   - Shows what would be created
   - Validates YAML structure
   - No API changes made

3. **Milestone Support**: Automatically links to milestones
   - Looks up milestone by title
   - Creates issue with milestone reference
   - Skips milestone if not found (logs warning)

4. **Rate Limiting**: Includes throttling
   - 250ms delay between API calls
   - Prevents hitting GitHub rate limits

5. **Error Handling**: Robust failure handling
   - Continues on individual issue failures
   - Reports summary at end
   - Exits with failure if critical errors

### Example Output

```
[1] SKIP (exists #123): [H1] Verify Lead → LTV Event Chain
[2] CREATED #456: [H2] Wire Cognitive Memory to Agent Guidance
[3] DRY RUN create: {"title": "[H3] Add Critical E2E Tests", "labels": [...]}
...

=== SUMMARY ===
Created: 15
Skipped (already existed): 14
Dry run: true
```

### Example: Import BACKLOG_IMPORT.yml

The repository includes `BACKLOG_IMPORT.yml` with 29 pre-defined issues ready for import:

```bash
# 1. Dry run first (recommended)
gh workflow run bulk-create-issues.yml \
  -f backlog_file=BACKLOG_IMPORT.yml \
  -f dry_run=true

# 2. Review the workflow logs

# 3. Actually create the issues
gh workflow run bulk-create-issues.yml \
  -f backlog_file=BACKLOG_IMPORT.yml \
  -f dry_run=false
```

This will create:
- 8 critical priority (P0) issues for Sprint 1
- 13 high priority (P1) issues for Sprint 2
- 8 low priority (P2) issues for Sprint 3

### Permissions

The workflow requires:
- `contents: read` - Read repository files
- `issues: write` - Create and update issues

These are automatically provided by `${{ secrets.GITHUB_TOKEN }}`.

### Troubleshooting

#### Issue Already Exists
✅ **Expected behavior** - The workflow skips existing issues by design.

#### Milestone Not Found
⚠️ **Warning logged** - Issue created without milestone. Create the milestone first or remove from YAML.

#### Invalid YAML
❌ **Fails with parse error** - Validate YAML syntax:
```bash
# Replace 'your-backlog.yml' with your actual filename
python -c "import yaml; yaml.safe_load(open('your-backlog.yml'))"

# Example with BACKLOG_IMPORT.yml
python -c "import yaml; yaml.safe_load(open('BACKLOG_IMPORT.yml'))"
```

#### Rate Limiting
⚠️ **Increase delays** - Modify the `time.sleep(0.25)` value in the workflow if needed.

#### Authentication Issues
❌ **Check token permissions** - Ensure `GITHUB_TOKEN` has `issues: write` permission.

### Best Practices

1. **Always dry run first**: Test with `dry_run=true` before creating issues
2. **Use unique titles**: Issues are identified by exact title match
3. **Create milestones first**: Ensure referenced milestones exist
4. **Label consistency**: Use existing label names (case-sensitive)
5. **Markdown formatting**: Use proper Markdown in `body` field
6. **Batch size**: Keep under 100 issues per run to avoid rate limits

### Creating Your Own Backlog File

```yaml
---
title: "[P0] Critical Production Issue"
labels: ["priority: critical", "type: bug", "area: api"]
milestone: "Q1 2025"
body: |
  ## Problem
  Describe the issue...
  
  ## Impact
  Production users affected...
  
  ## Solution
  Proposed fix...
  
  ## Acceptance Criteria
  - [ ] Fix implemented
  - [ ] Tests added
  - [ ] Deployed to production

---
title: "[P1] Feature Request"
labels: ["priority: high", "type: feature"]
body: |
  Feature description...
```

### Related Files

- **Workflow**: `.github/workflows/bulk-create-issues.yml`
- **Example Backlog**: `BACKLOG_IMPORT.yml` (29 issues)
- **Alternative**: `BACKLOG.yml` (if exists)

### Security

- **No secrets required**: Uses built-in `GITHUB_TOKEN`
- **No external API calls**: Only GitHub API
- **Idempotent**: Safe to re-run
- **Dry run available**: Preview before creating

---

For more information about other workflows, see individual workflow files in this directory.
