import type { ExportColumn } from './types';

/**
 * Simple XLSX generation using XML format
 * This creates a basic Excel file without external dependencies
 */

const XLSX_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateWorkbook(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
}

function generateStyles(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border/>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
</styleSheet>`;
}

function generateSharedStrings(strings: string[]): string {
  const items = strings.map((str) => `<si><t>${escapeXml(str)}</t></si>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">
${items}
</sst>`;
}

function columnIndexToLetter(index: number): string {
  let result = '';
  let num = index;
  while (num >= 0) {
    result = String.fromCharCode((num % 26) + 65) + result;
    num = Math.floor(num / 26) - 1;
  }
  return result;
}

function generateWorksheet<T>(
  data: T[],
  columns: ExportColumn<T>[]
): { xml: string; strings: string[] } {
  const strings: string[] = [];
  const stringIndexMap = new Map<string, number>();

  function getStringIndex(str: string): number {
    const existing = stringIndexMap.get(str);
    if (existing !== undefined) {
      return existing;
    }
    const index = strings.length;
    strings.push(str);
    stringIndexMap.set(str, index);
    return index;
  }

  const rows: string[] = [];

  // Header row
  const headerCells = columns.map((col, colIndex) => {
    const cellRef = `${columnIndexToLetter(colIndex)}1`;
    const stringIndex = getStringIndex(col.header);
    return `<c r="${cellRef}" t="s" s="1"><v>${stringIndex}</v></c>`;
  });
  rows.push(`<row r="1">${headerCells.join('')}</row>`);

  // Data rows
  data.forEach((item, rowIndex) => {
    const rowNum = rowIndex + 2;
    const cells = columns.map((col, colIndex) => {
      const cellRef = `${columnIndexToLetter(colIndex)}${rowNum}`;
      const key = col.key as keyof T;
      const value = item[key];

      // Format the value
      const formattedValue = col.format ? col.format(value, item) : formatValue(value);

      // Determine cell type
      if (typeof value === 'number' && !col.format) {
        return `<c r="${cellRef}"><v>${value}</v></c>`;
      }

      const stringIndex = getStringIndex(formattedValue);
      return `<c r="${cellRef}" t="s"><v>${stringIndex}</v></c>`;
    });
    rows.push(`<row r="${rowNum}">${cells.join('')}</row>`);
  });

  const lastCol = columnIndexToLetter(columns.length - 1);
  const lastRow = data.length + 1;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastCol}${lastRow}"/>
  <sheetData>
${rows.join('\n')}
  </sheetData>
</worksheet>`;

  return { xml, strings };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleDateString('ro-RO');
  if (typeof value === 'boolean') return value ? 'Da' : 'Nu';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  // Objects and remaining types
  return JSON.stringify(value);
}

/**
 * Create an XLSX file as a Blob
 */
export function createXLSX<T>(data: T[], columns: ExportColumn<T>[], sheetName = 'Sheet1'): Blob {
  const { xml: worksheetXml, strings } = generateWorksheet(data, columns);

  // Create ZIP file structure
  const files: Record<string, string> = {
    '[Content_Types].xml': XLSX_CONTENT_TYPES,
    '_rels/.rels': RELS,
    'xl/_rels/workbook.xml.rels': WORKBOOK_RELS,
    'xl/workbook.xml': generateWorkbook(sheetName),
    'xl/styles.xml': generateStyles(),
    'xl/sharedStrings.xml': generateSharedStrings(strings),
    'xl/worksheets/sheet1.xml': worksheetXml,
  };

  // Use JSZip-like minimal implementation or fall back to simple concatenation
  // For a production app, you'd want to use a proper ZIP library
  // For now, we'll use the browser's Compression Streams API if available
  // or fall back to a simpler format

  try {
    // Try to use a simple ZIP implementation
    return createZipBlob(files);
  } catch {
    // Fall back to CSV if ZIP creation fails
    throw new Error('XLSX export requires a ZIP library. Please export as CSV instead.');
  }
}

/**
 * Simple ZIP file creation
 * Note: This is a minimal implementation. For production, use a library like JSZip
 */
