const fs = require('fs');
const path = 'frontend/src/components/ChatMessage.jsx';
let c = fs.readFileSync(path, 'utf8');

const start = c.indexOf('    const escaped = String(text)');
if (start === -1) {
  console.error('start marker not found');
  process.exit(1);
}
const endMarker = "'&lt;preview:$1&gt;',\r\n    );";
const endIdx = c.indexOf(endMarker, start);
if (endIdx === -1) {
  console.error('end marker not found');
  process.exit(1);
}
const endOfBlock = endIdx + endMarker.length;

const newBlock = [
  "    const PREVIEW_OPEN = 'PREVIEWxOPENx';",
  "    const PREVIEW_CLOSE = 'xCLOSExPREVIEW';",
  "    const escaped = String(text).replace(",
  "      /<preview:([^>\\s]+?)>/g,",
  "      `${PREVIEW_OPEN}$1${PREVIEW_CLOSE}`,",
  "    );",
  "    const rawHtml = marked.parse(escaped, { breaks: true, gfm: true });",
  "    const sanitized = DOMPurify.sanitize(rawHtml);",
  "    const sentinelRe = new RegExp(`${PREVIEW_OPEN}([\\s\\S]+?)${PREVIEW_CLOSE}`, 'g');",
  "    return sanitized.replace(sentinelRe, '&lt;preview:$1&gt;');",
].join('\r\n');

c = c.substring(0, start) + newBlock + c.substring(endOfBlock);
fs.writeFileSync(path, c, 'utf8');
console.log('written, new length:', c.length);
