/* make_ink_preview.js - PREVIEW ONLY. Does not touch web/ production files.
 * Reads the freshly generated nova-real-nova-light.html (the real index.html
 * rendered by make_nova_real.js) and injects ONE light-mode "ink wash / shui-mo
 * yun-tu" palette override before </body>, so YG can pick a direction by eye.
 *
 *   node design/sketch/make_nova_real.js light nova
 *   node design/sketch/make_ink_preview.js a   (or b / c)
 *   -> design/sketch/nova-ink-a.html
 *
 * All values are token-level: recolour the whole UI by redefining the palette
 * on html[data-skin="nova"][lang] (specificity 0,2,1 beats the 0,1,1 base
 * blocks; [lang] is a harmless bump, index.html always has lang="zh-CN").
 * ASCII-only on purpose (PowerShell 5.1 once mangled non-ASCII harness text).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const sketch = __dirname;
const base = path.join(sketch, 'nova-real-nova-light.html');
const src = fs.readFileSync(base, 'utf8');

/* Each scheme: rice-paper ground + layered ink-wash diffusion (radial haze),
   deep-but-not-black ink bars (YG: "不要那么多黑"), one accent axis. */
const SCHEMES = {
  /* A - 花青云水 : cool cyan/teal ink landscape, ink-blue slate chrome */
  a: [
    'html[data-skin="nova"][lang]{',
    '  --n-shell:#E7EBE8;',
    '  --n-ink:#1C2B30; --n-ink-2:#4C6068; --n-ink-3:#5B6E76;',
    '  --n-graphite:#33474D; --n-graphite-2:#26363C; --n-graphite-3:#40565C;',
    '  --n-accent:#2E6E76; --n-accent-hi:#3E8891; --n-accent-lo:#20545B;',
    '  --n-accent-ink:#245A61; --n-accent-weak:rgba(46,110,118,.09);',
    '  --n-accent-line:rgba(46,110,118,.30);',
    '  --n-danger:#B23A2E;',
    '  --n-paper:#E7E6DC; --n-paper-2:#DFDED2;',
    '  --n-surface:#FCFDFC; --n-surface-2:#F4F7F5; --n-surface-3:#EAF0EE;',
    '  --n-line-weak:rgba(28,43,48,.07); --n-line:rgba(28,43,48,.12);',
    '  --n-line-strong:rgba(28,43,48,.20);',
    '  --n-m-card:#FCFDFC; --n-m-glass:#CBDAD7; --n-m-grid-cell:#DCE7E3;',
    '  --n-m-paper:#ECE7DA;',
    '  --n-edge:rgba(28,43,48,.11); --n-edge-strong:rgba(28,43,48,.18);',
    '  --eg-clock:#3A5560; --eg-clock-line:rgba(28,43,48,.20);',
    '  background-color:#EDF0EC!important;',
    '  background-image:',
    '    radial-gradient(120% 58% at 14% 6%,rgba(46,110,118,.11),transparent 60%),',
    '    radial-gradient(95% 50% at 90% 28%,rgba(46,110,118,.07),transparent 56%),',
    '    radial-gradient(150% 80% at 50% 100%,rgba(38,54,60,.07),transparent 60%),',
    '    linear-gradient(180deg,#F3F1EA 0%,#EAEDE9 55%,#E1E7E4 100%)!important;',
    '}',
    'html[data-skin="nova"][lang] #grid .c.today{',
    '  box-shadow:var(--n-light-top),inset 0 0 0 1px rgba(46,110,118,.40),var(--n-shadow-1)!important}',
    'html[data-skin="nova"][lang] #grid .gh.today{color:var(--n-accent)!important}'
  ].join('\n'),

  /* B - 朱印云图 : warm rice paper, cinnabar seal-red accent, ink-brown chrome */
  b: [
    'html[data-skin="nova"][lang]{',
    '  --n-shell:#E8E1D4;',
    '  --n-ink:#2A2622; --n-ink-2:#5E554A; --n-ink-3:#6A6053;',
    '  --n-graphite:#403A33; --n-graphite-2:#2C2823; --n-graphite-3:#514940;',
    '  --n-accent:#B23A2E; --n-accent-hi:#C8523F; --n-accent-lo:#8E2A22;',
    '  --n-accent-ink:#9C3327; --n-accent-weak:rgba(178,58,46,.08);',
    '  --n-accent-line:rgba(178,58,46,.28);',
    '  --n-danger:#8E2A22;',
    '  --n-paper:#EDE4D2; --n-paper-2:#E4D9C4;',
    '  --n-surface:#FEFCF7; --n-surface-2:#F8F3EA; --n-surface-3:#F0E9DC;',
    '  --n-line-weak:rgba(42,38,34,.07); --n-line:rgba(42,38,34,.12);',
    '  --n-line-strong:rgba(42,38,34,.20);',
    '  --n-m-card:#FEFCF7; --n-m-glass:#E0D6C4; --n-m-grid-cell:#EDE4D6;',
    '  --n-m-paper:#EDE3CF;',
    '  --n-edge:rgba(42,38,34,.11); --n-edge-strong:rgba(42,38,34,.18);',
    '  --eg-clock:#5E5346; --eg-clock-line:rgba(42,38,34,.20);',
    '  background-color:#F0EAE0!important;',
    '  background-image:',
    '    radial-gradient(120% 58% at 12% 6%,rgba(178,58,46,.10),transparent 60%),',
    '    radial-gradient(100% 52% at 88% 26%,rgba(120,96,60,.09),transparent 58%),',
    '    radial-gradient(150% 80% at 50% 100%,rgba(60,55,51,.06),transparent 60%),',
    '    linear-gradient(180deg,#F7F3EA 0%,#F0EAE0 55%,#E8E0D4 100%)!important;',
    '}',
    'html[data-skin="nova"][lang] #grid .c.today{',
    '  box-shadow:var(--n-light-top),inset 0 0 0 1px rgba(178,58,46,.40),var(--n-shadow-1)!important}',
    'html[data-skin="nova"][lang] #grid .gh.today{color:var(--n-accent)!important}'
  ].join('\n'),

  /* C - 留白淡墨 : near-monochrome, max negative space, faint mist-violet ink */
  c: [
    'html[data-skin="nova"][lang]{',
    '  --n-shell:#ECE8E2;',
    '  --n-ink:#242A2E; --n-ink-2:#525C62; --n-ink-3:#606A70;',
    '  --n-graphite:#3A3550; --n-graphite-2:#2A2740; --n-graphite-3:#494360;',
    '  --n-accent:#4A5A63; --n-accent-hi:#6B7C84; --n-accent-lo:#3A4750;',
    '  --n-accent-ink:#3E4C54; --n-accent-weak:rgba(74,90,99,.08);',
    '  --n-accent-line:rgba(74,90,99,.28);',
    '  --n-danger:#A6463E;',
    '  --n-paper:#ECE8DE; --n-paper-2:#E4DFD4;',
    '  --n-surface:#FFFFFF; --n-surface-2:#FAF8F4; --n-surface-3:#F1EEE9;',
    '  --n-line-weak:rgba(36,42,46,.06); --n-line:rgba(36,42,46,.10);',
    '  --n-line-strong:rgba(36,42,46,.17);',
    '  --n-m-card:#FFFFFF; --n-m-glass:#E4DFEC; --n-m-grid-cell:#EDE9F1;',
    '  --n-m-paper:#EFEAE0;',
    '  --n-edge:rgba(36,42,46,.10); --n-edge-strong:rgba(36,42,46,.16);',
    '  --eg-clock:#4B5560; --eg-clock-line:rgba(36,42,46,.18);',
    '  background-color:#F4F1EC!important;',
    '  background-image:',
    '    radial-gradient(130% 60% at 18% 6%,rgba(74,90,99,.07),transparent 62%),',
    '    radial-gradient(100% 50% at 86% 24%,rgba(120,108,150,.07),transparent 58%),',
    '    radial-gradient(150% 80% at 50% 100%,rgba(58,53,80,.05),transparent 60%),',
    '    linear-gradient(180deg,#FBF9F4 0%,#F4F1EC 55%,#ECE8E2 100%)!important;',
    '}',
    'html[data-skin="nova"][lang] #grid .c.today{',
    '  box-shadow:var(--n-light-top),inset 0 0 0 1px rgba(74,90,99,.34),var(--n-shadow-1)!important}',
    'html[data-skin="nova"][lang] #grid .gh.today{color:var(--n-accent)!important}'
  ].join('\n')
};

const key = (process.argv[2] || 'a').toLowerCase();
const css = SCHEMES[key] || SCHEMES.a;
const inject = '<style id="inkScheme-' + key + '">\n' + css + '\n</style>';
const out = src.replace('</body>', inject + '\n</body>');
const file = path.join(sketch, 'nova-ink-' + key + '.html');
fs.writeFileSync(file, out);
console.log('wrote ' + path.basename(file) + ' (' + css.length + ' css chars)');
