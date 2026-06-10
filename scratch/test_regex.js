const str = '<c r="H4">123</c>';
const regex = /<c r="H4">.*?<\/c>/g;

console.log("Regex lastIndex before test:", regex.lastIndex);
const hasMatch = regex.test(str);
console.log("Has match:", hasMatch, "lastIndex:", regex.lastIndex);

const replaced = str.replace(regex, "REPLACED");
console.log("Replaced:", replaced);
