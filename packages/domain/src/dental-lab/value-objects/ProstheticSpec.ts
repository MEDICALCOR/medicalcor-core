/**
 * @fileoverview Prosthetic Specification Value Objects
 *
 * Defines dental prosthetic types, materials, and specifications
 * following ISO 22674 and ADA dental material standards.
 *
 * @module domain/dental-lab/value-objects/ProstheticSpec
 */

// ============================================================================
// PROSTHETIC TYPES
// ============================================================================

/**
 * Types of dental prosthetics manufactured in the laboratory
 */
export const PROSTHETIC_TYPES = [
  // Fixed prosthetics
  'CROWN', // Single tooth restoration
  'BRIDGE', // Multi-unit fixed partial denture
  'VENEER', // Laminate veneer
  'INLAY', // Intracoronal restoration
  'ONLAY', // Extracoronal restoration
  'OVERLAY', // Full coverage indirect restoration

  // Implant prosthetics
  'IMPLANT_CROWN', // Single implant crown
  'IMPLANT_BRIDGE', // Implant-supported bridge
  'IMPLANT_ABUTMENT', // Custom abutment
  'SCREW_RETAINED_CROWN', // Screw-retained implant crown
  'CEMENT_RETAINED_CROWN', // Cement-retained implant crown
  'HYBRID_PROSTHESIS', // All-on-X hybrid prosthesis
  'OVERDENTURE', // Implant-supported overdenture
  'BAR_ATTACHMENT', // Bar for overdenture

  // Removable prosthetics
  'COMPLETE_DENTURE', // Full denture
  'PARTIAL_DENTURE', // Removable partial denture (RPD)
  'IMMEDIATE_DENTURE', // Immediate placement denture
  'FLIPPER', // Temporary partial denture
  'NIGHT_GUARD', // Occlusal splint
  'SPORTS_GUARD', // Athletic mouthguard
  'SLEEP_APPLIANCE', // Sleep apnea appliance

  // Orthodontic appliances
  'RETAINER', // Orthodontic retainer
  'ALIGNER', // Clear aligner
  'SPACE_MAINTAINER', // Pediatric space maintainer

  // Surgical guides
  'SURGICAL_GUIDE', // Implant surgical guide
  'BONE_GRAFT_TEMPLATE', // Bone augmentation guide

  // Temporaries
  'PROVISIONAL_CROWN', // Temporary crown
  'PROVISIONAL_BRIDGE', // Temporary bridge
  'PROVISIONAL_ALLON', // Provisional All-on-X prosthesis
] as const;

export type ProstheticType = (typeof PROSTHETIC_TYPES)[number];

// ============================================================================
// MATERIALS
// ============================================================================

/**
 * Dental materials per ISO 22674 classification
 */
export const PROSTHETIC_MATERIALS = [
  // Ceramics
  'ZIRCONIA', // Zirconium dioxide (Y-TZP)
  'ZIRCONIA_TRANSLUCENT', // High-translucent zirconia
  'ZIRCONIA_MULTI', // Multi-layer gradient zirconia
  'EMAX', // Lithium disilicate (IPS e.max)
  'FELDSPATHIC', // Feldspathic porcelain
  'EMPRESS', // Leucite-reinforced ceramic

  // Metals
  'TITANIUM', // Grade 5 titanium
  'TITANIUM_BASE', // Ti-base for hybrid abutments
  'COBALT_CHROME', // CoCr alloy
  'GOLD', // High noble gold alloy
  'PRECIOUS_METAL', // Noble metal alloy
  'BASE_METAL', // Non-precious alloy

  // Polymers
  'PMMA', // Polymethyl methacrylate
  'PEEK', // Polyether ether ketone
  'ACRYLIC', // Denture acrylic
  'COMPOSITE', // Resin composite
  'FLEXIBLE_NYLON', // Flexible denture material
  'TEMP_COMPOSITE', // Provisional composite

  // Hybrid materials
  'ZIRCONIA_PORCELAIN', // Zirconia with porcelain layering
  'METAL_CERAMIC', // PFM (porcelain-fused-to-metal)
  'METAL_ACRYLIC', // Metal framework with acrylic
] as const;

