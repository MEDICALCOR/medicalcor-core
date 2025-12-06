import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Counter,
  Gauge,
  Histogram,
  MetricsRegistry,
  globalMetrics,
  httpRequestsTotal,
  httpRequestDuration,
  leadsCreated,
  leadsScored,
  leadsConverted,
  appointmentsScheduled,
  appointmentsCancelled,
  messagesReceived,
  messagesSent,
  externalServiceRequests,
  externalServiceDuration,
  eventsAppended,
  eventStoreLatency,
  commandsExecuted,
  commandDuration,
  queriesExecuted,
  queryDuration,
  activeConnections,
  queueSize,
  aiFunctionCalls,
  aiFunctionDuration,
  aiIntentDetections,
  aiRequestsTotal,
  aiFallbackTotal,
  aiInstantFallbackTotal,
  aiTimeoutTotal,
  aiOperationDuration,
  aiScoringDuration,
  aiDailySpend,
  aiMonthlySpend,
  aiSpendByProvider,
  aiBudgetAlerts,
  aiBudgetStatus,
  aiTokensUsed,
  aiTokenEstimationTotal,
  aiTokenEstimationAccuracy,
  aiRateLimitHits,
  aiConcurrentRequests,
  aiProviderHealth,
  aiProviderResponseTime,
  aiProviderSuccessRate,
  patientJourneyStage,
  leadClassificationCurrent,
  patientJourneyDuration,
  workerTasksTotal,
  workerTaskDuration,
  workerTaskRetries,
  workerQueueDepth,
  workerQueueWaitTime,
  workerWorkflowsTotal,
  workerWorkflowDuration,
  workerWorkflowSteps,
  workerCronJobsTotal,
  workerCronJobDuration,
  workerActiveJobs,
  workerConcurrency,
  errorsTotal,
  circuitBreakerState,
  circuitBreakerTrips,
} from '../observability/metrics.js';

describe('Counter', () => {
  let counter: Counter;

  beforeEach(() => {
    counter = new Counter('test_counter', 'A test counter', ['label1', 'label2']);
  });

  describe('inc', () => {
    it('should increment by 1 by default', () => {
      counter.inc();
      expect(counter.get()).toBe(1);
    });

    it('should increment by specified amount', () => {
      counter.inc({}, 5);
      expect(counter.get()).toBe(5);
    });

    it('should accumulate increments', () => {
      counter.inc();
      counter.inc();
      counter.inc({}, 3);
      expect(counter.get()).toBe(5);
    });

    it('should track separate label combinations', () => {
      counter.inc({ label1: 'a', label2: 'x' });
      counter.inc({ label1: 'a', label2: 'y' });
      counter.inc({ label1: 'a', label2: 'x' }, 2);

      expect(counter.get({ label1: 'a', label2: 'x' })).toBe(3);
      expect(counter.get({ label1: 'a', label2: 'y' })).toBe(1);
    });

    it('should handle missing labels', () => {
      counter.inc({ label1: 'a' }); // label2 missing
      expect(counter.get({ label1: 'a' })).toBe(1);
    });
  });

  describe('get', () => {
    it('should return 0 for non-existent labels', () => {
      expect(counter.get({ label1: 'missing', label2: 'also' })).toBe(0);
    });

    it('should return correct value for existing labels', () => {
      counter.inc({ label1: 'a', label2: 'b' }, 42);
      expect(counter.get({ label1: 'a', label2: 'b' })).toBe(42);
    });
  });

  describe('reset', () => {
    it('should clear all values', () => {
      counter.inc({ label1: 'a', label2: 'x' }, 5);
      counter.inc({ label1: 'b', label2: 'y' }, 10);
      counter.reset();

      expect(counter.get({ label1: 'a', label2: 'x' })).toBe(0);
      expect(counter.get({ label1: 'b', label2: 'y' })).toBe(0);
      expect(counter.getAll()).toEqual([]);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no values', () => {
      expect(counter.getAll()).toEqual([]);
    });

    it('should return all label combinations and values', () => {
      counter.inc({ label1: 'a', label2: 'x' }, 5);
      counter.inc({ label1: 'b', label2: 'y' }, 10);

      const all = counter.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContainEqual({ labels: { label1: 'a', label2: 'x' }, value: 5 });
      expect(all).toContainEqual({ labels: { label1: 'b', label2: 'y' }, value: 10 });
    });
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(counter.name).toBe('test_counter');
    });

    it('should have correct help', () => {
      expect(counter.help).toBe('A test counter');
    });

    it('should have correct labels', () => {
      expect(counter.labels).toEqual(['label1', 'label2']);
    });
  });
});

