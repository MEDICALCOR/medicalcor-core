// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportButton } from '@/components/export/export-button';

const mockExportData = vi.fn();

vi.mock('@/lib/export', () => ({
  useExport: vi.fn(() => ({
    isExporting: false,
    error: null,
    exportData: mockExportData,
  })),
}));

const mockData = [
  { id: 1, name: 'Test 1', value: 100 },
  { id: 2, name: 'Test 2', value: 200 },
];

const mockColumns = [
  { header: 'ID', accessorKey: 'id' },
  { header: 'Name', accessorKey: 'name' },
  { header: 'Value', accessorKey: 'value' },
];

describe('ExportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render export button', () => {
    render(<ExportButton data={mockData} columns={mockColumns} filename="test" />);

    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });

  it('should disable button when no data', () => {
    render(<ExportButton data={[]} columns={mockColumns} filename="test" />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should show record count when dropdown is open', async () => {
    const user = userEvent.setup();
    render(<ExportButton data={mockData} columns={mockColumns} filename="test" />);

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('2 înregistrări')).toBeInTheDocument();
    });
  });

  it('should display CSV export option', async () => {
    const user = userEvent.setup();
    render(<ExportButton data={mockData} columns={mockColumns} filename="test" />);

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Export CSV')).toBeInTheDocument();
    });
  });

  it('should display Excel export option', async () => {
    const user = userEvent.setup();
    render(<ExportButton data={mockData} columns={mockColumns} filename="test" />);

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Export Excel')).toBeInTheDocument();
    });
  });

  it('should call exportData with CSV format when CSV is clicked', async () => {
    const user = userEvent.setup();
    render(<ExportButton data={mockData} columns={mockColumns} filename="test" />);

    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('Export CSV')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Export CSV'));

    expect(mockExportData).toHaveBeenCalledWith(mockData, mockColumns, {
      filename: 'test',
      format: 'csv',
      sheetName: undefined,
    });
  });

  it('should call exportData with XLSX format when Excel is clicked', async () => {
    const user = userEvent.setup();
    render(<ExportButton data={mockData} columns={mockColumns} filename="test" />);

    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('Export Excel')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Export Excel'));

    expect(mockExportData).toHaveBeenCalledWith(mockData, mockColumns, {
      filename: 'test',
      format: 'xlsx',
      sheetName: undefined,
    });
  });

  it('should include sheet name when provided', async () => {
    const user = userEvent.setup();
    render(
      <ExportButton
        data={mockData}
        columns={mockColumns}
        filename="test"
        sheetName="MySheet"
      />
    );

    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('Export Excel')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Export Excel'));

    expect(mockExportData).toHaveBeenCalledWith(mockData, mockColumns, {
      filename: 'test',
      format: 'xlsx',
      sheetName: 'MySheet',
    });
  });

  it('should close dropdown after export', async () => {
    const user = userEvent.setup();
    render(<ExportButton data={mockData} columns={mockColumns} filename="test" />);

    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('Export CSV')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Export CSV'));

    await waitFor(() => {
      expect(screen.queryByText('Export CSV')).not.toBeInTheDocument();
    });
  });

  it('should show loading state when exporting', () => {
    const { useExport } = require('@/lib/export');
    useExport.mockReturnValue({
      isExporting: true,
      error: null,
      exportData: mockExportData,
    });

    render(<ExportButton data={mockData} columns={mockColumns} filename="test" />);

    expect(screen.getByRole('img', { hidden: true })).toHaveClass('animate-spin');
  });

  it('should disable button when exporting', () => {
    const { useExport } = require('@/lib/export');
    useExport.mockReturnValue({
      isExporting: true,
      error: null,
      exportData: mockExportData,
    });

    render(<ExportButton data={mockData} columns={mockColumns} filename="test" />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should display error when export fails', async () => {
    const user = userEvent.setup();
    const { useExport } = require('@/lib/export');
    useExport.mockReturnValue({
      isExporting: false,
      error: 'Export failed',
      exportData: mockExportData,
    });

    render(<ExportButton data={mockData} columns={mockColumns} filename="test" />);

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Export failed')).toBeInTheDocument();
    });
  });

  it('should apply custom variant', () => {
    render(
      <ExportButton
        data={mockData}
        columns={mockColumns}
        filename="test"
        variant="ghost"
      />
    );

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  it('should apply custom size', () => {
    render(
      <ExportButton data={mockData} columns={mockColumns} filename="test" size="sm" />
    );

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  it('should not show Export text when size is icon', () => {
    render(
      <ExportButton data={mockData} columns={mockColumns} filename="test" size="icon" />
    );

    expect(screen.queryByText('Export')).not.toBeInTheDocument();
  });

  it('should apply custom className', () => {
    render(
      <ExportButton
        data={mockData}
        columns={mockColumns}
        filename="test"
        className="custom-class"
      />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveClass('custom-class');
  });

  it('should close dropdown when clicking backdrop', async () => {
    const user = userEvent.setup();
    render(<ExportButton data={mockData} columns={mockColumns} filename="test" />);

    await user.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('Export CSV')).toBeInTheDocument();
    });

    const backdrop = document.querySelector('.fixed.inset-0');
    if (backdrop) {
      await user.click(backdrop);
      await waitFor(() => {
        expect(screen.queryByText('Export CSV')).not.toBeInTheDocument();
      });
    }
  });

  it('should position dropdown relative to button', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ExportButton data={mockData} columns={mockColumns} filename="test" />
    );

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      const dropdown = container.querySelector('.absolute.right-0.top-full');
      expect(dropdown).toBeInTheDocument();
    });
  });
});
