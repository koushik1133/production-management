/**
 * excelToPdf.ts
 *
 * Full-fidelity Excel → PDF converter that works entirely in the browser.
 *
 * Strategy:
 *  1. Open the injected .xlsx as a JSZip archive to extract:
 *     - xl/sharedStrings.xml  (cell text)
 *     - xl/styles.xml         (fills, fonts, borders, alignment)
 *     - xl/worksheets/sheet1.xml  (cell grid, merges, col/row sizes)
 *     - xl/drawings/drawingN.xml  (image anchors)
 *     - xl/media/*            (actual image bytes → base64 data-URIs)
 *  2. Build a pixel-accurate HTML table that reproduces every cell's
 *     background color, font (bold/italic/size/color), text alignment,
 *     borders, merged spans, and embedded images.
 *  3. Open it in a new browser window with a toolbar-style "Save as PDF"
 *     button and trigger window.print() so the user can save to PDF.
 *     This preserves ALL colors with `print-color-adjust: exact`.
 */

import JSZip from 'jszip';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Convert Excel ARGB hex (8 chars) or RGB hex (6 chars) to a CSS #rrggbb */
function argbToCss(argb: string | undefined): string {
  if (!argb || argb.length < 6) return '';
  const rgb = argb.length === 8 ? argb.slice(2) : argb.slice(-6);
  if (rgb.toLowerCase() === 'ffffff' || rgb.toLowerCase() === '000000ff') return '';
  return `#${rgb}`;
}

/** Parse XML string to Document */
const parseXml = (xml: string): Document =>
  new DOMParser().parseFromString(xml, 'application/xml');

// ─── types ──────────────────────────────────────────────────────────────────

interface CellStyle {
  bgColor: string;       // CSS color or ''
  fontColor: string;     // CSS color or ''
  bold: boolean;
  italic: boolean;
  fontSize: number;      // pt
  halign: string;        // 'left'|'center'|'right'|'general'
  valign: string;        // 'top'|'middle'|'bottom'
  wrapText: boolean;
  borderTop: string;
  borderBottom: string;
  borderLeft: string;
  borderRight: string;
}

interface ImageAnchor {
  dataUrl: string;
  fromCol: number;
  fromRow: number;
  toCol: number;
  toRow: number;
}

// ─── style parsing ───────────────────────────────────────────────────────────

function parseBorderSide(el: Element | null): string {
  if (!el) return '';
  const style = el.getAttribute('style');
  if (!style || style === 'none') return '';
  const colorEl = el.getElementsByTagName('color')[0];
  const rgb = colorEl?.getAttribute('rgb');
  const color = rgb ? argbToCss(rgb) || '#000000' : '#000000';
  const width =
    style === 'thin' ? '0.5px' :
    style === 'medium' ? '1px' :
    style === 'thick' ? '2px' :
    style === 'hair' ? '0.3px' : '0.5px';
  return `${width} solid ${color}`;
}

