import type { ExportColumn } from './types';
import type { AuditLog } from '@/app/actions';

/**
 * Column definitions for audit log export
 */
export const auditColumns: ExportColumn<AuditLog>[] = [
  { key: 'id', header: 'ID' },
  {
    key: 'timestamp',
    header: 'Timestamp',
    format: (v) => (v instanceof Date ? v.toISOString() : String(v)),
  },
  { key: 'user', header: 'Utilizator' },
  { key: 'userRole', header: 'Rol' },
  { key: 'action', header: 'Acțiune' },
  { key: 'category', header: 'Categorie' },
  {
    key: 'status',
    header: 'Status',
    format: (v) => {
      const statusMap: Record<string, string> = {
        success: 'Succes',
        failure: 'Eroare',
        warning: 'Avertisment',
      };
      return statusMap[v as string] ?? String(v);
    },
  },
  { key: 'details', header: 'Detalii' },
  { key: 'entityType', header: 'Tip Entitate' },
  { key: 'entityId', header: 'ID Entitate' },
  { key: 'entityName', header: 'Nume Entitate' },
  { key: 'ipAddress', header: 'Adresă IP' },
];

/**
 * Column definitions for PDF export (subset with formatted headers)
 */
export const auditPdfColumns: ExportColumn<AuditLog>[] = [
  {
    key: 'timestamp',
    header: 'Data și Ora',
    format: (v) =>
      v instanceof Date
        ? v.toLocaleString('ro-RO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : String(v),
  },
  { key: 'user', header: 'Utilizator' },
  { key: 'action', header: 'Acțiune' },
  {
    key: 'category',
    header: 'Categorie',
    format: (v) => {
      const categoryMap: Record<string, string> = {
        patient: 'Pacient',
        document: 'Document',
        settings: 'Setări',
        auth: 'Autentificare',
        billing: 'Facturare',
        system: 'Sistem',
      };
      return categoryMap[v as string] ?? String(v);
    },
  },
  {
    key: 'status',
    header: 'Status',
    format: (v) => {
      const statusMap: Record<string, string> = {
        success: 'Succes',
        failure: 'Eroare',
        warning: 'Avertisment',
      };
      return statusMap[v as string] ?? String(v);
    },
  },
  { key: 'details', header: 'Detalii' },
];