describe('Gauge', () => {
  let gauge: Gauge;

  beforeEach(() => {
    gauge = new Gauge('test_gauge', 'A test gauge', ['service']);
  });

  describe('set', () => {
    it('should set value', () => {
      gauge.set(42);
      expect(gauge.get()).toBe(42);
    });

    it('should overwrite previous value', () => {
      gauge.set(10);
      gauge.set(20);
      expect(gauge.get()).toBe(20);
    });

    it('should set value with labels', () => {
      gauge.set(100, { service: 'api' });
      gauge.set(200, { service: 'worker' });

      expect(gauge.get({ service: 'api' })).toBe(100);
      expect(gauge.get({ service: 'worker' })).toBe(200);
    });
  });

  describe('inc', () => {
    it('should increment by 1 by default', () => {
      gauge.inc();
      expect(gauge.get()).toBe(1);
    });

    it('should increment by specified amount', () => {
      gauge.inc({}, 5);
      expect(gauge.get()).toBe(5);
    });

    it('should increment from current value', () => {
      gauge.set(10);
      gauge.inc({}, 5);
      expect(gauge.get()).toBe(15);
    });

    it('should increment with labels', () => {
      gauge.set(10, { service: 'api' });
      gauge.inc({ service: 'api' }, 5);
      expect(gauge.get({ service: 'api' })).toBe(15);
    });
  });

  describe('dec', () => {
    it('should decrement by 1 by default', () => {
      gauge.set(10);
      gauge.dec();
      expect(gauge.get()).toBe(9);
    });

    it('should decrement by specified amount', () => {
      gauge.set(10);
      gauge.dec({}, 5);
      expect(gauge.get()).toBe(5);
    });

    it('should allow negative values', () => {
      gauge.dec({}, 5);
      expect(gauge.get()).toBe(-5);
    });

    it('should decrement with labels', () => {
      gauge.set(20, { service: 'worker' });
      gauge.dec({ service: 'worker' }, 3);
      expect(gauge.get({ service: 'worker' })).toBe(17);
    });
  });

  describe('get', () => {
    it('should return 0 for non-existent labels', () => {
      expect(gauge.get({ service: 'missing' })).toBe(0);
    });
  });

  describe('getAll', () => {
    it('should return all values', () => {
      gauge.set(10, { service: 'api' });
      gauge.set(20, { service: 'worker' });

      const all = gauge.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContainEqual({ labels: { service: 'api' }, value: 10 });
      expect(all).toContainEqual({ labels: { service: 'worker' }, value: 20 });
    });
  });

  describe('properties', () => {
    it('should have correct properties', () => {
      expect(gauge.name).toBe('test_gauge');
      expect(gauge.help).toBe('A test gauge');
      expect(gauge.labels).toEqual(['service']);
    });
  });
});

