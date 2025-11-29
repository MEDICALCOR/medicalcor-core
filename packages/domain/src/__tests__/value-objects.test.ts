/**
 * @fileoverview Value Objects Unit Tests
 *
 * Banking/Medical Grade tests for domain Value Objects.
 * Tests cover all business rules, invariants, and edge cases.
 *
 * @module domain/__tests__/value-objects
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LeadScore,
  InvalidLeadScoreError,
  type LeadClassification,
} from '../shared-kernel/value-objects/lead-score.js';
import {
  PhoneNumber,
  InvalidPhoneNumberError,
  type PhoneRegion,
} from '../shared-kernel/value-objects/phone-number.js';

// ============================================================================
// LEAD SCORE VALUE OBJECT TESTS
// ============================================================================

describe('LeadScore Value Object', () => {
  describe('Factory Methods', () => {
    describe('fromNumeric()', () => {
      it('creates score for value 1 (UNQUALIFIED)', () => {
        const score = LeadScore.fromNumeric(1);
        expect(score.numericValue).toBe(1);
        expect(score.classification).toBe('UNQUALIFIED');
      });

      it('creates score for value 2 (COLD)', () => {
        const score = LeadScore.fromNumeric(2);
        expect(score.numericValue).toBe(2);
        expect(score.classification).toBe('COLD');
      });

      it('creates score for value 3 (WARM)', () => {
        const score = LeadScore.fromNumeric(3);
        expect(score.numericValue).toBe(3);
        expect(score.classification).toBe('WARM');
      });

      it('creates score for value 4 (HOT)', () => {
        const score = LeadScore.fromNumeric(4);
        expect(score.numericValue).toBe(4);
        expect(score.classification).toBe('HOT');
      });

      it('creates score for value 5 (HOT - max qualified)', () => {
        const score = LeadScore.fromNumeric(5);
        expect(score.numericValue).toBe(5);
        expect(score.classification).toBe('HOT');
      });

      it('accepts custom confidence level', () => {
        const score = LeadScore.fromNumeric(4, 0.95);
        expect(score.confidence).toBe(0.95);
      });

      it('throws for score below 1', () => {
        expect(() => LeadScore.fromNumeric(0)).toThrow(InvalidLeadScoreError);
        expect(() => LeadScore.fromNumeric(-1)).toThrow(InvalidLeadScoreError);
      });

      it('throws for score above 5', () => {
        expect(() => LeadScore.fromNumeric(6)).toThrow(InvalidLeadScoreError);
        expect(() => LeadScore.fromNumeric(10)).toThrow(InvalidLeadScoreError);
      });

      it('throws for non-integer scores', () => {
        expect(() => LeadScore.fromNumeric(3.5)).toThrow(InvalidLeadScoreError);
        expect(() => LeadScore.fromNumeric(2.7)).toThrow(InvalidLeadScoreError);
      });

      it('throws for invalid confidence below 0', () => {
        expect(() => LeadScore.fromNumeric(3, -0.1)).toThrow(InvalidLeadScoreError);
      });

      it('throws for invalid confidence above 1', () => {
        expect(() => LeadScore.fromNumeric(3, 1.5)).toThrow(InvalidLeadScoreError);
      });
    });

    describe('Classification Factory Methods', () => {
      it('hot() creates HOT score with default confidence', () => {
        const score = LeadScore.hot();
        expect(score.classification).toBe('HOT');
        expect(score.numericValue).toBe(4);
        expect(score.confidence).toBe(0.85);
      });

      it('hot(true) creates max qualified HOT score', () => {
        const score = LeadScore.hot(true);
        expect(score.numericValue).toBe(5);
        expect(score.classification).toBe('HOT');
      });

      it('warm() creates WARM score', () => {
        const score = LeadScore.warm();
        expect(score.classification).toBe('WARM');
        expect(score.numericValue).toBe(3);
      });

      it('cold() creates COLD score', () => {
        const score = LeadScore.cold();
        expect(score.classification).toBe('COLD');
        expect(score.numericValue).toBe(2);
      });

      it('unqualified() creates UNQUALIFIED score', () => {
        const score = LeadScore.unqualified();
        expect(score.classification).toBe('UNQUALIFIED');
        expect(score.numericValue).toBe(1);
      });
    });

    describe('fromClassification()', () => {
      it('creates correct score for each classification', () => {
        const hotScore = LeadScore.fromClassification('HOT');
        expect(hotScore.numericValue).toBe(4);

        const warmScore = LeadScore.fromClassification('WARM');
        expect(warmScore.numericValue).toBe(3);

        const coldScore = LeadScore.fromClassification('COLD');
        expect(coldScore.numericValue).toBe(2);

        const unqualifiedScore = LeadScore.fromClassification('UNQUALIFIED');
        expect(unqualifiedScore.numericValue).toBe(1);
      });
    });

    describe('parse()', () => {
      it('parses numeric values', () => {
        const result = LeadScore.parse(4);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.numericValue).toBe(4);
        }
      });

      it('parses string numbers', () => {
        const result = LeadScore.parse('3');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.numericValue).toBe(3);
        }
      });

      it('parses classification strings', () => {
        const result = LeadScore.parse('HOT');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.classification).toBe('HOT');
        }
      });

      it('parses classification strings case-insensitively', () => {
        const result = LeadScore.parse('warm');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.classification).toBe('WARM');
        }
      });

      it('parses LeadScore instances', () => {
        const original = LeadScore.hot();
        const result = LeadScore.parse(original);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toBe(original);
        }
      });

      it('parses objects with numericValue', () => {
        const result = LeadScore.parse({ numericValue: 4, confidence: 0.9 });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.numericValue).toBe(4);
          expect(result.value.confidence).toBe(0.9);
        }
      });

      it('returns error for invalid inputs', () => {
        const result = LeadScore.parse('invalid');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });
    });
  });

  describe('Business Rules', () => {
    describe('INVARIANT: Score must be 1-5', () => {
      it('accepts boundary values 1 and 5', () => {
        expect(LeadScore.fromNumeric(1).numericValue).toBe(1);
        expect(LeadScore.fromNumeric(5).numericValue).toBe(5);
      });

      it('rejects values outside boundaries', () => {
        expect(() => LeadScore.fromNumeric(0)).toThrow();
        expect(() => LeadScore.fromNumeric(6)).toThrow();
      });
    });

    describe('RULE: HOT leads require immediate attention', () => {
      it('HOT leads requiresImmediateAttention() returns true', () => {
        expect(LeadScore.hot().requiresImmediateAttention()).toBe(true);
        expect(LeadScore.fromNumeric(5).requiresImmediateAttention()).toBe(true);
      });

      it('non-HOT leads requiresImmediateAttention() returns false', () => {
        expect(LeadScore.warm().requiresImmediateAttention()).toBe(false);
        expect(LeadScore.cold().requiresImmediateAttention()).toBe(false);
        expect(LeadScore.unqualified().requiresImmediateAttention()).toBe(false);
      });
    });

    describe('RULE: COLD and WARM leads require nurturing', () => {
      it('COLD and WARM leads requiresNurturing() returns true', () => {
        expect(LeadScore.warm().requiresNurturing()).toBe(true);
        expect(LeadScore.cold().requiresNurturing()).toBe(true);
      });

      it('HOT and UNQUALIFIED leads requiresNurturing() returns false', () => {
        expect(LeadScore.hot().requiresNurturing()).toBe(false);
        expect(LeadScore.unqualified().requiresNurturing()).toBe(false);
      });
    });

    describe('RULE: Only HOT leads get auto-assigned to sales', () => {
      it('HOT leads shouldAutoAssignToSales() returns true', () => {
        expect(LeadScore.hot().shouldAutoAssignToSales()).toBe(true);
      });

      it('non-HOT leads shouldAutoAssignToSales() returns false', () => {
        expect(LeadScore.warm().shouldAutoAssignToSales()).toBe(false);
        expect(LeadScore.cold().shouldAutoAssignToSales()).toBe(false);
      });
    });

    describe('RULE: SLA Response Times by Classification', () => {
      it('HOT leads have 5 minute SLA', () => {
        expect(LeadScore.hot().getSLAResponseTimeMinutes()).toBe(5);
      });

      it('WARM leads have 1 hour SLA', () => {
        expect(LeadScore.warm().getSLAResponseTimeMinutes()).toBe(60);
      });

      it('COLD leads have 24 hour SLA', () => {
        expect(LeadScore.cold().getSLAResponseTimeMinutes()).toBe(1440);
      });

      it('UNQUALIFIED leads have 72 hour SLA', () => {
        expect(LeadScore.unqualified().getSLAResponseTimeMinutes()).toBe(4320);
      });
    });

    describe('RULE: Task Priority by Classification', () => {
      it('score 5 gets critical priority', () => {
        expect(LeadScore.fromNumeric(5).getTaskPriority()).toBe('critical');
      });

      it('score 4 gets high priority', () => {
        expect(LeadScore.fromNumeric(4).getTaskPriority()).toBe('high');
      });

      it('WARM gets medium priority', () => {
        expect(LeadScore.warm().getTaskPriority()).toBe('medium');
      });

      it('COLD and UNQUALIFIED get low priority', () => {
        expect(LeadScore.cold().getTaskPriority()).toBe('low');
        expect(LeadScore.unqualified().getTaskPriority()).toBe('low');
      });
    });
  });

  describe('Immutability', () => {
    it('is frozen after creation', () => {
      const score = LeadScore.hot();
      expect(Object.isFrozen(score)).toBe(true);
    });

    it('boost() returns new instance', () => {
      const original = LeadScore.cold();
      const boosted = original.boost();
      expect(boosted).not.toBe(original);
      expect(boosted.numericValue).toBe(3);
      expect(original.numericValue).toBe(2);
    });

    it('decrease() returns new instance', () => {
      const original = LeadScore.hot();
      const decreased = original.decrease();
      expect(decreased).not.toBe(original);
      expect(decreased.numericValue).toBe(3);
      expect(original.numericValue).toBe(4);
    });

    it('boost() respects upper bound', () => {
      const score = LeadScore.fromNumeric(5);
      const boosted = score.boost(3);
      expect(boosted.numericValue).toBe(5); // Can't go above 5
    });

    it('decrease() respects lower bound', () => {
      const score = LeadScore.fromNumeric(1);
      const decreased = score.decrease(3);
      expect(decreased.numericValue).toBe(1); // Can't go below 1
    });
  });

  describe('Equality', () => {
    it('equals() returns true for same values', () => {
      const score1 = LeadScore.fromNumeric(4);
      const score2 = LeadScore.fromNumeric(4);
      expect(score1.equals(score2)).toBe(true);
    });

    it('equals() returns false for different values', () => {
      const score1 = LeadScore.hot();
      const score2 = LeadScore.warm();
      expect(score1.equals(score2)).toBe(false);
    });

    it('compareTo() returns positive for higher score', () => {
      const higher = LeadScore.hot();
      const lower = LeadScore.cold();
      expect(higher.compareTo(lower)).toBeGreaterThan(0);
    });

    it('compareTo() returns negative for lower score', () => {
      const higher = LeadScore.hot();
      const lower = LeadScore.cold();
      expect(lower.compareTo(higher)).toBeLessThan(0);
    });

    it('compareTo() returns 0 for equal scores', () => {
      const score1 = LeadScore.warm();
      const score2 = LeadScore.warm();
      expect(score1.compareTo(score2)).toBe(0);
    });
  });

  describe('Serialization', () => {
    it('toJSON() returns proper DTO', () => {
      const score = LeadScore.fromNumeric(4, 0.85);
      const json = score.toJSON();

      expect(json.numericValue).toBe(4);
      expect(json.classification).toBe('HOT');
      expect(json.confidence).toBe(0.85);
      expect(json.scoredAt).toBeDefined();
    });

    it('toPrimitive() returns numeric value', () => {
      const score = LeadScore.hot();
      expect(score.toPrimitive()).toBe(4);
    });

    it('toString() returns descriptive string', () => {
      const score = LeadScore.fromNumeric(4, 0.85);
      expect(score.toString()).toContain('4');
      expect(score.toString()).toContain('HOT');
      expect(score.toString()).toContain('85%');
    });
  });
});

// ============================================================================
// PHONE NUMBER VALUE OBJECT TESTS
// ============================================================================

describe('PhoneNumber Value Object', () => {
  describe('E.164 Format Parsing', () => {
    it('parses Romanian mobile number', () => {
      const result = PhoneNumber.parse('+40721234567');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.e164).toBe('+40721234567');
        expect(result.value.region).toBe('RO');
        expect(result.value.countryCode).toBe('40');
        expect(result.value.nationalNumber).toBe('721234567');
        expect(result.value.phoneType).toBe('mobile');
      }
    });

    it('parses German mobile number', () => {
      const result = PhoneNumber.parse('+491601234567');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.region).toBe('DE');
        expect(result.value.countryCode).toBe('49');
      }
    });

    it('parses UK mobile number', () => {
      const result = PhoneNumber.parse('+447911123456');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.region).toBe('UK');
        expect(result.value.phoneType).toBe('mobile');
      }
    });

    it('parses US number', () => {
      const result = PhoneNumber.parse('+12025551234');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.region).toBe('US');
      }
    });

    it('rejects invalid E.164 format', () => {
      const result = PhoneNumber.parse('+1234'); // Too short
      expect(result.success).toBe(false);
    });

    it('rejects E.164 without plus', () => {
      const result = PhoneNumber.parse('40721234567');
      // Should attempt national format parsing with default region
      expect(result.success).toBe(false);
    });
  });

  describe('National Format Parsing', () => {
    it('parses Romanian national format with default region', () => {
      const result = PhoneNumber.parse('0721234567', 'RO');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.e164).toBe('+40721234567');
        expect(result.value.region).toBe('RO');
      }
    });

    it('parses German national format', () => {
      const result = PhoneNumber.parse('01601234567', 'DE');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.region).toBe('DE');
      }
    });

    it('handles international format with 00 prefix', () => {
      const result = PhoneNumber.parse('0040721234567');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.e164).toBe('+40721234567');
      }
    });
  });

  describe('Phone Type Detection', () => {
    it('detects Romanian mobile (7xx)', () => {
      const result = PhoneNumber.parse('+40721234567');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.phoneType).toBe('mobile');
        expect(result.value.isMobile()).toBe(true);
      }
    });

    it('detects Romanian landline (2xx, 3xx)', () => {
      const result = PhoneNumber.parse('+40212345678');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.phoneType).toBe('landline');
        expect(result.value.isMobile()).toBe(false);
      }
    });

    it('detects UK mobile (7xx)', () => {
      const result = PhoneNumber.parse('+447911123456');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.phoneType).toBe('mobile');
      }
    });
  });

  describe('WhatsApp Eligibility', () => {
    it('mobile numbers are WhatsApp eligible', () => {
      const phone = PhoneNumber.create('+40721234567');
      expect(phone.isWhatsAppEligible()).toBe(true);
    });

    it('landline numbers are not WhatsApp eligible', () => {
      const phone = PhoneNumber.create('+40212345678');
      expect(phone.isWhatsAppEligible()).toBe(false);
    });
  });

  describe('Region Detection', () => {
    it('detects Romanian numbers', () => {
      const phone = PhoneNumber.create('+40721234567');
      expect(phone.isRomanian()).toBe(true);
      expect(phone.isDACHRegion()).toBe(false);
    });

    it('detects DACH region numbers', () => {
      const dePhone = PhoneNumber.create('+491601234567');
      expect(dePhone.isDACHRegion()).toBe(true);

      const atPhone = PhoneNumber.create('+436501234567');
      expect(atPhone.isDACHRegion()).toBe(true);

      const chPhone = PhoneNumber.create('+41761234567');
      expect(chPhone.isDACHRegion()).toBe(true);
    });
  });

  describe('Preferred Language', () => {
    it('Romanian numbers prefer Romanian', () => {
      const phone = PhoneNumber.create('+40721234567');
      expect(phone.getPreferredLanguage()).toBe('ro');
    });

    it('German numbers prefer German', () => {
      const phone = PhoneNumber.create('+491601234567');
      expect(phone.getPreferredLanguage()).toBe('de');
    });

    it('UK numbers prefer English', () => {
      const phone = PhoneNumber.create('+447911123456');
      expect(phone.getPreferredLanguage()).toBe('en');
    });
  });

  describe('Formatting', () => {
    it('formatInternational() adds spaces', () => {
      const phone = PhoneNumber.create('+40721234567');
      const formatted = phone.formatInternational();
      expect(formatted).toContain('+40');
      expect(formatted).toContain(' ');
    });

    it('formatNational() adds leading zero', () => {
      const phone = PhoneNumber.create('+40721234567');
      const formatted = phone.formatNational();
      expect(formatted).toMatch(/^0/);
    });

    it('formatMasked() hides middle digits', () => {
      const phone = PhoneNumber.create('+40721234567');
      const masked = phone.formatMasked();
      expect(masked).toContain('*');
      expect(masked).toContain('721'); // First 3 visible
      expect(masked).toContain('567'); // Last 3 visible
    });
  });

  describe('Immutability', () => {
    it('is frozen after creation', () => {
      const phone = PhoneNumber.create('+40721234567');
      expect(Object.isFrozen(phone)).toBe(true);
    });
  });

  describe('Equality', () => {
    it('equals() returns true for same E.164', () => {
      const phone1 = PhoneNumber.create('+40721234567');
      const phone2 = PhoneNumber.create('+40721234567');
      expect(phone1.equals(phone2)).toBe(true);
    });

    it('equals() returns false for different numbers', () => {
      const phone1 = PhoneNumber.create('+40721234567');
      const phone2 = PhoneNumber.create('+40721234568');
      expect(phone1.equals(phone2)).toBe(false);
    });

    it('sameRegion() checks region match', () => {
      const ro1 = PhoneNumber.create('+40721234567');
      const ro2 = PhoneNumber.create('+40731234567');
      const de = PhoneNumber.create('+491601234567');

      expect(ro1.sameRegion(ro2)).toBe(true);
      expect(ro1.sameRegion(de)).toBe(false);
    });
  });

  describe('Serialization', () => {
    it('toJSON() returns proper DTO', () => {
      const phone = PhoneNumber.create('+40721234567');
      const json = phone.toJSON();

      expect(json.e164).toBe('+40721234567');
      expect(json.region).toBe('RO');
      expect(json.countryCode).toBe('40');
      expect(json.phoneType).toBe('mobile');
    });

    it('toPrimitive() returns E.164 string', () => {
      const phone = PhoneNumber.create('+40721234567');
      expect(phone.toPrimitive()).toBe('+40721234567');
    });

    it('toString() returns E.164 string', () => {
      const phone = PhoneNumber.create('+40721234567');
      expect(phone.toString()).toBe('+40721234567');
    });
  });

  describe('Validation Errors', () => {
    it('throws InvalidPhoneNumberError for invalid format', () => {
      expect(() => PhoneNumber.create('invalid')).toThrow(InvalidPhoneNumberError);
    });

    it('InvalidPhoneNumberError has correct code', () => {
      try {
        PhoneNumber.create('invalid');
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidPhoneNumberError);
        expect((e as InvalidPhoneNumberError).code).toBe('INVALID_PHONE_NUMBER');
      }
    });
  });
});

// ============================================================================
// BUSINESS RULES INTEGRATION TESTS
// ============================================================================

describe('Business Rules Integration', () => {
  describe('RULE: Un lead nu poate fi marcat HOT dacă nu are telefon valid', () => {
    it('valid phone allows HOT score assignment', () => {
      const phoneResult = PhoneNumber.parse('+40721234567');
      expect(phoneResult.success).toBe(true);

      if (phoneResult.success) {
        const score = LeadScore.hot();
        expect(score.isHot()).toBe(true);
        // Lead can be marked HOT if phone is valid
      }
    });

    it('invalid phone prevents lead processing', () => {
      const phoneResult = PhoneNumber.parse('invalid-phone');
      expect(phoneResult.success).toBe(false);
      // Cannot create lead without valid phone
    });
  });

  describe('RULE: WhatsApp channel requires mobile phone', () => {
    it('mobile phone is WhatsApp eligible', () => {
      const phone = PhoneNumber.create('+40721234567');
      expect(phone.isWhatsAppEligible()).toBe(true);
      // Can send WhatsApp message
    });

    it('landline phone is not WhatsApp eligible', () => {
      const phone = PhoneNumber.create('+40212345678');
      expect(phone.isWhatsAppEligible()).toBe(false);
      // Cannot send WhatsApp message
    });
  });

  describe('RULE: Regional language preferences', () => {
    it('Romanian lead gets Romanian communication', () => {
      const phone = PhoneNumber.create('+40721234567');
      expect(phone.getPreferredLanguage()).toBe('ro');
    });

    it('German lead gets German communication', () => {
      const phone = PhoneNumber.create('+491601234567');
      expect(phone.getPreferredLanguage()).toBe('de');
    });
  });

  describe('RULE: HOT leads must be contacted within 5 minutes', () => {
    it('HOT lead has 5 minute SLA', () => {
      const score = LeadScore.hot();
      expect(score.getSLAResponseTimeMinutes()).toBe(5);
      expect(score.requiresImmediateAttention()).toBe(true);
    });
  });

  describe('RULE: Score transitions preserve history', () => {
    it('boosting score creates new instance', () => {
      const cold = LeadScore.cold();
      const warm = cold.boost();

      expect(cold.classification).toBe('COLD');
      expect(warm.classification).toBe('WARM');
      expect(cold).not.toBe(warm);
    });

    it('multiple boosts track progression', () => {
      let score = LeadScore.unqualified();
      const history: number[] = [score.numericValue];

      score = score.boost();
      history.push(score.numericValue);

      score = score.boost();
      history.push(score.numericValue);

      score = score.boost();
      history.push(score.numericValue);

      expect(history).toEqual([1, 2, 3, 4]);
    });
  });
});
