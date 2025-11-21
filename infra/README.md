# MedicalCor Infrastructure

## Local Development

### Prerequisites
- Docker & Docker Compose
- pnpm 9+

### Start Services
```bash
# Start all services (API, Redis, PostgreSQL)
docker compose up -d

# Start with monitoring (Prometheus + Grafana)
docker compose --profile monitoring up -d

# Start with webhook tunnel (requires CLOUDFLARE_TUNNEL_TOKEN)
docker compose --profile tunnel up -d
```

### Access
- API: http://localhost:3000
- Prometheus: http://localhost:9090 (monitoring profile)
- Grafana: http://localhost:3001 (monitoring profile)
- PostgreSQL: localhost:5432
- Redis: localhost:6379

### Stop Services
```bash
docker compose down

# Remove volumes too
docker compose down -v
```

## Cloud Deployment (GCP)

### Prerequisites
- Terraform 1.5+
- GCP Project with billing enabled
- `gcloud` CLI authenticated

### Deploy
```bash
cd terraform

# Initialize
terraform init

# Plan
terraform plan -var="project_id=your-project-id" -var="environment=dev"

# Apply
terraform apply -var="project_id=your-project-id" -var="environment=dev"
```

### Environments
- `dev`: Minimal resources, auto-scaling to 0
- `staging`: Medium resources, always-on
- `prod`: High availability, backups, multi-region

## Database Migrations

Initial schema is in `init-db/01-init.sql` and runs automatically on first PostgreSQL start.

For subsequent migrations, use a migration tool like `dbmate` or `prisma migrate`.

## Secrets Management

### Local
Copy `.env.example` to `.env` and fill in values.

### Production
Secrets are managed via GCP Secret Manager. Update via:
```bash
gcloud secrets versions add medicalcor-hubspot-token-prod --data-file=- <<< "your-token"
```