describe('Histogram', () => {
  let histogram: Histogram;

  beforeEach(() => {
    histogram = new Histogram(
      'test_histogram',
      'A test histogram',
      ['method'],
      [0.1, 0.5, 1.0, 5.0]
    );
  });

  describe('observe', () => {
    it('should update bucket counts', () => {
      histogram.observe(0.05); // Should go in 0.1 bucket
      histogram.observe(0.3); // Should go in 0.5 bucket
      histogram.observe(0.8); // Should go in 1.0 bucket
      histogram.observe(3.0); // Should go in 5.0 bucket

      const all = histogram.getAll();
      expect(all).toHaveLength(1);

      const entry = all[0]!;
      expect(entry.count).toBe(4);
      expect(entry.sum).toBeCloseTo(0.05 + 0.3 + 0.8 + 3.0, 5);

      // Check bucket counts (cumulative)
      const buckets = entry.buckets;
      expect(buckets[0]!.count).toBe(1); // <= 0.1
      expect(buckets[1]!.count).toBe(2); // <= 0.5
      expect(buckets[2]!.count).toBe(3); // <= 1.0
      expect(buckets[3]!.count).toBe(4); // <= 5.0
    });

    it('should track separate label combinations', () => {
      histogram.observe(0.1, { method: 'GET' });
      histogram.observe(0.2, { method: 'POST' });

      const all = histogram.getAll();
      expect(all).toHaveLength(2);

      const getEntry = all.find((e) => e.labels.method === 'GET');
      const postEntry = all.find((e) => e.labels.method === 'POST');

      expect(getEntry?.count).toBe(1);
      expect(postEntry?.count).toBe(1);
    });

    it('should handle values larger than all buckets', () => {
      histogram.observe(10.0); // Larger than 5.0 bucket

      const all = histogram.getAll();
      const entry = all[0]!;

      // All buckets should have count 0 for this value since it's larger than all
      expect(entry.buckets[0]!.count).toBe(0);
      expect(entry.buckets[1]!.count).toBe(0);
      expect(entry.buckets[2]!.count).toBe(0);
      expect(entry.buckets[3]!.count).toBe(0);
      expect(entry.count).toBe(1);
      expect(entry.sum).toBe(10.0);
    });

    it('should handle value exactly at bucket boundary', () => {
      histogram.observe(0.5);

      const all = histogram.getAll();
      const entry = all[0]!;

      expect(entry.buckets[1]!.count).toBe(1); // <= 0.5
    });
  });

  describe('startTimer', () => {
    it('should measure duration', async () => {
      const mockNow = vi.spyOn(performance, 'now');
      mockNow.mockReturnValueOnce(1000); // Start
      mockNow.mockReturnValueOnce(1500); // End (500ms later)

      const end = histogram.startTimer();
      const duration = end();

      expect(duration).toBeCloseTo(0.5, 5); // 500ms = 0.5 seconds

      mockNow.mockRestore();
    });

    it('should observe duration with labels', () => {
      const mockNow = vi.spyOn(performance, 'now');
      mockNow.mockReturnValueOnce(0);
      mockNow.mockReturnValueOnce(100); // 100ms

      const end = histogram.startTimer({ method: 'GET' });
      end();

      const all = histogram.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]!.labels.method).toBe('GET');

      mockNow.mockRestore();
    });
  });

  describe('getAll', () => {
    it('should return empty array when no observations', () => {
      expect(histogram.getAll()).toEqual([]);
    });

    it('should return complete histogram data', () => {
      histogram.observe(0.3, { method: 'GET' });

      const all = histogram.getAll();
      expect(all).toHaveLength(1);

      const entry = all[0]!;
      expect(entry.labels).toEqual({ method: 'GET' });
      expect(entry.buckets).toHaveLength(4);
      expect(entry.sum).toBe(0.3);
      expect(entry.count).toBe(1);
    });
  });

  describe('custom buckets', () => {
    it('should sort buckets', () => {
      const unsorted = new Histogram('test', 'test', [], [1.0, 0.1, 0.5]);
      unsorted.observe(0.3);

      const all = unsorted.getAll();
      const bucketBoundaries = all[0]!.buckets.map((b) => b.le);
      expect(bucketBoundaries).toEqual([0.1, 0.5, 1.0]);
    });

    it('should use default buckets if not specified', () => {
      const defaultHist = new Histogram('test', 'test');
      defaultHist.observe(0.01);

      const all = defaultHist.getAll();
      expect(all[0]!.buckets.length).toBeGreaterThan(0);
    });
  });

  describe('properties', () => {
    it('should have correct properties', () => {
      expect(histogram.name).toBe('test_histogram');
      expect(histogram.help).toBe('A test histogram');
      expect(histogram.labels).toEqual(['method']);
    });
  });
});

