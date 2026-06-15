const fs = require('fs');
const JSZip = require('jszip');

async function test() {
  const base64Data = fs.readFileSync('/Users/koushikgoudshaganti/Desktop/sales-manager/src/lib/templates/LRG 1010.xlsx', 'base64');
  const zip = new JSZip();
  await zip.loadAsync(base64Data, { base64: true });
  const wbFile = zip.file('xl/workbook.xml');
  const wbXml = await wbFile.async('string');
  console.log("ORIGINAL XML:", wbXml);
  
  let sheetCount = 0;
  const newXml = wbXml.replace(/<sheet [^>]+>/g, (match) => {
    sheetCount++;
    if (sheetCount > 1) {
      if (match.includes('state=')) {
        return match.replace(/state="[^"]+"/, 'state="hidden"');
      } else {
        return match.replace(/\/?\>$/, ' state="hidden"/>');
      }
    }
    return match;
  });
  
  console.log("NEW XML:", newXml);
}
test();