export type ProstheticMaterial = (typeof PROSTHETIC_MATERIALS)[number];

// ============================================================================
// SHADE SYSTEMS
// ============================================================================

export const SHADE_SYSTEMS = [
  'VITA_CLASSICAL', // VITA Classical A1-D4
  'VITA_3D_MASTER', // VITA 3D-Master
  'VITA_BLEACH', // VITA Bleach shades
  'IVOCLAR', // Ivoclar Vivadent shades
  'CUSTOM', // Custom shade match
] as const;

export type ShadeSystem = (typeof SHADE_SYSTEMS)[number];

/**
 * Common VITA Classical shades
 */
export const VITA_CLASSICAL_SHADES = [
  'A1',
  'A2',
  'A3',
  'A3.5',
  'A4',
  'B1',
  'B2',
  'B3',
  'B4',
  'C1',
  'C2',
  'C3',
  'C4',
  'D2',
  'D3',
  'D4',
] as const;

export type VitaClassicalShade = (typeof VITA_CLASSICAL_SHADES)[number];

// ============================================================================
// TOOTH NOTATION
// ============================================================================

/**
 * FDI (ISO 3950) tooth notation - international standard
 */
export const FDI_TOOTH_NUMBERS = [
  // Upper right quadrant (1)
  '18',
  '17',
  '16',
  '15',
  '14',
  '13',
  '12',
  '11',
  // Upper left quadrant (2)
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  // Lower left quadrant (3)
  '38',
  '37',
  '36',
  '35',
  '34',
  '33',
  '32',
  '31',
  // Lower right quadrant (4)
  '41',
  '42',
  '43',
  '44',
  '45',
  '46',
  '47',
  '48',
] as const;

export type FDIToothNumber = (typeof FDI_TOOTH_NUMBERS)[number];

// ============================================================================
// PROSTHETIC SPECIFICATION
// ============================================================================

export interface ProstheticSpec {
  readonly type: ProstheticType;
  readonly material: ProstheticMaterial;
  readonly toothNumbers: readonly FDIToothNumber[];
  readonly shadeSystem?: ShadeSystem;
  readonly shade?: string;
  readonly stumpShade?: string; // For translucent materials
  readonly occlusalScheme?: 'CANINE_GUIDANCE' | 'GROUP_FUNCTION' | 'MUTUALLY_PROTECTED';
  readonly marginType?: 'CHAMFER' | 'SHOULDER' | 'KNIFE_EDGE' | 'FEATHER_EDGE';
  readonly contactType?: 'POINT' | 'AREA' | 'MODIFIED_RIDGE_LAP';
  readonly specialInstructions?: string;
}

// ============================================================================
// IMPLANT SPECIFICATIONS
// ============================================================================

export interface ImplantComponentSpec {
  readonly implantSystem: string; // e.g., 'STRAUMANN', 'NOBEL_BIOCARE', 'ZIMMER'
  readonly implantPlatform: string; // e.g., 'BLT', 'BLX', 'ACTIVE'
  readonly platformDiameter: number; // mm
  readonly abutmentType?: 'STOCK' | 'CUSTOM_MILLED' | 'TI_BASE_HYBRID';
  readonly screwType?: string;
  readonly torqueNcm?: number;
  readonly connectionType?: 'INTERNAL_HEX' | 'EXTERNAL_HEX' | 'CONICAL' | 'TRI_LOBE';
}

// ============================================================================
// MATERIAL PROPERTIES
// ============================================================================

