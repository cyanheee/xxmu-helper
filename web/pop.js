/* ============================================================
   Pop · 弹出层分层内核
   ------------------------------------------------------------
   「别再管所有弹出来的东西都叫弹窗」。

   弹出来的东西分 6 类，各有各的位置和生命周期，混着用就一定会乱：

     Tooltip     解释          悬停/长按才出现，鼠标移开就没
     Toast       交代事情结果   短暂自动消失
     Alert       系统提醒       顶部常驻，要用户自己关
     Popconfirm  按钮旁就地确认  就在那个按钮边上冒出来
     Modal       强制处理       屏幕中央，非处理不可
     Drawer      长表单/富内容   侧面抽出，能滚

   本文件做四样新东西（另外两样复用已有设施）：

     Pop.alert()    → Alert   顶部常驻条（本文件实现）
     Pop.confirm()  → Popconfirm 就地浮现小确认块（本文件实现）
     Pop.tip()      → Tooltip 解释气泡（本文件实现）
     Pop.toast()    → Toast   页面内小条（原生 Toast 不可用时的兜底）

     Modal  → 已有 #disc（声明）#tut（教程）#onb（引导）#upd（强制升级）
     Drawer → 已有 #sheet（半框），showTip() 归到这里

   设计原则（照抄自那句抖音视频）：
     · Popconfirm 只做「有副作用」的操作，不要给每个删除都套一层
     · Alert 不要滥用，会在页面上叠满小黄条
     · 长内容一律进 Drawer，不要用 Modal 装一大段话
   ============================================================ */
