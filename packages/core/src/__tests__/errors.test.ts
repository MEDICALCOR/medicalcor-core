import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  WebhookSignatureError,
  RateLimitError,
  ExternalServiceError,
  NotFoundError,
  DatabaseConnectionError,
  DatabaseOperationError,
  LeadNotFoundError,
  LeadUpsertError,
  isOperationalError,
  toSafeErrorResponse,
} from '../errors.js';

describe('AppError', () => {
  it('should create error with correct properties', () => {
    const error = new AppError('Test error', 'TEST_CODE', 400);

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.statusCode).toBe(400);
    expect(error.isOperational).toBe(true);
  });

  it('should default to 500 status code', () => {
    const error = new AppError('Test', 'CODE');
    expect(error.statusCode).toBe(500);
  });

  it('should produce safe error details', () => {
    const error = new AppError('Sensitive info here', 'CODE', 400);
    const safe = error.toSafeError();

    expect(safe.code).toBe('CODE');
    expect(safe.message).toBe('Sensitive info here');
    expect(safe.statusCode).toBe(400);
  });
});

describe('ValidationError', () => {
  it('should have 400 status code', () => {
    const error = new ValidationError('Invalid input');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  it('should store validation details', () => {
    const details = { field: 'email', message: 'invalid' };
    const error = new ValidationError('Invalid', details);
    expect(error.details).toBe(details);
  });
});

describe('AuthenticationError', () => {
  it('should have 401 status code', () => {
    const error = new AuthenticationError();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('should have default message', () => {
    const error = new AuthenticationError();
    expect(error.message).toBe('Authentication required');
  });
});

describe('WebhookSignatureError', () => {
  it('should have 401 status code', () => {
    const error = new WebhookSignatureError();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('WEBHOOK_SIGNATURE_ERROR');
  });
});

describe('RateLimitError', () => {
  it('should have 429 status code', () => {
    const error = new RateLimitError(120);
    expect(error.statusCode).toBe(429);
    expect(error.retryAfter).toBe(120);
  });

  it('should default retryAfter to 60', () => {
    const error = new RateLimitError();
    expect(error.retryAfter).toBe(60);
  });
});

describe('ExternalServiceError', () => {
  it('should have 502 status code', () => {
    const error = new ExternalServiceError('HubSpot', 'Connection failed');
    expect(error.statusCode).toBe(502);
    expect(error.service).toBe('HubSpot');
  });

  it('should store original error', () => {
    const original = new Error('Network error');
    const error = new ExternalServiceError('API', 'Failed', original);
    expect(error.originalError).toBe(original);
  });
});

describe('NotFoundError', () => {
  it('should have 404 status code', () => {
    const error = new NotFoundError('Contact');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Contact not found');
  });
});

describe('isOperationalError', () => {
  it('should return true for AppError instances', () => {
    expect(isOperationalError(new AppError('test', 'CODE'))).toBe(true);
    expect(isOperationalError(new ValidationError('test'))).toBe(true);
  });

  it('should return false for regular errors', () => {
    expect(isOperationalError(new Error('test'))).toBe(false);
  });

  it('should return false for non-errors', () => {
    expect(isOperationalError('string')).toBe(false);
    expect(isOperationalError(null)).toBe(false);
  });
});

describe('toSafeErrorResponse', () => {
  it('should return safe response for operational errors', () => {
    const error = new ValidationError('Bad input');
    const response = toSafeErrorResponse(error);

    expect(response.code).toBe('VALIDATION_ERROR');
    expect(response.statusCode).toBe(400);
  });

  it('should return generic response for unknown errors', () => {
    const response = toSafeErrorResponse(new Error('Sensitive'));

    expect(response.code).toBe('INTERNAL_ERROR');
    expect(response.message).toBe('An unexpected error occurred');
    expect(response.statusCode).toBe(500);
  });
});

describe('DatabaseConnectionError', () => {
  it('should have 503 status code', () => {
    const error = new DatabaseConnectionError();

    expect(error.statusCode).toBe(503);
    expect(error.code).toBe('DATABASE_CONNECTION_ERROR');
    expect(error.name).toBe('DatabaseConnectionError');
  });

  it('should have default message', () => {
    const error = new DatabaseConnectionError();
    expect(error.message).toBe('Database connection failed');
  });

  it('should accept custom message', () => {
    const error = new DatabaseConnectionError('Pool exhausted');
    expect(error.message).toBe('Pool exhausted');
  });

  it('should be operational error', () => {
    const error = new DatabaseConnectionError();
    expect(error.isOperational).toBe(true);
    expect(isOperationalError(error)).toBe(true);
  });
});

describe('DatabaseOperationError', () => {
  it('should have 500 status code', () => {
    const error = new DatabaseOperationError('INSERT', 'Constraint violation');

    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('DATABASE_OPERATION_ERROR');
    expect(error.name).toBe('DatabaseOperationError');
  });

  it('should include operation in message', () => {
    const error = new DatabaseOperationError('UPDATE', 'Record not found');
    expect(error.message).toBe('Database UPDATE failed: Record not found');
  });

  it('should store operation name', () => {
    const error = new DatabaseOperationError('DELETE', 'Foreign key constraint');
    expect(error.operation).toBe('DELETE');
  });

  it('should store original error', () => {
    const original = new Error('Connection timeout');
    const error = new DatabaseOperationError('SELECT', 'Query timeout', original);

    expect(error.originalError).toBe(original);
  });

  it('should work without original error', () => {
    const error = new DatabaseOperationError('INSERT', 'Duplicate key');
    expect(error.originalError).toBeUndefined();
  });
});

describe('LeadNotFoundError', () => {
  it('should have 404 status code', () => {
    const error = new LeadNotFoundError('hubspot', 'contact-123');

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('LEAD_NOT_FOUND');
    expect(error.name).toBe('LeadNotFoundError');
  });

  it('should include source and id in message', () => {
    const error = new LeadNotFoundError('whatsapp', 'wa-456');
    expect(error.message).toBe('Lead not found: source=whatsapp, id=wa-456');
  });

  it('should store externalSource', () => {
    const error = new LeadNotFoundError('hubspot', 'id-123');
    expect(error.externalSource).toBe('hubspot');
  });

  it('should store externalId', () => {
    const error = new LeadNotFoundError('hubspot', 'id-789');
    expect(error.externalId).toBe('id-789');
  });

  it('should be operational error', () => {
    const error = new LeadNotFoundError('test', 'id');
    expect(isOperationalError(error)).toBe(true);
  });
});

describe('LeadUpsertError', () => {
  it('should have 500 status code', () => {
    const error = new LeadUpsertError('hubspot', 'contact-123');

    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('LEAD_UPSERT_FAILED');
    expect(error.name).toBe('LeadUpsertError');
  });

  it('should include source and id in message', () => {
    const error = new LeadUpsertError('vapi', 'call-456');
    expect(error.message).toBe('Lead upsert failed: source=vapi, id=call-456');
  });

  it('should store externalSource', () => {
    const error = new LeadUpsertError('whatsapp', 'id');
    expect(error.externalSource).toBe('whatsapp');
  });

  it('should store externalId', () => {
    const error = new LeadUpsertError('hubspot', 'ext-id');
    expect(error.externalId).toBe('ext-id');
  });

  it('should store original error', () => {
    const original = new Error('Database timeout');
    const error = new LeadUpsertError('hubspot', 'id', original);

    expect(error.originalError).toBe(original);
  });

  it('should work without original error', () => {
    const error = new LeadUpsertError('hubspot', 'id');
    expect(error.originalError).toBeUndefined();
  });

  it('should be operational error', () => {
    const error = new LeadUpsertError('test', 'id');
    expect(isOperationalError(error)).toBe(true);
  });
});

// ============================================================================
// REPOSITORY ERROR TESTS
// ============================================================================

import {
  RepositoryError,
  RecordNotFoundError,
  RecordCreateError,
  RecordUpdateError,
  RecordDeleteError,
  ConcurrencyError,
  ConsentRequiredError,
  DatabaseConfigError,
  QueueEventValidationError,
  QueueEventProcessingError,
  QueueBreachAlertError,
} from '../errors.js';

describe('RepositoryError', () => {
  it('should have 500 status code', () => {
    const error = new RepositoryError('LeadRepository', 'find', 'Query failed');

    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('REPOSITORY_ERROR');
    expect(error.name).toBe('RepositoryError');
  });

  it('should store repository and operation', () => {
    const error = new RepositoryError('UserRepository', 'create', 'Insert failed');

    expect(error.repository).toBe('UserRepository');
    expect(error.operation).toBe('create');
  });

  it('should store original error', () => {
    const original = new Error('Connection timeout');
    const error = new RepositoryError('PatientRepository', 'update', 'Failed', original);

    expect(error.originalError).toBe(original);
  });

  it('should work without original error', () => {
    const error = new RepositoryError('Repository', 'delete', 'Not found');
    expect(error.originalError).toBeUndefined();
  });

  it('should be operational error', () => {
    const error = new RepositoryError('TestRepo', 'test', 'Test');
    expect(isOperationalError(error)).toBe(true);
  });
});

describe('RecordNotFoundError', () => {
  it('should have 404 status code', () => {
    const error = new RecordNotFoundError('LeadRepository', 'Lead', 'lead-123');

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('RECORD_NOT_FOUND');
    expect(error.name).toBe('RecordNotFoundError');
  });

  it('should include record type and id in message', () => {
    const error = new RecordNotFoundError('PatientRepository', 'Patient', 'patient-456');
    expect(error.message).toBe('Patient not found: patient-456');
  });

  it('should store repository and record info', () => {
    const error = new RecordNotFoundError('CaseRepository', 'Case', 'case-789');

    expect(error.repository).toBe('CaseRepository');
    expect(error.recordType).toBe('Case');
    expect(error.recordId).toBe('case-789');
    expect(error.operation).toBe('find');
  });

  it('should be operational error', () => {
    const error = new RecordNotFoundError('Repo', 'Type', 'id');
    expect(isOperationalError(error)).toBe(true);
  });
});

describe('RecordCreateError', () => {
  it('should have 500 status code', () => {
    const error = new RecordCreateError('LeadRepository', 'Lead');

    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('RECORD_CREATE_FAILED');
    expect(error.name).toBe('RecordCreateError');
  });

  it('should use default message when not provided', () => {
    const error = new RecordCreateError('PatientRepository', 'Patient');
    expect(error.message).toBe('Failed to create Patient');
  });

  it('should use custom message when provided', () => {
    const error = new RecordCreateError('CaseRepository', 'Case', 'Duplicate case number');
    expect(error.message).toBe('Duplicate case number');
  });

  it('should store repository and record type', () => {
    const error = new RecordCreateError('LeadRepository', 'Lead');

    expect(error.repository).toBe('LeadRepository');
    expect(error.recordType).toBe('Lead');
    expect(error.operation).toBe('create');
  });

  it('should store original error', () => {
    const original = new Error('Constraint violation');
    const error = new RecordCreateError('Repository', 'Record', 'Failed', original);

    expect(error.originalError).toBe(original);
  });

  it('should work without original error', () => {
    const error = new RecordCreateError('Repository', 'Record');
    expect(error.originalError).toBeUndefined();
  });

  it('should be operational error', () => {
    const error = new RecordCreateError('Repo', 'Type');
    expect(isOperationalError(error)).toBe(true);
  });
});

describe('RecordUpdateError', () => {
  it('should have 500 status code', () => {
    const error = new RecordUpdateError('LeadRepository', 'Lead', 'lead-123');

    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('RECORD_UPDATE_FAILED');
    expect(error.name).toBe('RecordUpdateError');
  });

  it('should use default message when not provided', () => {
    const error = new RecordUpdateError('PatientRepository', 'Patient', 'patient-456');
    expect(error.message).toBe('Failed to update Patient: patient-456');
  });

  it('should use custom message when provided', () => {
    const error = new RecordUpdateError('CaseRepository', 'Case', 'case-789', 'Version mismatch');
    expect(error.message).toBe('Version mismatch');
  });

  it('should store repository, record type, and record id', () => {
    const error = new RecordUpdateError('LeadRepository', 'Lead', 'lead-123');

    expect(error.repository).toBe('LeadRepository');
    expect(error.recordType).toBe('Lead');
    expect(error.recordId).toBe('lead-123');
    expect(error.operation).toBe('update');
  });

  it('should store original error', () => {
    const original = new Error('Connection lost');
    const error = new RecordUpdateError('Repository', 'Record', 'id', 'Failed', original);

    expect(error.originalError).toBe(original);
  });

  it('should work without original error', () => {
    const error = new RecordUpdateError('Repository', 'Record', 'id');
    expect(error.originalError).toBeUndefined();
  });

  it('should be operational error', () => {
    const error = new RecordUpdateError('Repo', 'Type', 'id');
    expect(isOperationalError(error)).toBe(true);
  });
});

describe('RecordDeleteError', () => {
  it('should have 500 status code', () => {
    const error = new RecordDeleteError('LeadRepository', 'Lead', 'lead-123');

    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('RECORD_DELETE_FAILED');
    expect(error.name).toBe('RecordDeleteError');
  });

  it('should use default message when not provided', () => {
    const error = new RecordDeleteError('PatientRepository', 'Patient', 'patient-456');
    expect(error.message).toBe('Failed to delete Patient: patient-456');
  });

  it('should use custom message when provided', () => {
    const error = new RecordDeleteError('CaseRepository', 'Case', 'case-789', 'Has dependencies');
    expect(error.message).toBe('Has dependencies');
  });

  it('should store repository, record type, and record id', () => {
    const error = new RecordDeleteError('LeadRepository', 'Lead', 'lead-123');

    expect(error.repository).toBe('LeadRepository');
    expect(error.recordType).toBe('Lead');
    expect(error.recordId).toBe('lead-123');
    expect(error.operation).toBe('delete');
  });

  it('should store original error', () => {
    const original = new Error('Foreign key constraint');
    const error = new RecordDeleteError('Repository', 'Record', 'id', 'Failed', original);

    expect(error.originalError).toBe(original);
  });

  it('should work without original error', () => {
    const error = new RecordDeleteError('Repository', 'Record', 'id');
    expect(error.originalError).toBeUndefined();
  });

  it('should be operational error', () => {
    const error = new RecordDeleteError('Repo', 'Type', 'id');
    expect(isOperationalError(error)).toBe(true);
  });
});

describe('ConcurrencyError', () => {
  it('should have 409 status code', () => {
    const error = new ConcurrencyError('LeadRepository', 'Lead', 'lead-123');

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONCURRENCY_ERROR');
    expect(error.name).toBe('ConcurrencyError');
  });

  it('should include record type and id in message', () => {
    const error = new ConcurrencyError('PatientRepository', 'Patient', 'patient-456');
    expect(error.message).toBe(
      'Concurrent modification detected for Patient: patient-456. Please retry.'
    );
  });

  it('should store repository, record type, and record id', () => {
    const error = new ConcurrencyError('CaseRepository', 'Case', 'case-789');

    expect(error.repository).toBe('CaseRepository');
    expect(error.recordType).toBe('Case');
    expect(error.recordId).toBe('case-789');
    expect(error.operation).toBe('update');
  });

  it('should be operational error', () => {
    const error = new ConcurrencyError('Repo', 'Type', 'id');
    expect(isOperationalError(error)).toBe(true);
  });
});

describe('ConsentRequiredError', () => {
  it('should have 403 status code', () => {
    const error = new ConsentRequiredError('contact-123', ['marketing', 'data_processing']);

    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('CONSENT_REQUIRED');
    expect(error.name).toBe('ConsentRequiredError');
  });

  it('should include missing consents in message', () => {
    const error = new ConsentRequiredError('patient-456', ['treatment', 'communication']);
    expect(error.message).toBe(
      'Patient consent required before scheduling. Missing consents: treatment, communication'
    );
  });

  it('should store contact id and missing consents', () => {
    const missingConsents = ['marketing', 'analytics'];
    const error = new ConsentRequiredError('contact-789', missingConsents);

    expect(error.contactId).toBe('contact-789');
    expect(error.missingConsents).toEqual(missingConsents);
  });

  it('should handle single missing consent', () => {
    const error = new ConsentRequiredError('patient-123', ['treatment']);
    expect(error.message).toBe(
      'Patient consent required before scheduling. Missing consents: treatment'
    );
  });

  it('should be operational error', () => {
    const error = new ConsentRequiredError('id', ['consent']);
    expect(isOperationalError(error)).toBe(true);
  });
});

describe('DatabaseConfigError', () => {
  it('should have 503 status code', () => {
    const error = new DatabaseConfigError('LeadRepository');

    expect(error.statusCode).toBe(503);
    expect(error.code).toBe('DATABASE_CONFIG_ERROR');
    expect(error.name).toBe('DatabaseConfigError');
  });

  it('should use default message when not provided', () => {
    const error = new DatabaseConfigError('PatientRepository');
    expect(error.message).toBe('Database connection not configured');
  });

  it('should use custom message when provided', () => {
    const error = new DatabaseConfigError(
      'CaseRepository',
      'Missing DATABASE_URL environment variable'
    );
    expect(error.message).toBe('Missing DATABASE_URL environment variable');
  });

  it('should store repository', () => {
    const error = new DatabaseConfigError('LeadRepository');
    expect(error.repository).toBe('LeadRepository');
  });

  it('should be operational error', () => {
    const error = new DatabaseConfigError('Repo');
    expect(isOperationalError(error)).toBe(true);
  });
});

// ============================================================================
// QUEUE ERROR TESTS
// ============================================================================

describe('QueueEventValidationError', () => {
  it('should have 400 status code', () => {
    const error = new QueueEventValidationError('Invalid event payload');

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('QUEUE_EVENT_VALIDATION_ERROR');
    expect(error.name).toBe('QueueEventValidationError');
  });

  it('should store event id', () => {
    const error = new QueueEventValidationError('Invalid', 'event-123');
    expect(error.eventId).toBe('event-123');
  });

  it('should store validation errors', () => {
    const validationErrors = { field: 'phone', message: 'Invalid format' };
    const error = new QueueEventValidationError('Invalid', 'event-456', validationErrors);
    expect(error.validationErrors).toEqual(validationErrors);
  });

  it('should work without event id and validation errors', () => {
    const error = new QueueEventValidationError('Invalid event');
    expect(error.eventId).toBeUndefined();
    expect(error.validationErrors).toBeUndefined();
  });

  it('should be operational error', () => {
    const error = new QueueEventValidationError('Invalid');
    expect(isOperationalError(error)).toBe(true);
  });
});

describe('QueueEventProcessingError', () => {
  it('should have 500 status code', () => {
    const error = new QueueEventProcessingError('event-123', 'Processing failed');

    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('QUEUE_EVENT_PROCESSING_ERROR');
    expect(error.name).toBe('QueueEventProcessingError');
  });

  it('should store event id and queue sid', () => {
    const error = new QueueEventProcessingError('event-123', 'Failed', 'queue-456');

    expect(error.eventId).toBe('event-123');
    expect(error.queueSid).toBe('queue-456');
  });

  it('should store original error', () => {
    const original = new Error('Database error');
    const error = new QueueEventProcessingError('event-789', 'Failed', 'queue-abc', original);

    expect(error.originalError).toBe(original);
  });

  it('should work without queue sid and original error', () => {
    const error = new QueueEventProcessingError('event-123', 'Failed');
    expect(error.queueSid).toBeUndefined();
    expect(error.originalError).toBeUndefined();
  });

  it('should be operational error', () => {
    const error = new QueueEventProcessingError('id', 'message');
    expect(isOperationalError(error)).toBe(true);
  });
});

describe('QueueBreachAlertError', () => {
  it('should have 500 status code', () => {
    const error = new QueueBreachAlertError('queue-123', 'SLA');

    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('QUEUE_BREACH_ALERT_ERROR');
    expect(error.name).toBe('QueueBreachAlertError');
  });

  it('should use default message when not provided', () => {
    const error = new QueueBreachAlertError('queue-456', 'capacity');
    expect(error.message).toBe('Failed to send alert for capacity breach on queue queue-456');
  });

  it('should use custom message when provided', () => {
    const error = new QueueBreachAlertError(
      'queue-789',
      'threshold',
      'Notification service unavailable'
    );
    expect(error.message).toBe('Notification service unavailable');
  });

  it('should store queue sid and breach type', () => {
    const error = new QueueBreachAlertError('queue-123', 'SLA');

    expect(error.queueSid).toBe('queue-123');
    expect(error.breachType).toBe('SLA');
  });

  it('should store original error', () => {
    const original = new Error('SMTP connection failed');
    const error = new QueueBreachAlertError('queue-456', 'alert', 'Email failed', original);

    expect(error.originalError).toBe(original);
  });

  it('should work without custom message and original error', () => {
    const error = new QueueBreachAlertError('queue-789', 'timeout');
    expect(error.originalError).toBeUndefined();
  });

  it('should be operational error', () => {
    const error = new QueueBreachAlertError('queue', 'type');
    expect(isOperationalError(error)).toBe(true);
  });
});