describe('MetricsRegistry', () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = new MetricsRegistry();
  });

  describe('counter', () => {
    it('should create new counter', () => {
      const counter = registry.counter('my_counter', 'My counter', ['label']);
      expect(counter).toBeInstanceOf(Counter);
      expect(counter.name).toBe('my_counter');
    });

    it('should return same counter for same name', () => {
      const counter1 = registry.counter('same_name', 'Help 1');
      const counter2 = registry.counter('same_name', 'Help 2');
      expect(counter1).toBe(counter2);
    });
  });

  describe('gauge', () => {
    it('should create new gauge', () => {
      const gauge = registry.gauge('my_gauge', 'My gauge', ['type']);
      expect(gauge).toBeInstanceOf(Gauge);
      expect(gauge.name).toBe('my_gauge');
    });

    it('should return same gauge for same name', () => {
      const gauge1 = registry.gauge('same_name', 'Help 1');
      const gauge2 = registry.gauge('same_name', 'Help 2');
      expect(gauge1).toBe(gauge2);
    });
  });

  describe('histogram', () => {
    it('should create new histogram', () => {
      const histogram = registry.histogram('my_histogram', 'My histogram', ['path'], [0.1, 1.0]);
      expect(histogram).toBeInstanceOf(Histogram);
      expect(histogram.name).toBe('my_histogram');
    });

    it('should return same histogram for same name', () => {
      const hist1 = registry.histogram('same_name', 'Help 1');
      const hist2 = registry.histogram('same_name', 'Help 2');
      expect(hist1).toBe(hist2);
    });
  });

  describe('toPrometheusText', () => {
    it('should return empty string for no metrics', () => {
      expect(registry.toPrometheusText()).toBe('');
    });

    it('should format counter correctly', () => {
      const counter = registry.counter('http_requests', 'Total requests', ['method', 'status']);
      counter.inc({ method: 'GET', status: '200' }, 10);
      counter.inc({ method: 'POST', status: '201' }, 5);

      const output = registry.toPrometheusText();
      expect(output).toContain('# HELP http_requests Total requests');
      expect(output).toContain('# TYPE http_requests counter');
      expect(output).toContain('http_requests{method="GET",status="200"} 10');
      expect(output).toContain('http_requests{method="POST",status="201"} 5');
    });

    it('should format gauge correctly', () => {
      const gauge = registry.gauge('active_connections', 'Active connections', ['type']);
      gauge.set(42, { type: 'websocket' });

      const output = registry.toPrometheusText();
      expect(output).toContain('# HELP active_connections Active connections');
      expect(output).toContain('# TYPE active_connections gauge');
      expect(output).toContain('active_connections{type="websocket"} 42');
    });

    it('should format histogram correctly', () => {
      const histogram = registry.histogram('request_duration', 'Duration', ['path'], [0.1, 1.0]);
      histogram.observe(0.05, { path: '/api' });

      const output = registry.toPrometheusText();
      expect(output).toContain('# HELP request_duration Duration');
      expect(output).toContain('# TYPE request_duration histogram');
      expect(output).toContain('request_duration_bucket{path="/api",le="0.1"} 1');
      expect(output).toContain('request_duration_bucket{path="/api",le="1"} 1');
      expect(output).toContain('request_duration_sum{path="/api"} 0.05');
      expect(output).toContain('request_duration_count{path="/api"} 1');
    });

    it('should handle metrics without labels', () => {
      const counter = registry.counter('simple_counter', 'Simple');
      counter.inc();

      const output = registry.toPrometheusText();
      expect(output).toContain('simple_counter 1');
    });

    it('should skip empty label values', () => {
      const counter = registry.counter('counter', 'Test', ['a', 'b']);
      counter.inc({ a: 'value' }); // b is missing

      const output = registry.toPrometheusText();
      expect(output).toContain('counter{a="value"} 1');
    });
  });

  describe('toJSON', () => {
    it('should return JSON representation', () => {
      const counter = registry.counter('counter', 'Counter');
      const gauge = registry.gauge('gauge', 'Gauge');
      const histogram = registry.histogram('histogram', 'Histogram');

      counter.inc();
      gauge.set(10);
      histogram.observe(0.5);

      const json = registry.toJSON();

      expect(json).toHaveProperty('counters');
      expect(json).toHaveProperty('gauges');
      expect(json).toHaveProperty('histograms');
      expect(json.counters).toHaveProperty('counter');
      expect(json.gauges).toHaveProperty('gauge');
      expect(json.histograms).toHaveProperty('histogram');
    });
  });

  describe('reset', () => {
    it('should reset all counters', () => {
      const counter1 = registry.counter('counter1', 'Counter 1');
      const counter2 = registry.counter('counter2', 'Counter 2');

      counter1.inc({}, 10);
      counter2.inc({}, 20);

      registry.reset();

      expect(counter1.get()).toBe(0);
      expect(counter2.get()).toBe(0);
    });
  });
});

