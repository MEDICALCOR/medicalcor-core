# Database Module
#
# Cloud-agnostic database configuration supporting PostgreSQL with pgvector.
# HIPAA-compliant with encryption at rest and in transit.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

# ============================================================================
# VARIABLES
# ============================================================================

variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "region" {
  description = "AWS region"
  type        = string
}

variable "database_name" {
  description = "Database name"
  type        = string
}

variable "instance_class" {
  description = "Database instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "storage_size_gb" {
  description = "Storage size in GB"
  type        = number
  default     = 20
}

variable "high_availability" {
  description = "Enable high availability"
  type        = bool
  default     = false
}

variable "multi_az" {
  description = "Enable Multi-AZ deployment"
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "Backup retention in days"
  type        = number
  default     = 7
}

variable "encryption_enabled" {
  description = "Enable encryption at rest"
  type        = bool
  default     = true
}

variable "performance_insights" {
  description = "Enable Performance Insights"
  type        = bool
  default     = false
}

variable "enable_pgvector" {
  description = "Enable pgvector extension"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}

# ============================================================================
# LOCALS
# ============================================================================

locals {
  db_identifier = "${var.name_prefix}-postgres"
  is_production = var.environment == "production"
}

# ============================================================================
# RANDOM PASSWORD
# ============================================================================

resource "random_password" "master_password" {
  length  = 32
  special = false
}

# ============================================================================
# PARAMETER GROUP
# ============================================================================

resource "aws_db_parameter_group" "main" {
  name   = "${local.db_identifier}-params"
  family = "postgres15"

  # Enable pgvector extension
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements,pgvector"
  }

  # Connection settings
  parameter {
    name  = "max_connections"
    value = local.is_production ? "200" : "100"
  }

  # Memory settings
  parameter {
    name  = "work_mem"
    value = local.is_production ? "262144" : "65536"  # KB
  }

  parameter {
    name  = "maintenance_work_mem"
    value = local.is_production ? "524288" : "131072"  # KB
  }

  # WAL settings for durability
  parameter {
    name  = "synchronous_commit"
    value = "on"
  }

  # Logging (HIPAA compliance)
  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_statement"
    value = "ddl"
  }

  tags = var.tags
}

# ============================================================================
# SUBNET GROUP
# ============================================================================

data "aws_subnets" "database" {
  filter {
    name   = "tag:Tier"
    values = ["database"]
  }
}

resource "aws_db_subnet_group" "main" {
  name       = "${local.db_identifier}-subnet-group"
  subnet_ids = data.aws_subnets.database.ids

  tags = merge(var.tags, {
    Name = "${local.db_identifier}-subnet-group"
  })
}

# ============================================================================
# SECURITY GROUP
# ============================================================================

data "aws_vpc" "main" {
  filter {
    name   = "tag:Name"
    values = ["${var.name_prefix}-vpc"]
  }
}

resource "aws_security_group" "database" {
  name        = "${local.db_identifier}-sg"
  description = "Security group for OSAX database"
  vpc_id      = data.aws_vpc.main.id

  # Allow PostgreSQL from within VPC
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.main.cidr_block]
    description = "PostgreSQL from VPC"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = merge(var.tags, {
    Name = "${local.db_identifier}-sg"
  })
}

# ============================================================================
# KMS KEY FOR ENCRYPTION
# ============================================================================

resource "aws_kms_key" "database" {
  count = var.encryption_enabled ? 1 : 0

  description             = "KMS key for ${local.db_identifier} encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Name = "${local.db_identifier}-kms"
  })
}

resource "aws_kms_alias" "database" {
  count = var.encryption_enabled ? 1 : 0

  name          = "alias/${local.db_identifier}"
  target_key_id = aws_kms_key.database[0].key_id
}

# ============================================================================
# RDS INSTANCE
# ============================================================================

resource "aws_db_instance" "main" {
  identifier = local.db_identifier

  # Engine
  engine               = "postgres"
  engine_version       = "15.4"
  instance_class       = var.instance_class

  # Storage
  allocated_storage     = var.storage_size_gb
  max_allocated_storage = var.storage_size_gb * 4  # Auto-scaling
  storage_type          = "gp3"
  storage_encrypted     = var.encryption_enabled
  kms_key_id           = var.encryption_enabled ? aws_kms_key.database[0].arn : null

  # Database
  db_name  = var.database_name
  username = "osax_admin"
  password = random_password.master_password.result
  port     = 5432

  # Network
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.database.id]
  publicly_accessible    = false

  # High availability
  multi_az = var.multi_az

  # Backup (HIPAA requirement)
  backup_retention_period = var.backup_retention_days
  backup_window           = "03:00-04:00"

  # Maintenance
  maintenance_window         = "Mon:04:00-Mon:05:00"
  auto_minor_version_upgrade = true

  # Parameters
  parameter_group_name = aws_db_parameter_group.main.name

  # Performance
  performance_insights_enabled          = var.performance_insights
  performance_insights_retention_period = var.performance_insights ? 7 : null

  # Deletion protection (production)
  deletion_protection = local.is_production
  skip_final_snapshot = !local.is_production
  final_snapshot_identifier = local.is_production ? "${local.db_identifier}-final-snapshot" : null

  tags = merge(var.tags, {
    Name = local.db_identifier
  })

  lifecycle {
    prevent_destroy = false  # Set to true in production
  }
}

# ============================================================================
# OUTPUTS
# ============================================================================

output "endpoint" {
  description = "Database endpoint"
  value       = aws_db_instance.main.endpoint
}

output "connection_string" {
  description = "Database connection string"
  value       = "postgresql://${aws_db_instance.main.username}:${random_password.master_password.result}@${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}?sslmode=require"
  sensitive   = true
}

output "database_name" {
  description = "Database name"
  value       = aws_db_instance.main.db_name
}

output "security_group_id" {
  description = "Security group ID"
  value       = aws_security_group.database.id
}
