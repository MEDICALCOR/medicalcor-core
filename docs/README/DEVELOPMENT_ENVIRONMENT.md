# Development Environment Policy

## Overview

MedicalCor Core requires local development environments only. GitHub Codespaces and other cloud-based development environments are **disabled** for security and compliance reasons.

## Why Codespaces Are Disabled

### Security & Compliance Requirements

As a HIPAA-compliant and GDPR-ready medical CRM platform, MedicalCor Core handles sensitive Protected Health Information (PHI) and Personally Identifiable Information (PII). Cloud-based development environments introduce several compliance risks:

1. **Data Residency**: Cloud development environments may store data in regions that don't meet GDPR/HIPAA requirements
2. **Access Control**: Shared cloud infrastructure increases the attack surface and potential for unauthorized access
3. **Audit Trail**: Limited visibility into who accesses PHI/PII data in cloud environments
4. **Encryption**: Cannot guarantee encryption at rest meets medical-grade standards in all cloud environments
5. **Third-Party Risk**: Introduces additional third-party processors that require Business Associate Agreements (BAA)

### Organizational Policy

Your organization has disabled GitHub Codespaces on this repository to ensure:

- All development occurs in controlled, auditable environments
- PHI/PII data never leaves approved infrastructure
- Compliance with HIPAA Technical Safeguards (45 CFR § 164.312)
- Compliance with GDPR Article 32 (Security of Processing)

## Local Development Setup

### Prerequisites

- **Node.js** >= 20.0.0 ([Download](https://nodejs.org/))
- **pnpm** >= 9.0.0 (installed via `corepack enable`)
- **PostgreSQL** 15+ ([Download](https://www.postgresql.org/download/))
- **Redis** 7+ (optional, for caching)
- **Docker** (optional, for Supabase local development)

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/MEDICALCOR/medicalcor-core.git
cd medicalcor-core

# 2. Enable pnpm via corepack
corepack enable

# 3. Install dependencies
pnpm install

# 4. Copy environment file and configure
cp .env.example .env
# Edit .env with your local configuration

# 5. Start development servers
pnpm dev

# API Gateway: http://localhost:3000
# Web Dashboard: http://localhost:3001
# Supabase Studio: http://localhost:54323
```

### Environment Configuration

The `.env` file must be configured with:

- Database connection strings (local PostgreSQL)
- API keys for integrations (development/sandbox accounts only)
- Webhook secrets (generate locally, never use production values)
- Redis connection (if using caching features)

**⚠️ IMPORTANT**: Never commit the `.env` file. Use `.env.example` as a template.

### Database Setup

```bash
# Option 1: Local PostgreSQL
# Configure DATABASE_URL in .env pointing to local instance

# Option 2: Supabase Local Development
# Requires Docker
pnpm db:reset  # Sets up local Supabase instance
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage
```

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm build --filter=@medicalcor/api
```

## IDE Recommendations

### VS Code

Install recommended extensions:

- ESLint (`dbaeumer.vscode-eslint`)
- Prettier (`esbenp.prettier-vscode`)
- Tailwind CSS IntelliSense (`bradlc.vscode-tailwindcss`)
- Prisma (`prisma.prisma`)
- Vitest (`vitest.explorer`)

Configure VS Code settings:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

### JetBrains IDEs (WebStorm, IntelliJ IDEA)

1. Enable Node.js integration
2. Set TypeScript version to workspace version
3. Enable ESLint and Prettier
4. Configure auto-import with relative paths

## Security Best Practices

When developing locally:

1. **Never use production credentials** - Always use development/sandbox accounts
2. **Enable disk encryption** - Use FileVault (macOS), BitLocker (Windows), or LUKS (Linux)
3. **Use strong passwords** - For database and Redis instances
4. **Keep dependencies updated** - Run `pnpm update` regularly
5. **Review security guidelines** - See [SECURITY.md](../../docs/README/SECURITY.md)

## Troubleshooting

### Port Already in Use

```bash
# Find and kill process using port 3000
lsof -ti:3000 | xargs kill -9

# Or change port in .env
API_PORT=3010
WEB_PORT=3011
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
psql -U postgres -c "SELECT version();"

# Check connection string in .env
# Format: postgresql://user:password@localhost:5432/database
```

### Module Not Found Errors

```bash
# Clear cache and reinstall
rm -rf node_modules .turbo
pnpm install
```

## Need Help?

- Review [CONTRIBUTING.md](../../docs/CONTRIBUTING.md) for development workflow
- Check [ARCHITECTURE.md](../../docs/ARCHITECTURE.md) for system design
- Consult [API_REFERENCE.md](../../docs/README/API_REFERENCE.md) for API documentation

## Contact

For development environment questions or access issues, contact your organization administrator.
