import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExport } from '@/lib/export/use-export';
import * as csvModule from '@/lib/export/csv';
import * as xlsxModule from '@/lib/export/xlsx';
import type { ExportColumn } from '@/lib/export/types';

// Mock the CSV and XLSX modules
vi.mock('@/lib/export/csv', () => ({
  toCSV: vi.fn(),
  downloadCSV: vi.fn(),
}));

vi.mock('@/lib/export/xlsx', () => ({
  downloadXLSX: vi.fn(),
}));

describe('useExport', () => {
  interface TestData {
    id: number;
    name: string;
    email: string;
  }

  const testData: TestData[] = [
    { id: 1, name: 'John Doe', email: 'john@example.com' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
  ];

  const columns: ExportColumn<TestData>[] = [
    { key: 'id', header: 'ID' },
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(csvModule.toCSV).mockReturnValue('mocked,csv,content');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useExport<TestData>());

    expect(result.current.isExporting).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('should export data as CSV', () => {
    const { result } = renderHook(() => useExport<TestData>());

    act(() => {
      result.current.exportData(testData, columns, {
        filename: 'test-export',
        format: 'csv',
      });
    });

    expect(csvModule.toCSV).toHaveBeenCalledWith(testData, columns);
    expect(csvModule.downloadCSV).toHaveBeenCalledWith('mocked,csv,content', 'test-export');
    expect(result.current.isExporting).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('should export data as XLSX', () => {
    const { result } = renderHook(() => useExport<TestData>());

    act(() => {
      result.current.exportData(testData, columns, {
        filename: 'test-export',
        format: 'xlsx',
      });
    });

    expect(xlsxModule.downloadXLSX).toHaveBeenCalledWith(
      testData,
      columns,
      'test-export',
      'Report'
    );
    expect(result.current.isExporting).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('should use custom sheet name for XLSX', () => {
    const { result } = renderHook(() => useExport<TestData>());

    act(() => {
      result.current.exportData(testData, columns, {
        filename: 'test-export',
        format: 'xlsx',
        sheetName: 'CustomSheet',
      });
    });

    expect(xlsxModule.downloadXLSX).toHaveBeenCalledWith(
      testData,
      columns,
      'test-export',
      'CustomSheet'
    );
  });

  it('should set isExporting to true during export', () => {
    const { result } = renderHook(() => useExport<TestData>());

    // Mock downloadCSV to be slow
    vi.mocked(csvModule.downloadCSV).mockImplementation(() => {
      expect(result.current.isExporting).toBe(true);
    });

    act(() => {
      result.current.exportData(testData, columns, {
        filename: 'test',
        format: 'csv',
      });
    });
  });

  it('should handle CSV export errors', () => {
    const { result } = renderHook(() => useExport<TestData>());
    const error = new Error('CSV export failed');

    vi.mocked(csvModule.toCSV).mockImplementation(() => {
      throw error;
    });

    act(() => {
      result.current.exportData(testData, columns, {
        filename: 'test',
        format: 'csv',
      });
    });

    expect(result.current.isExporting).toBe(false);
    expect(result.current.error).toBe('CSV export failed');
  });

  it('should handle XLSX export errors', () => {
    const { result } = renderHook(() => useExport<TestData>());
    const error = new Error('XLSX export failed');

    vi.mocked(xlsxModule.downloadXLSX).mockImplementation(() => {
      throw error;
    });

    act(() => {
      result.current.exportData(testData, columns, {
        filename: 'test',
        format: 'xlsx',
      });
    });

    expect(result.current.isExporting).toBe(false);
    expect(result.current.error).toBe('XLSX export failed');
  });

  it('should handle non-Error exceptions', () => {
    const { result } = renderHook(() => useExport<TestData>());

    vi.mocked(csvModule.toCSV).mockImplementation(() => {
      throw 'String error';
    });

    act(() => {
      result.current.exportData(testData, columns, {
        filename: 'test',
        format: 'csv',
      });
    });

    expect(result.current.error).toBe('Export failed');
  });

  it('should clear error on successful export after previous error', () => {
    const { result } = renderHook(() => useExport<TestData>());

    // First export fails
    vi.mocked(csvModule.toCSV).mockImplementationOnce(() => {
      throw new Error('First error');
    });

    act(() => {
      result.current.exportData(testData, columns, {
        filename: 'test',
        format: 'csv',
      });
    });

    expect(result.current.error).toBe('First error');

    // Second export succeeds
    vi.mocked(csvModule.toCSV).mockReturnValueOnce('success');

    act(() => {
      result.current.exportData(testData, columns, {
        filename: 'test',
        format: 'csv',
      });
    });

    expect(result.current.error).toBe(null);
    expect(result.current.isExporting).toBe(false);
  });

  it('should handle empty data array', () => {
    const { result } = renderHook(() => useExport<TestData>());

    act(() => {
      result.current.exportData([], columns, {
        filename: 'empty',
        format: 'csv',
      });
    });

    expect(csvModule.toCSV).toHaveBeenCalledWith([], columns);
    expect(result.current.error).toBe(null);
  });

  it('should handle multiple consecutive exports', () => {
    const { result } = renderHook(() => useExport<TestData>());

    act(() => {
      result.current.exportData(testData, columns, {
        filename: 'export1',
        format: 'csv',
      });
    });

    expect(csvModule.downloadCSV).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.exportData(testData, columns, {
        filename: 'export2',
        format: 'xlsx',
      });
    });

    expect(xlsxModule.downloadXLSX).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe(null);
  });

  it('should maintain callback reference stability', () => {
    const { result, rerender } = renderHook(() => useExport<TestData>());

    const firstExportData = result.current.exportData;

    rerender();

    const secondExportData = result.current.exportData;

    expect(firstExportData).toBe(secondExportData);
  });
});

describe('useExport - predefined column configurations', () => {
  it('should have leadColumns configuration', async () => {
    const { leadColumns } = await import('@/lib/export/use-export');

    expect(leadColumns).toBeDefined();
    expect(Array.isArray(leadColumns)).toBe(true);
    expect(leadColumns.length).toBeGreaterThan(0);

    const idColumn = leadColumns.find((col) => col.key === 'id');
    expect(idColumn).toBeDefined();
    expect(idColumn?.header).toBe('ID');
  });

  it('should have appointmentColumns configuration', async () => {
    const { appointmentColumns } = await import('@/lib/export/use-export');

    expect(appointmentColumns).toBeDefined();
    expect(Array.isArray(appointmentColumns)).toBe(true);
    expect(appointmentColumns.length).toBeGreaterThan(0);

    const idColumn = appointmentColumns.find((col) => col.key === 'id');
    expect(idColumn).toBeDefined();
  });

  it('should have reportColumns configuration', async () => {
    const { reportColumns } = await import('@/lib/export/use-export');

    expect(reportColumns).toBeDefined();
    expect(Array.isArray(reportColumns)).toBe(true);
    expect(reportColumns.length).toBeGreaterThan(0);

    const dateColumn = reportColumns.find((col) => col.key === 'date');
    expect(dateColumn).toBeDefined();
  });

  it('leadColumns should have score formatter', async () => {
    const { leadColumns } = await import('@/lib/export/use-export');

    const scoreColumn = leadColumns.find((col) => col.key === 'score');
    expect(scoreColumn).toBeDefined();
    expect(scoreColumn?.format).toBeDefined();

    if (scoreColumn?.format) {
      expect(scoreColumn.format(85, {} as never)).toBe('85%');
      expect(scoreColumn.format(null, {} as never)).toBe('-');
    }
  });

  it('reportColumns should have conversion rate formatter', async () => {
    const { reportColumns } = await import('@/lib/export/use-export');

    const conversionColumn = reportColumns.find((col) => col.key === 'conversionRate');
    expect(conversionColumn).toBeDefined();
    expect(conversionColumn?.format).toBeDefined();

    if (conversionColumn?.format) {
      expect(conversionColumn.format(0.456, {} as never)).toBe('45.6%');
      expect(conversionColumn.format(null, {} as never)).toBe('-');
    }
  });
});
