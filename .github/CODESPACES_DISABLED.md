# GitHub Codespaces Disabled

## Why Codespaces Are Disabled

Your organization has disabled GitHub Codespaces on this repository for security and compliance reasons.

### Compliance Requirements

MedicalCor Core is a HIPAA-compliant and GDPR-ready medical CRM platform that handles:

- Protected Health Information (PHI)
- Personally Identifiable Information (PII)
- Sensitive patient medical records
- Financial transaction data

### Security Concerns with Cloud Development

Cloud-based development environments like GitHub Codespaces introduce compliance risks:

1. **Data Residency**: Cannot guarantee data stays within compliant regions
2. **Access Control**: Increased attack surface with shared cloud infrastructure
3. **Audit Requirements**: Limited visibility into data access in cloud environments
4. **Encryption Standards**: Cannot guarantee medical-grade encryption in all cloud scenarios
5. **Third-Party Risk**: Additional processors require Business Associate Agreements (BAA)

### Organizational Policy

This restriction aligns with:

- **HIPAA Technical Safeguards** (45 CFR § 164.312)
- **GDPR Article 32** (Security of Processing)
- ISO 27001 information security standards
- SOC 2 Type II requirements

## Local Development Setup

Please set up a local development environment instead:

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/MEDICALCOR/medicalcor-core.git
cd medicalcor-core

# 2. Enable pnpm
corepack enable

# 3. Install dependencies
pnpm install

# 4. Configure environment
cp .env.example .env
# Edit .env with local configuration

# 5. Start development
pnpm dev
```

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- PostgreSQL 15+
- Local development machine with disk encryption enabled

### Complete Documentation

For detailed setup instructions and security requirements, see:

- [Development Environment Policy](../docs/README/DEVELOPMENT_ENVIRONMENT.md)
- [Contributing Guide](../docs/CONTRIBUTING.md)
- [Security Policy](../SECURITY.md)

## Need Help?

If you believe you need access to a cloud development environment for legitimate business reasons, please contact your organization administrator to discuss:

- Alternative approved cloud infrastructure
- Security exception request process
- Business Associate Agreement requirements

**Security Team**: security@medicalcor.ro
