/**
 * excelToPdf.ts
 *
 * Converts an injected Excel spec-sheet (base64) into a PDF document that
 * mirrors the sheet layout as closely as possible in a browser-only context.
 *
 * Strategy:
 *  1. Parse the workbook with SheetJS (already a dependency).
 *  2. Find the visible / "Quote" sheet.
 *  3. Walk every occupied cell and collect its value, colspan via merge info,
 *     and basic style cues (bold, alignment, number format).
 *  4. Render it as a table with jspdf-autotable (letter landscape by default).
 *  5. Return the jsPDF document instance so the caller can save it.
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/** Convert a base64 Excel string → jsPDF document */
export async function excelToPdfDoc(base64Excel: string, filename: string): Promise<jsPDF> {
  // Strip data-URI prefix if present
  const raw = base64Excel.includes(',') ? base64Excel.split(',')[1] : base64Excel;

  // Parse the workbook
  const workbook = XLSX.read(raw, { type: 'base64', cellStyles: true, cellNF: true, cellHTML: false });

  // Pick the first visible sheet (same sheet that would be open on file open)
  const targetSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[targetSheetName];

  if (!sheet) {
    throw new Error('Excel file contains no sheets.');
  }

  // Convert sheet to array-of-arrays (raw values)
  const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,          // Always formatted strings
    defval: '',
    blankrows: true,
  }) as (string | number | null)[][];

  // Trim fully-empty trailing rows
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (!last || last.every(c => c === '' || c === null || c === undefined)) {
      rows.pop();
    } else {
      break;
    }
  }

  if (rows.length === 0) {
    throw new Error('The spec sheet appears to be empty.');
  }

  // Determine max column count
  const colCount = Math.max(...rows.map(r => r.length));

  // Build merge map: cellRef → { rowspan, colspan }
  const mergeMap: Record<string, { rs: number; cs: number }> = {};
  const skipCells = new Set<string>();

  if (sheet['!merges']) {
    for (const merge of sheet['!merges']) {
      const rs = merge.e.r - merge.s.r + 1;
      const cs = merge.e.c - merge.s.c + 1;
      const key = `${merge.s.r}_${merge.s.c}`;
      mergeMap[key] = { rs, cs };
      // Mark all cells except the top-left as "skip"
      for (let r = merge.s.r; r <= merge.e.r; r++) {
        for (let c = merge.s.c; c <= merge.e.c; c++) {
          if (r !== merge.s.r || c !== merge.s.c) {
            skipCells.add(`${r}_${c}`);
          }
        }
      }
    }
  }

  // Build cell style helpers
  const getCellStyle = (rowIdx: number, colIdx: number): { bold: boolean; align: 'left' | 'center' | 'right'; bg: string | null; color: string | null; fontSize: number } => {
    const addr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
    const cell = sheet[addr];
    if (!cell || !cell.s) return { bold: false, align: 'left', bg: null, color: null, fontSize: 9 };

    const s = cell.s as {
      font?: { bold?: boolean; sz?: number; color?: { rgb?: string } };
      alignment?: { horizontal?: string };
      fill?: { fgColor?: { rgb?: string }; patternType?: string };
    };

    const bold = !!(s.font?.bold);
    const fontSize = s.font?.sz ? Math.max(7, Math.min(s.font.sz, 14)) : 9;

    const alignRaw = s.alignment?.horizontal || 'left';
    const align: 'left' | 'center' | 'right' =
      alignRaw === 'center' ? 'center' : alignRaw === 'right' ? 'right' : 'left';

    // Background color
    let bg: string | null = null;
    if (s.fill?.patternType && s.fill.patternType !== 'none' && s.fill.fgColor?.rgb) {
      const rgb = s.fill.fgColor.rgb;
      if (rgb && rgb !== 'FFFFFF' && rgb !== 'ffffff' && rgb.length === 6) {
        bg = `#${rgb}`;
      }
    }

    // Font color
    let color: string | null = null;
    if (s.font?.color?.rgb && s.font.color.rgb.length === 6) {
      color = `#${s.font.color.rgb}`;
    }

    return { bold, align, bg, color, fontSize };
  };

  // Create jsPDF in landscape to have more horizontal room
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

  // Page dimensions
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 18;
  const usableWidth = pageWidth - margin * 2;
  const colWidth = usableWidth / colCount;

  // Build autoTable body
  const tableBody: { content: string; colSpan?: number; rowSpan?: number; styles?: object }[][] = [];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const tableRow: { content: string; colSpan?: number; rowSpan?: number; styles?: object }[] = [];

    for (let c = 0; c < colCount; c++) {
      const key = `${r}_${c}`;
      if (skipCells.has(key)) continue;

      const val = row[c];
      const content = val === null || val === undefined ? '' : String(val);
      const merge = mergeMap[key];
      const style = getCellStyle(r, c);

      const cellStyles: Record<string, unknown> = {
        halign: style.align,
        fontSize: style.fontSize,
        fontStyle: style.bold ? 'bold' : 'normal',
        cellPadding: 2,
        overflow: 'linebreak',
      };
      if (style.bg) cellStyles['fillColor'] = style.bg;
      if (style.color) cellStyles['textColor'] = style.color;

      const cell: { content: string; colSpan?: number; rowSpan?: number; styles?: object } = {
        content,
        styles: cellStyles,
      };
      if (merge) {
        if (merge.cs > 1) cell.colSpan = merge.cs;
        if (merge.rs > 1) cell.rowSpan = merge.rs;
      }
      tableRow.push(cell);
    }

    tableBody.push(tableRow);
  }

  // Generate equal-width column definitions
  const columnStyles: Record<number, { cellWidth: number }> = {};
  for (let c = 0; c < colCount; c++) {
    columnStyles[c] = { cellWidth: colWidth };
  }

  // Title
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`${filename} — Spec Sheet`, margin, margin - 4);

  autoTable(doc, {
    startY: margin,
    margin: { left: margin, right: margin, top: margin, bottom: margin },
    body: tableBody,
    columnStyles,
    theme: 'plain',
    tableLineWidth: 0.3,
    tableLineColor: '#cbd5e1',
    styles: {
      lineWidth: 0.3,
      lineColor: '#cbd5e1',
      fontSize: 9,
      cellPadding: 2,
      overflow: 'linebreak',
      valign: 'middle',
    },
    didParseCell: (data) => {
      // Ensure header row is not auto-styled
      data.cell.styles.fillColor = (data.cell.styles.fillColor as string) || '#ffffff';
    },
  });

  return doc;
}

/** Generate and download a PDF from an injected Excel base64 string */
export async function downloadExcelAsPdf(base64Excel: string, serial: string): Promise<void> {
  const doc = await excelToPdfDoc(base64Excel, serial);
  doc.save(`${serial}_Quote.pdf`);
}
