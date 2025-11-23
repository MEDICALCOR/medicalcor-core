/**
 * Export types for reports
 */

export type ExportFormat = 'csv' | 'xlsx';

export interface ExportColumn<T = unknown> {
  key: keyof T | string;
  header: string;
  width?: number;
  format?: (value: unknown, row: T) => string;
}

export interface ExportOptions {
  filename: string;
  sheetName?: string;
  format: ExportFormat;
}

export interface LeadExportRow {
  id: string;
  phone: string;
  source: string;
  classification: string;
  score: number;
  confidence: number;
  procedures: string;
  createdAt: string;
  status: string;
  appointmentDate?: string;
}

export interface AppointmentExportRow {
  id: string;
  patientPhone: string;
  patientName: string;
  dateTime: string;
  procedure: string;
  status: string;
  operatorName?: string;
  notes?: string;
}

export interface ReportExportRow {
  date: string;
  totalLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  appointmentsScheduled: number;
  conversionRate: number;
}
