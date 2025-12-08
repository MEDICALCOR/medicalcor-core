# ADR-002: Cloud-Agnostic Multi-Cloud Strategy

## Status

**ACCEPTED** - 2024-11-30

## Context

MedicalCor operates in the healthcare sector with strict data residency requirements:

1. **GDPR Compliance**: Patient data must remain within EU boundaries
2. **Business Continuity**: DR requirements mandate multi-region capability
3. **Vendor Risk**: Single cloud provider dependency creates business risk
4. **Cost Optimization**: Ability to leverage competitive pricing across providers

Current challenges:

- Lock-in to specific cloud services (e.g., AWS-specific APIs)
- DR limited to single cloud provider regions
- Difficult to negotiate pricing without alternatives
- Compliance audits complicated by proprietary services

## Decision

Adopt a **Cloud-Agnostic Multi-Cloud Strategy** using open standards and abstractions:

### Infrastructure Principles

```
┌─────────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                            │
│              (Cloud-agnostic business logic)                    │
└─────────────────────────────────────────────────────────────────┘
                               │
                    Terraform Abstraction
                               │
┌──────────────┬───────────────┼───────────────┬──────────────────┐
│     AWS      │    Azure      │    GCP        │   On-Premise     │
│  ┌────────┐  │  ┌────────┐   │  ┌────────┐   │   ┌────────┐     │
│  │  EKS   │  │  │  AKS   │   │  │  GKE   │   │   │  K8s   │     │
│  │  RDS   │  │  │ AzSQL  │   │  │ Cloud  │   │   │ Postgres│    │
│  │  S3    │  │  │ Blob   │   │  │ SQL    │   │   │ MinIO  │     │
│  └────────┘  │  └────────┘   │  │ GCS    │   │   └────────┘     │
│              │               │  └────────┘   │                  │
└──────────────┴───────────────┴───────────────┴──────────────────┘
```

### Technology Choices

| Layer                   | Technology                | Rationale                              |
| ----------------------- | ------------------------- | -------------------------------------- |
| IaC                     | Terraform                 | Multi-cloud support, declarative       |
| Container Orchestration | Kubernetes                | Universal across all clouds            |
| Database                | PostgreSQL                | Available everywhere, pgvector support |
| Object Storage          | S3-compatible             | MinIO for on-prem, native for cloud    |
| Observability           | OpenTelemetry             | Vendor-neutral telemetry               |
| Secrets                 | External Secrets Operator | Works with any vault                   |
| CI/CD                   | GitHub Actions            | Cloud-agnostic, portable workflows     |

### Terraform Module Structure

```hcl
# Abstraction layer
module "database" {
  source         = "./modules/database"
  cloud_provider = var.cloud_provider  # "aws", "azure", "gcp"
  environment    = var.environment
  # ... cloud-agnostic parameters
}

# Provider-specific implementation hidden in module
```

### Kubernetes Standardization

- Helm charts for all deployments
- No cloud-specific annotations in core charts
- Environment-specific values files for cloud features
- Service mesh (Istio) for cross-cloud networking

## Consequences

### Positive

- **No Vendor Lock-in**: Can migrate between clouds within weeks
- **Multi-Region DR**: Failover to different cloud provider possible
- **Negotiation Leverage**: Can credibly threaten provider switch
- **GDPR Compliance**: Deploy to any EU region on any provider
- **Developer Experience**: Consistent tooling regardless of target cloud

### Negative

- **Cannot Use Cloud-Native Features**: No Lambda, Cloud Functions, etc.
- **More Complex Terraform**: Abstraction layers add complexity
- **Potential Performance Trade-offs**: Native services may be faster
- **Additional Testing**: Must verify on multiple cloud providers

### Neutral

- **Standardized Operations**: Same procedures everywhere
- **Team Skills**: Cloud-generic skills are more portable

## Cost Analysis

| Scenario                   | Monthly Cost | Notes                    |
| -------------------------- | ------------ | ------------------------ |
| Single Cloud (AWS)         | €2,000       | Baseline                 |
| Multi-Cloud Active-Passive | €2,600       | +30% for standby         |
| Multi-Cloud Active-Active  | €3,200       | +60% for full redundancy |

**ROI Justification**:

- Avoided vendor lock-in migration: €50,000+ (industry average)
- Negotiation savings: 15-25% on committed spend
- Compliance audit simplification: 40 hours/audit saved

## Alternatives Considered

### 1. Full AWS Native

**Rejected**: Creates unacceptable vendor lock-in risk for healthcare platform with 10+ year horizon.

### 2. Hybrid with Some Cloud-Native Services

**Partially Adopted**: Use managed Kubernetes (EKS/AKS/GKE) while keeping application portable.

### 3. On-Premise Only

**Rejected**: Higher operational cost, no geographic distribution for DR.

## Implementation Guidelines

1. **Terraform Rules**:
   - All resources defined in Terraform
   - Provider-specific code in modules only
   - No inline provider-specific configuration

2. **Kubernetes Rules**:
   - Helm charts must work on all providers
   - Cloud-specific features via values overlays
   - Test deployments on 2+ providers quarterly

3. **Application Rules**:
   - No cloud SDK imports in business logic
   - All cloud interaction through infrastructure adapters
   - Feature flags for provider-specific optimizations

## References

- CNCF Cloud Native Trail Map
- "Cloud Native Infrastructure" by Justin Garrison (2017)
- HashiCorp Terraform Best Practices