describe('Global Metrics', () => {
  beforeEach(() => {
    globalMetrics.reset();
  });

  describe('HTTP Metrics', () => {
    it('should have httpRequestsTotal counter', () => {
      httpRequestsTotal.inc({ method: 'GET', path: '/api/health', status: '200' });
      expect(httpRequestsTotal.get({ method: 'GET', path: '/api/health', status: '200' })).toBe(1);
    });

    it('should have httpRequestDuration histogram', () => {
      httpRequestDuration.observe(0.1, { method: 'GET', path: '/api/users' });
      expect(httpRequestDuration.getAll()).toHaveLength(1);
    });
  });

  describe('Business Metrics', () => {
    it('should have lead metrics', () => {
      leadsCreated.inc({ channel: 'whatsapp', source: 'website' });
      leadsScored.inc({ classification: 'HOT' });
      leadsConverted.inc();

      expect(leadsCreated.get({ channel: 'whatsapp', source: 'website' })).toBe(1);
      expect(leadsScored.get({ classification: 'HOT' })).toBe(1);
      expect(leadsConverted.get()).toBe(1);
    });

    it('should have appointment metrics', () => {
      appointmentsScheduled.inc({ service_type: 'consultation' });
      appointmentsCancelled.inc({ reason: 'patient_request' });

      expect(appointmentsScheduled.get({ service_type: 'consultation' })).toBe(1);
      expect(appointmentsCancelled.get({ reason: 'patient_request' })).toBe(1);
    });

    it('should have messaging metrics', () => {
      messagesReceived.inc({ channel: 'whatsapp' });
      messagesSent.inc({ channel: 'whatsapp', type: 'template' });

      expect(messagesReceived.get({ channel: 'whatsapp' })).toBe(1);
      expect(messagesSent.get({ channel: 'whatsapp', type: 'template' })).toBe(1);
    });
  });

  describe('Technical Metrics', () => {
    it('should have external service metrics', () => {
      externalServiceRequests.inc({ service: 'openai', operation: 'chat', status: 'success' });
      externalServiceDuration.observe(1.5, { service: 'openai', operation: 'chat' });

      expect(
        externalServiceRequests.get({ service: 'openai', operation: 'chat', status: 'success' })
      ).toBe(1);
      expect(externalServiceDuration.getAll()).toHaveLength(1);
    });

    it('should have event store metrics', () => {
      eventsAppended.inc({ type: 'LeadCreated' });
      eventStoreLatency.observe(0.01, { operation: 'append' });

      expect(eventsAppended.get({ type: 'LeadCreated' })).toBe(1);
    });

    it('should have command/query bus metrics', () => {
      commandsExecuted.inc({ type: 'CreateLead', status: 'success' });
      commandDuration.observe(0.1, { type: 'CreateLead' });
      queriesExecuted.inc({ type: 'GetLeads', cached: 'true' });
      queryDuration.observe(0.05, { type: 'GetLeads' });

      expect(commandsExecuted.get({ type: 'CreateLead', status: 'success' })).toBe(1);
      expect(queriesExecuted.get({ type: 'GetLeads', cached: 'true' })).toBe(1);
    });
  });

  describe('Resource Metrics', () => {
    it('should have connection gauges', () => {
      activeConnections.set(10, { type: 'database' });
      activeConnections.set(5, { type: 'redis' });
      queueSize.set(100, { queue: 'scoring' });

      expect(activeConnections.get({ type: 'database' })).toBe(10);
      expect(activeConnections.get({ type: 'redis' })).toBe(5);
      expect(queueSize.get({ queue: 'scoring' })).toBe(100);
    });
  });

  describe('AI Gateway Metrics', () => {
    it('should have AI function metrics', () => {
      aiFunctionCalls.inc({ function: 'scoreLead', status: 'success' });
      aiFunctionDuration.observe(2.5, { function: 'scoreLead' });
      aiIntentDetections.inc({ detected_function: 'scoreLead', confidence_bucket: 'high' });

      expect(aiFunctionCalls.get({ function: 'scoreLead', status: 'success' })).toBe(1);
    });

    it('should have AI provider metrics', () => {
      aiRequestsTotal.inc({ provider: 'openai', status: 'success', operation: 'chat' });
      aiFallbackTotal.inc({
        provider: 'openai',
        fallback_provider: 'anthropic',
        operation: 'scoring',
      });
      aiInstantFallbackTotal.inc({ operation: 'scoring' });
      aiTimeoutTotal.inc({ operation: 'scoring', provider: 'openai' });
      aiOperationDuration.observe(3.5, { operation: 'scoring', provider: 'openai' });
      aiScoringDuration.observe(2.0, { provider: 'openai' });

      expect(
        aiRequestsTotal.get({ provider: 'openai', status: 'success', operation: 'chat' })
      ).toBe(1);
    });

    it('should have AI budget metrics', () => {
      aiDailySpend.set(50.5, { scope: 'global', scope_id: 'all' });
      aiMonthlySpend.set(500.0, { scope: 'global', scope_id: 'all' });
      aiSpendByProvider.inc({ provider: 'openai', model: 'gpt-4', operation: 'chat' });
      aiBudgetAlerts.inc({ scope: 'global', threshold: '80', period: 'daily' });
      aiBudgetStatus.set(75.0, { scope: 'global', scope_id: 'all', period: 'daily' });

      expect(aiDailySpend.get({ scope: 'global', scope_id: 'all' })).toBe(50.5);
    });

    it('should have AI token metrics', () => {
      aiTokensUsed.inc({ type: 'input', model: 'gpt-4', provider: 'openai' });
      aiTokenEstimationTotal.inc({ confidence: 'high' });
      aiTokenEstimationAccuracy.observe(0.95, { model: 'gpt-4' });

      expect(aiTokensUsed.get({ type: 'input', model: 'gpt-4', provider: 'openai' })).toBe(1);
    });

    it('should have AI rate limit metrics', () => {
      aiRateLimitHits.inc({ tier: 'standard', limit_type: 'requests_per_minute' });
      aiConcurrentRequests.set(5, { tier: 'standard' });

      expect(aiRateLimitHits.get({ tier: 'standard', limit_type: 'requests_per_minute' })).toBe(1);
      expect(aiConcurrentRequests.get({ tier: 'standard' })).toBe(5);
    });

    it('should have AI provider health metrics', () => {
      aiProviderHealth.set(1.0, { provider: 'openai' });
      aiProviderResponseTime.set(250, { provider: 'openai' });
      aiProviderSuccessRate.set(0.98, { provider: 'openai' });

      expect(aiProviderHealth.get({ provider: 'openai' })).toBe(1.0);
      expect(aiProviderResponseTime.get({ provider: 'openai' })).toBe(250);
      expect(aiProviderSuccessRate.get({ provider: 'openai' })).toBe(0.98);
    });
  });

  describe('Patient Journey Metrics', () => {
    it('should have patient journey metrics', () => {
      patientJourneyStage.inc({ stage: 'scheduled', from_stage: 'lead' });
      leadClassificationCurrent.set(25, { classification: 'HOT' });
      patientJourneyDuration.observe(3600, { stage: 'lead' });

      expect(patientJourneyStage.get({ stage: 'scheduled', from_stage: 'lead' })).toBe(1);
      expect(leadClassificationCurrent.get({ classification: 'HOT' })).toBe(25);
    });
  });

  describe('Worker Metrics', () => {
    it('should have task metrics', () => {
      workerTasksTotal.inc({ task: 'score-lead', status: 'success' });
      workerTaskDuration.observe(5.0, { task: 'score-lead' });
      workerTaskRetries.inc({ task: 'score-lead', reason: 'timeout' });

      expect(workerTasksTotal.get({ task: 'score-lead', status: 'success' })).toBe(1);
    });

    it('should have queue metrics', () => {
      workerQueueDepth.set(10, { queue: 'default', priority: 'high' });
      workerQueueWaitTime.observe(2.5, { queue: 'default' });

      expect(workerQueueDepth.get({ queue: 'default', priority: 'high' })).toBe(10);
    });

    it('should have workflow metrics', () => {
      workerWorkflowsTotal.inc({ workflow: 'lead-qualification', status: 'success' });
      workerWorkflowDuration.observe(30.0, { workflow: 'lead-qualification' });
      workerWorkflowSteps.inc({
        workflow: 'lead-qualification',
        step: 'scoring',
        status: 'success',
      });

      expect(workerWorkflowsTotal.get({ workflow: 'lead-qualification', status: 'success' })).toBe(
        1
      );
    });

    it('should have cron job metrics', () => {
      workerCronJobsTotal.inc({ job: 'cleanup', status: 'success' });
      workerCronJobDuration.observe(60.0, { job: 'cleanup' });

      expect(workerCronJobsTotal.get({ job: 'cleanup', status: 'success' })).toBe(1);
    });

    it('should have worker health metrics', () => {
      workerActiveJobs.set(3, { worker: 'worker-1' });
      workerConcurrency.set(10, { worker: 'worker-1', type: 'limit' });
      workerConcurrency.set(3, { worker: 'worker-1', type: 'current' });

      expect(workerActiveJobs.get({ worker: 'worker-1' })).toBe(3);
      expect(workerConcurrency.get({ worker: 'worker-1', type: 'limit' })).toBe(10);
    });
  });

  describe('Error Tracking Metrics', () => {
    it('should have error metrics', () => {
      errorsTotal.inc({ category: 'validation', code: 'INVALID_INPUT', service: 'api' });
      circuitBreakerState.set(0, { service: 'openai' }); // 0 = closed (healthy)
      circuitBreakerTrips.inc({ service: 'openai' });

      expect(
        errorsTotal.get({ category: 'validation', code: 'INVALID_INPUT', service: 'api' })
      ).toBe(1);
      expect(circuitBreakerState.get({ service: 'openai' })).toBe(0);
      expect(circuitBreakerTrips.get({ service: 'openai' })).toBe(1);
    });
  });
});
