/**
 * excelToPdf.ts
 *
 * Converts an injected Excel spec sheet to a downloadable PDF entirely in the
 * browser — no API keys, no external services.
 *
 * Pipeline (same idea as browser-based tools like iLovePDF):
 *  1. Parse the .xlsx zip with JSZip to extract:
 *       - Styles  (fills, fonts, borders, alignment)
 *       - Shared strings
 *       - Sheet XML (cells, merges, col/row sizes)
 *       - Embedded images + drawing anchors
 *  2. Build a pixel-accurate HTML table and inject embedded images as
 *     absolutely-positioned <img> overlays.
 *  3. Mount the table in an off-screen container at full size.
 *  4. Use html2canvas to screenshot the container at 2× resolution.
 *  5. Use jsPDF to embed the canvas as an image in a letter-landscape PDF.
 *  6. Auto-download the PDF — no print dialog needed.
 */

import JSZip from 'jszip';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// ─── helpers ────────────────────────────────────────────────────────────────

function argbToCss(argb: string | undefined | null): string {
  if (!argb) return '';
  const s = argb.replace(/^#/, '');
  // Excel stores ARGB (8 chars) or RGB (6 chars)
  if (s.length === 8) {
    const alpha = parseInt(s.slice(0, 2), 16);
    if (alpha === 0) return ''; // fully transparent
    return `#${s.slice(2)}`;
  }
  if (s.length === 6) return `#${s}`;
  return '';
}

const parseXml = (xml: string): Document =>
  new DOMParser().parseFromString(xml, 'application/xml');

// ─── style types ────────────────────────────────────────────────────────────

interface CellStyle {
  bgColor: string;
  fontColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontSize: number;      // pt
  fontName: string;
  halign: string;
  valign: string;
  wrapText: boolean;
  indent: number;
  borderTop: string;
  borderBottom: string;
  borderLeft: string;
  borderRight: string;
}

const DEFAULT_STYLE: CellStyle = {
  bgColor: '', fontColor: '', bold: false, italic: false, underline: false,
  fontSize: 10, fontName: 'Arial', halign: 'general', valign: 'bottom',
  wrapText: false, indent: 0,
  borderTop: '', borderBottom: '', borderLeft: '', borderRight: '',
};

// ─── style parsing ───────────────────────────────────────────────────────────

function parseBorderSide(el: Element | null): string {
  if (!el) return '';
  const style = el.getAttribute('style') || '';
  if (!style || style === 'none') return '';
  const colorEl = el.getElementsByTagName('color')[0];
  const rgb = colorEl?.getAttribute('rgb');
  const color = rgb ? (argbToCss(rgb) || '#000000') : '#000000';
  const width =
    style === 'thin'   ? '0.5px' :
    style === 'medium' ? '1px'   :
    style === 'thick'  ? '2px'   :
    style === 'hair'   ? '0.3px' : '0.5px';
  return `${width} solid ${color}`;
}

function buildStyleTable(stylesXml: string): CellStyle[] {
  const doc = parseXml(stylesXml);

  // fills
  const fills: { bgColor: string }[] = [];
  for (const fill of Array.from(doc.getElementsByTagName('fills')[0]?.children ?? [])) {
    const pf = fill.getElementsByTagName('patternFill')[0];
    const pat = pf?.getAttribute('patternType') ?? '';
    if (!pat || pat === 'none') { fills.push({ bgColor: '' }); continue; }
    const fgEl = pf?.getElementsByTagName('fgColor')[0];
    fills.push({ bgColor: argbToCss(fgEl?.getAttribute('rgb')) });
  }

  // fonts
  const fonts: { bold: boolean; italic: boolean; underline: boolean; sz: number; name: string; color: string }[] = [];
  for (const font of Array.from(doc.getElementsByTagName('fonts')[0]?.children ?? [])) {
    fonts.push({
      bold:      !!font.getElementsByTagName('b')[0],
      italic:    !!font.getElementsByTagName('i')[0],
      underline: !!font.getElementsByTagName('u')[0],
      sz:        parseFloat(font.getElementsByTagName('sz')[0]?.getAttribute('val') ?? '10'),
      name:      font.getElementsByTagName('name')[0]?.getAttribute('val') ?? 'Arial',
      color:     argbToCss(font.getElementsByTagName('color')[0]?.getAttribute('rgb')),
    });
  }

  // borders
  const borders: { t: string; b: string; l: string; r: string }[] = [];
  for (const border of Array.from(doc.getElementsByTagName('borders')[0]?.children ?? [])) {
    borders.push({
      t: parseBorderSide(border.getElementsByTagName('top')[0]    ?? null),
      b: parseBorderSide(border.getElementsByTagName('bottom')[0] ?? null),
      l: parseBorderSide(border.getElementsByTagName('left')[0]   ?? null),
      r: parseBorderSide(border.getElementsByTagName('right')[0]  ?? null),
    });
  }

  // cell xfs
  const styles: CellStyle[] = [];
  for (const xf of Array.from(doc.getElementsByTagName('cellXfs')[0]?.children ?? [])) {
    const fontId   = parseInt(xf.getAttribute('fontId')   ?? '0');
    const fillId   = parseInt(xf.getAttribute('fillId')   ?? '0');
    const borderId = parseInt(xf.getAttribute('borderId') ?? '0');
    const font     = fonts[fontId]   ?? { bold: false, italic: false, underline: false, sz: 10, name: 'Arial', color: '' };
    const fill     = fills[fillId]   ?? { bgColor: '' };
    const border   = borders[borderId] ?? { t: '', b: '', l: '', r: '' };
    const alEl     = xf.getElementsByTagName('alignment')[0];
    styles.push({
      bgColor:      fill.bgColor,
      fontColor:    font.color,
      bold:         font.bold,
      italic:       font.italic,
      underline:    font.underline,
      fontSize:     font.sz,
      fontName:     font.name,
      halign:       alEl?.getAttribute('horizontal')  ?? 'general',
      valign:       alEl?.getAttribute('vertical')    ?? 'bottom',
      wrapText:     alEl?.getAttribute('wrapText') === '1',
      indent:       parseInt(alEl?.getAttribute('indent') ?? '0'),
      borderTop:    border.t,
      borderBottom: border.b,
      borderLeft:   border.l,
      borderRight:  border.r,
    });
  }
  return styles;
}

// ─── shared strings ──────────────────────────────────────────────────────────

function parseSharedStrings(xml: string): string[] {
  const doc = parseXml(xml);
  const result: string[] = [];
  for (const si of Array.from(doc.getElementsByTagName('si'))) {
    const parts: string[] = [];
    for (const t of Array.from(si.getElementsByTagName('t'))) {
      parts.push(t.textContent ?? '');
    }
    result.push(parts.join(''));
  }
  return result;
}

// ─── cell reference helpers ──────────────────────────────────────────────────

function colLetterToIndex(col: string): number {
  let n = 0;
  for (let i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64);
  return n - 1;
}

function decodeCellRef(ref: string): { r: number; c: number } {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) return { r: 0, c: 0 };
  return { r: parseInt(m[2]) - 1, c: colLetterToIndex(m[1]) };
}

