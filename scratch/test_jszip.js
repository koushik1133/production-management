
let xml1 = '<row r="4" spans="1:10"><c r="H4" s="10" t="s"><v>15</v></c></row>';
let xml2 = '<row r="4" spans="1:10"><c r="H4" s="10"/></row>';
const cellRef = 'H4';
const safeVal = 'MY_VAL';

const cellRegex = new RegExp(`<c r="${cellRef}"([^>]*)>(.*?)</c>|<c r="${cellRef}"([^>]*)/>`, 'g');

console.log("Before 1:", xml1);
xml1 = xml1.replace(cellRegex, (match, attrs1, inner, attrs2) => {
  const attrs = attrs1 || attrs2 || '';
  const cleanAttrs = attrs.replace(/t="[^"]*"/g, '').trim();
  return `<c r="${cellRef}" ${cleanAttrs} t="inlineStr"><is><t>${safeVal}</t></is></c>`;
});
console.log("After 1:", xml1);

console.log("Before 2:", xml2);
xml2 = xml2.replace(cellRegex, (match, attrs1, inner, attrs2) => {
  const attrs = attrs1 || attrs2 || '';
  const cleanAttrs = attrs.replace(/t="[^"]*"/g, '').trim();
  return `<c r="${cellRef}" ${cleanAttrs} t="inlineStr"><is><t>${safeVal}</t></is></c>`;
});
console.log("After 2:", xml2);

// What if the cell is completely missing?
let xml3 = '<row r="4" spans="1:10"><c r="G4"/></row>';
if (!cellRegex.test(xml3)) {
  const newCellXml = `<c r="${cellRef}" t="inlineStr"><is><t>${safeVal}</t></is></c>`;
  const rowNum = cellRef.replace(/[A-Z]/g, '');
  const rowRegex = new RegExp(`(<row r="${rowNum}"[^>]*>)`);
  xml3 = xml3.replace(rowRegex, `$1${newCellXml}`);
}
console.log("After 3:", xml3);

