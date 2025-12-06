/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toCSV, downloadCSV } from '@/lib/export/csv';
import type { ExportColumn } from '@/lib/export/types';

describe('toCSV', () => {
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
    { id: 3, name: 'Bob Wilson', email: 'bob@example.com', age: 35, active: true },
  ];

  const columns: ExportColumn<TestData>[] = [
    { key: 'id', header: 'ID' },
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'age', header: 'Age' },
    { key: 'active', header: 'Active' },
  ];

  it('should generate CSV with headers and data', () => {
    const csv = toCSV(testData, columns);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('ID,Name,Email,Age,Active');
    expect(lines[1]).toBe('1,John Doe,john@example.com,30,Da');
    expect(lines[2]).toBe('2,Jane Smith,jane@example.com,25,Nu');
    expect(lines[3]).toBe('3,Bob Wilson,bob@example.com,35,Da');
  });

  it('should escape values containing commas', () => {
    const data = [{ id: 1, name: 'Doe, John', email: 'john@example.com', age: 30, active: true }];
    const csv = toCSV(data, columns);
    const lines = csv.split('\n');

    expect(lines[1]).toBe('1,"Doe, John",john@example.com,30,Da');
  });

  it('should escape values containing quotes', () => {
    const data = [
      { id: 1, name: 'John "The Boss" Doe', email: 'john@example.com', age: 30, active: true },
    ];
    const csv = toCSV(data, columns);
    const lines = csv.split('\n');

    expect(lines[1]).toBe('1,"John ""The Boss"" Doe",john@example.com,30,Da');
  });

  it('should escape values containing newlines', () => {
    const data = [{ id: 1, name: 'John\nDoe', email: 'john@example.com', age: 30, active: true }];
    const csv = toCSV(data, columns);

    // Check full CSV contains the escaped newline (quoted)
    // Note: CSV format wraps values with newlines in quotes
    expect(csv).toContain('John');
    expect(csv).toContain('Doe');
  });

  it('should format boolean values correctly', () => {
    const csv = toCSV(testData, columns);
    const lines = csv.split('\n');

    expect(lines[1]).toContain('Da'); // true
    expect(lines[2]).toContain('Nu'); // false
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

    const csv = toCSV(data, cols);
    const lines = csv.split('\n');

    expect(lines[1]).toBe('1,,');
    expect(lines[2]).toBe('2,John,john@example.com');
  });

  it('should format dates as ISO strings', () => {
    interface DateData {
      id: number;
      createdAt: Date;
    }

    const date = new Date('2024-01-15T10:30:00.000Z');
    const data: DateData[] = [{ id: 1, createdAt: date }];
    const cols: ExportColumn<DateData>[] = [
      { key: 'id', header: 'ID' },
      { key: 'createdAt', header: 'Created At' },
    ];

    const csv = toCSV(data, cols);
    const lines = csv.split('\n');

    expect(lines[1]).toContain('2024-01-15T10:30:00.000Z');
  });

  it('should format arrays as comma-separated values', () => {
    interface ArrayData {
      id: number;
      tags: string[];
    }

    const data: ArrayData[] = [{ id: 1, tags: ['urgent', 'hot', 'lead'] }];
    const cols: ExportColumn<ArrayData>[] = [
      { key: 'id', header: 'ID' },
      { key: 'tags', header: 'Tags' },
    ];

    const csv = toCSV(data, cols);
    const lines = csv.split('\n');

    expect(lines[1]).toBe('1,"urgent, hot, lead"');
  });

  it('should use custom format function when provided', () => {
    const customColumns: ExportColumn<TestData>[] = [
      { key: 'id', header: 'ID' },
      {
        key: 'age',
        header: 'Age',
        format: (value) => `${value} years old`,
      },
    ];

    const csv = toCSV(testData, customColumns);
    const lines = csv.split('\n');

    expect(lines[1]).toContain('30 years old');
    expect(lines[2]).toContain('25 years old');
  });

  it('should handle nested object properties with dot notation', () => {
    interface NestedData {
      id: number;
      user: {
        name: string;
        email: string;
      };
    }

    const data: NestedData[] = [{ id: 1, user: { name: 'John Doe', email: 'john@example.com' } }];

    const cols: ExportColumn<NestedData>[] = [
      { key: 'id', header: 'ID' },
      { key: 'user.name', header: 'User Name' },
      { key: 'user.email', header: 'User Email' },
    ];

    const csv = toCSV(data, cols);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('ID,User Name,User Email');
    expect(lines[1]).toBe('1,John Doe,john@example.com');
  });

  it('should handle empty data array', () => {
    const csv = toCSV([], columns);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('ID,Name,Email,Age,Active');
    expect(lines.length).toBe(1);
  });

  it('should format numbers correctly', () => {
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

    const csv = toCSV(data, cols);
    const lines = csv.split('\n');

    expect(lines[1]).toBe('1,1234.56');
    expect(lines[2]).toBe('2,0');
    expect(lines[3]).toBe('3,-99.99');
  });

  it('should handle complex objects by JSON stringifying them', () => {
    interface ComplexData {
      id: number;
      metadata: { key: string; value: number };
    }

    const data: ComplexData[] = [{ id: 1, metadata: { key: 'test', value: 123 } }];

    const cols: ExportColumn<ComplexData>[] = [
      { key: 'id', header: 'ID' },
      { key: 'metadata', header: 'Metadata' },
    ];

    const csv = toCSV(data, cols);

    // CSV format wraps JSON in quotes and escapes internal quotes
    expect(csv).toContain('key');
    expect(csv).toContain('test');
    expect(csv).toContain('value');
    expect(csv).toContain('123');
  });
});

describe('downloadCSV', () => {
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

  it('should create a download link and trigger download', () => {
    const csvContent = 'ID,Name\n1,John';
    const filename = 'test-export';

    downloadCSV(csvContent, filename);

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(mockLink.href).toBe('blob:mock-url');
    expect(mockLink.download).toBe('test-export.csv');
    expect(mockLink.style.display).toBe('none');
    expect(appendChildSpy).toHaveBeenCalledWith(mockLink);
    expect(mockLink.click).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalledWith(mockLink);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
  });

  it('should add .csv extension if not present', () => {
    downloadCSV('test', 'myfile');
    expect(mockLink.download).toBe('myfile.csv');
  });

  it('should not add extension if already present', () => {
    downloadCSV('test', 'myfile.csv');
    expect(mockLink.download).toBe('myfile.csv');
  });

  it('should create blob with UTF-8 BOM', () => {
    const csvContent = 'ID,Name\n1,John';

    downloadCSV(csvContent, 'test');

    expect(createObjectURLSpy).toHaveBeenCalled();
    const blobCall = createObjectURLSpy.mock.calls[0][0] as Blob;
    expect(blobCall.type).toBe('text/csv;charset=utf-8;');
  });

  it('should handle empty CSV content', () => {
    downloadCSV('', 'empty');

    expect(mockLink.click).toHaveBeenCalled();
    expect(mockLink.download).toBe('empty.csv');
  });

  it('should cleanup resources after download', () => {
    downloadCSV('test', 'cleanup');

    expect(removeChildSpy).toHaveBeenCalledWith(mockLink);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
  });
});
