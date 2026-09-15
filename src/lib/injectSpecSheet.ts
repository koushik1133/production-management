import JSZip from 'jszip';
import type { LadOptions } from '../types';

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
  hideOtherSheets: boolean = false,
  dateCreated?: string,
  purchaseOrder?: string,
  consignment?: string,
  ladOptions?: LadOptions
): Promise<string> {
  const base64Data = base64File.includes(',') ? base64File.split(',')[1] : base64File;
  
  const zip = new JSZip();
  await zip.loadAsync(base64Data, { base64: true });

  const today = dateCreated ? dateCreated : new Date().toLocaleDateString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric'
  });

  // Load shared strings for dynamic cell content checks
  const sharedStrings: string[] = [];
  const sharedStringsFile = zip.file('xl/sharedStrings.xml');
  if (sharedStringsFile) {
    const sstXml = await sharedStringsFile.async('string');
    const sstDoc = new DOMParser().parseFromString(sstXml, "application/xml");
    const siNodes = sstDoc.getElementsByTagName('si');
    for (let i = 0; i < siNodes.length; i++) {
      sharedStrings.push(siNodes[i].textContent || '');
    }
  }

  const getCellText = (cell: Element): string => {
    const tAttr = cell.getAttribute('t');
    if (tAttr === 'inlineStr') {
      const tNode = cell.getElementsByTagName('t')[0];
      return tNode ? tNode.textContent || '' : '';
    } else if (tAttr === 's') {
      const vNode = cell.getElementsByTagName('v')[0];
      if (vNode) {
        const idx = parseInt(vNode.textContent || '', 10);
        return sharedStrings[idx] || '';
      }
    }
    const vNode = cell.getElementsByTagName('v')[0];
    if (vNode) return vNode.textContent || '';
    return cell.textContent || '';
  };

  const cleanLabel = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

  const formatPrice = (price: string | number | undefined): string => {
    if (price === undefined || price === '') return '';
    const num = typeof price === 'number' ? price : parseFloat(String(price).replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return String(price);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // 1. Placeholder-based Replacement (Robust & Flexible)
  // Searches xl/sharedStrings.xml for {{PLACEHOLDER}} or [[PLACEHOLDER]] and replaces it everywhere.
  if (sharedStringsFile) {
    let sharedStringsXml = await sharedStringsFile.async('string');
    
    const placeholderMap: Record<string, string> = {
      'SERIAL_NUMBER': serialNumber || '',
      'TRAILER_COLOR': trailerColor || '',
      'TRAILER_PLUG': trailerPlug || '',
      'TRAILER_NAME': trailerName || '',
      'SALE_PRICE': formatPrice(salePrice),
      'SALES_PERSON': salesPerson || '',
      'DEALER_LOCATION': dealerLocation || '',
      'DEALER_ADDRESS': dealerCommonAddress || '',
      'TODAYS_DATE': today,
      'PURCHASE_ORDER': purchaseOrder || '',
      'CONSIGNMENT': consignment || '',
      'DUAL_HYDRAULIC_JACKS': typeof ladOptions?.dualHydraulicJacks === 'boolean' ? (ladOptions.dualHydraulicJacks ? 'Yes' : '') : (ladOptions?.dualHydraulicJacks || ''),
      'BUMPER_PULL_SETUP': typeof ladOptions?.bumperPullSetup === 'boolean' ? (ladOptions.bumperPullSetup ? 'Yes' : '') : (ladOptions?.bumperPullSetup || ''),
      'DUAL_SIDE_PLATFORMS': typeof ladOptions?.dualSidePlatforms === 'boolean' ? (ladOptions.dualSidePlatforms ? 'Yes' : '') : (ladOptions?.dualSidePlatforms || ''),
      'SINGLE_SIDE_PLATFORMS': typeof ladOptions?.singleSidePlatforms === 'boolean' ? (ladOptions.singleSidePlatforms ? 'Yes' : '') : (ladOptions?.singleSidePlatforms || '')
    };

    for (const [key, val] of Object.entries(placeholderMap)) {
      // Handle both {{KEY}} and [[KEY]] formats, case-insensitive
      const regex1 = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
      const regex2 = new RegExp(`\\[\\[${key}\\]\\]`, 'gi');
      sharedStringsXml = sharedStringsXml.replace(regex1, val);
      sharedStringsXml = sharedStringsXml.replace(regex2, val);
    }

    // Handle literal text strings that look like formulas (if they typed them as plain text)
    if (serialNumber) sharedStringsXml = sharedStringsXml.replace(/='?[^'!]+'?!\$?B\$?2/gi, serialNumber);
    if (trailerColor) sharedStringsXml = sharedStringsXml.replace(/='?[^'!]+'?!\$?B\$?13/gi, trailerColor);
    if (trailerPlug) sharedStringsXml = sharedStringsXml.replace(/='?[^'!]+'?!\$?B\$?14/gi, trailerPlug);
    if (salePrice !== undefined) sharedStringsXml = sharedStringsXml.replace(/='?[^'!]+'?!\$?B\$?15/gi, String(salePrice));

    zip.file('xl/sharedStrings.xml', sharedStringsXml);
  }

  // 1.5 Formula-based Dynamic Replacement
  // Scans all sheets for actual Excel formulas pointing to the master cells (B2, B13, B14)
  const allFiles = Object.keys(zip.files);
  const worksheetFiles = allFiles.filter(name => name.startsWith('xl/worksheets/') && name.endsWith('.xml'));

  const parser = new DOMParser();

  for (const sheetPath of worksheetFiles) {
    const file = zip.file(sheetPath);
    if (!file) continue;

    const xml = await file.async('string');
    
    // Quick regex check before doing expensive DOM parsing
    if (!xml.match(/!\$?B\$?(2|13|14|15)/i)) {
      continue;
    }

    const doc = parser.parseFromString(xml, 'application/xml');
    const cells = doc.getElementsByTagName('c');
    const ns = doc.documentElement.namespaceURI || 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    let modified = false;

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const fNodes = cell.getElementsByTagName('f');
      if (fNodes.length === 0) continue;

      const formulaText = (fNodes[0].textContent || '').trim();
      
      let newValue: string | number | undefined = undefined;
      
      if (serialNumber && /!\$?B\$?2$/i.test(formulaText)) {
        newValue = serialNumber;
      } else if (trailerColor && /!\$?B\$?13$/i.test(formulaText)) {
        newValue = trailerColor;
      } else if (trailerPlug && /!\$?B\$?14$/i.test(formulaText)) {
        newValue = trailerPlug;
      } else if (salePrice !== undefined && /!\$?B\$?15$/i.test(formulaText)) {
        newValue = salePrice;
      }

      if (newValue !== undefined) {
        // Ensure cell type is str for strings
        if (typeof newValue === 'string') {
          cell.setAttribute('t', 'str');
        } else {
          cell.removeAttribute('t'); // Number type usually has no 't' attribute
        }
        
        // Find existing <v> tag or create one
        let vNode = cell.getElementsByTagName('v')[0];
        if (!vNode) {
          vNode = doc.createElementNS(ns, 'v');
          cell.appendChild(vNode);
        }
        
        // Remove any <is> tag if present
        const isNodes = cell.getElementsByTagName('is');
        for (let j = isNodes.length - 1; j >= 0; j--) {
          cell.removeChild(isNodes[j]);
        }
        
        vNode.textContent = String(newValue);
        modified = true;
      }
    }

    if (modified) {
      const serializer = new XMLSerializer();
      let newXml = serializer.serializeToString(doc);
      if (!newXml.startsWith('<?xml')) {
        newXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + newXml;
      }
      zip.file(sheetPath, newXml);
    }
  }

  const formatLadOption = (val?: boolean | string): string | undefined => {
    if (val === true) return 'Yes';
    if (typeof val === 'string' && val.trim().length > 0) return val.trim();
    return undefined;
  };

  const l29Val = formatLadOption(ladOptions?.dualHydraulicJacks);
  const l30Val = formatLadOption(ladOptions?.bumperPullSetup);
  const l31Val = formatLadOption(ladOptions?.dualSidePlatforms);
  const l32Val = formatLadOption(ladOptions?.singleSidePlatforms);

  // 2. Hardcoded Cell Replacement (Legacy Backwards Compatibility)
  // Map of which sheets get which updates
  // Based on standard template layout: Price=B15, Name=G4 (Trim Build), etc.
  const updates: Record<string, Record<string, string | number | undefined>> = {
    'xl/worksheets/sheet1.xml': {
      'H4': serialNumber,
      'J55': formatPrice(salePrice),
      ...(l29Val ? { 'L29': l29Val } : {}),
      ...(l30Val ? { 'L30': l30Val } : {}),
      ...(l31Val ? { 'L31': l31Val } : {}),
      ...(l32Val ? { 'L32': l32Val } : {})
    },
    'xl/worksheets/sheet2.xml': {
      'B2': serialNumber,
      'B3': purchaseOrder || '',
      'B4': today,
      'B13': trailerColor || '',
      'B14': trailerPlug || '',
      'B15': formatPrice(salePrice),
      'B6': trailerName || '',
      'B7': dealerCommonAddress || '',
      'B8': dealerCommonAddress || '',
      'B9': dealerLocation || '',
      'B11': consignment || '',
      'B12': salesPerson || ''
    },
    'xl/worksheets/sheet3.xml': { 
      'H4': serialNumber
    },
    'xl/worksheets/sheet4.xml': {
      'G5': serialNumber,
      'A9': trailerColor || '',
      'A12': trailerPlug || '',
      'G4': trailerName || ''
    },
    'xl/worksheets/sheet5.xml': { 'B2': serialNumber }
  };

  // Perform dynamic scanner in sheet1.xml
  const sheet1File = zip.file('xl/worksheets/sheet1.xml');
  let foundName = false;
  let foundSalesPerson = false;
  let foundDate = false;

  if (sheet1File) {
    const sheet1Xml = await sheet1File.async('string');
    const parser = new DOMParser();
    const sheet1Doc = parser.parseFromString(sheet1Xml, "application/xml");
    const cells = sheet1Doc.getElementsByTagName('c');
    
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const cellRef = cell.getAttribute('r');
      if (cellRef && (cellRef.startsWith('H') || cellRef.startsWith('G'))) {
        const text = cleanLabel(getCellText(cell));
        const rowNum = cellRef.replace(/[A-Z]/g, '');
        const targetCellRef = `I${rowNum}`;
        
        if (text.includes('dealer') || text.includes('customer') || text === 'name') {
          if (!text.includes('address') && !text.includes('loc') && !text.includes('phone')) {
            updates['xl/worksheets/sheet1.xml'][targetCellRef] = trailerName || '';
            foundName = true;
          }
        } else if (text.includes('salesperson') || text.includes('salesrep') || text.includes('salesperson')) {
          updates['xl/worksheets/sheet1.xml'][targetCellRef] = salesPerson || '';
          foundSalesPerson = true;
        } else if (text === 'date' || text === 'datecreated' || text === 'dateregistered' || text === 'createddate' || text === 'registereddate') {
          updates['xl/worksheets/sheet1.xml'][targetCellRef] = today;
          foundDate = true;
        }
      }
    }
  }

  // Fallbacks if dynamic scan couldn't find them
  if (!foundName) updates['xl/worksheets/sheet1.xml']['I49'] = trailerName || '';
  if (!foundSalesPerson) updates['xl/worksheets/sheet1.xml']['I51'] = salesPerson || '';
  if (!foundDate) updates['xl/worksheets/sheet1.xml']['I53'] = today;

  for (const [sheetPath, cellUpdates] of Object.entries(updates)) {
    const file = zip.file(sheetPath);
    if (!file) continue;

    const xml = await file.async('string');

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");

    for (const [cellRef, value] of Object.entries(cellUpdates)) {
      if (value === undefined || value === '') continue;

      const rowNum = cellRef.replace(/[A-Z]/g, '');
      
      let row = doc.querySelector(`row[r="${rowNum}"]`);
      if (!row) {
        const sheetData = doc.getElementsByTagName('sheetData')[0];
        if (sheetData) {
          const docNs = doc.documentElement.namespaceURI || 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
          row = doc.createElementNS(docNs, 'row');
          row.setAttribute('r', rowNum);
          
          const existingRows = Array.from(sheetData.getElementsByTagName('row'));
          const nextRow = existingRows.find(r => {
            const rVal = parseInt(r.getAttribute('r') || '0', 10);
            return rVal > parseInt(rowNum, 10);
          });
          if (nextRow) {
            sheetData.insertBefore(row, nextRow);
          } else {
            sheetData.appendChild(row);
          }
        }
      }
      if (!row) continue; // If row doesn't exist and couldn't be created, skip.

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

  // If hideOtherSheets is true (Quotes mode), completely delete all sheets except the first one
  // so that the generated quote Excel file strictly contains ONLY the customer quote sheet,
  // preventing dealers/customers from unhiding internal factory sheets (Purchase Info, Trim Build, Inspection, etc.)
  if (hideOtherSheets) {
    const wbFile = zip.file('xl/workbook.xml');
    const wbRelsFile = zip.file('xl/_rels/workbook.xml.rels');
    const ctFile = zip.file('[Content_Types].xml');

    if (wbFile && wbRelsFile && ctFile) {
      const parser = new DOMParser();
      const serializer = new XMLSerializer();

      // 1. Parse xl/workbook.xml and identify sheets to keep and remove
      const wbXml = await wbFile.async('string');
      const wbDoc = parser.parseFromString(wbXml, 'application/xml');
      const sheetNodes = Array.from(wbDoc.getElementsByTagName('sheet'));

      if (sheetNodes.length > 1) {
        const deletedRIds = new Set<string>();
        const deletedSheetNames = new Set<string>();

        // Keep index 0 (first sheet), delete all subsequent sheets
        for (let i = 1; i < sheetNodes.length; i++) {
          const s = sheetNodes[i];
          const rId = s.getAttribute('r:id') || s.getAttribute('id');
          if (rId) deletedRIds.add(rId);
          const name = s.getAttribute('name');
          if (name) deletedSheetNames.add(name.toLowerCase());
          s.parentNode?.removeChild(s);
        }

        // Clean definedNames referencing deleted sheets
        const definedNames = Array.from(wbDoc.getElementsByTagName('definedName'));
        definedNames.forEach(dn => {
          const localSheetId = dn.getAttribute('localSheetId');
          if (localSheetId && localSheetId !== '0') {
            dn.parentNode?.removeChild(dn);
          }
        });

        // Ensure first sheet is the active tab
        const wbViews = wbDoc.getElementsByTagName('workbookView');
        if (wbViews.length > 0) {
          wbViews[0].setAttribute('activeTab', '0');
        }

        // 2. Parse xl/_rels/workbook.xml.rels and find target file paths
        const wbRelsXml = await wbRelsFile.async('string');
        const wbRelsDoc = parser.parseFromString(wbRelsXml, 'application/xml');
        const relNodes = Array.from(wbRelsDoc.getElementsByTagName('Relationship'));
        const deletedTargets = new Set<string>();

        relNodes.forEach(rel => {
          const id = rel.getAttribute('Id');
          if (id && deletedRIds.has(id)) {
            const target = rel.getAttribute('Target');
            if (target) {
              const fullPath = target.startsWith('xl/') ? target : `xl/${target}`;
              deletedTargets.add(fullPath);
            }
            rel.parentNode?.removeChild(rel);
          }
          // Remove calcChain relationship if present
          const relType = rel.getAttribute('Type') || '';
          const relTarget = rel.getAttribute('Target') || '';
          if (relType.includes('calcChain') || relTarget.includes('calcChain')) {
            rel.parentNode?.removeChild(rel);
          }
        });

        // 3. Parse [Content_Types].xml and remove Overrides for deleted files
        const ctXml = await ctFile.async('string');
        const ctDoc = parser.parseFromString(ctXml, 'application/xml');
        const overrideNodes = Array.from(ctDoc.getElementsByTagName('Override'));
        overrideNodes.forEach(ov => {
          const partName = ov.getAttribute('PartName');
          if (!partName) return;
          const norm = partName.startsWith('/') ? partName.substring(1) : partName;
          if (deletedTargets.has(norm) || norm.includes('calcChain')) {
            ov.parentNode?.removeChild(ov);
          }
        });

        // 4. Delete worksheet files & their rels from the ZIP archive
        deletedTargets.forEach(targetPath => {
          zip.remove(targetPath);
          const parts = targetPath.split('/');
          const filename = parts.pop();
          const dir = parts.join('/');
          zip.remove(`${dir}/_rels/${filename}.rels`);
        });
        zip.remove('xl/calcChain.xml');

        // 5. Freeze formulas in Sheet 1 that reference the deleted sheets
        // to prevent #REF! errors when opening the quote in Excel
        const s1File = zip.file('xl/worksheets/sheet1.xml');
        if (s1File) {
          const s1XmlStr = await s1File.async('string');
          const s1Doc = parser.parseFromString(s1XmlStr, 'application/xml');
          const cellNodes = Array.from(s1Doc.getElementsByTagName('c'));
          cellNodes.forEach(cell => {
            const fNode = cell.getElementsByTagName('f')[0];
            if (fNode) {
              const formula = (fNode.textContent || '').trim();
              const referencesDeleted = formula.includes('!') || Array.from(deletedSheetNames).some(name => formula.toLowerCase().includes(name));
              if (referencesDeleted) {
                // Remove formula node so Excel uses the static/cached value
                cell.removeChild(fNode);
                if (!cell.getAttribute('t')) {
                  cell.setAttribute('t', 'str');
                }
              }
            }
          });
          let s1Xml = serializer.serializeToString(s1Doc);
          if (!s1Xml.startsWith('<?xml')) {
            s1Xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + s1Xml;
          }
          zip.file('xl/worksheets/sheet1.xml', s1Xml);
        }

        // 6. Serialize updated XMLs back into the ZIP
        let newWbXml = serializer.serializeToString(wbDoc);
        if (!newWbXml.startsWith('<?xml')) {
          newWbXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + newWbXml;
        }
        zip.file('xl/workbook.xml', newWbXml);

        let newWbRelsXml = serializer.serializeToString(wbRelsDoc);
        if (!newWbRelsXml.startsWith('<?xml')) {
          newWbRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + newWbRelsXml;
        }
        zip.file('xl/_rels/workbook.xml.rels', newWbRelsXml);

        let newCtXml = serializer.serializeToString(ctDoc);
        if (!newCtXml.startsWith('<?xml')) {
          newCtXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + newCtXml;
        }
        zip.file('[Content_Types].xml', newCtXml);
      }
    }
  }

  const generatedBase64 = await zip.generateAsync({ type: 'base64' });
  return `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${generatedBase64}`;
}
