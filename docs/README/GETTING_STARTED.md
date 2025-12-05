# Getting Started

This guide will help you set up MedicalCor Core for local development in under 10 minutes.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Running the Application](#running-the-application)
- [Verifying Installation](#verifying-installation)
- [Next Steps](#next-steps)

---

## Prerequisites

### Required Software

| Software       | Minimum Version | Installation                                     |
| -------------- | --------------- | ------------------------------------------------ |
| Node.js        | 20.0.0          | [nodejs.org](https://nodejs.org/) or use nvm     |
| pnpm           | 9.0.0           | `npm install -g pnpm`                            |
| Docker         | 24.0            | [docker.com](https://www.docker.com/get-started) |
| Docker Compose | 2.20            | Included with Docker Desktop                     |
| Git            | 2.40            | [git-scm.com](https://git-scm.com/)              |

### Verify Prerequisites

```bash
# Check Node.js version
node --version
# Expected: v20.x.x or higher

# Check pnpm version
pnpm --version
# Expected: 9.x.x or higher

# Check Docker
docker --version
# Expected: Docker version 24.x.x or higher

# Check Docker Compose
docker compose version
# Expected: Docker Compose version v2.x.x
```

### Hardware Requirements

| Component | Minimum    | Recommended |
| --------- | ---------- | ----------- |
| RAM       | 8 GB       | 16 GB       |
| Disk      | 10 GB free | 20 GB free  |
| CPU       | 2 cores    | 4+ cores    |

---

## Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/casagest/medicalcor-core.git
cd medicalcor-core
```

### Step 2: Install Dependencies

```bash
# Install all workspace dependencies
pnpm install

# This installs dependencies for:
# - apps/api (Fastify server)
# - apps/trigger (Trigger.dev workflows)
# - apps/web (Next.js dashboard)
# - packages/* (shared libraries)
```

### Step 3: Start Infrastructure

```bash
# Start PostgreSQL and Redis containers
docker compose up -d

# Verify containers are running
docker compose ps

# Expected output:
# NAME                STATUS
# medicalcor-db       running (healthy)
# medicalcor-redis    running
```

### Step 4: Build Packages

```bash
# Build all packages (required for first run)
pnpm build
```

---

## Environment Setup

### Step 1: Create Environment File

```bash
# Copy the example environment file
cp .env.example .env
```

### Step 2: Configure Required Variables

Open `.env` and configure the following essential variables:

```bash
# ===========================================
# REQUIRED FOR LOCAL DEVELOPMENT
# ===========================================

# Application
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Database (use Docker defaults)
DATABASE_URL=postgresql://medicalcor:localdev@localhost:5432/medicalcor
POSTGRES_USER=medicalcor
POSTGRES_PASSWORD=localdev
POSTGRES_DB=medicalcor
```

### Step 3: Configure Integrations (Optional for Basic Testing)

For full functionality, configure these integrations:

```bash
# ===========================================
# INTEGRATIONS (Optional for basic testing)
# ===========================================

# HubSpot CRM
HUBSPOT_ACCESS_TOKEN=your-hubspot-token

# WhatsApp (360dialog)
WHATSAPP_API_KEY=your-whatsapp-key
WHATSAPP_VERIFY_TOKEN=your-verify-token
WHATSAPP_WEBHOOK_SECRET=your-webhook-secret

# OpenAI (for AI scoring)
OPENAI_API_KEY=sk-your-openai-key

# Stripe (payments)
STRIPE_SECRET_KEY=sk_test_your-key
STRIPE_WEBHOOK_SECRET=whsec_your-secret
```

### Environment Variable Reference

See [CONFIGURATION.md](./CONFIGURATION.md) for a complete reference of all environment variables.

---

## Running the Application

### Development Mode

```bash
# Start all services (API + Web + Trigger.dev)
pnpm dev

# Or start services individually:

# API server only (port 3000)
pnpm dev:api

# Web dashboard only (port 3001)
pnpm dev:web

# Trigger.dev workflows
pnpm dev:trigger
```

### Service URLs

| Service       | URL                   | Description     |
| ------------- | --------------------- | --------------- |
| API Server    | http://localhost:3000 | Webhook gateway |
| Web Dashboard | http://localhost:3001 | Admin interface |
| PostgreSQL    | localhost:5432        | Database        |
| Redis         | localhost:6379        | Cache           |

---

## Verifying Installation

### 1. Check API Health

```bash
curl http://localhost:3000/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 2. Check Readiness (Database + Redis)

```bash
curl http://localhost:3000/ready

# Expected response:
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

### 3. Run Tests

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Expected: All tests pass
```

### 4. Check Type Safety

```bash
# Run TypeScript type checking
pnpm typecheck

# Expected: No errors
```

### 5. Check Code Quality

```bash
# Run ESLint
pnpm lint

# Expected: No errors
```

---

## Common Setup Issues

### Issue: Docker Containers Won't Start

**Symptoms**: `docker compose up -d` fails or containers exit immediately.

**Solutions**:

```bash
# Check for port conflicts
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis

# Stop conflicting services or change ports in docker-compose.yml

# Check Docker resources
docker system df

# Clean up if needed
docker system prune -a
```

### Issue: pnpm Install Fails

**Symptoms**: Dependencies fail to install or resolve.

**Solutions**:

```bash
# Clear pnpm cache
pnpm store prune

# Remove node_modules and reinstall
rm -rf node_modules
rm -rf **/node_modules
pnpm install
```

### Issue: Build Fails

**Symptoms**: `pnpm build` throws errors.

**Solutions**:

```bash
# Ensure Node.js version is correct
node --version  # Must be 20+

# Clean build artifacts
pnpm clean

# Rebuild
pnpm build
```

### Issue: Database Connection Error

**Symptoms**: API cannot connect to PostgreSQL.

**Solutions**:

```bash
# Check if container is running
docker compose ps

# Check container logs
docker compose logs db

# Verify DATABASE_URL in .env matches docker-compose.yml settings
```

For more troubleshooting tips, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

---

## Next Steps

Now that you have MedicalCor running locally, explore these guides:

### Learn the Architecture

- [Architecture Overview](./ARCHITECTURE.md) - Understand how components interact
- [API Reference](./API_REFERENCE.md) - Explore available endpoints

### Start Developing

- [Development Guide](./DEVELOPMENT.md) - Code standards and workflows
- [Testing Guide](./TESTING.md) - How to write and run tests

### Configure Integrations

- [HubSpot Setup](./CONFIGURATION.md#hubspot-crm)
- [WhatsApp Setup](./CONFIGURATION.md#whatsapp-360dialog)
- [Stripe Setup](./CONFIGURATION.md#stripe-payments)

### Prepare for Production

- [Deployment Guide](./DEPLOYMENT.md) - Production deployment instructions
- [Security Guide](./SECURITY.md) - Security best practices

---

## Quick Command Reference

```bash
# Development
pnpm dev              # Start all services
pnpm dev:api          # Start API only
pnpm dev:web          # Start web dashboard only
pnpm dev:trigger      # Start Trigger.dev

# Building
pnpm build            # Build all packages
pnpm clean            # Clean build artifacts

# Testing
pnpm test             # Run all tests
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage

# Code Quality
pnpm lint             # Run ESLint
pnpm lint:fix         # Fix ESLint issues
pnpm typecheck        # Run TypeScript checks
pnpm format           # Format code with Prettier

# Database
docker compose up -d  # Start PostgreSQL + Redis
docker compose down   # Stop containers
docker compose logs   # View container logs

# Useful Docker Commands
docker compose ps                      # Check container status
docker compose exec db psql -U medicalcor medicalcor  # Connect to PostgreSQL
docker compose exec redis redis-cli    # Connect to Redis
```

---

## Getting Help

- **Documentation**: Browse all guides in [docs/README/](./README.md)
- **Issues**: Report bugs on [GitHub Issues](https://github.com/casagest/medicalcor-core/issues)
- **Discussions**: Ask questions on [GitHub Discussions](https://github.com/casagest/medicalcor-core/discussions)
