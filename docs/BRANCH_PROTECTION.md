# Branch Protection Rules

This document describes the required branch protection settings for production-ready CI/CD.
These rules must be configured in GitHub repository settings.

## Protected Branches

### `main` Branch

The `main` branch is the production branch and requires the strictest protections.

#### Required Settings

```yaml
# GitHub Branch Protection Rules for 'main'
protection_rules:
  main:
    # Require pull request reviews
    required_pull_request_reviews:
      dismiss_stale_reviews: true
      require_code_owner_reviews: true
      required_approving_review_count: 2
      require_last_push_approval: true

    # Require status checks
    required_status_checks:
      strict: true # Require branches to be up to date
      contexts:
        - 'CI Success'
        - 'Lint'
        - 'Type Check'
        - 'Test'
        - 'E2E Tests (1/2)'
        - 'E2E Tests (2/2)'
        - 'Build'
        - 'Security Scan'
        - 'Secrets Scan'
        - 'Schema Validation'

    # Require conversation resolution
    required_conversation_resolution: true

    # Require signed commits
    required_signatures: true

    # Enforce for administrators
    enforce_admins: true

    # Restrict who can push
    restrictions:
      users: []
      teams:
        - engineering-leads
        - devops

    # Do not allow force pushes
    allow_force_pushes: false

    # Do not allow deletions
    allow_deletions: false

    # Allow creating merge commits only
    required_linear_history: false

    # Lock branch (no direct commits)
    lock_branch: false
```

### `staging` Branch

The staging branch has slightly relaxed rules for faster iteration.

```yaml
protection_rules:
  staging:
    required_pull_request_reviews:
      dismiss_stale_reviews: true
      require_code_owner_reviews: false
      required_approving_review_count: 1

    required_status_checks:
      strict: false
      contexts:
        - 'CI Success'
        - 'Lint'
        - 'Type Check'
        - 'Test'
        - 'Build'

    required_conversation_resolution: true
    required_signatures: false
    enforce_admins: false
    allow_force_pushes: false
    allow_deletions: false
```

## Rulesets (Modern Approach)

For repositories using the newer Rulesets feature:

```yaml
rulesets:
  - name: 'Production Protection'
    target: branch
    enforcement: active
    conditions:
      ref_name:
        include:
          - 'refs/heads/main'
    rules:
      - type: pull_request
        parameters:
          required_approving_review_count: 2
          dismiss_stale_reviews_on_push: true
          require_code_owner_review: true
          require_last_push_approval: true

      - type: required_status_checks
        parameters:
          strict_required_status_checks_policy: true
          required_status_checks:
            - context: 'CI Success'
              integration_id: null
            - context: 'Security Scan'
              integration_id: null

      - type: non_fast_forward

      - type: required_signatures

      - type: required_deployments
        parameters:
          required_deployment_environments:
            - staging
```

## Required GitHub Environments

### Staging Environment

```yaml
environments:
  staging:
    wait_timer: 0
    reviewers: []
    deployment_branch_policy:
      protected_branches: true
    variables:
      GCP_REGION: europe-west3
```

### Production Environment

```yaml
environments:
  production:
    wait_timer: 0
    reviewers:
      - teams:
          - engineering-leads
          - devops
    deployment_branch_policy:
      protected_branches: true
    variables:
      GCP_REGION: europe-west3
```

### Production Promote Environment

```yaml
environments:
  production-promote:
    wait_timer: 300 # 5-minute wait before promotion
    reviewers:
      - teams:
          - engineering-leads
    deployment_branch_policy:
      protected_branches: true
```

## Required Secrets

The following secrets must be configured at the repository or organization level:

### Required for CI

| Secret          | Description                  | Required |
| --------------- | ---------------------------- | -------- |
| `TURBO_TOKEN`   | Turborepo remote cache token | Optional |
| `CODECOV_TOKEN` | Codecov upload token         | Optional |

### Required for Deployment

| Secret                           | Description                               | Required |
| -------------------------------- | ----------------------------------------- | -------- |
| `GCP_PROJECT_ID`                 | Google Cloud project ID                   | Yes      |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | GCP Workload Identity Federation provider | Yes      |
| `GCP_SERVICE_ACCOUNT`            | GCP service account email                 | Yes      |
| `SLACK_WEBHOOK_URL`              | Slack webhook for notifications           | Optional |

### Required for Security

| Secret         | Description                      | Required |
| -------------- | -------------------------------- | -------- |
| `GITHUB_TOKEN` | Automatically provided by GitHub | Yes      |

## Merge Queue Configuration

For high-traffic repositories, enable merge queue:

```yaml
merge_queue:
  enabled: true
  merge_method: squash
  build_concurrency: 5
  max_entries_to_build: 10
  min_entries_to_merge: 1
  max_entries_to_merge: 5
  grouping_strategy: ALLGREEN
  entry_checks:
    - CI Success
  status_check_timeout: 60
```

## Auto-merge Settings

```yaml
auto_merge:
  enabled: true
  allowed_merge_methods:
    - squash
  delete_branch_on_merge: true
  require_squash_commit_title_pattern: "^(feat|fix|docs|style|refactor|perf|test|chore)(\\(.+\\))?!?:.+"
```

## Setup Instructions

1. Go to Repository Settings → Branches
2. Click "Add branch protection rule"
3. Set branch name pattern to `main`
4. Configure settings as described above
5. Repeat for `staging` branch with relaxed settings
6. Go to Settings → Environments
7. Create `staging`, `production`, and `production-promote` environments
8. Configure reviewers and deployment branch policies
9. Add required secrets under Settings → Secrets and variables → Actions
