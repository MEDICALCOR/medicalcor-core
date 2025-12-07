import type { Meta, StoryObj } from '@storybook/react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ExportButtonDemoProps {
  recordCount: number;
  isOpen?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

function ExportButtonDemo({
  recordCount,
  isOpen: initialOpen = false,
  disabled = false,
  variant = 'outline',
  size = 'default',
}: ExportButtonDemoProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);

  const handleExport = (format: 'csv' | 'xlsx') => {
    alert(`Exporting ${recordCount} records as ${format.toUpperCase()}`);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <Button
        variant={variant}
        size={size}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || recordCount === 0}
        className={cn('gap-2')}
      >
        <Download className="h-4 w-4" />
        {size !== 'icon' && 'Export'}
      </Button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <Card className="absolute right-0 top-full mt-2 z-50 w-48 shadow-lg">
            <CardContent className="p-2">
              <p className="text-xs text-muted-foreground px-2 py-1 mb-1">{recordCount} records</p>

              <button
                onClick={() => handleExport('csv')}
                className="flex items-center gap-2 w-full px-2 py-2 text-sm rounded-md hover:bg-muted transition-colors"
              >
                <FileText className="h-4 w-4 text-green-600" />
                <span>Export CSV</span>
              </button>

              <button
                onClick={() => handleExport('xlsx')}
                className="flex items-center gap-2 w-full px-2 py-2 text-sm rounded-md hover:bg-muted transition-colors"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                <span>Export Excel</span>
              </button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

const meta = {
  title: 'Features/ExportButton',
  component: ExportButtonDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    recordCount: {
      control: 'number',
      description: 'Number of records to export',
    },
    disabled: {
      control: 'boolean',
      description: 'Disable the button',
    },
    variant: {
      control: 'select',
      options: ['default', 'outline', 'ghost'],
      description: 'Button variant',
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
      description: 'Button size',
    },
  },
  decorators: [
    (Story) => (
      <div className="h-[200px] flex items-start justify-center pt-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ExportButtonDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    recordCount: 150,
  },
};

export const Open: Story = {
  args: {
    recordCount: 150,
    isOpen: true,
  },
};

export const NoRecords: Story = {
  args: {
    recordCount: 0,
  },
};

export const SmallButton: Story = {
  args: {
    recordCount: 50,
    size: 'sm',
  },
};

export const LargeButton: Story = {
  args: {
    recordCount: 500,
    size: 'lg',
  },
};

export const IconButton: Story = {
  args: {
    recordCount: 100,
    size: 'icon',
  },
};

export const GhostVariant: Story = {
  args: {
    recordCount: 75,
    variant: 'ghost',
  },
};

export const InTableHeader: Story = {
  args: { recordCount: 150 },
  render: () => (
    <div className="border rounded-lg w-[600px]">
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <div>
          <h3 className="font-semibold">Patient List</h3>
          <p className="text-sm text-muted-foreground">150 patients found</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            Filter
          </Button>
          <ExportButtonDemo recordCount={150} size="sm" />
        </div>
      </div>
      <div className="p-4 text-center text-muted-foreground text-sm">Table content here...</div>
    </div>
  ),
};

export const ExportFormats: Story = {
  args: { recordCount: 100 },
  render: () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Available Export Formats</h3>
      <div className="space-y-2">
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          <FileText className="h-5 w-5 text-green-600" />
          <div>
            <p className="font-medium">CSV (Comma-Separated Values)</p>
            <p className="text-sm text-muted-foreground">
              Universal format, compatible with Excel, Google Sheets, etc.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
          <div>
            <p className="font-medium">XLSX (Microsoft Excel)</p>
            <p className="text-sm text-muted-foreground">
              Native Excel format with formatting support.
            </p>
          </div>
        </div>
      </div>
    </div>
  ),
};
