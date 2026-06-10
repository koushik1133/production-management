import { JSDOM } from 'jsdom';

const dom = new JSDOM();
const parser = new dom.window.DOMParser();

const xml = '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="4"><c r="A4"/></row></sheetData></worksheet>';
const doc = parser.parseFromString(xml, "application/xml");

const row = doc.querySelector('row');
console.log("Row found:", !!row);

const cellRef = 'H4';
const value = 'Test';

let cell = row.querySelector(`c[r="${cellRef}"]`);
if (!cell) {
  // Test without NS
  cell = doc.createElement('c');
  cell.setAttribute('r', cellRef);
  row.appendChild(cell);
}

const serializer = new dom.window.XMLSerializer();
console.log(serializer.serializeToString(doc));
