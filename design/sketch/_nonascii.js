const s = require('fs').readFileSync('make_nova_real.js', 'utf8');
s.split('\n').forEach(function (l, i) {
  if (/[^\x00-\x7F]/.test(l)) console.log((i + 1) + ': ' + l.slice(0, 160));
});
