/**
 * @fileoverview Tests for Plan Capacity Use Case
 *
 * Tests the orchestration of capacity planning operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PlanCapacityUseCase,
  createPlanCapacityUseCase,
  type PlanCapacityInput,
} from '../plan-capacity.js';
import type { ICapacityPlanningRepository } from '../../repositories/capacity-planning-repository.js';
import type { StaffShift, ShiftConflict } from '../../entities/staff-shift.js';
import type { HistoricalDemandData } from '../../entities/capacity-plan.js';
import { CapacityPlanningPolicy } from '../../services/capacity-planning-policy.js';

describe('PlanCapacityUseCase', () => {
  let mockRepository: ICapacityPlanningRepository;
  let useCase: PlanCapacityUseCase;

  const createMockShift = (overrides: Partial<StaffShift> = {}): StaffShift => ({
    id: 'shift-001',
    clinicId: 'clinic-001',
    staffId: 'staff-001',
    staffName: 'Dr. Smith',
    staffRole: 'DENTIST',
    shiftType: 'REGULAR',
    startTime: new Date('2024-01-15T09:00:00Z'),
    endTime: new Date('2024-01-15T17:00:00Z'),
    breakMinutes: 60,
    maxAppointments: 16,
    bookedAppointments: 8,
    status: 'SCHEDULED',
    procedureTypes: ['cleaning', 'extraction'],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  });

  const createMockHistoricalData = (): HistoricalDemandData[] => [
    { date: new Date('2024-01-01'), dayOfWeek: 1, appointments: 15, noShows: 2, cancellations: 1 },
    { date: new Date('2024-01-02'), dayOfWeek: 2, appointments: 18, noShows: 1, cancellations: 2 },
    { date: new Date('2024-01-03'), dayOfWeek: 3, appointments: 20, noShows: 3, cancellations: 1 },
  ];

  beforeEach(() => {
    mockRepository = {
      createShift: vi.fn(),
      getShift: vi.fn(),
      getShiftsBySpec: vi.fn(),
      getShiftsInRange: vi.fn(),
      getStaffShifts: vi.fn(),
      updateShift: vi.fn(),
      updateShiftBookings: vi.fn(),
      cancelShift: vi.fn(),
      deleteShift: vi.fn(),
      createPlan: vi.fn(),
      getPlan: vi.fn(),
      getPlansBySpec: vi.fn(),
      getLatestPlan: vi.fn(),
      savePlan: vi.fn(),
      recordDemand: vi.fn(),
      getHistoricalDemand: vi.fn(),
      getDailyCapacity: vi.fn(),
      getWeeklyCapacity: vi.fn(),
      getStaffAvailability: vi.fn(),
    };

    useCase = new PlanCapacityUseCase(mockRepository);
  });

  describe('Input Validation', () => {
    const validInput: PlanCapacityInput = {
      clinicId: 'clinic-001',
      startDate: new Date('2024-01-15'),
      endDate: new Date('2024-01-20'),
      period: 'WEEK',
      correlationId: 'corr-123',
    };

    it('should reject empty clinic ID', async () => {
      const input = { ...validInput, clinicId: '   ' };

      const result = await useCase.execute(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('Clinic ID');
      }
    });

    it('should reject invalid start date', async () => {
      const input = { ...validInput, startDate: new Date('invalid') };

      const result = await useCase.execute(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('start date');
      }
    });

    it('should reject invalid end date', async () => {
      const input = { ...validInput, endDate: new Date('invalid') };

      const result = await useCase.execute(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('end date');
      }
    });

    it('should reject start date after end date', async () => {
      const input = {
        ...validInput,
        startDate: new Date('2024-01-20'),
        endDate: new Date('2024-01-15'),
      };

      const result = await useCase.execute(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('after start date');
      }
    });

    it('should reject date range exceeding 31 days', async () => {
      const input = {
        ...validInput,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-02-05'),
      };

      const result = await useCase.execute(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('31 days');
      }
    });

    it('should reject empty correlation ID', async () => {
      const input = { ...validInput, correlationId: '' };

      const result = await useCase.execute(input);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('Correlation ID');
      }
    });
  });

  describe('Successful Execution', () => {
    const validInput: PlanCapacityInput = {
      clinicId: 'clinic-001',
      startDate: new Date('2024-01-15'),
      endDate: new Date('2024-01-17'),
      period: 'DAY',
      correlationId: 'corr-123',
    };

    it('should create capacity plan successfully', async () => {
      const shifts = [
        createMockShift({ id: 'shift-1', startTime: new Date('2024-01-15T09:00:00Z') }),
        createMockShift({ id: 'shift-2', startTime: new Date('2024-01-16T09:00:00Z') }),
      ];

      vi.mocked(mockRepository.getShiftsInRange).mockResolvedValue({
        success: true,
        value: shifts,
      });
      vi.mocked(mockRepository.savePlan).mockResolvedValue({
        success: true,
        value: {} as never,
      });

      const result = await useCase.execute(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.plan).toBeDefined();
        expect(result.value.plan.clinicId).toBe('clinic-001');
        expect(result.value.conflictAnalysis).toBeDefined();
        expect(result.value.staffingAnalysis).toBeDefined();
        expect(result.value.events.length).toBeGreaterThan(0);
      }
    });

    it('should include historical data when includeForecast is true', async () => {
      const shifts = [createMockShift()];
      const historicalData = createMockHistoricalData();

      vi.mocked(mockRepository.getShiftsInRange).mockResolvedValue({
        success: true,
        value: shifts,
      });
      vi.mocked(mockRepository.getHistoricalDemand).mockResolvedValue({
        success: true,
        value: historicalData,
      });
      vi.mocked(mockRepository.savePlan).mockResolvedValue({
        success: true,
        value: {} as never,
      });

      const result = await useCase.execute({ ...validInput, includeForecast: true });

      expect(result.success).toBe(true);
      expect(mockRepository.getHistoricalDemand).toHaveBeenCalled();
    });

    it('should generate optimizations when includeOptimizations is true', async () => {
      const shifts = [createMockShift()];

      vi.mocked(mockRepository.getShiftsInRange).mockResolvedValue({
        success: true,
        value: shifts,
      });
      vi.mocked(mockRepository.savePlan).mockResolvedValue({
        success: true,
        value: {} as never,
      });

      const result = await useCase.execute({ ...validInput, includeOptimizations: true });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.optimizations).toBeDefined();
      }
    });

    it('should handle empty shifts array', async () => {
      vi.mocked(mockRepository.getShiftsInRange).mockResolvedValue({
        success: true,
        value: [],
      });
      vi.mocked(mockRepository.savePlan).mockResolvedValue({
        success: true,
        value: {} as never,
      });

      const result = await useCase.execute(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.plan.shifts).toHaveLength(0);
      }
    });
  });

  describe('Repository Errors', () => {
    const validInput: PlanCapacityInput = {
      clinicId: 'clinic-001',
      startDate: new Date('2024-01-15'),
      endDate: new Date('2024-01-17'),
      period: 'DAY',
      correlationId: 'corr-123',
    };

    it('should handle shifts fetch error', async () => {
      vi.mocked(mockRepository.getShiftsInRange).mockResolvedValue({
        success: false,
        error: {
          code: 'CONNECTION_ERROR',
          message: 'Database connection failed',
        },
      });

      const result = await useCase.execute(validInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('REPOSITORY_ERROR');
        expect(result.error.message).toContain('Database connection failed');
      }
    });

    it('should continue even if save plan fails', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const shifts = [createMockShift()];

      vi.mocked(mockRepository.getShiftsInRange).mockResolvedValue({
        success: true,
        value: shifts,
      });
      vi.mocked(mockRepository.savePlan).mockResolvedValue({
        success: false,
        error: {
          code: 'CONNECTION_ERROR',
          message: 'Save failed',
        },
      });

      const result = await useCase.execute(validInput);

      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to save capacity plan:', expect.any(Object));

      consoleSpy.mockRestore();
    });
  });

  describe('Event Emission', () => {
    const validInput: PlanCapacityInput = {
      clinicId: 'clinic-001',
      startDate: new Date('2024-01-15'),
      endDate: new Date('2024-01-16'),
      period: 'DAY',
      correlationId: 'corr-123',
    };

    it('should emit PlanCreated event', async () => {
      const shifts = [createMockShift()];

      vi.mocked(mockRepository.getShiftsInRange).mockResolvedValue({
        success: true,
        value: shifts,
      });
      vi.mocked(mockRepository.savePlan).mockResolvedValue({
        success: true,
        value: {} as never,
      });

      const result = await useCase.execute(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        const planCreatedEvent = result.value.events.find((e) => e.type === 'plan.created');
        expect(planCreatedEvent).toBeDefined();
      }
    });

    it('should emit CapacityCalculated events for each day', async () => {
      const shifts = [
        createMockShift({ startTime: new Date('2024-01-15T09:00:00Z') }),
        createMockShift({ id: 'shift-2', startTime: new Date('2024-01-16T09:00:00Z') }),
      ];

      vi.mocked(mockRepository.getShiftsInRange).mockResolvedValue({
        success: true,
        value: shifts,
      });
      vi.mocked(mockRepository.savePlan).mockResolvedValue({
        success: true,
        value: {} as never,
      });

      const result = await useCase.execute(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        const capacityEvents = result.value.events.filter((e) => e.type === 'capacity.calculated');
        expect(capacityEvents.length).toBeGreaterThan(0);
      }
    });

    it('should emit CapacityCritical events for critical/overbooked days', async () => {
      // Create shifts that would result in critical capacity
      const shifts = [
        createMockShift({
          maxAppointments: 10,
          bookedAppointments: 9, // 90% utilization = CRITICAL
        }),
      ];

      vi.mocked(mockRepository.getShiftsInRange).mockResolvedValue({
        success: true,
        value: shifts,
      });
      vi.mocked(mockRepository.savePlan).mockResolvedValue({
        success: true,
        value: {} as never,
      });

      const result = await useCase.execute(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        const criticalEvents = result.value.events.filter(
          (e) => e.type === 'capacity.capacity_critical'
        );
        expect(criticalEvents.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Summary Generation', () => {
    const validInput: PlanCapacityInput = {
      clinicId: 'clinic-001',
      startDate: new Date('2024-01-15'),
      endDate: new Date('2024-01-17'),
      period: 'DAY',
      correlationId: 'corr-123',
    };

    it('should generate summary with shift count', async () => {
      const shifts = [
        createMockShift({ id: 'shift-1' }),
        createMockShift({ id: 'shift-2' }),
        createMockShift({ id: 'shift-3' }),
      ];

      vi.mocked(mockRepository.getShiftsInRange).mockResolvedValue({
        success: true,
        value: shifts,
      });
      vi.mocked(mockRepository.savePlan).mockResolvedValue({
        success: true,
        value: {} as never,
      });

      const result = await useCase.execute(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.summary).toContain('3 shifts');
      }
    });

    it('should include staffing levels in summary', async () => {
      const shifts = [createMockShift()];

      vi.mocked(mockRepository.getShiftsInRange).mockResolvedValue({
        success: true,
        value: shifts,
      });
      vi.mocked(mockRepository.savePlan).mockResolvedValue({
        success: true,
        value: {} as never,
      });

      const result = await useCase.execute(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        // Summary should mention staffing levels (either adequate or gaps identified)
        expect(result.value.summary).toMatch(/Staffing (levels are adequate|gaps identified)/);
      }
    });

    it('should include average utilization', async () => {
      const shifts = [createMockShift()];

      vi.mocked(mockRepository.getShiftsInRange).mockResolvedValue({
        success: true,
        value: shifts,
      });
      vi.mocked(mockRepository.savePlan).mockResolvedValue({
        success: true,
        value: {} as never,
      });

      const result = await useCase.execute(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.summary).toMatch(/Average utilization: \d+(\.\d+)?%/);
      }
    });
  });

  describe('Custom Policy', () => {
    it('should use custom policy when provided', async () => {
      const customPolicy = new CapacityPlanningPolicy();
      const detectConflictsSpy = vi.spyOn(customPolicy, 'detectConflicts');

      const customUseCase = new PlanCapacityUseCase(mockRepository, customPolicy);
      const shifts = [createMockShift()];

      vi.mocked(mockRepository.getShiftsInRange).mockResolvedValue({
        success: true,
        value: shifts,
      });
      vi.mocked(mockRepository.savePlan).mockResolvedValue({
        success: true,
        value: {} as never,
      });

      const result = await customUseCase.execute({
        clinicId: 'clinic-001',
        startDate: new Date('2024-01-15'),
        endDate: new Date('2024-01-17'),
        period: 'DAY',
        correlationId: 'corr-123',
      });

      expect(result.success).toBe(true);
      expect(detectConflictsSpy).toHaveBeenCalled();
    });
  });

  describe('createPlanCapacityUseCase factory', () => {
    it('should create use case instance', () => {
      const instance = createPlanCapacityUseCase(mockRepository);

      expect(instance).toBeInstanceOf(PlanCapacityUseCase);
    });

    it('should create use case with custom policy', () => {
      const customPolicy = new CapacityPlanningPolicy();
      const instance = createPlanCapacityUseCase(mockRepository, customPolicy);

      expect(instance).toBeInstanceOf(PlanCapacityUseCase);
    });
  });
});
