/**
 * Table Utility Functions
 * Extracted to reduce OsaxCaseTable complexity
 */

export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTreatmentType(type: string): string {
  const typeLabels: Record<string, string> = {
    CPAP_THERAPY: 'CPAP',
    BIPAP_THERAPY: 'BiPAP',
    ORAL_APPLIANCE: 'Oral Appliance',
    POSITIONAL_THERAPY: 'Positional',
    LIFESTYLE_MODIFICATION: 'Lifestyle',
    SURGERY_EVALUATION: 'Surgery Eval',
  };

  return typeLabels[type] ?? type;
}


