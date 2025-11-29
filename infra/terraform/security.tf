# =============================================================================
# CRITICAL SECURITY FIXES
# MedicalCor Core Infrastructure Security Enhancements
# Platinum Banking/Medical Standards Compliance
# =============================================================================

# =============================================================================
# 1. CLOUD ARMOR WAF - DDoS and Attack Protection
# =============================================================================

resource "google_compute_security_policy" "api_security_policy" {
  name        = "medicalcor-api-security-${var.environment}"
  description = "Cloud Armor security policy for MedicalCor API - Medical/Banking Grade"

  # Default action - allow traffic that passes all rules
  rule {
    action   = "allow"
    priority = "2147483647"  # Lowest priority (default rule)
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "Default rule - allow all traffic that passes security rules"
  }

  # Block known bad IPs (Tor exit nodes, anonymous proxies, etc.)
  rule {
    action   = "deny(403)"
    priority = "100"
    match {
      expr {
        expression = "origin.region_code == 'XA' || origin.region_code == 'XB'"
      }
    }
    description = "Block requests from anonymous/satellite networks"
  }

  # Rate limiting rule - 100 requests per minute per IP
  rule {
    action   = "rate_based_ban"
    priority = "200"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = 100
        interval_sec = 60
      }
      ban_duration_sec = 600  # 10 minute ban after exceeding limit
    }
    description = "Rate limiting - 100 requests/minute per IP"
  }

  # SQL injection protection
  rule {
    action   = "deny(403)"
    priority = "1000"
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('sqli-v33-stable', {'sensitivity': 3})"
      }
    }
    description = "Block SQL injection attempts"
  }

  # XSS protection
  rule {
    action   = "deny(403)"
    priority = "1001"
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('xss-v33-stable', {'sensitivity': 3})"
      }
    }
    description = "Block cross-site scripting attempts"
  }

  # Protocol attacks protection
  rule {
    action   = "deny(403)"
    priority = "1002"
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('protocolattack-v33-stable', {'sensitivity': 3})"
      }
    }
    description = "Block protocol attack attempts"
  }

  # Remote file inclusion protection
  rule {
    action   = "deny(403)"
    priority = "1003"
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('rfi-v33-stable', {'sensitivity': 3})"
      }
    }
    description = "Block remote file inclusion attempts"
  }

  # Session fixation protection
  rule {
    action   = "deny(403)"
    priority = "1004"
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('sessionfixation-v33-stable', {'sensitivity': 3})"
      }
    }
    description = "Block session fixation attempts"
  }

  # GDPR: Block requests from non-EU regions (optional - uncomment if needed)
  # rule {
  #   action   = "deny(403)"
  #   priority = "300"
  #   match {
  #     expr {
  #       expression = "!(origin.region_code in ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'CH', 'NO', 'IS', 'LI'])"
  #     }
  #   }
  #   description = "GDPR: Only allow EU traffic"
  # }

  # Adaptive protection (ML-based threat detection)
  adaptive_protection_config {
    layer_7_ddos_defense_config {
      enable = true
      rule_visibility = "STANDARD"
    }
  }
}

# =============================================================================
# 2. SSL/TLS CERTIFICATE MANAGEMENT
# =============================================================================

# Managed SSL certificate for API domain
resource "google_compute_managed_ssl_certificate" "api_cert" {
  name = "medicalcor-api-cert-${var.environment}"

  managed {
    domains = var.environment == "prod" ? [
      "api.medicalcor.ro",
      "api.medicalcor.io"
    ] : [
      "api-${var.environment}.medicalcor.ro"
    ]
  }
}

# =============================================================================
# 3. HTTPS LOAD BALANCER WITH SECURITY POLICY
# =============================================================================

# Backend service for Cloud Run
resource "google_compute_backend_service" "api_backend" {
  name                  = "medicalcor-api-backend-${var.environment}"
  protocol              = "HTTPS"
  port_name             = "http"
  timeout_sec           = 30
  enable_cdn            = false  # Disabled for API (no caching of PHI)
  security_policy       = google_compute_security_policy.api_security_policy.id

  # Health check
  health_checks = [google_compute_health_check.api_health_check.id]

  # Cloud Run backend
  backend {
    group = google_compute_region_network_endpoint_group.api_neg.id
  }

  # SECURITY: Custom request headers
  custom_request_headers = [
    "X-Client-Geo-Location: {client_region}",
    "X-Request-Id: {random_uuid}",
  ]

  # SECURITY: Logging for audit
  log_config {
    enable      = true
    sample_rate = 1.0  # Log all requests for medical compliance
  }
}

# Network Endpoint Group for Cloud Run
resource "google_compute_region_network_endpoint_group" "api_neg" {
  name                  = "medicalcor-api-neg-${var.environment}"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.api.name
  }
}

