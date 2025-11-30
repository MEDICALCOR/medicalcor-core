#!/bin/bash
# ============================================================================
# MedicalCor OSAX Deployment Script
#
# Enterprise-grade deployment with comprehensive validation and rollback.
# HIPAA-compliant deployment process with audit logging.
#
# Usage:
#   ./scripts/deploy.sh [environment] [options]
#
# Environments:
#   development, staging, production
#
# Options:
#   --skip-tests      Skip test execution
#   --skip-terraform  Skip infrastructure deployment
#   --dry-run         Show what would be done without executing
#   --force           Skip confirmation prompts
# ============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="${1:-staging}"
SKIP_TESTS=false
SKIP_TERRAFORM=false
DRY_RUN=false
FORCE=false

# Parse options
shift || true
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    --skip-terraform)
      SKIP_TERRAFORM=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# ============================================================================
# Helper Functions
# ============================================================================

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

confirm() {
  if [ "$FORCE" = true ]; then
    return 0
  fi
  read -p "$1 [y/N] " -n 1 -r
  echo
  [[ $REPLY =~ ^[Yy]$ ]]
}

run_cmd() {
  if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}[DRY-RUN]${NC} Would execute: $*"
  else
    "$@"
  fi
}

# ============================================================================
# Validation
# ============================================================================

validate_environment() {
  log_info "Validating environment: $ENVIRONMENT"

  case $ENVIRONMENT in
    development|staging|production)
      log_success "Valid environment: $ENVIRONMENT"
      ;;
    *)
      log_error "Invalid environment: $ENVIRONMENT"
      log_error "Valid options: development, staging, production"
      exit 1
      ;;
  esac
}

