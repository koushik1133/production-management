const xml = '<row r="4" spans="1:10"><c r="A4" s="10"/><c r="C4" s="10"/></row>';
const cellRef = 'B4';
const newCellXml = `<c r="${cellRef}"><is><t>MY_VAL</t></is></c>`;

const rowNum = cellRef.replace(/[A-Z]/g, '');
const rowRegex = new RegExp(`(<row r="${rowNum}"[^>]*>)([\\s\\S]*?)(</row>)`);

let result = xml;
if (rowRegex.test(xml)) {
   result = result.replace(rowRegex, (match, rowOpen, innerCells, rowClose) => {
     const allCellsStr = innerCells + newCellXml;
     const cellElements = [...allCellsStr.matchAll(/<c r="([A-Z]+)\d+"[^>]*>[\s\S]*?<\/c>|<c r="([A-Z]+)\d+"[^>]*\/>/g)];
     
     cellElements.sort((a, b) => {
       const colA = a[1] || a[2];
       const colB = b[1] || b[2];
       if (colA.length !== colB.length) return colA.length - colB.length;
       return colA.localeCompare(colB);
     });
     
     const sortedInner = cellElements.map(c => c[0]).join('');
     return `${rowOpen}${sortedInner}${rowClose}`;
   });
}
console.log(result);
