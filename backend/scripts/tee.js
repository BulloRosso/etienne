// Cross-platform replacement for `tee -a <file>`: pipes stdin to stdout and appends it to the given file.
const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/tee.js <file>');
  process.exit(1);
}

const out = fs.createWriteStream(file, { flags: 'a' });
process.stdin.pipe(process.stdout);
process.stdin.pipe(out);
