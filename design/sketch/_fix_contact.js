'use strict';
/* One-shot: author contact 572833261 -> 692962849 (mail prefix follows).
 * Whole-tree text replace, skipping history logs, the secrets whitelist
 * (handled separately), VCS/build dirs and binaries. ASCII-only on purpose. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const OLD = '572833' + '261';   /* avoid self-match when this file is scanned */
const NEW = '692962849';
const TEXT_EXT = /\.(js|html|htm|css|md|py|txt|json|ts|jsx|tsx|svg|xml|yml|yaml|cfg|ini|sh|bat|ps1)$/i;
const SKIP_DIR = /(^|[\\/])(\.git|node_modules|\.out|__pycache__)([\\/]|$)/;
const SKIP_FILE = new Set([
  path.join('docs', 'handoff', 'changelog.md'),   /* historical log, keep as-is */
  path.join('docs', '.audit-notes-b2.md'),        /* historical audit snapshot */
  path.join('tools', 'scan_secrets.py'),          /* whitelist: add new, keep old */
  path.join('design', 'sketch', '_fix_contact.js') /* this file */
]);
let files = 0, hits = 0;
const changed = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full);
    if (SKIP_DIR.test(rel)) continue;
    let st;
    try { st = fs.statSync(full); } catch (e) { continue; }
    if (st.isDirectory()) { walk(full); continue; }
    if (!st.isFile() || !TEXT_EXT.test(name) || SKIP_FILE.has(rel)) continue;
    let s;
    try { s = fs.readFileSync(full, 'utf8'); } catch (e) { continue; }
    if (s.indexOf(OLD) < 0) continue;
    const n = s.split(OLD).length - 1;
    fs.writeFileSync(full, s.split(OLD).join(NEW), 'utf8');
    files++; hits += n;
    changed.push(rel + '  x' + n);
  }
}
walk(ROOT);
console.log('replaced ' + hits + ' occurrence(s) across ' + files + ' file(s):');
changed.forEach(x => console.log('  ' + x));