(function () {
  'use strict';

  var doc = document;

  /* ---------- 小工具 ---------- */
  function mk(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }

  /* ---------- 记住最近一次点过的按钮 ----------
   * Popconfirm 要「就地」冒出来，得知道贴着哪个按钮。
   * 用捕获阶段监听 click，全局只挂一次。 */
  var lastTrigger = null;
  on(doc, 'click', function (e) {
    var t = e.target;
    while (t && t !== doc) {
      if (t.tagName === 'BUTTON' || (t.className && String(t.className).indexOf('btn') >= 0)) {
        lastTrigger = t;
        break;
      }
      t = t.parentNode;
    }
  }, true);

  /* ============================================================
     Alert · 顶部常驻系统提醒
     ------------------------------------------------------------
     公告、版本提醒、数据被拦这类「系统说的话」放这里。
     默认不自动消失（视频原话：Alert 是顶部常驻，不是弹窗），
     要自动收就传 ttl（毫秒）。
     ============================================================ */
  function alertBox() {
    var box = doc.getElementById('popAlerts');
    if (!box) {
      box = mk('div', 'pop-alerts');
      box.id = 'popAlerts';
      doc.body.appendChild(box);
    }
    return box;
  }

  function dismiss(item) {
    if (!item || !item.parentNode) return;
    item.classList.add('pop-out');
    setTimeout(function () {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 180);
  }

  /* 记住还开着的 Alert，好让 closeNotice() 之类能把顶部那条收掉 */
  var openAlerts = [];

  function hideAlert() {
    var item = openAlerts.pop();
    if (!item) return;
    dismiss(item);
  }

  function alertBar(msg, opts) {
    opts = opts || {};
    var box = alertBox();

    var item = mk('div', 'pop-alert');
    if (opts.kind) item.className += ' pop-alert-' + opts.kind;

    if (opts.title) item.appendChild(mk('b', 'pop-alert-t', opts.title));

    var body = mk('div', 'pop-alert-b');
    String(msg == null ? '' : msg).split('\n').forEach(function (line) {
      if (line === '' && body.children.length) { body.appendChild(mk('div', 'pop-alert-gap', ' ')); return; }
      body.appendChild(mk('div', 'pop-alert-l', line));
    });
    item.appendChild(body);

    var x = mk('button', 'pop-alert-x', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', '关闭提醒');
    on(x, 'click', function () {
      dismiss(item);
      openAlerts = openAlerts.filter(function (i) { return i !== item; });
      if (typeof opts.onClose === 'function') opts.onClose();
    });
    item.appendChild(x);

    box.appendChild(item);
    openAlerts.push(item);
    /* 超过三条就把最早的挤掉：Alert 叠多了就成了「黄色瀑布」 */
    while (box.children.length > 3) {
      var oldest = box.firstChild;
      box.removeChild(oldest);
      openAlerts = openAlerts.filter(function (i) { return i !== oldest; });
    }

    if (opts.ttl) {
      setTimeout(function () {
        dismiss(item);
        openAlerts = openAlerts.filter(function (i) { return i !== item; });
        if (typeof opts.onClose === 'function') opts.onClose();
      }, opts.ttl);
    }
    return item;
  }

  /* ============================================================
     Popconfirm · 按钮旁就地确认
     ------------------------------------------------------------
     只给「有副作用」的动作用：退出账号、删留言、下架图片、停用学号。
     不做的事：普通查询、无副作用的按钮（那样只会让人多点一次）。

     用法：
        if (!await askConfirm('退出这个账号？')) return;
        doSomething();
     ============================================================ */
  var openConfirm = null;

  function closeConfirm(result) {
    if (!openConfirm) return;
    var c = openConfirm;
    openConfirm = null;
    if (c.layer && c.layer.parentNode) c.layer.parentNode.removeChild(c.layer);
    doc.removeEventListener('scroll', c.reposition, true);
    window.removeEventListener('resize', c.reposition);
    on(doc, 'keydown', c.esc, true);
    if (c.resolve) c.resolve(result);
  }

  function confirmNear(msg, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (openConfirm) closeConfirm(false);

      var lines = String(msg == null ? '' : msg).split('\n');
      var head = lines.shift() || '确认操作';
      var detail = lines.join('\n').trim();

      var layer = mk('div', 'pop-confirm-layer');
      var card = mk('div', 'pop-confirm');
      card.setAttribute('role', 'dialog');

      card.appendChild(mk('div', 'pop-confirm-t', head));
      if (detail) card.appendChild(mk('div', 'pop-confirm-d', detail));

      var row = mk('div', 'pop-confirm-act');
      var no = mk('button', 'pop-confirm-no', opts.cancelText || '取消');
      no.type = 'button';
      var yes = mk('button', 'pop-confirm-yes', opts.okText || '确定');
      yes.type = 'button';
      if (opts.danger) yes.className += ' danger';
      row.appendChild(no);
      row.appendChild(yes);
      card.appendChild(row);

      layer.appendChild(card);
      doc.body.appendChild(layer);

      on(no, 'click', function () { closeConfirm(false); });
      on(yes, 'click', function () { closeConfirm(true); });
      on(layer, 'click', function (e) { if (e.target === layer) closeConfirm(false); });

      var c = {
        layer: layer, card: card, resolve: resolve,
        anchor: opts.anchor || lastTrigger,
        reposition: reposition
      };
      function reposition() {
        placeCard(c);
      }
      c.reposition = reposition;
      c.esc = function (e) { if (e.key === 'Escape') closeConfirm(false); };
      on(doc, 'keydown', c.esc, true);
      doc.addEventListener('scroll', c.reposition, true);
      window.addEventListener('resize', c.reposition);

      openConfirm = c;
      placeCard(c);
    });
  }

  function placeCard(c) {
    var card = c.card;
    if (!card || !card.parentNode) return;
    card.style.top = '';
    card.style.bottom = '';
    card.style.left = '';

    var vw = window.innerWidth || 390;
    var vh = window.innerHeight || 844;
    var w = Math.min(vw - 24, 320);
    card.style.width = w + 'px';

    var ch = card.offsetHeight || 96;
    var left = 12;
    var top = vh - ch - 96;

    var a = c.anchor;
    if (a && a.getBoundingClientRect) {
      var r = a.getBoundingClientRect();
      if (r.width && r.height) {
        left = Math.max(12, Math.min(vw - w - 12, r.left + r.width / 2 - w / 2));
        top = r.bottom + 10;
        if (top + ch > vh - 12) {
          var above = r.top - ch - 10;
          top = above >= 12 ? above : Math.max(12, vh - ch - 12);
        }
      }
    }
    card.style.left = left + 'px';
    card.style.top = Math.max(12, Math.min(top, vh - ch - 12)) + 'px';
  }

  /* ============================================================
     Toast · 交代事情结果
     ------------------------------------------------------------
     短暂、自动消失、只说一句结果。
     App 里有原生 Toast（Host.toast），这里只做兜底：
     浏览器预览 / 没有 Host 的时候，用页面内的小条顶上，
     免得「点了没反应，像坏了」。
     ============================================================ */
  var toastEl = null;
  var toastTimer = null;
  function toast(msg) {
    var text = String(msg == null ? '' : msg);
    /* 有原生能力就交给原生，外观统一交给系统 */
    try {
      if (typeof XXMU !== 'undefined' && XXMU.toast) { XXMU.toast(text); return; }
    } catch (e) {}
    try {
      if (typeof Host !== 'undefined' && Host.toast) { Host.toast(text); return; }
    } catch (e) {}
    if (!doc.body) return;
    hideToast();
    toastEl = mk('div', 'pop-toast', text);
    doc.body.appendChild(toastEl);
    toastTimer = setTimeout(hideToast, 2200);
  }
  function hideToast() {
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    if (toastEl && toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
    toastEl = null;
  }

  /* ============================================================
     Tooltip · 解释
     ------------------------------------------------------------
     给「解释性文字」用：悬停/按下才冒出来。
     ============================================================ */
  var tipEl = null;
  function hideTip() {
    if (tipEl && tipEl.parentNode) tipEl.parentNode.removeChild(tipEl);
    tipEl = null;
  }
  function tip(target, text) {
    if (!target) return;
    hideTip();
    tipEl = mk('div', 'pop-tip', text);
    doc.body.appendChild(tipEl);
    var r = target.getBoundingClientRect();
    var w = tipEl.offsetWidth || 160;
    var vw = window.innerWidth || 390;
    var left = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2));
    tipEl.style.left = left + 'px';
    tipEl.style.top = Math.max(8, r.top - (tipEl.offsetHeight || 30) - 8) + 'px';
  }

  /* ---------- 导出 ---------- */
  var Pop = {
    alert: alertBar,
    hideAlert: hideAlert,
    confirm: confirmNear,
    tip: tip,
    hideTip: hideTip,
    toast: toast,
    hideToast: hideToast
  };
  window.Pop = Pop;
  /* 短名，迁移旧 confirm() 时用起来顺手 */
  window.askConfirm = function (msg, opts) { return confirmNear(msg, opts); };
})();
