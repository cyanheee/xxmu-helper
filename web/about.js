/* 河医大助手 - 激活门与关于页
 *
 * 三层门禁：
 *   1. 未激活 → #gate 遮挡，主界面 #app 隐藏
 *   2. 已激活但未登录教务 → 可以看关于页，课表为空
 *   3. 已激活 + 已登录 → 完整功能
 *
 * 授权从 v0.8.0 起是两层（见 auth.js）：
 *   - 本地码：证明「这个学号该有资格」，离线可算，负责即时反馈
 *   - 联网票据：服务器上的开卡记录才是真正的开关，能远程停用
 * 两者都通过才放行；服务器不可达时按本地码放行，联网后自动补验。
 */

const APP_VERSION = '1.1.40';
const DEV_NAME = '孤汩';
const DEV_QQ = '572833261';
const DEV_MAIL = '572833261@qq.com';

const Gate = (() => {
  const $ = (id) => document.getElementById(id);

  function show() {
    $('app').classList.add('locked');
    $('gate').classList.remove('off');
  }

  function hide() {
    $('gate').classList.add('off');
    $('app').classList.remove('locked');
  }

  function err(msg) {
    $('gateErr').textContent = msg || '';
    // 任何把「要更新」写在脸上的拦截，都顺手把更新弹窗叫起来。
    // 否则用户只看到一句话，却不知道去哪儿拿新版本。
    if (msg && /更新|新版/.test(msg) && typeof UpdateUI !== 'undefined') {
      UpdateUI.check(true);
    }
  }

  /** 已激活过就直接放行，然后后台静默联网复核 */
  function boot() {
    const pre = LICENSE.whoami();
    if (pre) $('gateId').value = pre;
    if (AUTH.usable()) {
      hide();
      if (window.__onUnlocked) window.__onUnlocked();
      /* 已激活但可能是「激活完就关了 App」的情况：声明/教程/引导还没做过就补上。
       * 顺序是 声明 → 教程 → 登录引导（三者各自往下转，见 disc.js 顶部说明）。 */
      if (typeof Disc !== 'undefined') Disc.afterUnlock();
      else if (typeof Tut !== 'undefined') Tut.afterUnlock();
      else if (typeof Onboard !== 'undefined') Onboard.afterUnlock();
      // 后台复核，不阻塞界面。被拉黑/版本过旧/管理员票据过期时才回来弹门。
      AUTH.check(false).then(r => {
        if (!r.ok) {
          // 版本过期：别只把人挡在门外，直接把升级提示顶到脸上
          if (r.tooOld && typeof UpdateUI !== 'undefined') {
            err(r.msg || '当前版本已停止使用，请更新');
            show();
            UpdateUI.check(true);
            return;
          }
          err(r.msg || '授权已失效，请重新激活');
          show();
        }
      });
      return true;
    }
    show();
    return false;
  }

  /* 进入 App。
   *
   * v1.1.0 起没有激活码了，这里只做两件事：
   *   1. 学生：填学号 → 领票（服务端仍查黑名单与设备名额）→ 放行
   *   2. 管理员：展开折叠区，多填一个管理口令 → 服务端验过后签 role=admin
   *
   * 学号是不是他本人的，不再靠激活码回答，而是靠**登录教务**：
   * 青果用学号当登录名，WebView 会把用户在登录页填的 input#username 读回来
   * 与这里登记的学号比对（见 sync.js 的 __onLoginDone 与 LICENSE.noteKbAccount）。
   * 所以这一步不拦人，拦在同步课表那一步——进了门却拿不到数据，指向很明确。
   */
  function submit() {
    const id = ($('gateId').value || '').trim();
    const code = ($('gateCode').value || '').trim();
    err('');

    if (!id) { err('请填写学号'); return; }
    if (!/^\d{6,20}$/.test(id)) { err('学号格式不对（应为 6-20 位数字）'); return; }

    const btn = $('gateBtn');
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '正在验证…';

    /* 同一栏内容两个字段一起上报：
     *   code = 当激活码验（服务端已不需要，留着兼容旧服务端）
     *   akey = 当管理口令验
     * 服务端先查 adm: 名单，命中就只认 akey，否则不看 akey。
     * 客户端不判断谁是管理员，否则等于把入口写死在 JS 里。 */
    AUTH.activate(id, code, code).then(r => {
      btn.disabled = false;
      btn.textContent = old;
      if (!r.ok) {
        /* v1.1.8：断网要和「被服务器拒绝」分开说。
         * 原来一律走 err(r.msg)，断网的学生看到的是同款红字，
         * 很容易以为自己被封号了，然后开始反复重试或去找人问。 */
        if (r.reason === 'offline') {
          err((r.msg || '连不上服务器') + '\n\n这不是学号的问题，是网络没通。'
            + '换个网（比如关掉 Wi-Fi 用流量）再点一次就行。');
          return;
        }
        err(r.msg || '进不去');
        // 设备名额满：把已绑的机型列出来，学生自己就知道该找管理员解绑
        if (r.reason === 'device_limit' && r.devices && r.devices.length) {
          const lines = r.devices.map((d, i) =>
            '  ' + (i + 1) + '. ' + (d.tag || '未知机型')
            + (d.last ? '（' + new Date(d.last * 1000).toLocaleDateString() + ' 最后使用）' : ''));
          err((r.msg || '') + '\n已绑定：\n' + lines.join('\n') + '\n换手机请让管理员在后台「解绑设备」。');
        }
        // 版本太旧：服务器连进都不给，直接把更新弹出来
        if (r.reason === 'too_old' && typeof UpdateUI !== 'undefined') {
          UpdateUI.check(true);
        }
        /* 被停用：这种情况只能等管理员解封，写清楚否则他只会反复重试。 */
        if (r.reason === 'revoked') {
          err((r.msg || '该学号已被停用') + '\n\n这一步只能等管理员解封，重填没有用。');
        } else if (r.reason === 'not_granted') {
          err((r.msg || '该学号还没有开通') + '\n\n需要管理员先在后台加入名单。');
        }
        return;
      }

      try {
        if (typeof Host !== 'undefined' && Host.setPref) Host.setPref('xxmu_user', id);
        else localStorage.setItem('xxmu_user', id);
      } catch (e) {}

      hide();
      if (window.__onUnlocked) window.__onUnlocked();
      if (r.offline) {
        // 网络问题：进去能用，但要明确告诉用户现在是什么状态
        XXMU.toast('已保存，但没连上服务器，联网后会自动复核');
      }
      /* 首次进入：先看声明（用之前得知道哪些事以官方为准），
       * 再看教程（这东西能干什么），最后是登录引导。 */
      if (typeof Disc !== 'undefined') Disc.afterUnlock();
      else if (typeof Tut !== 'undefined') Tut.afterUnlock();
      else if (typeof Onboard !== 'undefined') Onboard.afterUnlock();
    }, e => {
      btn.disabled = false;
      btn.textContent = old;
      err('出错了：' + ((e && e.message) || e));
    });
  }

  /** 展开/收起「管理员口令」那一栏 */
  function toggleAdm() {
    const box = $('gateAdm');
    if (!box) return;
    const on = box.style.display !== 'none';
    box.style.display = on ? 'none' : 'block';
    const t = $('gateMoreBtn');
    if (t) t.textContent = on ? '我是管理员' : '收起管理员口令';
    if (!on) {
      const c = $('gateCode');
      if (c) setTimeout(() => c.focus(), 60);
    }
  }

  function init() {
    $('gateBtn').onclick = submit;
    if ($('gateMoreBtn')) $('gateMoreBtn').onclick = toggleAdm;
    if ($('gateCode')) {
      $('gateCode').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
    }
    $('gateId').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        // 学生直接回车就是提交；管理员展开后回车跳到口令栏
        const box = $('gateAdm');
        if (box && box.style.display !== 'none') $('gateCode').focus();
        else submit();
      }
    });
    boot();
  }

  return { init, show, hide, boot };
})();

