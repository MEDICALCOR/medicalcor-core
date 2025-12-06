import type { ExportColumn } from './types';

/**
 * PDF generation utility for audit logs using jsPDF-like approach
 * Creates a downloadable PDF document from tabular data
 */

interface PdfOptions {
  title: string;
  subtitle?: string;
  filename: string;
  orientation?: 'portrait' | 'landscape';
  generatedBy?: string;
  dateRange?: { start: string; end: string };
}

const PDF_HEADER = '%PDF-1.4\n';
const PAGE_WIDTH = 595; // A4 width in points
const PAGE_HEIGHT = 842; // A4 height in points
const MARGIN = 40;
const LINE_HEIGHT = 14;
const HEADER_HEIGHT = 20;
const FONT_SIZE = 10;
const TITLE_FONT_SIZE = 16;
const SUBTITLE_FONT_SIZE = 12;

/**
 * Escape special characters for PDF text
 */
function escapePdfText(text: string): string {
  // Remove control characters (0x00-0x1F)
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    if (charCode >= 0x20) {
      result += text[i];
    }
  }
  return result.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleString('ro-RO');
  if (typeof value === 'boolean') return value ? 'Da' : 'Nu';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'symbol') return value.description ?? '';
  if (typeof value === 'function') return '[Function]';
  if (Array.isArray(value)) return value.map((v) => formatValue(v)).join(', ');
  // typeof value === 'object'
  try {
    return JSON.stringify(value);
  } catch {
    return '[Object]';
  }
}

/**
 * Create a simple PDF document with table data
 */
