import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ResourceBlock,
  InvalidResourceBlockError,
  InvalidResourceBlockTransitionError,
  isResourceBlock,
  type ResourceType,
  type ResourceBlockDTO,
} from '../osax/entities/ResourceBlock.js';

describe('ResourceBlock Entity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create', () => {
    it('should create a new resource block with required fields', () => {
      const block = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 90,
      });

      expect(block.id).toMatch(/^rb-/);
      expect(block.caseId).toBe('case-123');
      expect(block.resourceType).toBe('OR_TIME');
      expect(block.durationMinutes).toBe(90);
      expect(block.status).toBe('SOFT_HELD');
    });

    it('should use provided ID', () => {
      const block = ResourceBlock.create({
        id: 'custom-id-123',
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 60,
      });

      expect(block.id).toBe('custom-id-123');
    });

    it('should calculate expiration based on default TTL (72 hours)', () => {
      const block = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'CBCT_MACHINE',
        durationMinutes: 30,
      });

      const expectedExpiry = new Date('2024-06-18T10:00:00.000Z');
      expect(block.expiresAt).toEqual(expectedExpiry);
    });

    it('should calculate expiration based on custom TTL', () => {
      const block = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 60,
        ttlHours: 24,
      });

      const expectedExpiry = new Date('2024-06-16T10:00:00.000Z');
      expect(block.expiresAt).toEqual(expectedExpiry);
    });

    it('should use provided createdAt', () => {
      const createdAt = new Date('2024-06-10T08:00:00.000Z');
      const block = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 60,
        createdAt,
      });

      expect(block.createdAt).toEqual(createdAt);
    });

    it('should support all resource types', () => {
      const types: ResourceType[] = [
        'OR_TIME',
        'CBCT_MACHINE',
        'SURGICAL_KIT',
        'SPECIALIST',
        'ANESTHESIOLOGIST',
        'DENTAL_CHAIR',
        'IMPLANT_KIT',
      ];

      types.forEach((type) => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: type,
          durationMinutes: 60,
        });
        expect(block.resourceType).toBe(type);
      });
    });
  });

  describe('validation', () => {
    it('should throw for missing caseId', () => {
      expect(() =>
        ResourceBlock.create({
          caseId: '',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
        })
      ).toThrow(InvalidResourceBlockError);
    });

    it('should throw for invalid resourceType', () => {
      expect(() =>
        ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'INVALID_TYPE' as ResourceType,
          durationMinutes: 60,
        })
      ).toThrow(InvalidResourceBlockError);
    });

    it('should throw for zero duration', () => {
      expect(() =>
        ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 0,
        })
      ).toThrow(InvalidResourceBlockError);
    });

    it('should throw for negative duration', () => {
      expect(() =>
        ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: -30,
        })
      ).toThrow(InvalidResourceBlockError);
    });

    it('should throw for duration exceeding 8 hours', () => {
      expect(() =>
        ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 500,
        })
      ).toThrow(InvalidResourceBlockError);
    });

    it('should throw for invalid ttlHours', () => {
      expect(() =>
        ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
          ttlHours: 0,
        })
      ).toThrow(InvalidResourceBlockError);
    });

    it('should throw for ttlHours exceeding one week', () => {
      expect(() =>
        ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
          ttlHours: 200,
        })
      ).toThrow(InvalidResourceBlockError);
    });
  });

  describe('confirm', () => {
    it('should confirm a soft-held block', () => {
      const block = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 90,
      });

      const scheduledStart = new Date('2024-06-20T09:00:00.000Z');
      block.confirm(scheduledStart);

      expect(block.status).toBe('CONFIRMED');
      expect(block.scheduledStart).toEqual(scheduledStart);
    });

    it('should throw when confirming from invalid status', () => {
      const block = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 60,
      });

      block.release();

      expect(() => block.confirm(new Date())).toThrow(InvalidResourceBlockTransitionError);
    });

    it('should throw when confirming expired block', () => {
      const block = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 60,
        ttlHours: 1,
      });

      // Advance time past expiration
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);

      expect(() => block.confirm(new Date())).toThrow(InvalidResourceBlockTransitionError);
    });

    it('should throw for invalid scheduledStart', () => {
      const block = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 60,
      });

      expect(() => block.confirm(null as unknown as Date)).toThrow(InvalidResourceBlockError);
      expect(() => block.confirm(new Date('invalid'))).toThrow(InvalidResourceBlockError);
    });
  });

  describe('release', () => {
    it('should release a soft-held block', () => {
      const block = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 60,
      });

      block.release('Patient cancelled');

      expect(block.status).toBe('RELEASED');
      expect(block.releaseReason).toBe('Patient cancelled');
    });

    it('should release a confirmed block', () => {
      const block = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 60,
      });

      block.confirm(new Date('2024-06-20T09:00:00.000Z'));
      block.release();

      expect(block.status).toBe('RELEASED');
    });

    it('should release without reason', () => {
      const block = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 60,
      });

      block.release();

      expect(block.status).toBe('RELEASED');
      expect(block.releaseReason).toBeUndefined();
    });

    it('should throw when releasing from invalid status', () => {
      const block = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 60,
      });

      block.release();

      expect(() => block.release()).toThrow(InvalidResourceBlockTransitionError);
    });
  });

  describe('markExpired', () => {
    it('should mark soft-held block as expired', () => {
      const block = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 60,
      });

      block.markExpired();

      expect(block.status).toBe('EXPIRED');
    });

    it('should throw when marking confirmed block as expired', () => {
      const block = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 60,
      });

      block.confirm(new Date('2024-06-20T09:00:00.000Z'));

      expect(() => block.markExpired()).toThrow(InvalidResourceBlockTransitionError);
    });
  });

  describe('query methods', () => {
    describe('isExpired', () => {
      it('should return false for fresh soft-held block', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
        });

        expect(block.isExpired()).toBe(false);
      });

      it('should return true after TTL expires', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
          ttlHours: 1,
        });

        vi.advanceTimersByTime(2 * 60 * 60 * 1000);

        expect(block.isExpired()).toBe(true);
      });

      it('should return true for EXPIRED status', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
        });

        block.markExpired();

        expect(block.isExpired()).toBe(true);
      });

      it('should return false for confirmed block', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
          ttlHours: 1,
        });

        block.confirm(new Date('2024-06-20T09:00:00.000Z'));
        vi.advanceTimersByTime(2 * 60 * 60 * 1000);

        expect(block.isExpired()).toBe(false);
      });
    });

    describe('isActive', () => {
      it('should return true for soft-held block', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
        });

        expect(block.isActive()).toBe(true);
      });

      it('should return true for confirmed block', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
        });

        block.confirm(new Date('2024-06-20T09:00:00.000Z'));

        expect(block.isActive()).toBe(true);
      });

      it('should return false for expired soft-held block', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
          ttlHours: 1,
        });

        vi.advanceTimersByTime(2 * 60 * 60 * 1000);

        expect(block.isActive()).toBe(false);
      });

      it('should return false for released block', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
        });

        block.release();

        expect(block.isActive()).toBe(false);
      });
    });

    describe('isSoftHeld', () => {
      it('should return true for soft-held block', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
        });

        expect(block.isSoftHeld()).toBe(true);
      });

      it('should return false after confirmation', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
        });

        block.confirm(new Date('2024-06-20T09:00:00.000Z'));

        expect(block.isSoftHeld()).toBe(false);
      });

      it('should return false when expired', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
          ttlHours: 1,
        });

        vi.advanceTimersByTime(2 * 60 * 60 * 1000);

        expect(block.isSoftHeld()).toBe(false);
      });
    });

    describe('isConfirmed', () => {
      it('should return true for confirmed block', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
        });

        block.confirm(new Date());

        expect(block.isConfirmed()).toBe(true);
      });
    });

    describe('isReleased', () => {
      it('should return true for released block', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
        });

        block.release();

        expect(block.isReleased()).toBe(true);
      });
    });

    describe('getTimeRemainingMs', () => {
      it('should return remaining time for soft-held block', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
          ttlHours: 1,
        });

        const remaining = block.getTimeRemainingMs();
        expect(remaining).toBe(60 * 60 * 1000);
      });

      it('should return 0 for confirmed block', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
        });

        block.confirm(new Date());

        expect(block.getTimeRemainingMs()).toBe(0);
      });

      it('should return 0 when expired', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
          ttlHours: 1,
        });

        vi.advanceTimersByTime(2 * 60 * 60 * 1000);

        expect(block.getTimeRemainingMs()).toBe(0);
      });
    });

    describe('getScheduledEnd', () => {
      it('should return scheduled end for confirmed block', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 90,
        });

        const startTime = new Date('2024-06-20T09:00:00.000Z');
        block.confirm(startTime);

        const expectedEnd = new Date('2024-06-20T10:30:00.000Z');
        expect(block.getScheduledEnd()).toEqual(expectedEnd);
      });

      it('should return undefined for unconfirmed block', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
        });

        expect(block.getScheduledEnd()).toBeUndefined();
      });
    });

    describe('getResourceDescription', () => {
      it('should return human-readable description for each type', () => {
        const descriptions: Record<ResourceType, string> = {
          OR_TIME: 'Operating Room Time',
          CBCT_MACHINE: 'CBCT Scanner',
          SURGICAL_KIT: 'Surgical Instrument Kit',
          SPECIALIST: 'Specialist Surgeon',
          ANESTHESIOLOGIST: 'Anesthesiologist',
          DENTAL_CHAIR: 'Dental Operatory',
          IMPLANT_KIT: 'Implant Surgical Kit',
        };

        Object.entries(descriptions).forEach(([type, expected]) => {
          const block = ResourceBlock.create({
            caseId: 'case-123',
            resourceType: type as ResourceType,
            durationMinutes: 60,
          });

          expect(block.getResourceDescription()).toBe(expected);
        });
      });
    });
  });

  describe('equals', () => {
    it('should return true for same ID', () => {
      const block1 = ResourceBlock.create({
        id: 'rb-123',
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 60,
      });

      const block2 = ResourceBlock.create({
        id: 'rb-123',
        caseId: 'case-456',
        resourceType: 'CBCT_MACHINE',
        durationMinutes: 30,
      });

      expect(block1.equals(block2)).toBe(true);
    });

    it('should return false for different IDs', () => {
      const block1 = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 60,
      });

      const block2 = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 60,
      });

      expect(block1.equals(block2)).toBe(false);
    });

    it('should return false for null', () => {
      const block = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 60,
      });

      expect(block.equals(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      const block = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 60,
      });

      expect(block.equals(undefined)).toBe(false);
    });
  });

  describe('reconstitute', () => {
    it('should reconstitute from DTO', () => {
      const dto: ResourceBlockDTO = {
        id: 'rb-123',
        caseId: 'case-456',
        resourceType: 'OR_TIME',
        status: 'CONFIRMED',
        durationMinutes: 90,
        scheduledStart: '2024-06-20T09:00:00.000Z',
        expiresAt: '2024-06-18T10:00:00.000Z',
        createdAt: '2024-06-15T10:00:00.000Z',
        updatedAt: '2024-06-16T10:00:00.000Z',
      };

      const block = ResourceBlock.reconstitute(dto);

      expect(block.id).toBe('rb-123');
      expect(block.caseId).toBe('case-456');
      expect(block.status).toBe('CONFIRMED');
      expect(block.scheduledStart).toEqual(new Date('2024-06-20T09:00:00.000Z'));
    });

    it('should reconstitute with Date objects', () => {
      const dto: ResourceBlockDTO = {
        id: 'rb-123',
        caseId: 'case-456',
        resourceType: 'OR_TIME',
        status: 'SOFT_HELD',
        durationMinutes: 60,
        expiresAt: new Date('2024-06-18T10:00:00.000Z'),
        createdAt: new Date('2024-06-15T10:00:00.000Z'),
        updatedAt: new Date('2024-06-15T10:00:00.000Z'),
      };

      const block = ResourceBlock.reconstitute(dto);

      expect(block.expiresAt).toEqual(new Date('2024-06-18T10:00:00.000Z'));
    });

    it('should reconstitute with release reason', () => {
      const dto: ResourceBlockDTO = {
        id: 'rb-123',
        caseId: 'case-456',
        resourceType: 'OR_TIME',
        status: 'RELEASED',
        durationMinutes: 60,
        expiresAt: '2024-06-18T10:00:00.000Z',
        createdAt: '2024-06-15T10:00:00.000Z',
        updatedAt: '2024-06-16T10:00:00.000Z',
        releaseReason: 'Patient cancelled',
      };

      const block = ResourceBlock.reconstitute(dto);

      expect(block.releaseReason).toBe('Patient cancelled');
    });

    it('should throw for invalid DTO', () => {
      expect(() => ResourceBlock.reconstitute(null as unknown as ResourceBlockDTO)).toThrow(
        InvalidResourceBlockError
      );
      expect(() => ResourceBlock.reconstitute('invalid' as unknown as ResourceBlockDTO)).toThrow(
        InvalidResourceBlockError
      );
    });
  });

  describe('serialization', () => {
    describe('toJSON', () => {
      it('should serialize to JSON', () => {
        const block = ResourceBlock.create({
          id: 'rb-123',
          caseId: 'case-456',
          resourceType: 'OR_TIME',
          durationMinutes: 90,
        });

        const json = block.toJSON();

        expect(json.id).toBe('rb-123');
        expect(json.caseId).toBe('case-456');
        expect(json.resourceType).toBe('OR_TIME');
        expect(json.status).toBe('SOFT_HELD');
        expect(json.durationMinutes).toBe(90);
        expect(typeof json.expiresAt).toBe('string');
        expect(typeof json.createdAt).toBe('string');
      });

      it('should include scheduledStart when confirmed', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
        });

        block.confirm(new Date('2024-06-20T09:00:00.000Z'));
        const json = block.toJSON();

        expect(json.scheduledStart).toBe('2024-06-20T09:00:00.000Z');
      });

      it('should include releaseReason when released', () => {
        const block = ResourceBlock.create({
          caseId: 'case-123',
          resourceType: 'OR_TIME',
          durationMinutes: 60,
        });

        block.release('Cancelled by staff');
        const json = block.toJSON();

        expect(json.releaseReason).toBe('Cancelled by staff');
      });
    });

    describe('toString', () => {
      it('should return string representation', () => {
        const block = ResourceBlock.create({
          id: 'rb-123',
          caseId: 'case-456',
          resourceType: 'OR_TIME',
          durationMinutes: 90,
        });

        const str = block.toString();

        expect(str).toContain('rb-123');
        expect(str).toContain('OR_TIME');
        expect(str).toContain('SOFT_HELD');
        expect(str).toContain('90min');
      });
    });
  });

  describe('isResourceBlock type guard', () => {
    it('should return true for ResourceBlock instance', () => {
      const block = ResourceBlock.create({
        caseId: 'case-123',
        resourceType: 'OR_TIME',
        durationMinutes: 60,
      });

      expect(isResourceBlock(block)).toBe(true);
    });

    it('should return false for non-ResourceBlock', () => {
      expect(isResourceBlock({})).toBe(false);
      expect(isResourceBlock(null)).toBe(false);
      expect(isResourceBlock('string')).toBe(false);
      expect(isResourceBlock(123)).toBe(false);
    });
  });

  describe('Error classes', () => {
    describe('InvalidResourceBlockError', () => {
      it('should create error with details', () => {
        const error = new InvalidResourceBlockError('Test error', {
          field: 'caseId',
          value: null,
        });

        expect(error.name).toBe('InvalidResourceBlockError');
        expect(error.code).toBe('INVALID_RESOURCE_BLOCK');
        expect(error.message).toBe('Test error');
        expect(error.details.field).toBe('caseId');
      });

      it('should serialize to JSON', () => {
        const error = new InvalidResourceBlockError('Test', { field: 'test' });
        const json = error.toJSON();

        expect(json.name).toBe('InvalidResourceBlockError');
        expect(json.code).toBe('INVALID_RESOURCE_BLOCK');
        expect(json.message).toBe('Test');
      });
    });

    describe('InvalidResourceBlockTransitionError', () => {
      it('should create transition error', () => {
        const error = new InvalidResourceBlockTransitionError('Cannot transition', {
          currentStatus: 'RELEASED',
          targetStatus: 'CONFIRMED',
        });

        expect(error.name).toBe('InvalidResourceBlockTransitionError');
        expect(error.code).toBe('INVALID_RESOURCE_BLOCK_TRANSITION');
        expect(error.details.currentStatus).toBe('RELEASED');
        expect(error.details.targetStatus).toBe('CONFIRMED');
      });
    });
  });
});
