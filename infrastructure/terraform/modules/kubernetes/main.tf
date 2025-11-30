# Kubernetes Module
#
# Cloud-agnostic Kubernetes cluster configuration.
# Supports EKS (AWS), AKS (Azure), and GKE (GCP).

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
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

variable "cluster_name" {
  description = "Kubernetes cluster name"
  type        = string
}

variable "kubernetes_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.28"
}

variable "node_pools" {
  description = "Node pool configurations"
  type = list(object({
    name          = string
    instance_type = string
    min_nodes     = number
    max_nodes     = number
    disk_size_gb  = number
    labels        = optional(map(string), {})
    taints        = optional(list(object({
      key    = string
      value  = string
      effect = string
    })), [])
  }))
}

variable "enable_private_endpoint" {
  description = "Enable private cluster endpoint"
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
  is_production = var.environment == "production"
}

# ============================================================================
# DATA SOURCES
# ============================================================================

data "aws_vpc" "main" {
  filter {
    name   = "tag:Name"
    values = ["${var.name_prefix}-vpc"]
  }
}

data "aws_subnets" "private" {
  filter {
    name   = "tag:Tier"
    values = ["private"]
  }
}

# ============================================================================
# IAM ROLE FOR EKS CLUSTER
# ============================================================================

resource "aws_iam_role" "cluster" {
  name = "${var.cluster_name}-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "eks.amazonaws.com"
      }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.cluster.name
}

resource "aws_iam_role_policy_attachment" "vpc_resource_controller" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController"
  role       = aws_iam_role.cluster.name
}

# ============================================================================
# IAM ROLE FOR NODE GROUPS
# ============================================================================

resource "aws_iam_role" "node_group" {
  name = "${var.cluster_name}-node-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "node_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.node_group.name
}

resource "aws_iam_role_policy_attachment" "cni_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.node_group.name
}

resource "aws_iam_role_policy_attachment" "ecr_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.node_group.name
}

# ============================================================================
# SECURITY GROUP
# ============================================================================

resource "aws_security_group" "cluster" {
  name        = "${var.cluster_name}-sg"
  description = "Security group for EKS cluster"
  vpc_id      = data.aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-sg"
  })
}

# ============================================================================
# EKS CLUSTER
# ============================================================================

resource "aws_eks_cluster" "main" {
  name     = var.cluster_name
  role_arn = aws_iam_role.cluster.arn
  version  = var.kubernetes_version

  vpc_config {
    subnet_ids              = data.aws_subnets.private.ids
    endpoint_private_access = true
    endpoint_public_access  = !var.enable_private_endpoint
    security_group_ids      = [aws_security_group.cluster.id]
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  encryption_config {
    resources = ["secrets"]
    provider {
      key_arn = aws_kms_key.cluster.arn
    }
  }

  tags = var.tags

  depends_on = [
    aws_iam_role_policy_attachment.cluster_policy,
    aws_iam_role_policy_attachment.vpc_resource_controller,
  ]
}

# ============================================================================
# KMS KEY FOR SECRETS ENCRYPTION
# ============================================================================

resource "aws_kms_key" "cluster" {
  description             = "KMS key for ${var.cluster_name} secrets encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-kms"
  })
}

# ============================================================================
# NODE GROUPS
# ============================================================================

resource "aws_eks_node_group" "main" {
  for_each = { for pool in var.node_pools : pool.name => pool }

  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.cluster_name}-${each.value.name}"
  node_role_arn   = aws_iam_role.node_group.arn
  subnet_ids      = data.aws_subnets.private.ids

  instance_types = [each.value.instance_type]
  disk_size      = each.value.disk_size_gb

  scaling_config {
    desired_size = each.value.min_nodes
    max_size     = each.value.max_nodes
    min_size     = each.value.min_nodes
  }

  update_config {
    max_unavailable = 1
  }

  labels = each.value.labels

  dynamic "taint" {
    for_each = each.value.taints
    content {
      key    = taint.value.key
      value  = taint.value.value
      effect = taint.value.effect
    }
  }

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-${each.value.name}"
  })

  depends_on = [
    aws_iam_role_policy_attachment.node_policy,
    aws_iam_role_policy_attachment.cni_policy,
    aws_iam_role_policy_attachment.ecr_policy,
  ]
}

# ============================================================================
# OUTPUTS
# ============================================================================

output "cluster_endpoint" {
  description = "Kubernetes cluster endpoint"
  value       = aws_eks_cluster.main.endpoint
}

output "cluster_name" {
  description = "Kubernetes cluster name"
  value       = aws_eks_cluster.main.name
}

output "cluster_arn" {
  description = "Kubernetes cluster ARN"
  value       = aws_eks_cluster.main.arn
}

output "cluster_certificate_authority_data" {
  description = "Cluster CA certificate"
  value       = aws_eks_cluster.main.certificate_authority[0].data
  sensitive   = true
}

output "cluster_security_group_id" {
  description = "Cluster security group ID"
  value       = aws_security_group.cluster.id
}

output "node_role_arn" {
  description = "Node IAM role ARN"
  value       = aws_iam_role.node_group.arn
}
