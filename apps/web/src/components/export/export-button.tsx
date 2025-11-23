'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { useExport, type ExportColumn, type ExportFormat } from '@/lib/export';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ExportButtonProps<T> {
  data: T[];
  columns: ExportColumn<T>[];
  filename: string;
  sheetName?: string;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function ExportButton<T>({
  data,
  columns,
  filename,
  sheetName,
  className,
  variant = 'outline',
  size = 'default',
}: ExportButtonProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const { isExporting, error, exportData } = useExport<T>();

  const handleExport = (format: ExportFormat) => {
    exportData(data, columns, { filename, format, sheetName });
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <Button
        variant={variant}
        size={size}
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting || data.length === 0}
        className={cn('gap-2', className)}
      >
        {isExporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {size !== 'icon' && 'Export'}
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Dropdown */}
          <Card className="absolute right-0 top-full mt-2 z-50 w-48 shadow-lg">
            <CardContent className="p-2">
              <p className="text-xs text-muted-foreground px-2 py-1 mb-1">
                {data.length} înregistrări
              </p>

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

              {error && <p className="text-xs text-destructive px-2 py-1 mt-1">{error}</p>}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
