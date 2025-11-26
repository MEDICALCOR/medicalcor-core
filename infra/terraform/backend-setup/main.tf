# =============================================================================
# Terraform State Backend Setup
# Run this ONCE to create the encrypted state bucket before main infrastructure
# =============================================================================
#
# Usage:
#   cd infra/terraform/backend-setup
#   terraform init
#   terraform apply -var="project_id=YOUR_PROJECT_ID"
#
# Then uncomment the backend "gcs" block in ../main.tf and run:
#   cd ../
#   terraform init -migrate-state
#
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.12"
    }
  }
}

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region for state bucket"
  type        = string
  default     = "europe-west3" # Frankfurt (GDPR compliant)
}

variable "environment" {
  description = "Environment suffix for bucket naming"
  type        = string
  default     = "prod"
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# =============================================================================
# KMS Key for Customer-Managed Encryption (CMEK)
# =============================================================================

resource "google_kms_key_ring" "terraform_state" {
  name     = "terraform-state-keyring"
  location = var.region
}

resource "google_kms_crypto_key" "terraform_state" {
  name            = "terraform-state-key"
  key_ring        = google_kms_key_ring.terraform_state.id
  rotation_period = "7776000s" # 90 days

  lifecycle {
    prevent_destroy = true
  }

  labels = {
    purpose     = "terraform-state-encryption"
    environment = var.environment
    managed_by  = "terraform"
  }
}

# =============================================================================
# State Bucket with Encryption
# =============================================================================

resource "google_storage_bucket" "terraform_state" {
  name          = "medicalcor-terraform-state-${var.project_id}"
  location      = var.region
  force_destroy = false
  storage_class = "STANDARD"

  # SECURITY: Enable versioning for state recovery
  versioning {
    enabled = true
  }

  # SECURITY: Uniform bucket-level access (no ACLs)
  uniform_bucket_level_access = true

  # SECURITY: Customer-Managed Encryption Key (CMEK)
  encryption {
    default_kms_key_name = google_kms_crypto_key.terraform_state.id
  }

  # SECURITY: Lifecycle rules for old versions
  lifecycle_rule {
    condition {
      num_newer_versions = 10
      with_state         = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      days_since_noncurrent_time = 30
    }
    action {
      type = "Delete"
    }
  }

  # SECURITY: Prevent public access
  public_access_prevention = "enforced"

  labels = {
    purpose     = "terraform-state"
    environment = var.environment
    encryption  = "cmek"
    managed_by  = "terraform"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# =============================================================================
# IAM Bindings for State Bucket
# =============================================================================

# Grant the Cloud Storage service account access to use the KMS key
resource "google_kms_crypto_key_iam_member" "storage_service_account" {
  crypto_key_id = google_kms_crypto_key.terraform_state.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:service-${data.google_project.current.number}@gs-project-accounts.iam.gserviceaccount.com"
}

data "google_project" "current" {}

# =============================================================================
# Audit Logging for State Access
# =============================================================================

resource "google_storage_bucket_iam_audit_config" "terraform_state" {
  bucket = google_storage_bucket.terraform_state.name

  audit_log_config {
    log_type = "DATA_READ"
  }
  audit_log_config {
    log_type = "DATA_WRITE"
  }
  audit_log_config {
    log_type = "ADMIN_READ"
  }
}

# =============================================================================
# Outputs
# =============================================================================

output "state_bucket_name" {
  description = "Name of the Terraform state bucket"
  value       = google_storage_bucket.terraform_state.name
}

output "state_bucket_url" {
  description = "URL of the Terraform state bucket"
  value       = google_storage_bucket.terraform_state.url
}

output "kms_key_id" {
  description = "KMS key ID for state encryption"
  value       = google_kms_crypto_key.terraform_state.id
}

output "backend_config" {
  description = "Backend configuration to add to main.tf"
  value       = <<-EOT
    # Add this to main.tf terraform block:
    backend "gcs" {
      bucket         = "${google_storage_bucket.terraform_state.name}"
      prefix         = "core"
      encryption_key = "${google_kms_crypto_key.terraform_state.id}"
    }
  EOT
}