function decodeRange(ref: string) {
  const [start, end] = ref.split(':');
  const s = decodeCellRef(start);
  const e = end ? decodeCellRef(end) : s;
  return { sr: s.r, sc: s.c, er: e.r, ec: e.c };
}

// ─── sheet parser ────────────────────────────────────────────────────────────

interface SheetData {
  cells: Map<string, { value: string; styleIdx: number }>;
  merges: { sr: number; sc: number; er: number; ec: number }[];
  colWidths: Map<number, number>;
  rowHeights: Map<number, number>;
  maxRow: number;
  maxCol: number;
}

function parseSheet(sheetXml: string, sharedStrings: string[]): SheetData {
  const doc = parseXml(sheetXml);

  const merges: SheetData['merges'] = [];
  for (const mc of Array.from(doc.getElementsByTagName('mergeCell'))) {
    const ref = mc.getAttribute('ref') ?? '';
    if (ref.includes(':')) merges.push(decodeRange(ref));
  }

  const colWidths = new Map<number, number>();
  for (const col of Array.from(doc.getElementsByTagName('col'))) {
    const min = parseInt(col.getAttribute('min') ?? '1') - 1;
    const max = parseInt(col.getAttribute('max') ?? '1') - 1;
    const wpx = Math.round(parseFloat(col.getAttribute('width') ?? '8') * 7);
    for (let c = min; c <= max; c++) colWidths.set(c, wpx);
  }

  const rowHeights = new Map<number, number>();
  const cells = new Map<string, { value: string; styleIdx: number }>();
  let maxRow = 0, maxCol = 0;

  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    const rIdx = parseInt(row.getAttribute('r') ?? '1') - 1;
    maxRow = Math.max(maxRow, rIdx);
    const ht = parseFloat(row.getAttribute('ht') ?? '0');
    if (ht > 0) rowHeights.set(rIdx, Math.round(ht * 1.333));

    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const ref  = c.getAttribute('r') ?? '';
      const t    = c.getAttribute('t') ?? '';
      const sIdx = parseInt(c.getAttribute('s') ?? '0');
      const { r, c: colIdx } = decodeCellRef(ref);
      maxRow = Math.max(maxRow, r);
      maxCol = Math.max(maxCol, colIdx);

      const vEl = c.getElementsByTagName('v')[0];
      const iEl = c.getElementsByTagName('is')[0];
      let val = '';
      if (t === 's')          val = sharedStrings[parseInt(vEl?.textContent ?? '0')] ?? '';
      else if (t === 'inlineStr') val = iEl?.textContent ?? '';
      else                    val = vEl?.textContent ?? '';

      cells.set(`${r},${colIdx}`, { value: val.trim(), styleIdx: sIdx });
    }
  }
  return { cells, merges, colWidths, rowHeights, maxRow, maxCol };
}

