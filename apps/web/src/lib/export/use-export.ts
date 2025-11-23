'use client';

import { useState, useCallback } from 'react';
import { toCSV, downloadCSV } from './csv';
import { downloadXLSX } from './xlsx';
import type { ExportColumn, ExportFormat } from './types';

interface ExportState {
  isExporting: boolean;
  error: string | null;
}

export function useExport<T>() {
  const [state, setState] = useState<ExportState>({
    isExporting: false,
    error: null,
  });

  const exportData = useCallback(
    (
      data: T[],
      columns: ExportColumn<T>[],
      options: {
        filename: string;
        format: ExportFormat;
        sheetName?: string;
      }
    ) => {
      setState({ isExporting: true, error: null });

      try {
        if (options.format === 'csv') {
          const csv = toCSV(data, columns);
          downloadCSV(csv, options.filename);
        } else {
          // xlsx format
          downloadXLSX(data, columns, options.filename, options.sheetName ?? 'Report');
        }

        setState({ isExporting: false, error: null });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Export failed';
        setState({ isExporting: false, error: message });
      }
    },
    []
  );

  return {
    ...state,
    exportData,
  };
}

// Predefined column configurations for common exports
export const leadColumns: ExportColumn[] = [
  { key: 'id', header: 'ID' },
  { key: 'phone', header: 'Telefon' },
  { key: 'source', header: 'Sursă' },
  { key: 'classification', header: 'Clasificare' },
  {
    key: 'score',
    header: 'Scor AI',
    format: (v) => (typeof v === 'number' ? `${v}%` : '-'),
  },
  {
    key: 'confidence',
    header: 'Încredere',
    format: (v) => (typeof v === 'number' ? `${v}%` : '-'),
  },
  { key: 'procedures', header: 'Proceduri interes' },
  {
    key: 'createdAt',
    header: 'Creat la',
    format: (v) => (typeof v === 'string' ? new Date(v).toLocaleString('ro-RO') : '-'),
  },
  { key: 'status', header: 'Status' },
];

export const appointmentColumns: ExportColumn[] = [
  { key: 'id', header: 'ID' },
  { key: 'patientPhone', header: 'Telefon pacient' },
  { key: 'patientName', header: 'Nume pacient' },
  {
    key: 'dateTime',
    header: 'Data și ora',
    format: (v) => (typeof v === 'string' ? new Date(v).toLocaleString('ro-RO') : '-'),
  },
  { key: 'procedure', header: 'Procedură' },
  { key: 'status', header: 'Status' },
  { key: 'operatorName', header: 'Operator' },
  { key: 'notes', header: 'Note' },
];

export const reportColumns: ExportColumn[] = [
  {
    key: 'date',
    header: 'Data',
    format: (v) => (typeof v === 'string' ? new Date(v).toLocaleDateString('ro-RO') : '-'),
  },
  { key: 'totalLeads', header: 'Total lead-uri' },
  { key: 'hotLeads', header: 'Lead-uri HOT' },
  { key: 'warmLeads', header: 'Lead-uri WARM' },
  { key: 'coldLeads', header: 'Lead-uri COLD' },
  { key: 'appointmentsScheduled', header: 'Programări' },
  {
    key: 'conversionRate',
    header: 'Rata conversie',
    format: (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '-'),
  },
];
