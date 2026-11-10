/*
 * nova-easter.js  v2 — XXMU / NOVA 课表像素伙伴
 * ---------------------------------------------------------------
 * YG (m00477 / m00623)：像素小人要有基础动作、气泡语音多一点、
 *   英文加翻译、点击有原版音效（点马里奥说一句「马里奥」），
 *   万人级游戏品质：丝滑、好看、流畅、有趣、细腻、可玩性高、不易腻。
 *
 * 桥接原则：**不碰 app.js 一行**。独立 IIFE，不进 ORGANS 表，
 *   自己读 data-skin + #top[data-page] 启停。
 * 约束：
 *   1) 只在 data-skin=nova 且课表页出现；舞台 #eg-stage 全层
 *      pointer-events:none，只 .eg-sprite 开 auto，绝不抢课表点击。
 *   2) 底部左右各 ~104px，中间留 ~178px 空，bottom 高过 #tabs(z:20)，
 *      绝不遮挡课名 / 按钮 / CH 01 铭牌 / 5 Tab。
 *   3) 状态呼应只读 .nv-belt-next 的真实文本，读不到用兜底，
 *      绝不内置臆造钟点。
 *   4) 素材全为 inline SVG 8-bit 像素图，音效为 Web Audio 合成
 *      8-bit 方波/三角波 —— 全离线、零外链、零采样文件。
 *   5) 首帧静态兜底：build() 里同步写好英中两行台词 + idle 帧，
 *      QA 夹具（杀掉所有 timer）出图仍能看到完整彩蛋。
 */