function createZipBlob(files: Record<string, string>): Blob {
  // Minimal ZIP file structure
  const entries: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  const encoder = new TextEncoder();

  for (const [filename, content] of Object.entries(files)) {
    const filenameBytes = encoder.encode(filename);
    const contentBytes = encoder.encode(content);

    // Local file header
    const localHeader = new Uint8Array(30 + filenameBytes.length);
    const view = new DataView(localHeader.buffer);

    view.setUint32(0, 0x04034b50, true); // Local file header signature
    view.setUint16(4, 20, true); // Version needed
    view.setUint16(6, 0, true); // General purpose flag
    view.setUint16(8, 0, true); // Compression method (store)
    view.setUint16(10, 0, true); // File time
    view.setUint16(12, 0, true); // File date
    view.setUint32(14, 0, true); // CRC-32 (0 for simplicity)
    view.setUint32(18, contentBytes.length, true); // Compressed size
    view.setUint32(22, contentBytes.length, true); // Uncompressed size
    view.setUint16(26, filenameBytes.length, true); // File name length
    view.setUint16(28, 0, true); // Extra field length

    localHeader.set(filenameBytes, 30);

    entries.push(localHeader);
    entries.push(contentBytes);

    // Central directory entry
    const centralEntry = new Uint8Array(46 + filenameBytes.length);
    const centralView = new DataView(centralEntry.buffer);

    centralView.setUint32(0, 0x02014b50, true); // Central directory signature
    centralView.setUint16(4, 20, true); // Version made by
    centralView.setUint16(6, 20, true); // Version needed
    centralView.setUint16(8, 0, true); // General purpose flag
    centralView.setUint16(10, 0, true); // Compression method
    centralView.setUint16(12, 0, true); // File time
    centralView.setUint16(14, 0, true); // File date
    centralView.setUint32(16, 0, true); // CRC-32
    centralView.setUint32(20, contentBytes.length, true); // Compressed size
    centralView.setUint32(24, contentBytes.length, true); // Uncompressed size
    centralView.setUint16(28, filenameBytes.length, true); // File name length
    centralView.setUint16(30, 0, true); // Extra field length
    centralView.setUint16(32, 0, true); // File comment length
    centralView.setUint16(34, 0, true); // Disk number start
    centralView.setUint16(36, 0, true); // Internal attributes
    centralView.setUint32(38, 0, true); // External attributes
    centralView.setUint32(42, offset, true); // Relative offset

    centralEntry.set(filenameBytes, 46);
    centralDir.push(centralEntry);

    offset += localHeader.length + contentBytes.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  centralDir.forEach((entry) => (centralDirSize += entry.length));

  // End of central directory
  const endOfCentralDir = new Uint8Array(22);
  const endView = new DataView(endOfCentralDir.buffer);

  endView.setUint32(0, 0x06054b50, true); // End signature
  endView.setUint16(4, 0, true); // Disk number
  endView.setUint16(6, 0, true); // Central dir disk
  endView.setUint16(8, Object.keys(files).length, true); // Entries on disk
  endView.setUint16(10, Object.keys(files).length, true); // Total entries
  endView.setUint32(12, centralDirSize, true); // Central dir size
  endView.setUint32(16, centralDirOffset, true); // Central dir offset
  endView.setUint16(20, 0, true); // Comment length

  // Combine all parts
  const totalSize =
    entries.reduce((sum, arr) => sum + arr.length, 0) +
    centralDir.reduce((sum, arr) => sum + arr.length, 0) +
    endOfCentralDir.length;

  const result = new Uint8Array(totalSize);
  let pos = 0;

  for (const entry of entries) {
    result.set(entry, pos);
    pos += entry.length;
  }

  for (const entry of centralDir) {
    result.set(entry, pos);
    pos += entry.length;
  }

  result.set(endOfCentralDir, pos);

  return new Blob([result], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Download data as XLSX file
 */
export function downloadXLSX<T>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string,
  sheetName = 'Sheet1'
): void {
  const blob = createXLSX(data, columns, sheetName);
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
