/**
 * @fileoverview Tests for Prosthetic Specification Value Objects
 *
 * Tests type guards, material compatibility, and tooth notation helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  PROSTHETIC_TYPES,
  PROSTHETIC_MATERIALS,
  SHADE_SYSTEMS,
  VITA_CLASSICAL_SHADES,
  FDI_TOOTH_NUMBERS,
  MATERIAL_PROPERTIES,
  isValidProstheticType,
  isValidMaterial,
  isValidFDITooth,
  isMaterialCompatibleWithType,
  getToothQuadrant,
  isMaxillaryTooth,
  isMandibularTooth,
  isAnteriorTooth,
  isPosteriorTooth,
  type ProstheticType,
  type ProstheticMaterial,
  type FDIToothNumber,
} from '../ProstheticSpec.js';

describe('ProstheticSpec', () => {
  describe('PROSTHETIC_TYPES', () => {
    it('should contain all fixed prosthetic types', () => {
      const fixedTypes = ['CROWN', 'BRIDGE', 'VENEER', 'INLAY', 'ONLAY', 'OVERLAY'];
      fixedTypes.forEach((type) => {
        expect(PROSTHETIC_TYPES).toContain(type);
      });
    });

    it('should contain all implant prosthetic types', () => {
      const implantTypes = [
        'IMPLANT_CROWN',
        'IMPLANT_BRIDGE',
        'IMPLANT_ABUTMENT',
        'SCREW_RETAINED_CROWN',
        'CEMENT_RETAINED_CROWN',
        'HYBRID_PROSTHESIS',
        'OVERDENTURE',
        'BAR_ATTACHMENT',
      ];
      implantTypes.forEach((type) => {
        expect(PROSTHETIC_TYPES).toContain(type);
      });
    });

    it('should contain all removable prosthetic types', () => {
      const removableTypes = [
        'COMPLETE_DENTURE',
        'PARTIAL_DENTURE',
        'IMMEDIATE_DENTURE',
        'FLIPPER',
        'NIGHT_GUARD',
        'SPORTS_GUARD',
        'SLEEP_APPLIANCE',
      ];
      removableTypes.forEach((type) => {
        expect(PROSTHETIC_TYPES).toContain(type);
      });
    });

    it('should contain orthodontic appliances', () => {
      expect(PROSTHETIC_TYPES).toContain('RETAINER');
      expect(PROSTHETIC_TYPES).toContain('ALIGNER');
      expect(PROSTHETIC_TYPES).toContain('SPACE_MAINTAINER');
    });

    it('should contain surgical guides and temporaries', () => {
      expect(PROSTHETIC_TYPES).toContain('SURGICAL_GUIDE');
      expect(PROSTHETIC_TYPES).toContain('BONE_GRAFT_TEMPLATE');
      expect(PROSTHETIC_TYPES).toContain('PROVISIONAL_CROWN');
      expect(PROSTHETIC_TYPES).toContain('PROVISIONAL_BRIDGE');
      expect(PROSTHETIC_TYPES).toContain('PROVISIONAL_ALLON');
    });
  });

  describe('PROSTHETIC_MATERIALS', () => {
    it('should contain ceramic materials', () => {
      const ceramics = [
        'ZIRCONIA',
        'ZIRCONIA_TRANSLUCENT',
        'ZIRCONIA_MULTI',
        'EMAX',
        'FELDSPATHIC',
        'EMPRESS',
      ];
      ceramics.forEach((material) => {
        expect(PROSTHETIC_MATERIALS).toContain(material);
      });
    });

    it('should contain metal materials', () => {
      const metals = [
        'TITANIUM',
        'TITANIUM_BASE',
        'COBALT_CHROME',
        'GOLD',
        'PRECIOUS_METAL',
        'BASE_METAL',
      ];
      metals.forEach((material) => {
        expect(PROSTHETIC_MATERIALS).toContain(material);
      });
    });

    it('should contain polymer materials', () => {
      const polymers = ['PMMA', 'PEEK', 'ACRYLIC', 'COMPOSITE', 'FLEXIBLE_NYLON', 'TEMP_COMPOSITE'];
      polymers.forEach((material) => {
        expect(PROSTHETIC_MATERIALS).toContain(material);
      });
    });

    it('should contain hybrid materials', () => {
      expect(PROSTHETIC_MATERIALS).toContain('ZIRCONIA_PORCELAIN');
      expect(PROSTHETIC_MATERIALS).toContain('METAL_CERAMIC');
      expect(PROSTHETIC_MATERIALS).toContain('METAL_ACRYLIC');
    });
  });

  describe('SHADE_SYSTEMS', () => {
    it('should contain standard shade systems', () => {
      expect(SHADE_SYSTEMS).toContain('VITA_CLASSICAL');
      expect(SHADE_SYSTEMS).toContain('VITA_3D_MASTER');
      expect(SHADE_SYSTEMS).toContain('VITA_BLEACH');
      expect(SHADE_SYSTEMS).toContain('IVOCLAR');
      expect(SHADE_SYSTEMS).toContain('CUSTOM');
    });
  });

  describe('VITA_CLASSICAL_SHADES', () => {
    it('should contain A shades', () => {
      expect(VITA_CLASSICAL_SHADES).toContain('A1');
      expect(VITA_CLASSICAL_SHADES).toContain('A2');
      expect(VITA_CLASSICAL_SHADES).toContain('A3');
      expect(VITA_CLASSICAL_SHADES).toContain('A3.5');
      expect(VITA_CLASSICAL_SHADES).toContain('A4');
    });

    it('should contain B shades', () => {
      expect(VITA_CLASSICAL_SHADES).toContain('B1');
      expect(VITA_CLASSICAL_SHADES).toContain('B2');
      expect(VITA_CLASSICAL_SHADES).toContain('B3');
      expect(VITA_CLASSICAL_SHADES).toContain('B4');
    });

    it('should contain C shades', () => {
      expect(VITA_CLASSICAL_SHADES).toContain('C1');
      expect(VITA_CLASSICAL_SHADES).toContain('C2');
      expect(VITA_CLASSICAL_SHADES).toContain('C3');
      expect(VITA_CLASSICAL_SHADES).toContain('C4');
    });

    it('should contain D shades', () => {
      expect(VITA_CLASSICAL_SHADES).toContain('D2');
      expect(VITA_CLASSICAL_SHADES).toContain('D3');
      expect(VITA_CLASSICAL_SHADES).toContain('D4');
    });
  });

  describe('FDI_TOOTH_NUMBERS', () => {
    it('should contain all 32 permanent teeth', () => {
      expect(FDI_TOOTH_NUMBERS).toHaveLength(32);
    });

    it('should contain upper right quadrant (1)', () => {
      const upperRight = ['18', '17', '16', '15', '14', '13', '12', '11'];
      upperRight.forEach((tooth) => {
        expect(FDI_TOOTH_NUMBERS).toContain(tooth);
      });
    });

    it('should contain upper left quadrant (2)', () => {
      const upperLeft = ['21', '22', '23', '24', '25', '26', '27', '28'];
      upperLeft.forEach((tooth) => {
        expect(FDI_TOOTH_NUMBERS).toContain(tooth);
      });
    });

    it('should contain lower left quadrant (3)', () => {
      const lowerLeft = ['38', '37', '36', '35', '34', '33', '32', '31'];
      lowerLeft.forEach((tooth) => {
        expect(FDI_TOOTH_NUMBERS).toContain(tooth);
      });
    });

    it('should contain lower right quadrant (4)', () => {
      const lowerRight = ['41', '42', '43', '44', '45', '46', '47', '48'];
      lowerRight.forEach((tooth) => {
        expect(FDI_TOOTH_NUMBERS).toContain(tooth);
      });
    });
  });

  describe('MATERIAL_PROPERTIES', () => {
    it('should define properties for zirconia', () => {
      const zirconia = MATERIAL_PROPERTIES.ZIRCONIA;
      expect(zirconia).toBeDefined();
      expect(zirconia?.flexuralStrength).toBe(1200);
      expect(zirconia?.translucency).toBe('LOW');
      expect(zirconia?.millingCompatible).toBe(true);
      expect(zirconia?.printingCompatible).toBe(false);
    });

    it('should define properties for translucent zirconia', () => {
      const zirconiaT = MATERIAL_PROPERTIES.ZIRCONIA_TRANSLUCENT;
      expect(zirconiaT).toBeDefined();
      expect(zirconiaT?.flexuralStrength).toBe(900);
      expect(zirconiaT?.translucency).toBe('HIGH');
    });

    it('should define properties for e.max', () => {
      const emax = MATERIAL_PROPERTIES.EMAX;
      expect(emax).toBeDefined();
      expect(emax?.flexuralStrength).toBe(530);
      expect(emax?.indicatedFor).toContain('CROWN');
      expect(emax?.indicatedFor).toContain('VENEER');
    });

    it('should define properties for titanium', () => {
      const titanium = MATERIAL_PROPERTIES.TITANIUM;
      expect(titanium).toBeDefined();
      expect(titanium?.translucency).toBe('OPAQUE');
      expect(titanium?.millingCompatible).toBe(true);
      expect(titanium?.printingCompatible).toBe(true);
      expect(titanium?.layeringRequired).toBe(true);
    });
  });

  describe('isValidProstheticType', () => {
    it('should return true for valid prosthetic types', () => {
      expect(isValidProstheticType('CROWN')).toBe(true);
      expect(isValidProstheticType('BRIDGE')).toBe(true);
      expect(isValidProstheticType('IMPLANT_CROWN')).toBe(true);
      expect(isValidProstheticType('HYBRID_PROSTHESIS')).toBe(true);
    });

    it('should return false for invalid types', () => {
      expect(isValidProstheticType('INVALID')).toBe(false);
      expect(isValidProstheticType('')).toBe(false);
      expect(isValidProstheticType('crown')).toBe(false); // case-sensitive
    });

    it('should return false for non-string values', () => {
      expect(isValidProstheticType(null)).toBe(false);
      expect(isValidProstheticType(undefined)).toBe(false);
      expect(isValidProstheticType(123)).toBe(false);
      expect(isValidProstheticType({})).toBe(false);
    });
  });

  describe('isValidMaterial', () => {
    it('should return true for valid materials', () => {
      expect(isValidMaterial('ZIRCONIA')).toBe(true);
      expect(isValidMaterial('EMAX')).toBe(true);
      expect(isValidMaterial('TITANIUM')).toBe(true);
      expect(isValidMaterial('PMMA')).toBe(true);
    });

    it('should return false for invalid materials', () => {
      expect(isValidMaterial('INVALID')).toBe(false);
      expect(isValidMaterial('')).toBe(false);
      expect(isValidMaterial('zirconia')).toBe(false); // case-sensitive
    });

    it('should return false for non-string values', () => {
      expect(isValidMaterial(null)).toBe(false);
      expect(isValidMaterial(undefined)).toBe(false);
      expect(isValidMaterial(42)).toBe(false);
    });
  });

  describe('isValidFDITooth', () => {
    it('should return true for valid FDI tooth numbers', () => {
      expect(isValidFDITooth('11')).toBe(true);
      expect(isValidFDITooth('21')).toBe(true);
      expect(isValidFDITooth('36')).toBe(true);
      expect(isValidFDITooth('48')).toBe(true);
    });

    it('should return false for invalid tooth numbers', () => {
      expect(isValidFDITooth('00')).toBe(false);
      expect(isValidFDITooth('99')).toBe(false);
      expect(isValidFDITooth('')).toBe(false);
      expect(isValidFDITooth('A1')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isValidFDITooth(null)).toBe(false);
      expect(isValidFDITooth(undefined)).toBe(false);
      expect(isValidFDITooth(11)).toBe(false);
    });
  });

  describe('isMaterialCompatibleWithType', () => {
    it('should return true for compatible combinations', () => {
      expect(isMaterialCompatibleWithType('ZIRCONIA', 'CROWN')).toBe(true);
      expect(isMaterialCompatibleWithType('EMAX', 'CROWN')).toBe(true);
      expect(isMaterialCompatibleWithType('TITANIUM', 'IMPLANT_ABUTMENT')).toBe(true);
    });

    it('should return false for contraindicated combinations', () => {
      expect(isMaterialCompatibleWithType('ZIRCONIA', 'VENEER')).toBe(false);
      expect(isMaterialCompatibleWithType('TITANIUM', 'VENEER')).toBe(false);
      expect(isMaterialCompatibleWithType('TITANIUM', 'CROWN')).toBe(false);
    });

    it('should return true for materials without defined properties', () => {
      // GOLD doesn't have properties defined, so should allow any type
      expect(isMaterialCompatibleWithType('GOLD', 'CROWN')).toBe(true);
      expect(isMaterialCompatibleWithType('GOLD', 'VENEER')).toBe(true);
    });

    it('should return false for translucent zirconia with bridge', () => {
      expect(isMaterialCompatibleWithType('ZIRCONIA_TRANSLUCENT', 'BRIDGE')).toBe(false);
    });

    it('should return false for e.max with implant abutment', () => {
      expect(isMaterialCompatibleWithType('EMAX', 'IMPLANT_ABUTMENT')).toBe(false);
    });
  });

  describe('getToothQuadrant', () => {
    it('should return quadrant 1 for upper right teeth', () => {
      expect(getToothQuadrant('11')).toBe(1);
      expect(getToothQuadrant('18')).toBe(1);
    });

    it('should return quadrant 2 for upper left teeth', () => {
      expect(getToothQuadrant('21')).toBe(2);
      expect(getToothQuadrant('28')).toBe(2);
    });

    it('should return quadrant 3 for lower left teeth', () => {
      expect(getToothQuadrant('31')).toBe(3);
      expect(getToothQuadrant('38')).toBe(3);
    });

    it('should return quadrant 4 for lower right teeth', () => {
      expect(getToothQuadrant('41')).toBe(4);
      expect(getToothQuadrant('48')).toBe(4);
    });
  });

  describe('isMaxillaryTooth', () => {
    it('should return true for upper right teeth (quadrant 1)', () => {
      expect(isMaxillaryTooth('11')).toBe(true);
      expect(isMaxillaryTooth('16')).toBe(true);
      expect(isMaxillaryTooth('18')).toBe(true);
    });

    it('should return true for upper left teeth (quadrant 2)', () => {
      expect(isMaxillaryTooth('21')).toBe(true);
      expect(isMaxillaryTooth('26')).toBe(true);
      expect(isMaxillaryTooth('28')).toBe(true);
    });

    it('should return false for mandibular teeth', () => {
      expect(isMaxillaryTooth('31')).toBe(false);
      expect(isMaxillaryTooth('41')).toBe(false);
      expect(isMaxillaryTooth('36')).toBe(false);
      expect(isMaxillaryTooth('46')).toBe(false);
    });
  });

  describe('isMandibularTooth', () => {
    it('should return true for lower left teeth (quadrant 3)', () => {
      expect(isMandibularTooth('31')).toBe(true);
      expect(isMandibularTooth('36')).toBe(true);
      expect(isMandibularTooth('38')).toBe(true);
    });

    it('should return true for lower right teeth (quadrant 4)', () => {
      expect(isMandibularTooth('41')).toBe(true);
      expect(isMandibularTooth('46')).toBe(true);
      expect(isMandibularTooth('48')).toBe(true);
    });

    it('should return false for maxillary teeth', () => {
      expect(isMandibularTooth('11')).toBe(false);
      expect(isMandibularTooth('21')).toBe(false);
      expect(isMandibularTooth('16')).toBe(false);
      expect(isMandibularTooth('26')).toBe(false);
    });
  });

  describe('isAnteriorTooth', () => {
    it('should return true for incisors (positions 1-2)', () => {
      expect(isAnteriorTooth('11')).toBe(true);
      expect(isAnteriorTooth('12')).toBe(true);
      expect(isAnteriorTooth('21')).toBe(true);
      expect(isAnteriorTooth('22')).toBe(true);
      expect(isAnteriorTooth('31')).toBe(true);
      expect(isAnteriorTooth('32')).toBe(true);
      expect(isAnteriorTooth('41')).toBe(true);
      expect(isAnteriorTooth('42')).toBe(true);
    });

    it('should return true for canines (position 3)', () => {
      expect(isAnteriorTooth('13')).toBe(true);
      expect(isAnteriorTooth('23')).toBe(true);
      expect(isAnteriorTooth('33')).toBe(true);
      expect(isAnteriorTooth('43')).toBe(true);
    });

    it('should return false for posterior teeth', () => {
      expect(isAnteriorTooth('14')).toBe(false);
      expect(isAnteriorTooth('16')).toBe(false);
      expect(isAnteriorTooth('18')).toBe(false);
      expect(isAnteriorTooth('36')).toBe(false);
    });
  });

  describe('isPosteriorTooth', () => {
    it('should return true for premolars (positions 4-5)', () => {
      expect(isPosteriorTooth('14')).toBe(true);
      expect(isPosteriorTooth('15')).toBe(true);
      expect(isPosteriorTooth('24')).toBe(true);
      expect(isPosteriorTooth('25')).toBe(true);
      expect(isPosteriorTooth('34')).toBe(true);
      expect(isPosteriorTooth('35')).toBe(true);
      expect(isPosteriorTooth('44')).toBe(true);
      expect(isPosteriorTooth('45')).toBe(true);
    });

    it('should return true for molars (positions 6-8)', () => {
      expect(isPosteriorTooth('16')).toBe(true);
      expect(isPosteriorTooth('17')).toBe(true);
      expect(isPosteriorTooth('18')).toBe(true);
      expect(isPosteriorTooth('26')).toBe(true);
      expect(isPosteriorTooth('27')).toBe(true);
      expect(isPosteriorTooth('28')).toBe(true);
      expect(isPosteriorTooth('36')).toBe(true);
      expect(isPosteriorTooth('37')).toBe(true);
      expect(isPosteriorTooth('38')).toBe(true);
      expect(isPosteriorTooth('46')).toBe(true);
      expect(isPosteriorTooth('47')).toBe(true);
      expect(isPosteriorTooth('48')).toBe(true);
    });

    it('should return false for anterior teeth', () => {
      expect(isPosteriorTooth('11')).toBe(false);
      expect(isPosteriorTooth('12')).toBe(false);
      expect(isPosteriorTooth('13')).toBe(false);
      expect(isPosteriorTooth('21')).toBe(false);
      expect(isPosteriorTooth('22')).toBe(false);
      expect(isPosteriorTooth('23')).toBe(false);
    });
  });

  describe('All teeth classification', () => {
    it('should correctly classify all teeth as either anterior or posterior', () => {
      FDI_TOOTH_NUMBERS.forEach((tooth) => {
        const isAnterior = isAnteriorTooth(tooth);
        const isPosterior = isPosteriorTooth(tooth);
        // Each tooth must be exactly one of anterior or posterior
        expect(isAnterior !== isPosterior).toBe(true);
      });
    });

    it('should correctly classify all teeth as either maxillary or mandibular', () => {
      FDI_TOOTH_NUMBERS.forEach((tooth) => {
        const isMax = isMaxillaryTooth(tooth);
        const isMand = isMandibularTooth(tooth);
        // Each tooth must be exactly one of maxillary or mandibular
        expect(isMax !== isMand).toBe(true);
      });
    });
  });
});