// ─── image extraction ─────────────────────────────────────────────────────────

interface ImageAnchor {
  dataUrl: string;
  fromCol: number; fromRow: number;
  toCol: number;   toRow: number;
}

async function extractImages(zip: JSZip, sheetIndex: number): Promise<ImageAnchor[]> {
  const images: ImageAnchor[] = [];
  // Sheet rels
  let sheetRelXml: string | null = null;
  for (const path of [
    `xl/worksheets/_rels/sheet${sheetIndex + 1}.xml.rels`,
    `xl/worksheets/_rels/Sheet${sheetIndex + 1}.xml.rels`,
  ]) {
    const f = zip.file(path);
    if (f) { sheetRelXml = await f.async('string'); break; }
  }
  if (!sheetRelXml) return images;

  const drawingMatch = sheetRelXml.match(/Target=["']\.\.\/drawings\/([^"']+)["']/);
  if (!drawingMatch) return images;
  const drawingFile = zip.file(`xl/drawings/${drawingMatch[1]}`);
  if (!drawingFile) return images;
  const drawingXml = await drawingFile.async('string');

  // Drawing rels
  const relMap: Record<string, string> = {};
  const drawingRelFile = zip.file(`xl/drawings/_rels/${drawingMatch[1].replace('.xml', '.xml.rels')}`);
  if (drawingRelFile) {
    const relXml = await drawingRelFile.async('string');
    for (const m of relXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2];
  }

  for (const anchor of drawingXml.matchAll(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g)) {
    const txt = anchor[0];
    const fromBlock = txt.match(/<xdr:from>([\s\S]*?)<\/xdr:from>/)?.[1] ?? '';
    const toBlock   = txt.match(/<xdr:to>([\s\S]*?)<\/xdr:to>/)?.[1]   ?? '';
    const fromCol = parseInt(fromBlock.match(/<xdr:col>(\d+)<\/xdr:col>/)?.[1] ?? '0');
    const fromRow = parseInt(fromBlock.match(/<xdr:row>(\d+)<\/xdr:row>/)?.[1] ?? '0');
    const toCol   = parseInt(toBlock.match(/<xdr:col>(\d+)<\/xdr:col>/)?.[1]   ?? '0');
    const toRow   = parseInt(toBlock.match(/<xdr:row>(\d+)<\/xdr:row>/)?.[1]   ?? '0');
    const rIdMatch = txt.match(/r:embed="([^"]+)"/);
    if (!rIdMatch) continue;
    const relTarget = relMap[rIdMatch[1]];
    if (!relTarget) continue;
    const mediaName = relTarget.replace(/^\.\.\/media\//, '');
    const mediaFile = zip.file(`xl/media/${mediaName}`);
    if (!mediaFile) continue;
    const imgData = await mediaFile.async('base64');
    const ext  = mediaName.split('.').pop()?.toLowerCase() ?? 'png';
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : 'image/png';
    images.push({ dataUrl: `data:${mime};base64,${imgData}`, fromCol, fromRow, toCol, toRow });
  }
  return images;
}

