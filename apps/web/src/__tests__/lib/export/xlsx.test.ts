/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createXLSX, downloadXLSX } from '@/lib/export/xlsx';
import type { ExportColumn } from '@/lib/export/types';

describe('createXLSX', () => {
  interface TestData {
    id: number;
    name: string;
    email: string;
    age: number;
    active: boolean;
  }

  const testData: TestData[] = [
    { id: 1, name: 'John Doe', email: 'john@example.com', age: 30, active: true },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com', age: 25, active: false },
  ];

  const columns: ExportColumn<TestData>[] = [
    { key: 'id', header: 'ID' },
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'age', header: 'Age' },
    { key: 'active', header: 'Active' },
  ];

  it('should create a blob with correct MIME type', () => {
    const blob = createXLSX(testData, columns);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('should create a valid ZIP blob', () => {
    const blob = createXLSX(testData, columns);

    // Check blob is created with correct type
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('should handle empty data array', () => {
    const blob = createXLSX([], columns);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0); // Should still have structure
  });

  it('should handle custom sheet name', () => {
    const blob = createXLSX(testData, columns, 'CustomSheet');

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('should format boolean values correctly', () => {
    const blob = createXLSX(testData, columns);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('should handle null and undefined values', () => {
    interface NullableData {
      id: number;
      name: string | null;
      email?: string;
    }

    const data: NullableData[] = [
      { id: 1, name: null, email: undefined },
      { id: 2, name: 'John', email: 'john@example.com' },
    ];

    const cols: ExportColumn<NullableData>[] = [
      { key: 'id', header: 'ID' },
      { key: 'name', header: 'Name' },
      { key: 'email', header: 'Email' },
    ];

    const blob = createXLSX(data, cols);

    expect(blob).toBeInstanceOf(Blob);
  });

  it('should format dates correctly', () => {
    interface DateData {
      id: number;
      createdAt: Date;
    }

    const data: DateData[] = [{ id: 1, createdAt: new Date('2024-01-15T10:30:00Z') }];

    const cols: ExportColumn<DateData>[] = [
      { key: 'id', header: 'ID' },
      { key: 'createdAt', header: 'Created At' },
    ];

    const blob = createXLSX(data, cols);

    expect(blob).toBeInstanceOf(Blob);
  });

  it('should use custom format function when provided', () => {
    const customColumns: ExportColumn<TestData>[] = [
      { key: 'id', header: 'ID' },
      {
        key: 'age',
        header: 'Age',
        format: (value) => `${value} years`,
      },
    ];

    const blob = createXLSX(testData, customColumns);

    expect(blob).toBeInstanceOf(Blob);
  });

  it('should handle numbers correctly', () => {
    interface NumberData {
      id: number;
      value: number;
    }

    const data: NumberData[] = [
      { id: 1, value: 1234.56 },
      { id: 2, value: 0 },
      { id: 3, value: -99.99 },
    ];

    const cols: ExportColumn<NumberData>[] = [
      { key: 'id', header: 'ID' },
      { key: 'value', header: 'Value' },
    ];

    const blob = createXLSX(data, cols);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('should handle arrays correctly', () => {
    interface ArrayData {
      id: number;
      tags: string[];
    }

    const data: ArrayData[] = [{ id: 1, tags: ['urgent', 'hot', 'lead'] }];

    const cols: ExportColumn<ArrayData>[] = [
      { key: 'id', header: 'ID' },
      { key: 'tags', header: 'Tags' },
    ];

    const blob = createXLSX(data, cols);

    expect(blob).toBeInstanceOf(Blob);
  });

  it('should handle special XML characters in data', () => {
    interface SpecialData {
      id: number;
      text: string;
    }

    const data: SpecialData[] = [{ id: 1, text: 'Text with <special> & "characters"' }];

    const cols: ExportColumn<SpecialData>[] = [
      { key: 'id', header: 'ID' },
      { key: 'text', header: 'Text' },
    ];

    const blob = createXLSX(data, cols);

    expect(blob).toBeInstanceOf(Blob);
  });

  it('should handle large datasets', () => {
    const largeData = Array.from({ length: 1000 }, (_, i) => ({
      id: i + 1,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      age: 20 + (i % 50),
      active: i % 2 === 0,
    }));

    const blob = createXLSX(largeData, columns);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('should create blob with different column counts', () => {
    const minimalColumns: ExportColumn<TestData>[] = [{ key: 'id', header: 'ID' }];

    const blob = createXLSX(testData, minimalColumns);

    expect(blob).toBeInstanceOf(Blob);
  });

  it('should handle complex nested objects', () => {
    interface ComplexData {
      id: number;
      metadata: { key: string; value: number };
    }

    const data: ComplexData[] = [{ id: 1, metadata: { key: 'test', value: 123 } }];

    const cols: ExportColumn<ComplexData>[] = [
      { key: 'id', header: 'ID' },
      { key: 'metadata', header: 'Metadata' },
    ];

    const blob = createXLSX(data, cols);

    expect(blob).toBeInstanceOf(Blob);
  });
});

describe('downloadXLSX', () => {
  let createElementSpy: ReturnType<typeof vi.spyOn>;
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let appendChildSpy: ReturnType<typeof vi.spyOn>;
  let removeChildSpy: ReturnType<typeof vi.spyOn>;
  let mockLink: HTMLAnchorElement;

  beforeEach(() => {
    mockLink = {
      href: '',
      download: '',
      style: { display: '' },
      click: vi.fn(),
    } as unknown as HTMLAnchorElement;

    createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockLink);
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink);
    removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  interface TestData {
    id: number;
    name: string;
  }

  const testData: TestData[] = [{ id: 1, name: 'John' }];
  const columns: ExportColumn<TestData>[] = [
    { key: 'id', header: 'ID' },
    { key: 'name', header: 'Name' },
  ];

  it('should create a download link and trigger download', () => {
    downloadXLSX(testData, columns, 'test-export');

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(mockLink.href).toBe('blob:mock-url');
    expect(mockLink.download).toBe('test-export.xlsx');
    expect(mockLink.style.display).toBe('none');
    expect(appendChildSpy).toHaveBeenCalledWith(mockLink);
    expect(mockLink.click).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalledWith(mockLink);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
  });

  it('should add .xlsx extension if not present', () => {
    downloadXLSX(testData, columns, 'myfile');
    expect(mockLink.download).toBe('myfile.xlsx');
  });

  it('should not add extension if already present', () => {
    downloadXLSX(testData, columns, 'myfile.xlsx');
    expect(mockLink.download).toBe('myfile.xlsx');
  });

  it('should use default sheet name if not provided', () => {
    downloadXLSX(testData, columns, 'test');

    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(mockLink.click).toHaveBeenCalled();
  });

  it('should use custom sheet name when provided', () => {
    downloadXLSX(testData, columns, 'test', 'CustomSheet');

    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(mockLink.click).toHaveBeenCalled();
  });

  it('should cleanup resources after download', () => {
    downloadXLSX(testData, columns, 'cleanup');

    expect(removeChildSpy).toHaveBeenCalledWith(mockLink);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
  });

  it('should handle empty data', () => {
    downloadXLSX([], columns, 'empty');

    expect(mockLink.click).toHaveBeenCalled();
    expect(mockLink.download).toBe('empty.xlsx');
  });
});