/* ---------------- 关于页 ---------------- */

const About = (() => {
  const $ = (id) => document.getElementById(id);

  function openExternal(url) {
    try {
      if (typeof Host !== 'undefined' && Host.openUrl) { Host.openUrl(url); return; }
      window.open(url, '_blank');
    } catch (e) {}
  }

  function deviceInfo() {
    try {
      if (typeof Host !== 'undefined' && Host.deviceInfo) return Host.deviceInfo();
    } catch (e) {}
    return (navigator.userAgent || '--');
  }

  function crashText() {
    try {
      if (typeof Host !== 'undefined' && Host.crashLog) return Host.crashLog() || '';
    } catch (e) {}
    return '';
  }

  function diagText() {
    const id = LICENSE.whoami() || (typeof currentUser === 'function' ? currentUser() : '') || '未填写';
    const lic = AUTH.usable() ? (AUTH.isAdmin() ? '管理员' : '正常') : '未登记学号';
    const acc = (typeof LICENSE.accounts === 'function') ? LICENSE.accounts() : { kb: '', cx: '', verified: false };
    const acctLine = '学号核对：' + (acc.verified ? '已一致'
      : (acc.kb ? ('不一致（教务读到 ' + acc.kb + '）') : '尚未登录教务'));
    const login = (typeof Host !== 'undefined' && Host.cookies && Host.cookies().length > 20)
      ? '已登录' : '未登录';
    const src = ($('srcTag') && $('srcTag').textContent) || '--';
    const cnt = ($('cnt') && $('cnt').textContent) || '--';
    /* 作业状态健康度：用户报「交给他的状态读不准」时，这一行能直接看出
     * 是解析失败（unknown 多）还是学习通真的这么写（有值但古怪）。 */
    let hwLine = '作业：未同步';
    try {
      const hw = (typeof CX !== 'undefined') ? CX.cached() : null;
      if (hw && Array.isArray(hw.works)) {
        const n = hw.works.length;
        const unk = hw.works.filter(w => !String(w.status || '').trim()).length
          + (hw.exams || []).filter(e => !String(e.status || '').trim()).length;
        hwLine = '作业：' + n + ' 条 / 考试 ' + (hw.exams || []).length + ' 场'
          + (unk ? '（其中 ' + unk + ' 条状态未读到）' : '（状态全部读到）');
      }
    } catch (e) {}
    return [
      '【河医大助手 问题反馈】',
      '学号：' + id,
      '版本：v' + APP_VERSION,
      '状态：' + lic,
      acctLine,
      '教务登录：' + login,
      '数据来源：' + src,
      '课程数：' + cnt,
      hwLine,
      '设备：' + deviceInfo(),
      'UA：' + (navigator.userAgent || '--'),
    ].join('\n');
  }

  function refresh() {
    const id = LICENSE.whoami() || '--';
    const act = AUTH.usable();
    const adm = AUTH.isAdmin();
    $('aboutLic').textContent = act ? (adm ? '管理员（口令登录）' : '正常') : '未登记学号';
    $('aboutLic').className = 'v ' + (act ? 'ok' : 'warn');
    $('aboutLicId').textContent = id;

    /* 学号核对：这是取消激活码之后唯一能证明「这个号是他本人」的东西。
     * 三种状态必须分清楚，否则用户看到「未核对」会以为软件坏了：
     *   已一致   = 登录教务时读到的账号就是登记的学号
     *   不一致   = 读到了但不一样（可能是登错号，也可能填错了）
     *   尚未登录 = 还没登录过教务，属于正常的新手状态 */
    const vf = $('aboutVerified');
    if (vf) {
      const acc = (typeof LICENSE.accounts === 'function')
        ? LICENSE.accounts() : { kb: '', verified: false };
      if (!act) {
        vf.textContent = '--';
        vf.className = 'v';
      } else if (acc.verified) {
        vf.textContent = '已一致';
        vf.className = 'v ok';
      } else if (acc.kb) {
        vf.textContent = '不一致（' + acc.kb + '）';
        vf.className = 'v warn';
      } else {
        vf.textContent = '尚未登录教务';
        vf.className = 'v warn';
      }
    }

    // 联网校验状态：如实显示现在是「已联网确认」还是「仅本地码」
    const net = $('aboutNet');
    if (net) {
      const t = AUTH.ticket();
      if (!act) {
        net.textContent = '未激活';
        net.className = 'v warn';
      } else if (adm) {
        net.textContent = '管理员（服务端签发）';
        net.className = 'v ok';
      } else if (!t) {
        net.textContent = '尚未联网校验';
        net.className = 'v warn';
      } else {
        const exp = AUTH.expAt();
        /* v1.1.8：过期要说「已过期」。
         * 原来一律 Math.max(0, ...) 再拼「有效 · 剩 N 天」，票据过期之后
         * 显示的是「有效 · 剩 0 天」—— 既说有效又说剩 0 天，用户不知道
         * 该不该重新登录。exp 是秒，和 Date.now() 的毫秒要先统一。 */
        const ms = exp ? (exp * 1000 - Date.now()) : 0;
        if (exp && ms <= 0) {
          net.textContent = '已过期，重新登录一次';
          net.className = 'v warn';
        } else {
          const d = exp ? Math.max(0, Math.ceil(ms / 86400000)) : 0;
          net.textContent = exp ? ('有效 · 剩 ' + d + ' 天') : '有效';
          net.className = 'v ok';
        }
      }
    }

    $('fbId').textContent = id;
    $('fbVer').textContent = 'v' + APP_VERSION;
    $('fbLogin').textContent =
      (typeof Host !== 'undefined' && Host.cookies && Host.cookies().length > 20)
        ? '已登录' : '未登录';
    $('fbSrc').textContent = ($('srcTag') && $('srcTag').textContent) || '--';
    $('fbCnt').textContent = ($('cnt') && $('cnt').textContent) || '--';

    /* 作业状态健康度：一句话说清「是解析失败还是学习通真这么写」。
     * 用户报「状态读不准」时，这一行就是分诊台。 */
    const fbHw = $('fbHw');
    if (fbHw) {
      let line = '未同步';
      let cls = 'v';
      try {
        const hw = (typeof CX !== 'undefined') ? CX.cached() : null;
        if (hw && Array.isArray(hw.works)) {
          const nw = hw.works.length, ne = (hw.exams || []).length;
          const miss = hw.works.filter(w => !String(w.status || '').trim()).length
            + (hw.exams || []).filter(e => !String(e.status || '').trim()).length;
          line = nw + ' 条作业 / ' + ne + ' 场考试';
          if (miss) { line += '，' + miss + ' 条未读到状态'; cls = 'v warn'; }
          else { line += '，状态全部读到'; cls = 'v ok'; }
        }
      } catch (e) {}
      fbHw.textContent = line;
      fbHw.className = cls;
    }

    const dev = $('fbDevice');
    if (dev) dev.textContent = deviceInfo();

    const crash = crashText();
    const row = $('fbCrash');
    if (row) {
      if (crash) {
        const m = /=====[^\n]*=====|(\w+(?:Exception|Error))/.exec(crash);
        row.textContent = m ? (m[1] || m[0]).slice(0, 40) : '有';
        row.className = 'v warn';
      } else {
        row.textContent = '无';
        row.className = 'v ok';
      }
    }
    const btnC = $('btnShowCrash');
    if (btnC) btnC.style.display = crash ? 'block' : 'none';
  }

  function copy(text, okMsg) {
    const done = () => {
      if (typeof Host !== 'undefined' && Host.toast) Host.toast(okMsg || '已复制');
      else alert(okMsg || '已复制');
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, () => fallback(text, done));
        return;
      }
    } catch (e) {}
    fallback(text, done);
  }

  function fallback(text, done) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (e) {
      alert(text);
    }
  }

  function init() {
    $('aboutVer').textContent = 'v' + APP_VERSION;

    const qq = $('lnkQQ');
    qq.onclick = () => copy(DEV_QQ, 'QQ 号已复制：' + DEV_QQ);

    const mail = $('lnkMail');
    mail.onclick = () => copy(DEV_MAIL, '邮箱已复制：' + DEV_MAIL);

    $('btnCopyDiag').onclick = () => copy(diagText(), '诊断信息已复制');

    const btnC = $('btnShowCrash');
    if (btnC) {
      btnC.onclick = () => {
        const t = crashText();
        if (!t) { showTip('没有崩溃记录。'); return; }
        showTip(t);
      };
    }

    $('btnMail').onclick = () => {
      const subject = encodeURIComponent('河医大助手 问题反馈');
      const body = encodeURIComponent(diagText() + '\n\n问题描述：\n');
      openExternal('mailto:' + DEV_MAIL + '?subject=' + subject + '&body=' + body);
    };

    $('btnReauth').onclick = () => {
      if (confirm('重新填学号？当前的登记会被清除，填完要重新登录一次教务。')) {
        LICENSE.deactivate();
        AUTH.clearTicket();
        refresh();
        Gate.show();
      }
    };

    /* 只清「学号核对」这一条判定。
     *
     * 场景：教务登录名不是学号（或者学校换了登录方式），软件每次都判「不一致」，
     * 用户每轮都要多点一次同步。旧版本只能靠「重新填学号」或「退出本机账号」
     * 绕过去，而那两条路会把课表缓存和教务 cookie 一起冲掉 —— 为了清一个布尔
     * 判据把整个账号状态推平，代价完全不成比例。
     *
     * 清完不重载页面：下一次登录教务时 noteKbAccount 会重新写一份真值，
     * 而在那之前「未核对」本来就是正常状态，不该因为清了一下就白屏等同步。 */
    const cc = $('btnClearCheck');
    if (cc) {
      cc.onclick = () => {
        if (!confirm('清除学号核对记录？\n\n'
          + '只清「教务读到的账号」这条判定，课表、作业、登录状态都不动。\n'
          + '下次登录教务会重新核对一次。')) return;
        LICENSE.clearCheck();
        refresh();
        XXMU.toast('已清除，下次登录教务会重新核对');
      };
    }

    /* 查看作业状态原文（v1.1.5 新增）。
     *
     * 为什么需要这个按钮：这次「内脏学没交却显示已完成」全靠用户截图上
     * 一个「—」角标反推出来，而项目历史上从没把学习通页面落过盘，
     * 只能靠猜标签结构。下次学习通再改版，又是同样的静默失败。
     * 现在解析时发现状态读不出来，就把那段原始 HTML 留在内存里，
     * 这里能一键复制出来 —— 拿到原文就不用猜了。
     */
    const hr = $('btnShowHwRaw');
    if (hr) {
      hr.onclick = () => {
        let txt = '';
        try {
          const dg = (typeof CX !== 'undefined' && CX.diag) ? CX.diag() : null;
          if (!dg || !dg.miss.length) {
            txt = '这次同步没有解析失败的状态位。\n\n'
              + '如果作业仍显示不对，先点上面的「重新抓作业与考试」再回来看——'
              + '诊断样本只在抓取过程中收集。';
          } else {
            const parts = ['【作业状态解析失败样本】共 ' + dg.miss.length + ' 条', ''];
            dg.miss.forEach((m, i) => {
              parts.push('--- 样本 ' + (i + 1) + '（' + (m.kind === 'exam' ? '考试' : '作业')
                + ' / ' + (m.course || '未知课程') + '）---');
              parts.push(m.html || '(空)');
              parts.push('');
            });
            txt = parts.join('\n');
          }
        } catch (e) { txt = '读取诊断样本失败：' + ((e && e.message) || e); }
        copy(txt, '已复制，粘给我就能定位');
      };
    }

    /* v1.1.13：课表抓取原文。
     *
     * 用户报「某学号永远没有课表」，而项目里从来没保存过真实青果课表 HTML，
     * 离线无法复现。这个出口把「上次抓到的页面长什么样」直接给出来：
     *   · 页面字节数很小 → 抓取就没成功（cookie/学期参数问题）
     *   · 页面很大但格子 0 个 → 页面结构变了，正则失配
     *   · 格子有、课程有、周次空 → parseWeeks 认不出周次写法
     * 三种情况修法完全不同，没有这段原文就只能猜。 */
    const kr = $('btnShowKbRaw');
    if (kr) {
      kr.onclick = () => {
        let txt = '';
        try {
          const d = (typeof XXMU !== 'undefined' && XXMU.diag) ? XXMU.diag() : null;
          if (!d || !d.at) {
            txt = '这次打开还没有抓取记录。\n\n'
              + '先点课表页的「从教务同步课表」，抓一次再回来看。';
          } else {
            const parts = ['【课表抓取原文】'];
            parts.push('抓取时间：' + new Date(d.at * 1000).toLocaleString());
            parts.push('页面字节：' + d.bytes);
            parts.push('解析出格子：' + d.cells);
            parts.push('课程条数：' + d.courses);
            if (d.err) parts.push('抓取层错误：' + d.err);
            parts.push('');
            parts.push('--- 页面原文样例 ---');
            (d.samples || []).forEach((x, i) => {
              parts.push('[样例 ' + (i + 1) + ']');
              parts.push(x || '(空)');
              parts.push('');
            });
            if (!d.samples || !d.samples.length) {
              parts.push('(没有留存原文：可能是抓取在解码之前就失败了)');
            }
            txt = parts.join('\n');
          }
        } catch (e) { txt = '读取课表诊断失败：' + ((e && e.message) || e); }
        copy(txt, '已复制，粘给我就能定位');
      };
    }

    /* 退出本机账号：换人用这台手机时用。
     *
     * 和上面「重新填学号」的区别（两个按钮都在，因为场景不同）：
     *   重新填学号   = 还是我，只是填错了/换了个号 → 只清登记
     *   退出本机账号 = 这台手机要还给我/交给别人 → 连课表、作业、
     *                  学习通记录一起清，不给下一个人看我的东西
     *
     * 真正的实现只有一个（app.js 的 exitAccount），这里只转发。
     * 两处各写一遍的话，将来有人只改了其中一处，另一个入口就漏清文件。
     */
    const ex = $('btnExit');
    if (ex) {
      ex.onclick = () => {
        if (typeof window.__XXMU_EXIT_ACCOUNT === 'function') {
          window.__XXMU_EXIT_ACCOUNT();
          return;
        }
        // 兜底：app.js 没加载（几乎不会发生，但不留白屏）
        if (!confirm('退出这台手机上的账号？退出后需要重新激活。')) return;
        try { if (typeof Host !== 'undefined' && Host.clearCookies) Host.clearCookies(); } catch (e) {}
        try { if (typeof Host !== 'undefined' && Host.clearAccount) Host.clearAccount(); } catch (e) {}
        LICENSE.deactivate();
        AUTH.clearTicket();
        try { location.reload(); } catch (e2) { refresh(); Gate.show(); }
      };
    }

    /* 手动复核：用户点了就强制联网验一次，跳过「6 小时内不再问」的缓存。
     * 主要给「账号被别人踢了但还没到 6 小时」这种场景用。 */
    const rc = $('btnRecheck');
    if (rc) {
      rc.onclick = () => {
        rc.disabled = true;
        rc.textContent = '联网校验中…';
        AUTH.check(true).then(r => {
          rc.disabled = false;
          rc.textContent = '立即联网复核';
          if (r.ok) {
            XXMU.toast(r.admin ? '管理员身份已由服务端确认' : (r.offline ? '没连上服务器，先用本地码' : '校验通过'));
            refresh();
          } else {
            refresh();
            alert('授权已失效：' + (r.msg || r.reason) + '\n请重新激活。');
            Gate.show();
          }
        }, e => {
          rc.disabled = false;
          rc.textContent = '立即联网复核';
          XXMU.toast('联网校验失败：' + ((e && e.message) || e));
        });
      };
    }
  }

  /* v1.1.13：把 version 暴露出去 —— 课表诊断（app.js 的 kbDiagText）
   * 需要版本号，原先只有模块内部的 APP_VERSION 常量，外部拿不到。 */
  return { init, refresh, diagText, version: () => APP_VERSION };
})();

/* 关于页的刷新入口。
 *
 * v1.1.8 之前这里写的是
 *     document.querySelector('#tabs button[data-tab="about"]')
 * 而底部导航只有 kb / learn / wiki / campus / me 五个（关于页是从「我的」
 * 二级进去的），所以那个 querySelector 恒为 null，整个 IIFE 从来没生效过 ——
 * 一段看起来在做事的死代码，比没有更容易骗过后来的人。
 *
 * 真正的跳转在 app.js 的 rowAbout 点击里：
 *     switchTab('about'); About.refresh();
 * 所以这里不再重复挂监听（挂上就是刷两遍），只留这条说明。
 */