export interface MaterialProperties {
  readonly flexuralStrength: number; // MPa
  readonly fractureResistance: number; // MPa·m^0.5
  readonly translucency: 'HIGH' | 'MEDIUM' | 'LOW' | 'OPAQUE';
  readonly indicatedFor: readonly ProstheticType[];
  readonly contraindicatedFor: readonly ProstheticType[];
  readonly millingCompatible: boolean;
  readonly printingCompatible: boolean;
  readonly layeringRequired: boolean;
}

export const MATERIAL_PROPERTIES: Partial<Record<ProstheticMaterial, MaterialProperties>> = {
  ZIRCONIA: {
    flexuralStrength: 1200,
    fractureResistance: 5.0,
    translucency: 'LOW',
    indicatedFor: ['CROWN', 'BRIDGE', 'IMPLANT_CROWN', 'IMPLANT_ABUTMENT'],
    contraindicatedFor: ['VENEER'],
    millingCompatible: true,
    printingCompatible: false,
    layeringRequired: false,
  },
  ZIRCONIA_TRANSLUCENT: {
    flexuralStrength: 900,
    fractureResistance: 4.5,
    translucency: 'HIGH',
    indicatedFor: ['CROWN', 'VENEER', 'IMPLANT_CROWN'],
    contraindicatedFor: ['BRIDGE'], // Long-span bridges
    millingCompatible: true,
    printingCompatible: false,
    layeringRequired: false,
  },
  EMAX: {
    flexuralStrength: 530,
    fractureResistance: 2.75,
    translucency: 'HIGH',
    indicatedFor: ['CROWN', 'VENEER', 'INLAY', 'ONLAY'],
    contraindicatedFor: ['IMPLANT_ABUTMENT', 'BRIDGE'], // Long-span
    millingCompatible: true,
    printingCompatible: false,
    layeringRequired: false,
  },
  TITANIUM: {
    flexuralStrength: 1100,
    fractureResistance: 75,
    translucency: 'OPAQUE',
    indicatedFor: ['IMPLANT_ABUTMENT', 'BAR_ATTACHMENT', 'HYBRID_PROSTHESIS'],
    contraindicatedFor: ['VENEER', 'CROWN'],
    millingCompatible: true,
    printingCompatible: true,
    layeringRequired: true,
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function isValidProstheticType(value: unknown): value is ProstheticType {
  return typeof value === 'string' && PROSTHETIC_TYPES.includes(value as ProstheticType);
}

export function isValidMaterial(value: unknown): value is ProstheticMaterial {
  return typeof value === 'string' && PROSTHETIC_MATERIALS.includes(value as ProstheticMaterial);
}

export function isValidFDITooth(value: unknown): value is FDIToothNumber {
  return typeof value === 'string' && FDI_TOOTH_NUMBERS.includes(value as FDIToothNumber);
}

export function isMaterialCompatibleWithType(
  material: ProstheticMaterial,
  type: ProstheticType
): boolean {
  const props = MATERIAL_PROPERTIES[material];
  if (!props) return true; // Unknown material, allow
  if (props.contraindicatedFor.includes(type)) return false;
  return true;
}

export function getToothQuadrant(tooth: FDIToothNumber): 1 | 2 | 3 | 4 {
  const firstDigit = tooth[0];
  return Number(firstDigit) as 1 | 2 | 3 | 4;
}

export function isMaxillaryTooth(tooth: FDIToothNumber): boolean {
  const quadrant = getToothQuadrant(tooth);
  return quadrant === 1 || quadrant === 2;
}

export function isMandibularTooth(tooth: FDIToothNumber): boolean {
  const quadrant = getToothQuadrant(tooth);
  return quadrant === 3 || quadrant === 4;
}

export function isAnteriorTooth(tooth: FDIToothNumber): boolean {
  const position = Number(tooth[1]);
  return position >= 1 && position <= 3;
}

export function isPosteriorTooth(tooth: FDIToothNumber): boolean {
  const position = Number(tooth[1]);
  return position >= 4 && position <= 8;
}