function buildStyleTable(stylesXml: string): CellStyle[] {
  const doc = parseXml(stylesXml);

  // ── shared fills ──
  const fills: { bgColor: string }[] = [];
  for (const fill of Array.from(doc.getElementsByTagName('fill'))) {
    const pf = fill.getElementsByTagName('patternFill')[0];
    const patType = pf?.getAttribute('patternType') ?? '';
    if (patType === 'none' || patType === '') {
      fills.push({ bgColor: '' });
      continue;
    }
    const fgEl = pf?.getElementsByTagName('fgColor')[0];
    fills.push({ bgColor: argbToCss(fgEl?.getAttribute('rgb') ?? '') });
  }

  // ── shared fonts ──
  const fonts: { bold: boolean; italic: boolean; sz: number; color: string } [] = [];
  for (const font of Array.from(doc.getElementsByTagName('fonts')[0]?.children ?? [])) {
    const bold = !!font.getElementsByTagName('b')[0];
    const italic = !!font.getElementsByTagName('i')[0];
    const szEl = font.getElementsByTagName('sz')[0];
    const sz = parseFloat(szEl?.getAttribute('val') ?? '10');
    const colorEl = font.getElementsByTagName('color')[0];
    const color = argbToCss(colorEl?.getAttribute('rgb') ?? '');
    fonts.push({ bold, italic, sz, color });
  }

  // ── shared borders ──
  const borders: { top: string; bottom: string; left: string; right: string }[] = [];
  for (const border of Array.from(doc.getElementsByTagName('borders')[0]?.children ?? [])) {
    borders.push({
      top:    parseBorderSide(border.getElementsByTagName('top')[0] ?? null),
      bottom: parseBorderSide(border.getElementsByTagName('bottom')[0] ?? null),
      left:   parseBorderSide(border.getElementsByTagName('left')[0] ?? null),
      right:  parseBorderSide(border.getElementsByTagName('right')[0] ?? null),
    });
  }

  // ── cell xfs (the actual per-cell style index) ──
  const styles: CellStyle[] = [];
  const cellXfsEl = doc.getElementsByTagName('cellXfs')[0];
  for (const xf of Array.from(cellXfsEl?.children ?? [])) {
    const fontId  = parseInt(xf.getAttribute('fontId')  ?? '0');
    const fillId  = parseInt(xf.getAttribute('fillId')  ?? '0');
    const borderId = parseInt(xf.getAttribute('borderId') ?? '0');

    const font   = fonts[fontId]   ?? { bold: false, italic: false, sz: 10, color: '' };
    const fill   = fills[fillId]   ?? { bgColor: '' };
    const border = borders[borderId] ?? { top: '', bottom: '', left: '', right: '' };

    const alEl    = xf.getElementsByTagName('alignment')[0];
    const halign  = alEl?.getAttribute('horizontal')  ?? 'general';
    const valign  = alEl?.getAttribute('vertical')    ?? 'bottom';
    const wrap    = alEl?.getAttribute('wrapText') === '1';

    styles.push({
      bgColor:      fill.bgColor,
      fontColor:    font.color,
      bold:         font.bold,
      italic:       font.italic,
      fontSize:     font.sz,
      halign,
      valign,
      wrapText:     wrap,
      borderTop:    border.top,
      borderBottom: border.bottom,
      borderLeft:   border.left,
      borderRight:  border.right,
    });
  }

  return styles;
}

// ─── sheet parsing ───────────────────────────────────────────────────────────

function colLetterToIndex(col: string): number {
  let n = 0;
  for (let i = 0; i < col.length; i++) {
    n = n * 26 + (col.charCodeAt(i) - 64);
  }
  return n - 1;
}

function decodeCellRef(ref: string): { r: number; c: number } {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) return { r: 0, c: 0 };
  return { r: parseInt(m[2]) - 1, c: colLetterToIndex(m[1]) };
}

function decodeRange(ref: string): { sr: number; sc: number; er: number; ec: number } {
  const [start, end] = ref.split(':');
  const s = decodeCellRef(start);
  const e = end ? decodeCellRef(end) : s;
  return { sr: s.r, sc: s.c, er: e.r, ec: e.c };
}

function parseSheet(
  sheetXml: string,
  sharedStrings: string[],
): {
  cells: Map<string, { value: string; styleIdx: number }>;
  merges: { sr: number; sc: number; er: number; ec: number }[];
  colWidths: Map<number, number>;
  rowHeights: Map<number, number>;
  maxRow: number;
  maxCol: number;
} {
  const doc = parseXml(sheetXml);

  // merges
  const merges: { sr: number; sc: number; er: number; ec: number }[] = [];
  for (const mc of Array.from(doc.getElementsByTagName('mergeCell'))) {
    const ref = mc.getAttribute('ref') ?? '';
    if (ref.includes(':')) merges.push(decodeRange(ref));
  }

  // column widths (Excel char units → px; 1 char ≈ 7px at 96dpi)
  const colWidths = new Map<number, number>();
  for (const col of Array.from(doc.getElementsByTagName('col'))) {
    const min  = parseInt(col.getAttribute('min') ?? '1') - 1;
    const max  = parseInt(col.getAttribute('max') ?? '1') - 1;
    const wch  = parseFloat(col.getAttribute('width') ?? '8');
    const wpx  = Math.round(wch * 7);
    for (let c = min; c <= max; c++) colWidths.set(c, wpx);
  }

  // row heights (Excel points → px; 1pt ≈ 1.333px)
  const rowHeights = new Map<number, number>();

  // cells
  const cells = new Map<string, { value: string; styleIdx: number }>();
  let maxRow = 0;
  let maxCol = 0;

  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    const rIdx = parseInt(row.getAttribute('r') ?? '1') - 1;
    maxRow = Math.max(maxRow, rIdx);

    const ht = parseFloat(row.getAttribute('ht') ?? '0');
    if (ht > 0) rowHeights.set(rIdx, Math.round(ht * 1.333));

    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const ref = c.getAttribute('r') ?? '';
      const t   = c.getAttribute('t') ?? '';
      const s   = parseInt(c.getAttribute('s') ?? '0');

      const { r, c: colIdx } = decodeCellRef(ref);
      maxRow = Math.max(maxRow, r);
      maxCol = Math.max(maxCol, colIdx);

      const vEl = c.getElementsByTagName('v')[0];
      const iEl = c.getElementsByTagName('is')[0]; // inline string

      let val = '';
      if (t === 's') {
        const idx = parseInt(vEl?.textContent ?? '0');
        val = sharedStrings[idx] ?? '';
      } else if (t === 'inlineStr') {
        val = iEl?.textContent ?? '';
      } else if (t === 'str') {
        val = vEl?.textContent ?? '';
      } else {
        // Numeric / date — the v element has the computed value
        val = vEl?.textContent ?? '';
      }

      cells.set(`${r},${colIdx}`, { value: val.trim(), styleIdx: s });
    }
  }

  return { cells, merges, colWidths, rowHeights, maxRow, maxCol };
}

