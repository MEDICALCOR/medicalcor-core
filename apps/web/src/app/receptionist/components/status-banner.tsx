'use client';

import { Check, AlertTriangle, Phone, Clock } from 'lucide-react';

export interface SystemStatus {
  missedCalls: number;
  angryPatients: number;
  insuranceVerified: boolean;
  queueSize: number;
}

interface StatusBannerProps {
  status: SystemStatus;
}

/**
 * Status banner - kindergarten simple
 *
 * Shows ONE of:
 * - All good (green) - nothing needs attention
 * - Warning (yellow) - something needs attention
 * - Alert (red) - urgent action needed
 */
export function StatusBanner({ status }: StatusBannerProps) {
  const hasIssues = status.missedCalls > 0 || status.angryPatients > 0 || status.queueSize > 5;

  // Red alert - angry patients or many missed calls
  if (status.angryPatients > 0 || status.missedCalls > 3) {
    return (
      <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-800 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-red-700 dark:text-red-400">Needs attention</p>
            <div className="flex flex-wrap gap-3 mt-1 text-sm text-red-600 dark:text-red-300">
              {status.missedCalls > 0 && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {status.missedCalls} missed calls
                </span>
              )}
              {status.angryPatients > 0 && (
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {status.angryPatients} complaints
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Yellow warning - some missed calls or queue building
  if (hasIssues) {
    return (
      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-200 dark:border-amber-800 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center flex-shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-amber-700 dark:text-amber-400">Heads up</p>
            <div className="flex flex-wrap gap-3 mt-1 text-sm text-amber-600 dark:text-amber-300">
              {status.missedCalls > 0 && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {status.missedCalls} missed calls
                </span>
              )}
              {status.queueSize > 5 && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {status.queueSize} in queue
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Green - all good!
  return (
    <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border-2 border-green-200 dark:border-green-800 p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center flex-shrink-0">
          <Check className="h-5 w-5" />
        </div>
        <div>
          <p className="font-semibold text-green-700 dark:text-green-400">All good!</p>
          <div className="flex flex-wrap gap-3 mt-1 text-sm text-green-600 dark:text-green-300">
            <span>No missed calls</span>
            <span>•</span>
            <span>No angry patients</span>
            {status.insuranceVerified && (
              <>
                <span>•</span>
                <span>Insurance verified</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