// ─── CSS for one cell ─────────────────────────────────────────────────────────

function cellCss(style: CellStyle, rowPx: number): string {
  const p: string[] = [
    `height:${rowPx}px`,
    'overflow:hidden',
    `padding:1px ${2 + style.indent * 8}px 1px 2px`,
    `vertical-align:${style.valign === 'top' ? 'top' : style.valign === 'center' ? 'middle' : 'bottom'}`,
    `font-family:${style.fontName || 'Arial'}, Arial, sans-serif`,
    `font-size:${style.fontSize}pt`,
  ];
  if (!style.wrapText) p.push('white-space:nowrap');
  else p.push('white-space:normal', 'word-break:break-word');
  if (style.bgColor)    p.push(`background-color:${style.bgColor}`);
  if (style.fontColor)  p.push(`color:${style.fontColor}`);
  if (style.bold)       p.push('font-weight:bold');
  if (style.italic)     p.push('font-style:italic');
  if (style.underline)  p.push('text-decoration:underline');
  const ha = style.halign;
  if (ha === 'center')  p.push('text-align:center');
  else if (ha === 'right') p.push('text-align:right');
  if (style.borderTop)    p.push(`border-top:${style.borderTop}`);
  if (style.borderBottom) p.push(`border-bottom:${style.borderBottom}`);
  if (style.borderLeft)   p.push(`border-left:${style.borderLeft}`);
  if (style.borderRight)  p.push(`border-right:${style.borderRight}`);
  return p.join(';');
}

// ─── main export ─────────────────────────────────────────────────────────────

