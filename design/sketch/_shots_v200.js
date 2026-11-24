/* _shots_v200.js - v2.0.0 QA shots.
 *   1) learn page: the "today line" (next class + nearest deadline + copy button)
 *   2) grades sheet: the gpa-target box
 * ASCII-only source, same rule as make_nova_real.js.
 *   node design/sketch/_shots_v200.js [light|dark]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SK = path.join(ROOT, 'design', 'sketch');
const SHOTS = path.join(SK, 'shots');
const EDGE = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  'Microsoft', 'Edge', 'Application', 'msedge.exe');

function gen(theme, skin) {
  execFileSync(process.execPath, [path.join(SK, 'make_nova_real.js'), theme, skin],
    { stdio: 'inherit' });
  return path.join(SK, 'nova-real-' + skin + '-' + theme + '.html');
}

/* The stock fixture pins every course to week 11, which is not the week we are
 * actually in -- so blocksOf() legitimately returns nothing and the today line
 * says "no class today". For the shot we want a real "next class", so re-pin the
 * injected courses onto the current week and make sure some land on today.
 *
 * DATA / TIMES / curWeek are `let` bindings at the top level of app.js: they are
 * reachable as bare identifiers from another script tag, but they are NOT
 * properties of window. Reading window.DATA gives undefined and the whole
 * fixture silently does nothing -- hence the typeof guards below. */
const COMMON = [
  '  var tw = (typeof weekOf === "function") ? weekOf(new Date()) : 1;',
  '  var td = (new Date().getDay() + 6) % 7 + 1;',
  '  try {',
  '    var cs = (typeof DATA !== "undefined" && DATA && DATA.courses) ? DATA.courses.slice() : [];',
  '    if (cs.length) {',
  '      cs.forEach(function (c) { c.weeks = [tw]; });',
  '      var today = cs.filter(function (c) { return c.day === td; });',
  '      if (today.length < 2) {',
  '        cs[0].day = td; cs[0].periods = [1, 2];',
  '        if (cs[1]) { cs[1].day = td; cs[1].periods = [3, 4]; }',
  '      }',
  '      DATA.courses = cs;',
  '      if (DATA.times && DATA.times.length) { TIMES = DATA.times; PERIODS = 16; }',
  '      curWeek = tw;',
  '      if (typeof renderWeek === "function") renderWeek();',
  '    }',
  '  } catch (e) {}'
].join('\n');

function shotLearn(html, theme) {
  const extra = [
    '<script id="v200LearnJs">',
    '(function(){',
    '  function go(){',
    COMMON,
    '    try { if (typeof switchTab === "function") switchTab("learn"); } catch(e){}',
    '    try { if (typeof renderHomework === "function") renderHomework(); } catch(e){}',
    '    try { if (window.LEARNPLUS) LEARNPLUS.paintToday(); } catch(e){}',
    '    try { if (window.NOVA_ORGANS) NOVA_ORGANS.sync(); } catch(e){}',
    '  }',
    '  if (document.readyState === "complete") go(); else window.addEventListener("load", go);',
    '})();',
    '</script>'
  ].join('\n');
  return html.replace('</body>', extra + '\n</body>');
}

