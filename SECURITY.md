# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

1. **DO NOT** create a public GitHub issue for security vulnerabilities
2. Email security concerns to: security@medicalcor.ro
3. Use GitHub's private vulnerability reporting feature if available

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

### Response Timeline

| Severity | Initial Response | Resolution Target |
| -------- | ---------------- | ----------------- |
| Critical | 4 hours          | 24 hours          |
| High     | 24 hours         | 7 days            |
| Medium   | 48 hours         | 30 days           |
| Low      | 1 week           | 90 days           |

## Security Practices

### Authentication & Authorization

- All API endpoints require authentication
- JWT tokens with short expiration (15 minutes access, 7 days refresh)
- Secure password hashing using bcrypt with work factor 12
- Rate limiting on authentication endpoints (5 attempts per minute)
- Account lockout after 5 failed attempts
- Multi-factor authentication (MFA) support for sensitive operations

### Data Protection

- All data encrypted at rest using AES-256-GCM
- TLS 1.3 enforced for data in transit
- Field-level encryption for PII and PHI data
- Automatic key rotation every 90 days
- Secure key storage in cloud KMS

### Infrastructure Security

- Principle of least privilege for all IAM roles
- Network segmentation with private subnets
- WAF protection on all public endpoints
- DDoS protection enabled
- Regular security patching schedule

### Compliance

This application is designed with HIPAA and GDPR compliance in mind:

**HIPAA Requirements:**

- PHI encryption at rest and in transit
- Comprehensive audit logging
- Access controls and authentication
- Backup and disaster recovery procedures
- Automatic session timeout

**GDPR Requirements:**

- Data minimization
- Right to access (data export)
- Right to erasure (data deletion)
- Data portability
- Consent management

## Development Security

### Development Environment Requirements

**⚠️ Cloud Development Environments Disabled**

For HIPAA/GDPR compliance, all development must be performed in local environments:

- **GitHub Codespaces**: Disabled (organizational policy)
- **Cloud IDEs**: Not permitted for PHI/PII data
- **Remote Development**: Only on approved infrastructure

**Required Local Security Controls:**

- Full disk encryption (FileVault, BitLocker, LUKS)
- Strong password policies
- Screen lock after 5 minutes of inactivity
- Up-to-date OS security patches
- Approved antivirus/EDR software

See [Development Environment Policy](./docs/README/DEVELOPMENT_ENVIRONMENT.md) for complete requirements.

### Code Security

- No secrets in source code
- Environment variables for configuration
- Dependency vulnerability scanning (daily)
- Static code analysis (CodeQL)
- Mandatory code review for all changes

### CI/CD Security

- Signed commits recommended
- Branch protection on main
- Required status checks before merge
- Secret scanning on all pushes
- Container image scanning
- SBOM generation for releases

### Dependency Management

- Weekly automated dependency updates via Dependabot
- Security advisory monitoring
- Lock file integrity verification
- Minimal dependency footprint

## Incident Response

### Severity Classification

| Level    | Description                           | Examples                                  |
| -------- | ------------------------------------- | ----------------------------------------- |
| Critical | Active data breach, system compromise | Unauthorized data access, credential leak |
| High     | Exploitable vulnerability             | SQL injection, auth bypass                |
| Medium   | Potential vulnerability               | XSS, CSRF without active exploitation     |
| Low      | Security improvement                  | Missing headers, weak cipher              |

### Response Procedure

1. **Detect** - Identify and confirm the incident
2. **Contain** - Limit damage and prevent spread
3. **Eradicate** - Remove the threat
4. **Recover** - Restore normal operations
5. **Learn** - Post-incident review and improvements

## Security Contacts

- Security Team: security@medicalcor.ro
- On-call: See internal documentation
- Bug Bounty: Currently not available

## Acknowledgments

We appreciate responsible disclosure and will acknowledge security researchers who help us improve our security posture.