// ─── shared strings ──────────────────────────────────────────────────────────

function parseSharedStrings(xml: string): string[] {
  const doc = parseXml(xml);
  const result: string[] = [];
  for (const si of Array.from(doc.getElementsByTagName('si'))) {
    // Concatenate all <t> elements (handles rich text)
    const parts: string[] = [];
    for (const t of Array.from(si.getElementsByTagName('t'))) {
      parts.push(t.textContent ?? '');
    }
    result.push(parts.join(''));
  }
  return result;
}

// ─── image extraction ─────────────────────────────────────────────────────────

async function extractImages(zip: JSZip, sheetIndex: number): Promise<ImageAnchor[]> {
  const images: ImageAnchor[] = [];

  // Find the sheet's relationship file
  const relPaths = [
    `xl/worksheets/_rels/sheet${sheetIndex + 1}.xml.rels`,
    `xl/worksheets/_rels/Sheet${sheetIndex + 1}.xml.rels`,
  ];
  let sheetRelXml: string | null = null;
  for (const rp of relPaths) {
    const f = zip.file(rp);
    if (f) { sheetRelXml = await f.async('string'); break; }
  }
  if (!sheetRelXml) return images;

  const drawingMatch = sheetRelXml.match(/Target=["']\.\.\/drawings\/([^"']+)["']/);
  if (!drawingMatch) return images;
  const drawingFileName = drawingMatch[1]; // e.g. "drawing1.xml"

  const drawingFile = zip.file(`xl/drawings/${drawingFileName}`);
  if (!drawingFile) return images;
  const drawingXml = await drawingFile.async('string');

  // Drawing relationship map (rId → media path)
  const drawingRelFileName = drawingFileName.replace('.xml', '.xml.rels');
  const drawingRelFile = zip.file(`xl/drawings/_rels/${drawingRelFileName}`);
  const relMap: Record<string, string> = {};
  if (drawingRelFile) {
    const relXml = await drawingRelFile.async('string');
    for (const m of relXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
      relMap[m[1]] = m[2]; // e.g. rId1 → "../media/image1.png"
    }
  }

  // Parse each image anchor
  const anchorRegex = /<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g;
  for (const anchorMatch of drawingXml.matchAll(anchorRegex)) {
    const txt = anchorMatch[0];

    // Use separate from/to blocks
    const fromBlock = txt.match(/<xdr:from>([\s\S]*?)<\/xdr:from>/)?.[1] ?? '';
    const toBlock   = txt.match(/<xdr:to>([\s\S]*?)<\/xdr:to>/)?.[1] ?? '';

    const fromCol = parseInt(fromBlock.match(/<xdr:col>(\d+)<\/xdr:col>/)?.[1] ?? '0');
    const fromRow = parseInt(fromBlock.match(/<xdr:row>(\d+)<\/xdr:row>/)?.[1] ?? '0');
    const toCol   = parseInt(toBlock.match(/<xdr:col>(\d+)<\/xdr:col>/)?.[1] ?? '0');
    const toRow   = parseInt(toBlock.match(/<xdr:row>(\d+)<\/xdr:row>/)?.[1] ?? '0');

    const rIdMatch = txt.match(/r:embed="([^"]+)"/);
    if (!rIdMatch) continue;
    const rId = rIdMatch[1];
    const relTarget = relMap[rId];
    if (!relTarget) continue;

    // Resolve media path
    const mediaName = relTarget.replace(/^\.\.\/media\//, '');
    const mediaFile = zip.file(`xl/media/${mediaName}`);
    if (!mediaFile) continue;

    const imgData = await mediaFile.async('base64');
    const ext = mediaName.split('.').pop()?.toLowerCase() ?? 'png';
    const mime =
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
      ext === 'gif'  ? 'image/gif'  :
      ext === 'bmp'  ? 'image/bmp'  :
      'image/png';

    images.push({
      dataUrl: `data:${mime};base64,${imgData}`,
      fromCol, fromRow, toCol, toRow,
    });
  }

  return images;
}

