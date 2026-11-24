const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const [file, needle, before, after] = process.argv.slice(2);
const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
const i = s.indexOf(needle);
if (i < 0) { console.log('NOT FOUND: ' + needle); process.exit(1); }
const b = Number(before || 0), a = Number(after || 1200);
console.log(s.slice(Math.max(0, i - b), i + a));
