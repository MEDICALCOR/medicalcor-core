/**
 * @fileoverview Security Domain Module
 *
 * Security-related domain services for geographic anomaly detection,
 * access monitoring, and threat detection.
 *
 * @module @medicalcor/domain/security
 */

export {
  GeoAnomalyDetectionService,
  createGeoAnomalyDetectionService,
  DEFAULT_GEO_ANOMALY_CONFIG,
  type GeoAnomalyDetectionServiceConfig,
  type GeoAnomalyDetectionServiceDeps,
  type IGeoIPService,
  type ILocationHistoryRepository,
} from './geo-anomaly-detection-service.js';