// ─── CSS builder for one cell ─────────────────────────────────────────────────

function buildCellCss(style: CellStyle, rowPx: number): string {
  const parts: string[] = [
    `height:${rowPx}px`,
    'padding:2px 4px',
    'vertical-align:' + (style.valign === 'top' ? 'top' : style.valign === 'center' ? 'middle' : 'bottom'),
    'overflow:hidden',
  ];
  if (!style.wrapText) parts.push('white-space:nowrap');
  else parts.push('white-space:normal','word-break:break-word');

  if (style.bgColor) parts.push(`background-color:${style.bgColor}`);
  if (style.fontColor) parts.push(`color:${style.fontColor}`);
  if (style.bold) parts.push('font-weight:bold');
  if (style.italic) parts.push('font-style:italic');
  if (style.fontSize) parts.push(`font-size:${style.fontSize}pt`);

  const ha = style.halign;
  if (ha === 'center') parts.push('text-align:center');
  else if (ha === 'right') parts.push('text-align:right');

  if (style.borderTop)    parts.push(`border-top:${style.borderTop}`);
  if (style.borderBottom) parts.push(`border-bottom:${style.borderBottom}`);
  if (style.borderLeft)   parts.push(`border-left:${style.borderLeft}`);
  if (style.borderRight)  parts.push(`border-right:${style.borderRight}`);

  return parts.join(';');
}

// ─── main export ─────────────────────────────────────────────────────────────

