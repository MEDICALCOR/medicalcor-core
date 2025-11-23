import type { ExportColumn } from './types';

/**
 * Convert data to CSV format
 */
export function toCSV<T>(data: T[], columns: ExportColumn<T>[]): string {
  // Header row
  const headers = columns.map((col) => escapeCSV(col.header));
  const rows = [headers.join(',')];

  // Data rows
  for (const item of data) {
    const row = columns.map((col) => {
      const key = col.key as keyof T;
      const value =
        typeof key === 'string' && key.includes('.') ? getNestedValue(item, key) : item[key];

      const formattedValue = col.format ? col.format(value, item) : formatValue(value);

      return escapeCSV(formattedValue);
    });
    rows.push(row.join(','));
  }

  return rows.join('\n');
}

/**
 * Escape a value for CSV format
 */
function escapeCSV(value: string): string {
  // If contains comma, newline, or quote, wrap in quotes and escape internal quotes
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'boolean') {
    return value ? 'Da' : 'Nu';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'string') {
    return value;
  }

  // Objects and remaining types
  return JSON.stringify(value);
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Download data as CSV file
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
