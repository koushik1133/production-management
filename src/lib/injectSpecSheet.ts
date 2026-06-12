import JSZip from 'jszip';

/**
 * Surgically injects trailer data into specific cells using JSZip.
 * By directly modifying the XML inside the .xlsx zip archive, we ensure 
 * ZERO structural changes. All shapes, text boxes, images, and advanced
 * formatting are perfectly preserved because we don't re-render the workbook.
 */
export async function injectTrailerDataIntoSpec(
  base64File: string,
  serialNumber: string,
  trailerName?: string,
  trailerColor?: string,
  trailerPlug?: string,
  salePrice?: string | number,
  salesPerson?: string,
  dealerLocation?: string,
  dealerCommonAddress?: string,
  hideOtherSheets: boolean = false
): Promise<string> {
  const base64Data = base64File.includes(',') ? base64File.split(',')[1] : base64File;
  
  const zip = new JSZip();
  await zip.loadAsync(base64Data, { base64: true });

  const today = new Date().toLocaleDateString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric'
  });

  // Map of which sheets get which updates
  // Based on standard template layout: Price=B15, Name=G4 (Trim Build), etc.
  const updates: Record<string, Record<string, string | number | undefined>> = {
    'xl/worksheets/sheet1.xml': {
      'H4': serialNumber,
      'I53': today,
      'I49': trailerName || '',
      'I51': salesPerson || '',
      'J55': salePrice || '',
      'D43': trailerPlug || '',
      'F56': trailerColor || ''
    },
    'xl/worksheets/sheet2.xml': {
      'B2': serialNumber,
      'B4': today,
      'B13': trailerColor || '',
      'B14': trailerPlug || '',
      'B15': salePrice || '',
      'B6': trailerName || '',
      'B7': dealerCommonAddress || '',
      'B8': dealerCommonAddress || '',
      'B9': dealerLocation || '',
      'B12': salesPerson || ''
    },
    'xl/worksheets/sheet3.xml': { 
      'H4': serialNumber,
      'D43': trailerPlug || '',
      'F56': trailerColor || ''
    },
    'xl/worksheets/sheet4.xml': {
      'G5': serialNumber,
      'A9': trailerColor || '',
      'A12': trailerPlug || '',
      'G4': trailerName || ''
    },
    'xl/worksheets/sheet5.xml': { 'B2': serialNumber }
  };

  for (const [sheetPath, cellUpdates] of Object.entries(updates)) {
    const file = zip.file(sheetPath);
    if (!file) continue;

    let xml = await file.async('string');

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");

    for (const [cellRef, value] of Object.entries(cellUpdates)) {
      if (value === undefined || value === '') continue;

      const rowNum = cellRef.replace(/[A-Z]/g, '');
      
      let row = doc.querySelector(`row[r="${rowNum}"]`);
      if (!row) continue; // If row doesn't exist, skip.

      const ns = row.namespaceURI;

      let cell = row.querySelector(`c[r="${cellRef}"]`);
      if (!cell) {
        // Create new cell in the correct namespace
        cell = doc.createElementNS(ns, 'c');
        cell.setAttribute('r', cellRef);
        row.appendChild(cell);
        
        // Sort cells in row to satisfy Excel's strict ordering
        const cells = Array.from(row.querySelectorAll('c'));
        cells.sort((a, b) => {
          const rA = a.getAttribute('r')?.replace(/[0-9]/g, '') || '';
          const rB = b.getAttribute('r')?.replace(/[0-9]/g, '') || '';
          if (rA.length !== rB.length) return rA.length - rB.length;
          return rA.localeCompare(rB);
        });
        cells.forEach(c => row!.appendChild(c));
      }

      // Remove any existing value types
      cell.removeAttribute('t');
      cell.setAttribute('t', 'inlineStr');
      
      // Clear existing children (like <v> or <is>)
      while (cell.firstChild) {
        cell.removeChild(cell.firstChild);
      }
      
      // Create <is><t>VALUE</t></is>
      const isElement = doc.createElementNS(ns, 'is');
      const tElement = doc.createElementNS(ns, 't');
      tElement.textContent = String(value);
      isElement.appendChild(tElement);
      cell.appendChild(isElement);
    }
    
    // Serialize back to string
    const serializer = new XMLSerializer();
    let newXml = serializer.serializeToString(doc);
    // Remove the default xmlns added by DOMParser if it messes things up, 
    // but usually it's fine. We can ensure the xml declaration is kept if needed.
    if (!newXml.startsWith('<?xml')) {
      newXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + newXml;
    }
    
    zip.file(sheetPath, newXml);
  }

  // If hideOtherSheets is true, hide all sheets except the first one
  if (hideOtherSheets) {
    const workbookFile = zip.file('xl/workbook.xml');
    if (workbookFile) {
      let wbXml = await workbookFile.async('string');
      
      // We use regex to add state="hidden" to avoid DOMParser destroying Excel's delicate XML namespaces
      let sheetCount = 0;
      wbXml = wbXml.replace(/<sheet [^>]+>/g, (match) => {
        sheetCount++;
        if (sheetCount > 1 && !match.includes('state=')) {
          // Add state="hidden" right before the closing bracket
          return match.replace(/\/?>$/, ' state="hidden"/>');
        }
        return match;
      });
      
      zip.file('xl/workbook.xml', wbXml);
    }
  }

  const generatedBase64 = await zip.generateAsync({ type: 'base64' });
  return `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${generatedBase64}`;
}