function createPdfDocument<T>(data: T[], columns: ExportColumn<T>[], options: PdfOptions): string {
  const objects: string[] = [];
  let objectCount = 0;
  const xref: number[] = [];
  let currentOffset = 0;

  function addObject(content: string): number {
    objectCount++;
    xref.push(currentOffset);
    const obj = `${objectCount} 0 obj\n${content}\nendobj\n`;
    objects.push(obj);
    currentOffset += obj.length;
    return objectCount;
  }

  // Calculate column widths
  const contentWidth =
    options.orientation === 'landscape' ? PAGE_HEIGHT - 2 * MARGIN : PAGE_WIDTH - 2 * MARGIN;
  const colWidth = contentWidth / Math.min(columns.length, 6);

  // Generate page content
  const contentHeight =
    options.orientation === 'landscape' ? PAGE_WIDTH - 2 * MARGIN : PAGE_HEIGHT - 2 * MARGIN;
  const rowsPerPage = Math.floor((contentHeight - 80) / LINE_HEIGHT);

  // Split data into pages
  const pages: T[][] = [];
  for (let i = 0; i < data.length; i += rowsPerPage) {
    pages.push(data.slice(i, i + rowsPerPage));
  }
  if (pages.length === 0) pages.push([]);

  // Build PDF structure
  currentOffset = PDF_HEADER.length;

  // Catalog
  const catalogId = addObject('<< /Type /Catalog /Pages 2 0 R >>');

  // Pages object (placeholder, will be updated)
  const pagesObjContent = `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  addObject(pagesObjContent);

  // Font
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  // Create pages
  const pageWidth = options.orientation === 'landscape' ? PAGE_HEIGHT : PAGE_WIDTH;
  const pageHeight = options.orientation === 'landscape' ? PAGE_WIDTH : PAGE_HEIGHT;

  pages.forEach((pageData, pageIndex) => {
    // Page object
    addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${5 + pageIndex * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`
    );

    // Page content stream
    let stream = 'BT\n';
    let yPos = pageHeight - MARGIN;

    // Title (first page only)
    if (pageIndex === 0) {
      stream += `/F1 ${TITLE_FONT_SIZE} Tf\n`;
      stream += `${MARGIN} ${yPos} Td\n`;
      stream += `(${escapePdfText(options.title)}) Tj\n`;
      yPos -= TITLE_FONT_SIZE + 8;

      // Subtitle
      if (options.subtitle) {
        stream += `/F1 ${SUBTITLE_FONT_SIZE} Tf\n`;
        stream += `0 -${TITLE_FONT_SIZE + 8} Td\n`;
        stream += `(${escapePdfText(options.subtitle)}) Tj\n`;
        yPos -= SUBTITLE_FONT_SIZE + 4;
      }

      // Date range
      if (options.dateRange) {
        stream += `/F1 ${FONT_SIZE} Tf\n`;
        stream += `0 -${SUBTITLE_FONT_SIZE + 8} Td\n`;
        stream += `(Perioada: ${escapePdfText(options.dateRange.start)} - ${escapePdfText(options.dateRange.end)}) Tj\n`;
        yPos -= FONT_SIZE + 4;
      }

      // Generated info
      stream += `/F1 ${FONT_SIZE} Tf\n`;
      stream += `0 -${FONT_SIZE + 4} Td\n`;
      stream += `(Generat: ${escapePdfText(new Date().toLocaleString('ro-RO'))}${options.generatedBy ? ` de ${escapePdfText(options.generatedBy)}` : ''}) Tj\n`;
      yPos -= FONT_SIZE + 20;

      stream += `0 -20 Td\n`;
    }

    // Table header
    stream += `/F1 ${FONT_SIZE} Tf\n`;
    if (pageIndex > 0) {
      stream += `${MARGIN} ${yPos} Td\n`;
    }

    const visibleColumns = columns.slice(0, 6);
    visibleColumns.forEach((col, colIndex) => {
      if (colIndex === 0) {
        stream += `(${escapePdfText(col.header.substring(0, 15))}) Tj\n`;
      } else {
        stream += `${colWidth} 0 Td\n`;
        stream += `(${escapePdfText(col.header.substring(0, 15))}) Tj\n`;
      }
    });
    stream += `${-colWidth * (visibleColumns.length - 1)} -${HEADER_HEIGHT} Td\n`;

    // Table rows
    pageData.forEach((row) => {
      visibleColumns.forEach((col, colIndex) => {
        const key = col.key as keyof T;
        const value = row[key];
        const formattedValue = col.format ? col.format(value, row) : formatValue(value);
        const displayValue = formattedValue.substring(0, 20);

        if (colIndex === 0) {
          stream += `(${escapePdfText(displayValue)}) Tj\n`;
        } else {
          stream += `${colWidth} 0 Td\n`;
          stream += `(${escapePdfText(displayValue)}) Tj\n`;
        }
      });
      stream += `${-colWidth * (visibleColumns.length - 1)} -${LINE_HEIGHT} Td\n`;
    });

    // Page number
    stream += `0 -20 Td\n`;
    stream += `(Pagina ${pageIndex + 1} din ${pages.length}) Tj\n`;

    stream += 'ET';

    const streamLength = stream.length;
    addObject(`<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`);
  });

  // Build final PDF
  let pdf = PDF_HEADER;

  // Adjust offsets
  const adjustedXref: number[] = [];
  let offset = PDF_HEADER.length;
  for (const obj of objects) {
    adjustedXref.push(offset);
    offset += obj.length;
  }

  pdf += objects.join('');

  // Cross-reference table
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objectCount + 1}\n`;
  pdf += '0000000000 65535 f \n';
  adjustedXref.forEach((off) => {
    pdf += `${off.toString().padStart(10, '0')} 00000 n \n`;
  });

  // Trailer
  pdf += `trailer\n<< /Size ${objectCount + 1} /Root ${catalogId} 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return pdf;
}

/**
 * Download data as PDF file
 */
export function downloadPDF<T>(data: T[], columns: ExportColumn<T>[], options: PdfOptions): void {
  const pdfContent = createPdfDocument(data, columns, options);
  const blob = new Blob([pdfContent], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = options.filename.endsWith('.pdf') ? options.filename : `${options.filename}.pdf`;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Create PDF blob for audit log export
 */
export function createAuditPdfBlob<T>(
  data: T[],
  columns: ExportColumn<T>[],
  options: PdfOptions
): Blob {
  const pdfContent = createPdfDocument(data, columns, options);
  return new Blob([pdfContent], { type: 'application/pdf' });
}
