/* make_eg_click_test.js — real-click QA page for the NOVA pixel buddies (v2).
 * Reads design/sketch/nova-real-nova-light.html, injects a load-time script
 * that dispatches two real PointerEvents at the Mario sprite and writes a
 * JSON result into <pre id="eg-test-result"> for Edge --dump-dom to read.
 * QA ONLY: never touches web/ production files. ASCII-only source.
 */
const fs = require('fs');
const path = require('path');
const here = __dirname;
const src = path.join(here, 'nova-real-nova-light.html');
const dst = path.join(here, 'eg-click-test.html');
let html = fs.readFileSync(src, 'utf8');

const test = `
<script id="eg-click-test">
window.addEventListener('load', function () {
  var out = { ok:false };
  try {
    Math.random = function () { return 0.99; };   /* kill banter/rare randomness */
    var sp = document.querySelector('.eg-mario .eg-sprite');
    var bb = document.querySelector('.eg-mario .eg-bubble');
    if (!sp || !bb) { out.err = 'sprite/bubble missing'; }
    else {
      function hit(el) {
        el.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, cancelable:true}));
        el.dispatchEvent(new PointerEvent('pointerup',   {bubbles:true, cancelable:true}));
      }
      hit(sp); hit(sp);
      var en = bb.querySelector('.eg-en');
      var zh = bb.querySelector('.eg-zh');
      var bd = bb.querySelector('.eg-badge');
      var on = sp.querySelector('.eg-frame.on');
      var fls = [], nodes = bb.parentNode.querySelectorAll('.eg-float');
      for (var i = 0; i < nodes.length; i++) fls.push(nodes[i].textContent);
      var st = null;
      try { st = JSON.parse(localStorage.getItem('xxmu_eg_v2') || 'null'); } catch (e) {}
      out = {
        ok: true,
        stageOn: document.documentElement.classList.contains('eg-on'),
        en: en ? en.textContent : '',
        zh: zh ? zh.textContent : '',
        badge: bd ? bd.textContent : '',
        badgeShown: bd ? bd.style.display : 'none',
        pose: sp.getAttribute('data-pose'),
        frame: on ? on.getAttribute('data-f') : '',
        particles: sp.querySelectorAll('.eg-p').length,
        floatTexts: fls,
        taps: st ? st.taps : null,
        combo: st ? st.combo : null,
        coins: st ? st.coins : null
      };
    }
  } catch (e) { out.err = String(e); }
  var pre = document.createElement('pre');
  pre.id = 'eg-test-result';
  pre.textContent = 'EGTEST_JSON:' + JSON.stringify(out);
  document.body.appendChild(pre);
});
</script>
`;

if (html.indexOf('</body>') >= 0) html = html.replace('</body>', test + '</body>');
else html += test;
fs.writeFileSync(dst, html, 'utf8');
console.log('wrote ' + dst);