export async function downloadExcelAsPdf(base64Excel: string, serial: string): Promise<void> {
  const raw = base64Excel.includes(',') ? base64Excel.split(',')[1] : base64Excel;

  // 1. Load zip
  const zip = new JSZip();
  await zip.loadAsync(raw, { base64: true });

  // 2. Parse parts
  const ssFile     = zip.file('xl/sharedStrings.xml');
  const stylesFile = zip.file('xl/styles.xml');
  const sheetFile  = zip.file('xl/worksheets/sheet1.xml') || zip.file('xl/worksheets/Sheet1.xml');
  if (!sheetFile) throw new Error('Cannot find sheet1.xml');

  const sharedStrings = ssFile     ? parseSharedStrings(await ssFile.async('string'))       : [];
  const styleTable    = stylesFile ? buildStyleTable(await stylesFile.async('string'))       : [];
  const sheetXml      = await sheetFile.async('string');
  const { cells, merges, colWidths, rowHeights, maxRow, maxCol } = parseSheet(sheetXml, sharedStrings);

  const DEFAULT_COL_W = 64;
  const DEFAULT_ROW_H = 20;

  // 3. Pixel offsets
  const colOffsets: number[] = [0];
  for (let c = 0; c <= maxCol; c++) colOffsets.push(colOffsets[c] + (colWidths.get(c) ?? DEFAULT_COL_W));
  const rowOffsets: number[] = [0];
  for (let r = 0; r <= maxRow; r++) rowOffsets.push(rowOffsets[r] + (rowHeights.get(r) ?? DEFAULT_ROW_H));
  const totalW = colOffsets[maxCol + 1];
  const totalH = rowOffsets[maxRow + 1];

  // 4. Merge maps
  const mergeSpans = new Map<string, { rs: number; cs: number }>();
  const skipCells  = new Set<string>();
  for (const m of merges) {
    mergeSpans.set(`${m.sr},${m.sc}`, { rs: m.er - m.sr + 1, cs: m.ec - m.sc + 1 });
    for (let r = m.sr; r <= m.er; r++)
      for (let c = m.sc; c <= m.ec; c++)
        if (r !== m.sr || c !== m.sc) skipCells.add(`${r},${c}`);
  }

  // 5. Extract images
  const images = await extractImages(zip, 0);

  // 6. Build HTML table string
  let tableHtml = '<table style="border-collapse:collapse;table-layout:fixed;"><colgroup>';
  for (let c = 0; c <= maxCol; c++) tableHtml += `<col style="width:${colWidths.get(c) ?? DEFAULT_COL_W}px">`;
  tableHtml += '</colgroup>';

  for (let r = 0; r <= maxRow; r++) {
    const rowH = rowHeights.get(r) ?? DEFAULT_ROW_H;
    tableHtml += `<tr style="height:${rowH}px">`;
    for (let c = 0; c <= maxCol; c++) {
      const key  = `${r},${c}`;
      if (skipCells.has(key)) continue;
      const cd   = cells.get(key);
      const span = mergeSpans.get(key);
      const st   = styleTable[cd?.styleIdx ?? 0] ?? DEFAULT_STYLE;
      const val  = (cd?.value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      const rs   = span?.rs && span.rs > 1 ? ` rowspan="${span.rs}"` : '';
      const cs   = span?.cs && span.cs > 1 ? ` colspan="${span.cs}"` : '';
      tableHtml += `<td${rs}${cs} style="${cellCss(st, rowH)}">${val}</td>`;
    }
    tableHtml += '</tr>';
  }
  tableHtml += '</table>';

  // 7. Mount off-screen container
  // Use a clip-container (overflow:hidden, 1×1px) positioned far off-screen
  // so the browser still lays it out at full size but it stays invisible.
  // The wrapper inside MUST be position:relative so absolute-positioned
  // image overlays anchor to it correctly.
  const clipContainer = document.createElement('div');
  Object.assign(clipContainer.style, {
    position: 'absolute',
    left:     '-99999px',
    top:      '0px',
    width:    '1px',
    height:   '1px',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex:   '-1',
  });

  const wrapper = document.createElement('div');
  Object.assign(wrapper.style, {
    position:   'relative',   // ← critical: makes abs-positioned images anchor here
    width:      `${totalW}px`,
    minHeight:  `${totalH}px`,
    background: '#ffffff',
    fontFamily: 'Arial, sans-serif',
    fontSize:   '10pt',
    lineHeight: '1.2',
  });
  wrapper.innerHTML = tableHtml;
  clipContainer.appendChild(wrapper);
  document.body.appendChild(clipContainer);

  // Inject image overlays — positioned relative to wrapper
  for (const img of images) {
    const left   = colOffsets[img.fromCol] ?? 0;
    const top    = rowOffsets[img.fromRow] ?? 0;
    const right  = colOffsets[Math.min(img.toCol, maxCol + 1)] ?? totalW;
    const bottom = rowOffsets[Math.min(img.toRow, maxRow + 1)] ?? totalH;
    const width  = Math.max(10, right  - left);
    const height = Math.max(10, bottom - top);

    const el = document.createElement('img');
    el.src = img.dataUrl;
    Object.assign(el.style, {
      position:     'absolute',
      left:         `${left}px`,
      top:          `${top}px`,
      width:        `${width}px`,
      height:       `${height}px`,
      objectFit:    'fill',
      pointerEvents:'none',
      zIndex:       '10',
      display:      'block',
    });
    wrapper.appendChild(el);
  }

  // Wait for ALL images to fully load (data-URIs are instant but force a paint cycle)
  await new Promise<void>(resolve => {
    const imgs = Array.from(wrapper.querySelectorAll('img'));
    if (imgs.length === 0) { resolve(); return; }
    let remaining = imgs.length;
    const done = () => { if (--remaining <= 0) resolve(); };
    imgs.forEach(i => {
      if (i.complete && i.naturalWidth > 0) { done(); }
      else { i.addEventListener('load', done); i.addEventListener('error', done); }
    });
    setTimeout(resolve, 4000); // hard fallback
  });

  // One extra rAF to let the browser finish painting before screenshot
  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  // 8. Screenshot with html2canvas
  //    scrollX/scrollY tell html2canvas where to start reading in the document
  const SCALE = 2; // 2× for sharpness
  const canvas = await html2canvas(wrapper, {
    scale:              SCALE,
    useCORS:            true,
    allowTaint:         true,
    backgroundColor:    '#ffffff',
    width:              totalW,
    height:             totalH,
    scrollX:            0,
    scrollY:            0,
    windowWidth:        totalW + 200,
    windowHeight:       totalH + 200,
    logging:            false,
    foreignObjectRendering: false, // more compatible across browsers
  });

  // Clean up
  document.body.removeChild(clipContainer);

  // 9. Build PDF
  //    Letter landscape: 792 × 612 pt  (11 × 8.5 in)
  const PDF_W  = 792;
  const PDF_H  = 612;
  const MARGIN = 8; // pt on each side

  const availW = PDF_W - MARGIN * 2;
  const availH = PDF_H - MARGIN * 2;

  // Source dimensions in CSS pixels (before the 2× scale)
  const srcW = totalW;
  const srcH = totalH;

  // Scale to fit width; then see how many pages tall
  const fitRatio = availW / srcW;
  const renderedH = srcH * fitRatio; // height in PDF pts if all on one page

  // Split into pages if needed
  const pageCount  = Math.ceil(renderedH / availH);
  // Height in source CSS px that maps to one PDF page
  const srcPageH   = availH / fitRatio;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

  for (let page = 0; page < pageCount; page++) {
    if (page > 0) doc.addPage();

    const srcSliceY = page * srcPageH;                          // CSS px
    const srcSliceH = Math.min(srcPageH, srcH - srcSliceY);    // CSS px
    const destH     = srcSliceH * fitRatio;                     // PDF pts

    // Slice the canvas
    const sliceCanvas  = document.createElement('canvas');
    sliceCanvas.width  = Math.round(srcW  * SCALE);
    sliceCanvas.height = Math.round(srcSliceH * SCALE);
    const ctx = sliceCanvas.getContext('2d')!;
    ctx.drawImage(
      canvas,
      0,              srcSliceY * SCALE,   // source x, y  (in canvas px = CSS × SCALE)
      canvas.width,   srcSliceH * SCALE,   // source w, h
      0,              0,                    // dest x, y
      sliceCanvas.width, sliceCanvas.height // dest w, h
    );

    doc.addImage(
      sliceCanvas.toDataURL('image/jpeg', 0.95),
      'JPEG',
      MARGIN, MARGIN,
      availW, destH,
    );
  }

  doc.save(`${serial}_Quote.pdf`);
}