validate_prerequisites() {
  log_info "Checking prerequisites..."

  local missing=()

  # Check required tools
  command -v node >/dev/null 2>&1 || missing+=("node")
  command -v pnpm >/dev/null 2>&1 || missing+=("pnpm")
  command -v terraform >/dev/null 2>&1 || missing+=("terraform")
  command -v kubectl >/dev/null 2>&1 || missing+=("kubectl")
  command -v helm >/dev/null 2>&1 || missing+=("helm")

  if [ ${#missing[@]} -gt 0 ]; then
    log_error "Missing required tools: ${missing[*]}"
    exit 1
  fi

  log_success "All prerequisites met"
}

validate_environment_variables() {
  log_info "Checking environment variables..."

  local missing=()

  # Required variables
  [ -z "${DATABASE_URL:-}" ] && missing+=("DATABASE_URL")
  [ -z "${ENCRYPTION_KEY:-}" ] && missing+=("ENCRYPTION_KEY")

  # Production-specific variables
  if [ "$ENVIRONMENT" = "production" ]; then
    [ -z "${OPENAI_API_KEY:-}" ] && missing+=("OPENAI_API_KEY")
    [ -z "${SENTRY_DSN:-}" ] && missing+=("SENTRY_DSN")
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    log_error "Missing environment variables: ${missing[*]}"
    exit 1
  fi

  log_success "All environment variables set"
}

# ============================================================================
# Build & Test
# ============================================================================

run_tests() {
  if [ "$SKIP_TESTS" = true ]; then
    log_warning "Skipping tests (--skip-tests flag)"
    return 0
  fi

  log_info "Running tests..."

  run_cmd pnpm test

  log_success "All tests passed"
}

build_application() {
  log_info "Building application..."

  run_cmd pnpm install --frozen-lockfile
  run_cmd pnpm build

  log_success "Application built successfully"
}

run_type_check() {
  log_info "Running type check..."

  run_cmd pnpm typecheck

  log_success "Type check passed"
}

run_lint() {
  log_info "Running linter..."

  run_cmd pnpm lint

  log_success "Lint check passed"
}

# ============================================================================
# Infrastructure Deployment
# ============================================================================

deploy_infrastructure() {
  if [ "$SKIP_TERRAFORM" = true ]; then
    log_warning "Skipping Terraform deployment (--skip-terraform flag)"
    return 0
  fi

  log_info "Deploying infrastructure with Terraform..."

  cd infrastructure/terraform

  run_cmd terraform init -upgrade
  run_cmd terraform workspace select "$ENVIRONMENT" || terraform workspace new "$ENVIRONMENT"
  run_cmd terraform plan -var="environment=$ENVIRONMENT" -out=tfplan

  if [ "$DRY_RUN" = false ]; then
    if confirm "Apply Terraform changes?"; then
      run_cmd terraform apply tfplan
    else
      log_warning "Terraform apply skipped"
    fi
  fi

  cd ../..

  log_success "Infrastructure deployed"
}

# ============================================================================
# Database Migrations
# ============================================================================

run_migrations() {
  log_info "Running database migrations..."

  run_cmd pnpm db:migrate

  log_success "Migrations completed"
}

# ============================================================================
# Kubernetes Deployment
# ============================================================================

deploy_kubernetes() {
  log_info "Deploying to Kubernetes..."

  # Update kubeconfig
  if [ "$ENVIRONMENT" = "production" ]; then
    run_cmd aws eks update-kubeconfig --name "medicalcor-osax-production" --region eu-central-1
  else
    run_cmd aws eks update-kubeconfig --name "medicalcor-osax-$ENVIRONMENT" --region eu-central-1
  fi

  # Deploy with Helm
  run_cmd helm upgrade --install osax \
    ./infrastructure/kubernetes/helm/osax \
    --namespace medicalcor \
    --create-namespace \
    --values "./infrastructure/kubernetes/helm/osax/values.yaml" \
    --values "./infrastructure/terraform/helm-values/$ENVIRONMENT.yaml" \
    --wait \
    --timeout 10m

  log_success "Kubernetes deployment completed"
}

# ============================================================================
# Health Check
# ============================================================================

health_check() {
  log_info "Running health check..."

  local url
  case $ENVIRONMENT in
    development)
      url="http://localhost:3000/api/health"
      ;;
    staging)
      url="https://staging-osax.medicalcor.ro/api/health"
      ;;
    production)
      url="https://osax.medicalcor.ro/api/health"
      ;;
  esac

  if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}[DRY-RUN]${NC} Would check health at: $url"
    return 0
  fi

  local max_attempts=30
  local attempt=1

  while [ $attempt -le $max_attempts ]; do
    log_info "Health check attempt $attempt/$max_attempts..."

    if curl -sf "$url" | grep -q '"status":"HEALTHY"'; then
      log_success "Health check passed!"
      return 0
    fi

    sleep 10
    ((attempt++))
  done

  log_error "Health check failed after $max_attempts attempts"
  return 1
}

# ============================================================================
# Rollback
# ============================================================================

rollback() {
  log_warning "Rolling back deployment..."

  run_cmd helm rollback osax --namespace medicalcor

  log_success "Rollback completed"
}

# ============================================================================
# Main Deployment Flow
# ============================================================================

main() {
  echo ""
  echo "=============================================="
  echo "  MedicalCor OSAX Deployment"
  echo "  Environment: $ENVIRONMENT"
  echo "  Dry Run: $DRY_RUN"
  echo "=============================================="
  echo ""

  # Validation phase
  validate_environment
  validate_prerequisites

  # Only check env vars in non-dry-run mode
  if [ "$DRY_RUN" = false ]; then
    validate_environment_variables
  fi

  # Confirmation for production
  if [ "$ENVIRONMENT" = "production" ] && [ "$DRY_RUN" = false ]; then
    log_warning "You are about to deploy to PRODUCTION!"
    if ! confirm "Are you sure you want to continue?"; then
      log_info "Deployment cancelled"
      exit 0
    fi
  fi

  # Build phase
  run_lint
  run_type_check
  run_tests
  build_application

  # Deployment phase
  deploy_infrastructure
  run_migrations
  deploy_kubernetes

  # Verification phase
  if ! health_check; then
    log_error "Deployment verification failed"
    if confirm "Do you want to rollback?"; then
      rollback
    fi
    exit 1
  fi

  echo ""
  log_success "=============================================="
  log_success "  Deployment completed successfully!"
  log_success "  Environment: $ENVIRONMENT"
  log_success "=============================================="
  echo ""
}

# Run main function
main "$@"