(function () {
  'use strict';

  /* ---------- 显隐判定 ---------- */
  function isNova() { return document.documentElement.getAttribute('data-skin') === 'nova'; }
  function isKb() {
    var top = document.getElementById('top');
    if (top && top.getAttribute('data-page') === 'kb') return true;
    var b = document.querySelector('#tabs button.active');
    if (b && (b.getAttribute('data-tab') === 'kb' || b.getAttribute('data-name') === 'kb')) return true;
    if (document.querySelector('#tab-kb.active')) return true;
    return false;
  }
  function isOn() { return isNova() && isKb(); }
  var reduced = false;
  try { reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}

  function later(fn, ms) { try { return window.setTimeout(fn, ms); } catch (e) { return 0; } }
  function unlater(id) { try { window.clearTimeout(id); } catch (e) {} }

  /* ---------- 8-bit 素材（沿用已验证剪影） ---------- */
  var PAL_M = { R:'#E8402A', K:'#2B2B33', S:'#F7C08A', W:'#FFFFFF', B:'#2C4FC9', Y:'#F4C542', N:'#7A4423' };
  var BASE_M = [
    '....RRRRRR..','...RRRRRRRR.','..RRRRRRRRRR','..KKSSSSSSKK',
    '..KSSWSSWSSK','..KSSSSSSSSK','...KSKKKKSK.','...SSSSSSSS.',
    '....KSSSSK..','..RRRRRRRR..','.RRRBBBBRRR.','RRRRBYBBYBBR',
    '.RR.BBBBB.RR','...BBBBBB...','..NN.BB.NN..'
  ];
  var PAL_L = { G:'#2E9E4F', g:'#1B6B34', Y:'#F2D06B', S:'#F7C08A', W:'#FFFFFF', K:'#2B2B33', N:'#7A4423' };
  var BASE_L = [
    '.....G......','....GGG.....','...GGGGG....','..GGGGGGG...',
    '..YYSSSSYY..','..YSWSSWSY..','...SSSSSS...','...KSSSSK...',
    '....SSSS....','..GGGGGGGG..','.GGGKKKKGGG.','NGGGKKKKGGGN',
    '..GGGGGGGG..','...gg..gg...','..NN....NN..'
  ];
  function fit(row, w) {
    if (row.length >= w) return row.slice(0, w);
    var s = row; while (s.length < w) s += '.'; return s;
  }
  function patch(base, diffs) {
    var rows = base.slice(), w = base[0].length;
    for (var i = 0; i < diffs.length; i++) rows[diffs[i][0]] = fit(diffs[i][1], w);
    return rows;
  }
  function spriteSVG(rows, pal) {
    var w = rows[0].length, h = rows.length;
    var out = '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
    for (var y = 0; y < h; y++) {
      var row = rows[y], x = 0;
      while (x < row.length) {
        var ch = row.charAt(x);
        if (ch === '.' || !pal[ch]) { x++; continue; }
        var run = 1;
        while (x + run < row.length && row.charAt(x + run) === ch) run++;
        out += '<rect x="' + x + '" y="' + y + '" width="' + run + '" height="1" fill="' + pal[ch] + '"/>';
        x += run;
      }
    }
    return out + '</svg>';
  }

  /* 多姿势：idle / blink / step / jump / wave / cheer / power / sleep */
  var POSE = {
    mario: {
      idle:  [],
      blink: [[4,'..KSSKSSKSSK']],
      step:  [[13,'..BBBBBBBB..'],[14,'.NN..BB..NN.']],
      jump:  [[9,'.RRRRRRRRRR.'],[10,'RRRBBBBBBRRR'],[14,'...NN.NN....']],
      wave:  [[0,'....RRRRRR.S'],[1,'...RRRRRRRRS'],[2,'..RRRRRRRRRS']],
      cheer: [[0,'..S.RRRRRR.S'],[1,'..S.RRRRRR.S'],[9,'.RRRRRRRRRR.']],
      power: [[8,'..SS....SS..'],[9,'RRRRRRRRRRRR'],[10,'.RRRBBBBRRR.']],
      sleep: [[4,'..KSSKSSKSSK']]
    },
    link: {
      idle:  [],
      blink: [[5,'..YSKSSKSY..']],
      step:  [[13,'..gg..gg....'],[14,'.NN..NN.....']],
      jump:  [[9,'..GGGGGGGG..'],[11,'SGGGKKKKGGGS'],[14,'..NN.NN.....']],
      wave:  [[0,'.....G.....S'],[1,'....GGG....S'],[2,'...GGGGG...S']],
      cheer: [[0,'..S..G.....S'],[1,'..S.GGG....S'],[9,'..GGGGGGGG..']],
      power: [[10,'.GGGKKKKGGG.'],[11,'SGGGKKKKGGGS']],
      sleep: [[5,'..YSKSSKSY..']]
    }
  };
  var POSE_ORDER = ['idle','blink','step','jump','wave','cheer','power','sleep'];
  var FRAME = {};
  function buildFrames() {
    ['mario','link'].forEach(function (who) {
      var base = who === 'mario' ? BASE_M : BASE_L;
      var pal  = who === 'mario' ? PAL_M  : PAL_L;
      FRAME[who] = {};
      POSE_ORDER.forEach(function (p) {
        FRAME[who][p] = spriteSVG(patch(base, POSE[who][p]), pal);
      });
    });
  }

  /* ---------- 双语台词池 ---------- */
  function Q(en, zh) { return { en: en, zh: zh }; }
  var NORMAL = {
    mario: [
      Q("It's-a me, Mario!", '是我呀，马里奥！'),
      Q("Let's-a go!  Wahoo!", '出发啦！哇呼！'),
      Q('Thank you so much for playing my game!', '谢谢你来玩我的游戏！'),
      Q('Mamma mia!  Here we go again!', '我的天！又来一次！'),
      Q('Here we go!', '我们走！'),
      Q('Wahoo!  Yippee!', '哇呼！太棒啦！'),
      Q('Nice of you to drop by!', '谢谢你顺路来看我！'),
      Q("I'm the best at jumping!", '跳跳我最在行！'),
      Q('Pasta time?  No, class time!', '该吃面啦？不对，该上课啦！'),
      Q('One more coin, one more smile!', '再多一枚金币，再多一个笑脸！'),
      Q('You tapped me!  High five!', '你点到我啦！击个掌！'),
      Q('Never skip leg day at the timetable!', '课表再忙也别忘了练腿！')
    ],
    link: [
      Q("It's dangerous to go alone! Take this.", '一个人上路太危险！拿上这个。'),
      Q('Hey! Listen!', '嘿！听我说！'),
      Q("Zelda... it's me, Link.", '塞尔达……是我，林克。'),
      Q('HYAH!  Hup!  Yah!', '喝！哈！呀！'),
      Q('The map is in your heart.', '地图就在你心里。'),
      Q('Courage, wisdom, power - and a good schedule.', '勇气、智慧、力量，还有好课表。'),
      Q('A secret hides in every week.', '每一周都藏着一个秘密。'),
      Q('Watch the sky, then watch the clock.', '先看看天，再看看钟。'),
      Q("I'll guard this timetable.", '这张课表由我来守护。'),
      Q('Hmm... a hidden block?', '嗯……有隐藏方块？'),
      Q('Your tap is as sharp as a sword.', '你这一下，比剑还利落。'),
      Q('Rest is part of the quest.', '休息也是冒险的一部分。')
    ]
  };
  var RARE = {
    mario: [
      Q('The princess is in another castle, but your class is right here.', '公主在别的城堡，课却就在这儿。'),
      Q('Power-up earned: extra credit!', '获得强化：加分！'),
      Q('You found the 1-Up of the timetable!', '你找到了课表里的加命蘑菇！')
    ],
    link: [
      Q('The Master Sword chose your study plan.', '大师之剑选中了你的学习计划。'),
      Q('A fair wind, and a free afternoon.', '顺风，外加一个空闲的下午。'),
      Q("You've awakened the Hero of Time and of attendance.", '你唤醒了时之勇者，也是考勤之勇者。')
    ]
  };
  var BANTER = [
    [Q('Wahoo! Race you to class!', '哇呼！比谁先冲到教室！'), Q('Slow down, the timetable has no shortcuts.', '慢点，课表可没有捷径。')],
    [Q('Mushroom or rupee, which is tastier?', '蘑菇和卢比，哪个更好吃？'), Q('Neither. Try the cafeteria.', '都不行，去食堂吧。')],
    [Q('I fixed the pipe, you fixed the schedule?', '我修好水管，你修好课表？'), Q('Both need a hero.', '两样都得有勇者。')],
    [Q("Let's-a team up for the exam!", '考试一起组队吧！'), Q('You bring the courage, I bring the notes.', '你带勇气，我带笔记。')]
  ];
  function comboQuote(n) {
    if (n >= 20) return Q('COMBO x' + n + '!!!  Legendary!', n + '连击！！！传说级！');
    if (n >= 10) return Q('COMBO x' + n + '!!  Amazing!', n + '连击！！太神了！');
    if (n >= 5)  return Q('COMBO x' + n + '!  Nice!', n + '连击！漂亮！');
    return null;
  }
  /* 呼应真实课表状态（.nv-belt-next），绝不编钟点 */
  function echoQuote() {
    var el = document.querySelector('.nv-belt-next'), t = '';
    if (el && !el.classList.contains('off')) t = (el.textContent || '').trim();
    if (/结束/.test(t)) return [Q("Today's quest is cleared!", '今天的冒险通关啦！'), Q('Rest now, hero.', '歇会儿吧，勇者。')];
    if (/无课|没有课/.test(t)) return [Q('A free day!  Explore a little.', '没课！去探探险吧。'), Q('Even heroes need a break.', '勇者也需要休息。')];
    if (/距上课|还有/.test(t)) return [Q('The next stage is loading...', '下一关正在加载……'), Q('Check your map, hero.', '看看地图，勇者。')];
    return [Q('The timetable is our map.', '课表就是我们的地图。'), Q('Every class is a quest.', '每一节课都是一次冒险。')];
  }

  /* ---------- Web Audio：离线合成 8-bit 原版音效 ---------- */
  var audio = (function () {
    var ctx = null, master = null, muted = false;
    try { muted = localStorage.getItem('xxmu_eg_mute') === '1'; } catch (e) {}
    function ensure() {
      if (ctx) return ctx;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.13;
        master.connect(ctx.destination);
      } catch (e) { ctx = null; }
      return ctx;
    }
    function tone(freq, t0, dur, type, vol, slideTo) {
      var c = ensure(); if (!c) return;
      try {
        var o = c.createOscillator(), g = c.createGain();
        o.type = type || 'square';
        o.frequency.setValueAtTime(freq, t0);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol || 0.5, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(master);
        o.start(t0); o.stop(t0 + dur + 0.03);
      } catch (e) {}
    }
    function seq(notes) {
      var c = ensure(); if (!c || muted) return;
      if (c.state === 'suspended' && c.resume) { try { c.resume(); } catch (e) {} }
      var t = c.currentTime + 0.01;
      for (var i = 0; i < notes.length; i++) {
        var n = notes[i];
        tone(n[0], t, n[1], n[2] || 'square', n[3] || 0.5, n[4]);
        t += n[1] * 0.9;
      }
    }
    return {
      /* 三音上扬 = 「Ma-ri-o!」的标志性腔调 */
      mario:    function () { seq([[523,.075,'square',.5,659],[659,.075,'square',.5,784],[784,.13,'square',.55,1047]]); },
      link:     function () { seq([[784,.06,'triangle',.55],[988,.06,'triangle',.55],[1175,.14,'triangle',.5]]); },
      coin:     function () { seq([[988,.07,'square',.5],[1319,.13,'square',.5]]); },
      jump:     function () { seq([[392,.07,'square',.4,784]]); },
      power:    function () { seq([[659,.05,'square',.5],[880,.05,'square',.5],[1047,.05,'square',.5],[1319,.16,'square',.55]]); },
      fanfare:  function () { seq([[523,.09,'square',.5],[659,.09,'square',.5],[784,.09,'square',.5],[1047,.24,'square',.6]]); },
      toggleMute: function () { muted = !muted; try { localStorage.setItem('xxmu_eg_mute', muted ? '1' : '0'); } catch (e) {} return muted; },
      isMuted:  function () { return muted; }
    };
  })();

  /* ---------- 持久化进度（金币 / 连击 / 图鉴 / 成就 / 每日） ---------- */
  function defaults() {
    return { taps:0, coins:0, combo:0, best:0, last:0, day:'',
      by:{mario:0,link:0}, seen:{mario:{},link:{}}, bag:{mario:[],link:[]},
      ach:{}, unlocked:false, hinted:0 };
  }
  var S = defaults();
  function load() {
    var d = defaults();
    try {
      var raw = localStorage.getItem('xxmu_eg_v2');
      if (raw) {
        var o = JSON.parse(raw) || {};
        ['taps','coins','combo','best','last','day','unlocked','hinted'].forEach(function (k) { if (o[k] !== undefined) d[k] = o[k]; });
        if (o.by)   { d.by.mario = o.by.mario || 0; d.by.link = o.by.link || 0; }
        if (o.seen) { d.seen.mario = o.seen.mario || {}; d.seen.link = o.seen.link || {}; }
        if (o.bag)  { d.bag.mario = o.bag.mario || []; d.bag.link = o.bag.link || []; }
        if (o.ach)  d.ach = o.ach || {};
      }
    } catch (e) {}
    S = d;
  }
  function save() { try { localStorage.setItem('xxmu_eg_v2', JSON.stringify(S)); } catch (e) {} }
  function dayKey() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function collectionDone() {
    var ok = true;
    ['mario','link'].forEach(function (w) {
      var s = S.seen[w] || {};
      NORMAL[w].forEach(function (q) { if (!s[q.en]) ok = false; });
    });
    return ok;
  }
  var ACH = [
    { k:'first',    zh:'初次击掌',     en:'First high-five', test:function () { return S.taps >= 1; } },
    { k:'regular',  zh:'课表常客',     en:'Regular',         test:function () { return S.taps >= 25; } },
    { k:'buddy',    zh:'像素挚友',     en:'Pixel buddy',     test:function () { return S.taps >= 100; } },
    { k:'combo10',  zh:'连击大师',     en:'Combo master',    test:function () { return S.best >= 10; } },
    { k:'combo20',  zh:'连击传说',     en:'Combo legend',    test:function () { return S.best >= 20; } },
    { k:'collect',  zh:'台词图鉴集齐', en:'Full collection', test:function () { return collectionDone(); } }
  ];

  /* ---------- 舞台 ---------- */
  var stage = null, actors = {}, built = false, beat = 0, timer = 0;

  function pose(who, p) {
    var a = actors[who]; if (!a) return;
    a.sprite.setAttribute('data-pose', p);
    for (var i = 0; i < a.frames.length; i++) {
      a.frames[i].classList.toggle('on', a.frames[i].getAttribute('data-f') === p);
    }
  }
  function flashPose(who, p, ms) {
    var a = actors[who]; if (!a) return;
    pose(who, p);
    unlater(a.pt);
    a.pt = later(function () { if (a.sprite.getAttribute('data-pose') === p) pose(who, 'idle'); }, ms || 620);
  }
  function speak(who, q, pop, rare) {
    var a = actors[who]; if (!a || !q) return;
    if (a.en.textContent !== q.en) a.en.textContent = q.en;
    if (a.zh.textContent !== q.zh) a.zh.textContent = q.zh;
    a.bubble.classList.toggle('eg-rare', !!rare);
    if (pop) { a.bubble.classList.remove('eg-pop'); void a.bubble.offsetWidth; a.bubble.classList.add('eg-pop'); }
  }
  function pickQuote(who) {
    var pool = NORMAL[who].slice();
    if (S.unlocked) pool = pool.concat(RARE[who]);
    var bag = S.bag[who] || (S.bag[who] = []);
    var fresh = pool.filter(function (q) { return bag.indexOf(q.en) < 0; });
    if (!fresh.length) { bag.length = 0; fresh = pool; }
    var q = fresh[Math.floor(Math.random() * fresh.length)];
    bag.push(q.en);
    (S.seen[who] || (S.seen[who] = {}))[q.en] = 1;
    return q;
  }
  function pickFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function updateBadge(who) {
    var a = actors[who]; if (!a) return;
    var n = S.by[who] || 0;
    a.badge.textContent = n > 99 ? '99+' : String(n);
    a.badge.style.display = n > 0 ? '' : 'none';
  }

  function toast(msg) {
    if (reduced || !stage) return;
    var t = stage.querySelector('.eg-toast');
    if (!t) { t = document.createElement('div'); t.className = 'eg-toast'; stage.appendChild(t); }
    t.textContent = msg;
    t.classList.remove('on'); void t.offsetWidth; t.classList.add('on');
  }
  function floatText(who, txt) {
    if (reduced) return;
    var a = actors[who];
    var f = document.createElement('div'); f.className = 'eg-float'; f.textContent = txt;
    a.actor.appendChild(f);
    var kill = function () { if (f.parentNode) f.parentNode.removeChild(f); };
    f.addEventListener('animationend', kill);
    later(kill, 950);
  }
  function burst(who, big) {
    if (reduced) return;
    var fx = actors[who].fx, n = big ? 14 : 7;
    var color = who === 'mario' ? '#F4C542' : '#7BE08A';
    for (var i = 0; i < n; i++) {
      var p = document.createElement('i');
      var ang = (Math.PI * 2 * i / n) + Math.random() * 0.5;
      var dist = (big ? 34 : 20) + Math.random() * 16;
      p.className = 'eg-p' + (i % 3 === 0 ? ' eg-star' : '');
      p.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(1) + 'px');
      p.style.setProperty('--dy', (Math.sin(ang) * dist - 12).toFixed(1) + 'px');
      p.style.setProperty('--pc', color);
      fx.appendChild(p);
      (function (el) {
        var kill = function () { if (el.parentNode) el.parentNode.removeChild(el); };
        el.addEventListener('animationend', kill);
        later(kill, 850);
      })(p);
    }
  }
  function banter() {
    var pair = pickFrom(BANTER);
    speak('mario', pair[0], true, false);
    later(function () { speak('link', pair[1], true, false); flashPose('link', 'wave', 600); }, 900);
  }
  function checkAch(who) {
    if (collectionDone() && !S.unlocked) S.unlocked = true;
    for (var i = 0; i < ACH.length; i++) {
      var a = ACH[i];
      if (!S.ach[a.k] && a.test()) {
        S.ach[a.k] = 1;
        toast(a.zh + ' · ' + a.en);
        audio.fanfare();
        burst(who, true);
        break;
      }
    }
  }

  /* ---------- 核心交互：点一下 ---------- */
  function tap(who) {
    var now = Date.now();
    S.taps++;
    S.combo = (now - S.last < 2800) ? Math.min(S.combo + 1, 999) : 1;
    S.last = now;
    if (S.combo > S.best) S.best = S.combo;
    S.by[who] = (S.by[who] || 0) + 1;
    var gain = S.combo >= 5 ? 2 : 1;
    S.coins += gain;
    var firstToday = false, key = dayKey();
    if (S.day !== key) { S.day = key; firstToday = true; S.coins += 5; }

    /* 音效：点马里奥 = 「Ma-ri-o!」原版腔调；里程碑 = 小号 */
    if (S.combo === 5 || S.combo === 10 || S.combo === 20) audio.fanfare();
    else if (who === 'mario') { audio.mario(); if (S.combo % 3 === 0) later(function () { audio.coin(); }, 160); }
    else { audio.link(); if (S.combo % 4 === 0) later(function () { audio.coin(); }, 160); }

    /* 动作轮转 */
    var cycle = ['cheer','jump','wave','power','step'];
    flashPose(who, cycle[S.taps % cycle.length], 640);
    if (S.combo >= 5) audio.power();
    burst(who, S.combo >= 5);
    floatText(who, '+' + gain + (firstToday ? ' +5' : '') + (S.combo > 1 ? '  x' + S.combo : ''));

    /* 台词 */
    var q, rare = false;
    if (S.taps === 1) q = Q(who === 'mario' ? 'Mario!' : 'Link!', who === 'mario' ? '马里奥！' : '林克！');
    else {
      var cq = comboQuote(S.combo);
      if (cq && (S.combo === 5 || S.combo === 10 || S.combo === 20 || S.combo % 10 === 0)) q = cq;
      else if (firstToday) q = Q('First tap today!  +5', '今日第一下！+5 星');
      else if (S.unlocked && Math.random() < 0.14) { q = pickFrom(RARE[who]); rare = true; }
      else q = pickQuote(who);
    }
    speak(who, q, true, rare);

    checkAch(who);
    if (Math.random() < 0.15) banter();
    updateBadge(who);
    save();
  }
  function bindTap(sprite, who) {
    var lp = 0, longFired = false;
    sprite.addEventListener('pointerdown', function (e) {
      e.preventDefault(); longFired = false;
      unlater(lp);
      lp = later(function () {
        longFired = true;
        var m = audio.toggleMute();
        toast(m ? '音效已关 · Sound off' : '音效已开 · Sound on');
        flashPose(who, 'cheer', 700);
      }, 520);
    });
    sprite.addEventListener('pointerup', function () { unlater(lp); if (!longFired) tap(who); });
    sprite.addEventListener('pointercancel', function () { unlater(lp); });
    sprite.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(who); }
    });
  }

  function build() {
    if (built) return; built = true;
    buildFrames();
    stage = document.createElement('div');
    stage.id = 'eg-stage';
    stage.setAttribute('aria-hidden', 'true');
    ['mario','link'].forEach(function (who) {
      var actor = document.createElement('div'); actor.className = 'eg-actor eg-' + who;
      var bubble = document.createElement('div'); bubble.className = 'eg-bubble';
      var badge = document.createElement('i'); badge.className = 'eg-badge'; badge.style.display = 'none';
      var en = document.createElement('span'); en.className = 'eg-en';
      var zh = document.createElement('span'); zh.className = 'eg-zh';
      bubble.appendChild(badge); bubble.appendChild(en); bubble.appendChild(zh);
      var sprite = document.createElement('div');
      sprite.className = 'eg-sprite'; sprite.setAttribute('data-pose', 'idle');
      sprite.setAttribute('role', 'button'); sprite.setAttribute('tabindex', '0');
      sprite.setAttribute('aria-label', who === 'mario' ? '马里奥，点一下' : '林克，点一下');
      var frames = [];
      POSE_ORDER.forEach(function (p) {
        var f = document.createElement('div');
        f.className = 'eg-frame' + (p === 'idle' ? ' on' : '');
        f.setAttribute('data-f', p);
        f.innerHTML = FRAME[who][p];
        sprite.appendChild(f); frames.push(f);
      });
      var fx = document.createElement('div'); fx.className = 'eg-fx'; sprite.appendChild(fx);
      actor.appendChild(bubble); actor.appendChild(sprite);
      stage.appendChild(actor);
      actors[who] = { actor:actor, bubble:bubble, badge:badge, en:en, zh:zh,
        sprite:sprite, frames:frames, fx:fx, pt:0 };
      bindTap(sprite, who);
    });
    document.body.appendChild(stage);

    /* 首帧静态兜底：QA 夹具杀掉所有 timer 也能出图 */
    speak('mario', NORMAL.mario[0], false, false);
    speak('link',  NORMAL.link[0],  false, false);
    ['mario','link'].forEach(function (w) { pose(w, 'idle'); updateBadge(w); });
    update();

    try {
      var mo = new MutationObserver(update);
      mo.observe(document.documentElement, { attributes:true, attributeFilter:['data-skin','data-theme','data-page'] });
      var top = document.getElementById('top');
      if (top) mo.observe(top, { attributes:true, attributeFilter:['data-page'] });
      var tabs = document.getElementById('tabs');
      if (tabs) mo.observe(tabs, { attributes:true, subtree:true, attributeFilter:['class'] });
    } catch (e) {}

    /* 环境循环：眨眼 / 走步 / 挥手 / 换台词 / 双人拌嘴 / 状态呼应 */
    try { timer = window.setInterval(loop, 900); } catch (e) {}
    /* 一次性提示（夹具里 later 为 no-op，不会污染静态首帧） */
    if (!S.hinted) later(function () { if (isOn()) { S.hinted = 1; save(); toast('点一下有惊喜 · 长按切音效'); } }, 1400);
  }
  function loop() {
    if (!isOn()) return;
    beat++;
    if (beat % 3 === 0 && Math.random() < 0.65) flashPose(Math.random() < 0.5 ? 'mario' : 'link', 'blink', 170);
    if (beat % 8 === 0 && Math.random() < 0.55) flashPose(Math.random() < 0.5 ? 'mario' : 'link', Math.random() < 0.5 ? 'step' : 'wave', 520);
    if (beat % 7 === 0) { var w = Math.random() < 0.5 ? 'mario' : 'link'; speak(w, pickQuote(w), true, false); }
    if (beat % 23 === 0 && Math.random() < 0.6) banter();
    if (beat % 31 === 0) {
      var e = echoQuote();
      speak('mario', e[0], true, false);
      later(function () { speak('link', e[1], true, false); }, 1000);
    }
  }
  function update() { document.documentElement.classList.toggle('eg-on', isOn()); }
  function boot() {
    load();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
    else build();
  }
  boot();
})();