# Health check
resource "google_compute_health_check" "api_health_check" {
  name                = "medicalcor-api-health-${var.environment}"
  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3

  https_health_check {
    port               = 443
    request_path       = "/health"
  }
}

# URL map for routing
resource "google_compute_url_map" "api_url_map" {
  name            = "medicalcor-api-urlmap-${var.environment}"
  default_service = google_compute_backend_service.api_backend.id

  # SECURITY: Custom error responses
  default_custom_error_response_policy {
    error_response_rule {
      match_response_codes = ["4xx", "5xx"]
      path                 = "/error"
      override_response_code = 0  # Use original response code
    }
  }
}

# HTTPS target proxy
resource "google_compute_target_https_proxy" "api_https_proxy" {
  name             = "medicalcor-api-https-proxy-${var.environment}"
  url_map          = google_compute_url_map.api_url_map.id
  ssl_certificates = [google_compute_managed_ssl_certificate.api_cert.id]

  # SECURITY: TLS 1.2+ only
  ssl_policy = google_compute_ssl_policy.modern_ssl_policy.id
}

# SSL Policy (TLS 1.2+ only)
resource "google_compute_ssl_policy" "modern_ssl_policy" {
  name            = "medicalcor-ssl-policy-${var.environment}"
  profile         = "MODERN"
  min_tls_version = "TLS_1_2"
}

# Global forwarding rule (HTTPS)
resource "google_compute_global_forwarding_rule" "api_https_forwarding" {
  name                  = "medicalcor-api-https-${var.environment}"
  target                = google_compute_target_https_proxy.api_https_proxy.id
  port_range            = "443"
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.api_ip.address
}

# Static IP for API
resource "google_compute_global_address" "api_ip" {
  name         = "medicalcor-api-ip-${var.environment}"
  address_type = "EXTERNAL"
  ip_version   = "IPV4"
}

# HTTP to HTTPS redirect
resource "google_compute_url_map" "http_redirect" {
  name = "medicalcor-http-redirect-${var.environment}"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "http_redirect_proxy" {
  name    = "medicalcor-http-redirect-proxy-${var.environment}"
  url_map = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_forwarding_rule" "http_redirect_forwarding" {
  name                  = "medicalcor-http-redirect-${var.environment}"
  target                = google_compute_target_http_proxy.http_redirect_proxy.id
  port_range            = "80"
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.api_ip.address
}

# =============================================================================
# 4. CLOUD AUDIT LOGS
# =============================================================================

resource "google_project_iam_audit_config" "all_services" {
  project = var.project_id
  service = "allServices"

  # Log all admin activity
  audit_log_config {
    log_type = "ADMIN_READ"
  }

  # Log data access (HIPAA requirement)
  audit_log_config {
    log_type = "DATA_READ"
  }

  audit_log_config {
    log_type = "DATA_WRITE"
  }
}

# =============================================================================
# 5. VPC FIREWALL RULES
# =============================================================================

# Deny all ingress by default (defense in depth)
resource "google_compute_firewall" "deny_all_ingress" {
  name    = "medicalcor-deny-all-ingress-${var.environment}"
  network = google_compute_network.vpc.name

  deny {
    protocol = "all"
  }

  direction     = "INGRESS"
  priority      = 65534
  source_ranges = ["0.0.0.0/0"]

  description = "Default deny all ingress traffic"
}

# Allow health checks from Google Load Balancer
resource "google_compute_firewall" "allow_health_checks" {
  name    = "medicalcor-allow-health-checks-${var.environment}"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  direction     = "INGRESS"
  priority      = 1000
  source_ranges = [
    "35.191.0.0/16",   # Google Load Balancer health check ranges
    "130.211.0.0/22",
  ]

  target_tags = ["api-server"]
  description = "Allow health checks from Google Load Balancer"
}

# =============================================================================
# 6. SECRET ROTATION SCHEDULING (placeholder for manual action)
# =============================================================================

# Note: Actual secret rotation requires external automation (e.g., Cloud Functions)
# This resource creates the schedule, but rotation must be implemented separately

resource "google_secret_manager_secret" "rotation_schedule" {
  secret_id = "rotation-schedule-${var.environment}"

  labels = {
    rotation_days = "90"  # Rotate secrets every 90 days
    environment   = var.environment
  }

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

# =============================================================================
# 7. SECURITY OUTPUTS
# =============================================================================

output "api_external_ip" {
  value       = google_compute_global_address.api_ip.address
  description = "External IP address for the API"
}

output "security_policy_id" {
  value       = google_compute_security_policy.api_security_policy.id
  description = "Cloud Armor security policy ID"
}

output "ssl_certificate_id" {
  value       = google_compute_managed_ssl_certificate.api_cert.id
  description = "SSL certificate ID"
}