export async function downloadExcelAsPdf(base64Excel: string, serial: string): Promise<void> {
  const raw = base64Excel.includes(',') ? base64Excel.split(',')[1] : base64Excel;

  // Load zip
  const zip = new JSZip();
  await zip.loadAsync(raw, { base64: true });

  // Shared strings
  const ssFile = zip.file('xl/sharedStrings.xml');
  const sharedStrings = ssFile ? parseSharedStrings(await ssFile.async('string')) : [];

  // Styles
  const stylesFile = zip.file('xl/styles.xml');
  const styleTable = stylesFile ? buildStyleTable(await stylesFile.async('string')) : [];

  // Default style
  const defaultStyle: CellStyle = {
    bgColor: '', fontColor: '', bold: false, italic: false,
    fontSize: 10, halign: 'general', valign: 'bottom',
    wrapText: false, borderTop: '', borderBottom: '', borderLeft: '', borderRight: '',
  };

  // Sheet (try sheet1.xml first, then Sheet1.xml)
  const sheetFile =
    zip.file('xl/worksheets/sheet1.xml') ||
    zip.file('xl/worksheets/Sheet1.xml');
  if (!sheetFile) throw new Error('Cannot find sheet1.xml in workbook');
  const sheetXml = await sheetFile.async('string');

  const { cells, merges, colWidths, rowHeights, maxRow, maxCol } =
    parseSheet(sheetXml, sharedStrings);

  // Build merge lookup
  const mergeSpans = new Map<string, { rs: number; cs: number }>();
  const skipCells  = new Set<string>();
  for (const m of merges) {
    mergeSpans.set(`${m.sr},${m.sc}`, { rs: m.er - m.sr + 1, cs: m.ec - m.sc + 1 });
    for (let r = m.sr; r <= m.er; r++) {
      for (let c = m.sc; c <= m.ec; c++) {
        if (r !== m.sr || c !== m.sc) skipCells.add(`${r},${c}`);
      }
    }
  }

  const DEFAULT_COL_W = 64;
  const DEFAULT_ROW_H = 20;

  // Pixel offsets for image positioning
  const colOffsets: number[] = [0];
  for (let c = 0; c <= maxCol; c++) {
    colOffsets.push(colOffsets[c] + (colWidths.get(c) ?? DEFAULT_COL_W));
  }
  const rowOffsets: number[] = [0];
  for (let r = 0; r <= maxRow; r++) {
    rowOffsets.push(rowOffsets[r] + (rowHeights.get(r) ?? DEFAULT_ROW_H));
  }
  const totalWidth  = colOffsets[maxCol + 1];
  const totalHeight = rowOffsets[maxRow + 1];

  // Extract embedded images
  const images = await extractImages(zip, 0);

  // ── Build HTML table ──────────────────────────────────────────────────────
  let html = '<table>\n<colgroup>';
  for (let c = 0; c <= maxCol; c++) {
    html += `<col style="width:${colWidths.get(c) ?? DEFAULT_COL_W}px">`;
  }
  html += '</colgroup>\n';

  for (let r = 0; r <= maxRow; r++) {
    const rowH = rowHeights.get(r) ?? DEFAULT_ROW_H;
    html += `<tr style="height:${rowH}px">`;

    for (let c = 0; c <= maxCol; c++) {
      const key = `${r},${c}`;
      if (skipCells.has(key)) continue;

      const cellData = cells.get(key);
      const span     = mergeSpans.get(key);
      const style    = styleTable[cellData?.styleIdx ?? 0] ?? defaultStyle;
      const value    = cellData?.value ?? '';

      const rsAttr = span?.rs && span.rs > 1 ? ` rowspan="${span.rs}"` : '';
      const csAttr = span?.cs && span.cs > 1 ? ` colspan="${span.cs}"` : '';
      const css    = buildCellCss(style, rowH);
      const safe   = value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

      html += `<td${rsAttr}${csAttr} style="${css}">${safe}</td>`;
    }

    html += '</tr>\n';
  }
  html += '</table>';

  // ── Image overlays ────────────────────────────────────────────────────────
  let imgHtml = '';
  for (const img of images) {
    const left   = colOffsets[img.fromCol] ?? 0;
    const top    = rowOffsets[img.fromRow] ?? 0;
    const width  = Math.max(20, (colOffsets[img.toCol] ?? colOffsets[maxCol + 1]) - left);
    const height = Math.max(10, (rowOffsets[img.toRow] ?? rowOffsets[maxRow + 1]) - top);
    imgHtml += `<img src="${img.dataUrl}" style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;pointer-events:none;z-index:5;object-fit:fill;" />`;
  }

  // ── Full HTML document ────────────────────────────────────────────────────
  const doc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${serial} — Spec Sheet</title>
  <style>
    @page { size: letter landscape; margin: 0.18in; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; background: #fff; }

    /* ── toolbar (hidden when printing) ── */
    #toolbar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
      display: flex; align-items: center; gap: 12px;
      padding: 8px 16px;
      background: #1e293b;
      color: #f1f5f9;
      font-family: sans-serif; font-size: 13px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
    #toolbar strong { font-size: 14px; }
    #toolbar button {
      padding: 6px 18px;
      background: #4f46e5; color: #fff;
      border: none; border-radius: 6px; cursor: pointer; font-weight: 700;
      font-size: 13px;
    }
    #toolbar button:hover { background: #4338ca; }
    #toolbar .hint { font-size: 11px; color: #94a3b8; }

    /* ── sheet wrapper ── */
    #sheet-wrap {
      margin-top: 44px; /* push below toolbar */
      position: relative;
      width: ${totalWidth}px;
      min-height: ${totalHeight}px;
    }

    table {
      border-collapse: collapse;
      width: ${totalWidth}px;
      table-layout: fixed;
    }
    td {
      border: 0.4px solid #c0c0c0;
      overflow: hidden;
    }

    @media print {
      #toolbar { display: none !important; }
      #sheet-wrap { margin-top: 0; }
      body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>
  <div id="toolbar">
    <strong>📄 ${serial} — Spec Sheet</strong>
    <button onclick="window.print()">⬇ Save as PDF</button>
    <span class="hint">In the print dialog → Destination: "Save as PDF" · Layout: Landscape</span>
  </div>
  <div id="sheet-wrap">
    ${html}
    ${imgHtml}
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=1400,height=900');
  if (!win) {
    alert('Popup blocked — please allow popups for this site and try again.');
    return;
  }
  win.document.open();
  win.document.write(doc);
  win.document.close();
  win.focus();
}