function shotSheet(html, theme) {
  const extra = [
    /* The long-capture CSS pins #sheet absolute into a 390x1500 box at the top,
     * which works for a full-page scroll but leaves the panel itself squashed.
     * For this shot the sheet IS the subject, so give it the whole frame. */
    '<style id="v200SheetCss">',
    '#sheet{position:fixed!important;left:0!important;top:0!important;',
    '  width:390px!important;height:1240px!important;max-height:1240px!important;',
    '  display:block!important;border-radius:0!important;margin:0!important;}',
    '#sheet .sh-body,#sh-body{max-height:1120px!important;overflow:auto!important;}',
    '</style>',
    '<script id="v200SheetJs">',
    '(function(){',
    '  function go(){',
    COMMON,
    '    try { document.documentElement.setAttribute("data-shot-sheet","1"); } catch(e){}',
    '    try { if (typeof switchTab === "function") switchTab("learn"); } catch(e){}',
    '    try { if (typeof renderHomework === "function") renderHomework(); } catch(e){}',
    /* a real grade list: three scored, one still blank -> the box has to say
     * something honest about the unknown one instead of counting it as 0. */
    '    try {',
    '      var L=[{name:"\\u7CFB\\u7EDF\\u89E3\\u5256\\u5B66",credit:5,score:"87",term:"2026-2027-1"},',
    '             {name:"\\u751F\\u7406\\u5B66",credit:4,score:"78",term:"2026-2027-1"},',
    '             {name:"\\u75C5\\u7406\\u5B66",credit:4,score:"55",term:"2026-2027-1"},',
    '             {name:"\\u836F\\u7406\\u5B66",credit:3,score:"",term:"2026-2027-1"}];',
    '      localStorage.setItem("xxmu_grades",JSON.stringify({list:L,saved_at:Date.now()}));',
    '      localStorage.setItem("xxmu_gpa_target","3.5");',
    '      localStorage.setItem("xxmu_gpa_remain","18");',
    '    } catch(e){}',
    '    try { if (typeof GRADES !== "undefined" && GRADES.open) GRADES.open(); } catch(e){}',
    '    try { if (typeof GRADES !== "undefined" && GRADES.revealAll) GRADES.revealAll(GRADES.load().list||[]); } catch(e){}',
    '    try { if (typeof LEARNPLUS !== "undefined") { LEARNPLUS.paintToday(); LEARNPLUS.paintTarget(); } } catch(e){}',
    /* scroll the sheet body so the target box (mounted last) is in frame */
    '    try {',
    '      var b=document.getElementById("sh-body");',
    '      var t=document.getElementById("gpaTargetBox");',
    '      if (b && t) b.scrollTop = t.offsetTop - 40;',
    '    } catch(e){}',
    '  }',
    '  if (document.readyState === "complete") go(); else window.addEventListener("load", go);',
    '})();',
    '</script>'
  ].join('\n');
  return html.replace('</body>', extra + '\n</body>');
}

function shoot(htmlPath, outName, height) {
  const out = path.join(SHOTS, outName);
  const url = 'file:///' + htmlPath.replace(/\\/g, '/');
  execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=390,' + height, '--virtual-time-budget=1600',
    '--screenshot=' + out, url
  ], { stdio: 'ignore' });
  const b = fs.readFileSync(out);
  console.log(path.basename(out) + ' ' + b.length + ' bytes');
}

const themes = process.argv[2] ? [process.argv[2]] : ['light', 'dark'];
themes.forEach(function (theme) {
  const p = gen(theme, 'nova');
  const html = fs.readFileSync(p, 'utf8');

  const lp = path.join(SK, 'v200-learn-' + theme + '.html');
  fs.writeFileSync(lp, shotLearn(html, theme), 'utf8');
  shoot(lp, 'v200-learn-' + theme + '.png', 1700);

  const sp = path.join(SK, 'v200-sheet-' + theme + '.html');
  /* Classic is the honest baseline for this panel: no skin layers at all, so
   * whatever survives here is app.js + grades.js + learnplus.js on their own.
   * The NOVA version of the same shot lives in _shot_nova_sheet.js -- an earlier
   * note claimed the swipe organ ate #sh-body and that the target box could not
   * survive under NOVA; that turned out to be a misdiagnosis (see changelog
   * v2.0.0), so both skins are photographed now. */
  const classic = fs.readFileSync(gen(theme, 'classic'), 'utf8');
  fs.writeFileSync(sp, shotSheet(classic, theme), 'utf8');
  shoot(sp, 'v200-sheet-' + theme + '.png', 1240);
});
console.log('done');
