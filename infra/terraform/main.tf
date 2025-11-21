# =============================================================================
# MedicalCor Core Infrastructure
# Terraform configuration for cloud deployment
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state configuration (uncomment for production)
  # backend "gcs" {
  #   bucket = "medicalcor-terraform-state"
  #   prefix = "core"
  # }
}

# =============================================================================
# Variables
# =============================================================================

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "europe-west3" # Frankfurt (GDPR compliant)
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "api_image" {
  description = "Docker image for API service"
  type        = string
  default     = "gcr.io/medicalcor/api:latest"
}

# =============================================================================
# Provider Configuration
# =============================================================================

provider "google" {
  project = var.project_id
  region  = var.region
}

# =============================================================================
# Networking
# =============================================================================

resource "google_compute_network" "vpc" {
  name                    = "medicalcor-vpc-${var.environment}"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name          = "medicalcor-subnet-${var.environment}"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id

  private_ip_google_access = true
}

# =============================================================================
# Cloud Run Service (API)
# =============================================================================

resource "google_cloud_run_v2_service" "api" {
  name     = "medicalcor-api-${var.environment}"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    containers {
      image = var.api_image

      ports {
        container_port = 3000
      }

      env {
        name  = "NODE_ENV"
        value = var.environment == "prod" ? "production" : "development"
      }

      env {
        name  = "LOG_LEVEL"
        value = var.environment == "prod" ? "warn" : "info"
      }

      # Secrets from Secret Manager
      env {
        name = "HUBSPOT_ACCESS_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.hubspot_token.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "WHATSAPP_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.whatsapp_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "STRIPE_WEBHOOK_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.stripe_secret.secret_id
            version = "latest"
          }
        }
      }

      resources {
        limits = {
          cpu    = var.environment == "prod" ? "2" : "1"
          memory = var.environment == "prod" ? "1Gi" : "512Mi"
        }
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 3000
        }
        initial_delay_seconds = 10
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/live"
          port = 3000
        }
        period_seconds    = 30
        timeout_seconds   = 5
        failure_threshold = 3
      }
    }

    scaling {
      min_instance_count = var.environment == "prod" ? 1 : 0
      max_instance_count = var.environment == "prod" ? 10 : 2
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_secret_manager_secret_version.hubspot_token,
    google_secret_manager_secret_version.whatsapp_key,
    google_secret_manager_secret_version.stripe_secret,
  ]
}

# =============================================================================
# VPC Connector (for Cloud SQL access)
# =============================================================================

resource "google_vpc_access_connector" "connector" {
  name          = "medicalcor-vpc-connector-${var.environment}"
  region        = var.region
  network       = google_compute_network.vpc.name
  ip_cidr_range = "10.8.0.0/28"

  min_instances = 2
  max_instances = 3
}

# =============================================================================
# Cloud SQL (PostgreSQL)
# =============================================================================

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "google_sql_database_instance" "postgres" {
  name             = "medicalcor-db-${var.environment}"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier = var.environment == "prod" ? "db-custom-2-4096" : "db-f1-micro"

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }

    backup_configuration {
      enabled                        = var.environment == "prod"
      point_in_time_recovery_enabled = var.environment == "prod"
      start_time                     = "03:00"
    }

    maintenance_window {
      day  = 7 # Sunday
      hour = 3
    }

    database_flags {
      name  = "log_min_duration_statement"
      value = "1000" # Log queries > 1 second
    }
  }

  deletion_protection = var.environment == "prod"
}

resource "google_sql_database" "database" {
  name     = "medicalcor"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "user" {
  name     = "medicalcor"
  instance = google_sql_database_instance.postgres.name
  password = random_password.db_password.result
}

# =============================================================================
# Redis (Memorystore)
# =============================================================================

resource "google_redis_instance" "cache" {
  name           = "medicalcor-redis-${var.environment}"
  tier           = var.environment == "prod" ? "STANDARD_HA" : "BASIC"
  memory_size_gb = var.environment == "prod" ? 2 : 1
  region         = var.region

  authorized_network = google_compute_network.vpc.id

  redis_version = "REDIS_7_0"
  display_name  = "MedicalCor Redis ${var.environment}"

  redis_configs = {
    maxmemory-policy = "allkeys-lru"
  }
}

# =============================================================================
# Secret Manager
# =============================================================================

resource "google_secret_manager_secret" "hubspot_token" {
  secret_id = "medicalcor-hubspot-token-${var.environment}"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "hubspot_token" {
  secret      = google_secret_manager_secret.hubspot_token.id
  secret_data = "PLACEHOLDER_REPLACE_ME"

  lifecycle {
    ignore_changes = [secret_data]
  }
}

resource "google_secret_manager_secret" "whatsapp_key" {
  secret_id = "medicalcor-whatsapp-key-${var.environment}"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "whatsapp_key" {
  secret      = google_secret_manager_secret.whatsapp_key.id
  secret_data = "PLACEHOLDER_REPLACE_ME"

  lifecycle {
    ignore_changes = [secret_data]
  }
}

resource "google_secret_manager_secret" "stripe_secret" {
  secret_id = "medicalcor-stripe-secret-${var.environment}"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "stripe_secret" {
  secret      = google_secret_manager_secret.stripe_secret.id
  secret_data = "PLACEHOLDER_REPLACE_ME"

  lifecycle {
    ignore_changes = [secret_data]
  }
}

# =============================================================================
# IAM
# =============================================================================

resource "google_service_account" "api" {
  account_id   = "medicalcor-api-${var.environment}"
  display_name = "MedicalCor API Service Account"
}

resource "google_project_iam_member" "api_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}

# =============================================================================
# Outputs
# =============================================================================

output "api_url" {
  description = "Cloud Run API URL"
  value       = google_cloud_run_v2_service.api.uri
}

output "db_connection_name" {
  description = "Cloud SQL connection name"
  value       = google_sql_database_instance.postgres.connection_name
}

output "redis_host" {
  description = "Redis host"
  value       = google_redis_instance.cache.host
}
