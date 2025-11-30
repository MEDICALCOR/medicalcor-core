# MedicalCor OSAX Infrastructure
#
# Cloud-agnostic Terraform configuration for OSAX platform.
# Supports AWS, Azure, and GCP through provider abstraction.
#
# HIPAA Compliance: All resources configured for healthcare data requirements.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Remote state configuration
  # Uncomment and configure for production
  # backend "s3" {
  #   bucket         = "medicalcor-terraform-state"
  #   key            = "osax/terraform.tfstate"
  #   region         = "eu-central-1"
  #   encrypt        = true
  #   dynamodb_table = "terraform-lock"
  # }
}

# ============================================================================
# VARIABLES
# ============================================================================

variable "cloud_provider" {
  description = "Cloud provider (aws, azure, gcp)"
  type        = string
  default     = "aws"

  validation {
    condition     = contains(["aws", "azure", "gcp"], var.cloud_provider)
    error_message = "Cloud provider must be aws, azure, or gcp."
  }
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "region" {
  description = "Primary region for deployment"
  type        = string
  default     = "eu-central-1"
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "medicalcor-osax"
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = "osax.medicalcor.ro"
}

variable "enable_high_availability" {
  description = "Enable high availability configuration"
  type        = bool
  default     = true
}

variable "enable_disaster_recovery" {
  description = "Enable disaster recovery configuration"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default = {
    Project     = "MedicalCor-OSAX"
    ManagedBy   = "Terraform"
    Compliance  = "HIPAA,GDPR"
    DataClass   = "PHI"
  }
}

# ============================================================================
# LOCAL VALUES
# ============================================================================

locals {
  # Resource naming
  name_prefix = "${var.project_name}-${var.environment}"

  # Common tags
  common_tags = merge(var.tags, {
    Environment = var.environment
    Region      = var.region
  })

  # Environment-specific configuration
  is_production = var.environment == "production"

  # Database configuration
  db_instance_class = local.is_production ? "db.r6g.large" : "db.t3.medium"
  db_storage_size   = local.is_production ? 100 : 20

  # Kubernetes configuration
  k8s_node_count = local.is_production ? 3 : 1
  k8s_node_type  = local.is_production ? "t3.large" : "t3.medium"
}

# ============================================================================
# DATA SOURCES
# ============================================================================

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# ============================================================================
# DATABASE MODULE
# ============================================================================

module "database" {
  source = "./modules/database"

  name_prefix          = local.name_prefix
  environment          = var.environment
  region               = var.region

  # Database configuration
  database_name        = "medicalcor_osax"
  instance_class       = local.db_instance_class
  storage_size_gb      = local.db_storage_size

  # High availability
  high_availability    = var.enable_high_availability
  multi_az             = local.is_production

  # Backup configuration (HIPAA requirement)
  backup_retention_days = local.is_production ? 35 : 7

  # Encryption (HIPAA requirement)
  encryption_enabled   = true

  # Monitoring
  performance_insights = local.is_production

  # Extensions
  enable_pgvector      = true

  tags = local.common_tags
}

# ============================================================================
# KUBERNETES MODULE
# ============================================================================

module "kubernetes" {
  source = "./modules/kubernetes"

  name_prefix    = local.name_prefix
  environment    = var.environment
  region         = var.region

  # Cluster configuration
  cluster_name   = "${local.name_prefix}-eks"
  kubernetes_version = "1.28"

  # Node configuration
  node_pools = [
    {
      name           = "default"
      instance_type  = local.k8s_node_type
      min_nodes      = local.is_production ? 3 : 1
      max_nodes      = local.is_production ? 10 : 3
      disk_size_gb   = 100
      labels = {
        "workload-type" = "general"
      }
    },
    {
      name           = "ml"
      instance_type  = local.is_production ? "g4dn.xlarge" : "t3.large"
      min_nodes      = 0
      max_nodes      = local.is_production ? 5 : 1
      disk_size_gb   = 200
      labels = {
        "workload-type" = "ml"
      }
      taints = [{
        key    = "workload-type"
        value  = "ml"
        effect = "NoSchedule"
      }]
    }
  ]

  # Networking
  enable_private_endpoint = local.is_production

  tags = local.common_tags
}

# ============================================================================
# HELM RELEASES
# ============================================================================

resource "helm_release" "osax" {
  name       = "osax"
  namespace  = "medicalcor"
  repository = "https://charts.medicalcor.ro"
  chart      = "osax"
  version    = "3.0.0"

  create_namespace = true

  # Wait for deployment
  wait    = true
  timeout = 600

  values = [
    templatefile("${path.module}/helm-values/${var.environment}.yaml", {
      domain_name     = var.domain_name
      region          = var.region
      environment     = var.environment
      replica_count   = local.is_production ? 3 : 1
    })
  ]

  set_sensitive {
    name  = "database.connectionString"
    value = module.database.connection_string
  }

  set_sensitive {
    name  = "secrets.encryptionKey"
    value = random_password.encryption_key.result
  }

  depends_on = [
    module.kubernetes,
    module.database
  ]
}

# ============================================================================
# SECRETS
# ============================================================================

resource "random_password" "encryption_key" {
  length  = 32
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = true
}

# ============================================================================
# OUTPUTS
# ============================================================================

output "database_endpoint" {
  description = "Database connection endpoint"
  value       = module.database.endpoint
  sensitive   = true
}

output "database_connection_string" {
  description = "Database connection string"
  value       = module.database.connection_string
  sensitive   = true
}

output "kubernetes_cluster_endpoint" {
  description = "Kubernetes cluster endpoint"
  value       = module.kubernetes.cluster_endpoint
  sensitive   = true
}

output "kubernetes_cluster_name" {
  description = "Kubernetes cluster name"
  value       = module.kubernetes.cluster_name
}

output "application_url" {
  description = "Application URL"
  value       = "https://${var.domain_name}"
}

output "environment" {
  description = "Deployed environment"
  value       = var.environment
}

output "region" {
  description = "Deployed region"
  value       = var.region
}
