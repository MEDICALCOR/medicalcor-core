'use client';

/**
 * Export Report Button Component
 *
 * Client component that handles CSV export for the LTV dashboard.
 * Triggers server action and downloads the generated CSV file.
 */

import { useState } from 'react';
import { exportLTVReportAction } from '../actions';

export function ExportReportButton() {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setIsExporting(true);
    setError(null);

    try {
      const result = await exportLTVReportAction('csv');

      if (!result.success) {
        setError(result.message);
        return;
      }

      if (result.data && result.filename) {
        // Create blob and download
        const blob = new Blob([result.data], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export report');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleExport}
        disabled={isExporting}
        className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
        aria-label="Export LTV report as CSV"
      >
        {isExporting ? (
          <span className="flex items-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Exporting...
          </span>
        ) : (
          'Export Report'
        )}
      </button>
      {error && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
