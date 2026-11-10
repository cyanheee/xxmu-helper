/* 河医大助手 - 使用指南
 *
 * 为什么从 wiki.js 拆出来：
 *   原来的 WIKI 页混了两类完全不同的东西 ——「这个 App 怎么用」和
 *   「学校有哪些流程」。前者是软件说明书，跟「我的」页的其他设置项是一家人；
 *   后者是学校资料。混在一页里，用户找「怎么同步课表」和找「怎么开在校证明」
 *   要翻同一个列表，谁都不顺手。
 *
 *   所以：使用说明搬到「我的 → 使用帮助」（二级页），
 *   WIKI 页整体让给学校资料（见 wiki.js）。
 *
 * 这里只写「这个 App 怎么用」，不写学校政策。
 */

const GUIDE = (() => {
  const K_MINE = 'xxmu_guide_mine';   // 用户自己补的条目（JSON 数组）

  const BUILTIN = [
    {
      cat: '开始使用',
      t: '第一次打开要做什么',
      b: [
        '装好打开，填上学号点「进入」。不用激活码了，1.1 版起取消了。',
        '进去后先去「我的」页点「登录教务（学校官方页面）」，在打开的学校官方页面上正常输入学号和密码。',
        '这一步顺便核对身份：App 会把你登录时填的学号和进门时填的学号对一下，一致就说明这个号确实是你的。',
        '登录成功回到 App，点「从教务同步课表」，课表就下来了。',
        '学习通的作业要单独同步一次：进「学习」页点右上角「重新检查」。',
      ],
    },
    {
      cat: '开始使用',
      t: '不用激活码了，那怎么确认是我本人 / 换了手机怎么办',
      b: [
        '1.1 版起取消了激活码，填学号就能进。',
        '怎么确认是你本人：靠的是学校自己的登录。青果教务用学号当登录名，你输对学号密码才登得进去，App 读到登录页填的账号后会和软件里登记的学号比对。',
        '两个学号对不上时，课表会拒绝同步并提示两边分别是多少 —— 你自己就知道该改哪边。',
        '换手机直接在软件里填同一个学号就行，不用找人要码。',
        '一个学号默认最多绑 3 台设备。超了会提示「设备数量已达上限」，把提示里的机型列表发给开发者，让他清一下旧设备。',
      ],
    },
    {
      cat: '开始使用',
      t: '为什么有时候要更新，不更新会怎样',
      b: [
        '打开 App 时会自动检查一次新版本。有新版本会弹一个框，写着这版改了什么。',
        '软提示：可以点「以后再说」，先继续用。',
        '强制更新：如果这版有必须修的问题（比如旧版会崩、接口变了），弹框上只剩「立即更新」，不能跳过。',
        '从 1.0 版起，点「去下载」会直接在 App 里下载安装包，下完自动拉起系统安装器，不用去文件管理器里再找一遍。',
        '第一次这样下载时，系统会问「是否允许本应用安装未知应用」，选择允许即可（设置 → 应用 → 特殊权限里也能改）。',
        '如果下载地址还没配好，弹框里会显示 QQ 群号，点一下就能复制。',
      ],
    },
    {
      cat: '教务与课表',
      t: '教务系统怎么登录',
      b: [
        '在「我的」页点「登录教务」，App 会打开学校官方的登录页，你在官方页面上正常输入学号和密码。',
        'App 不保存你的密码，只保留登录后的会话（Cookie）。登录一次之后，课表可以随时重新同步。',
        '如果登录页要求填验证码，直接在页面上填 —— 那个验证码是学校页面自己出的，App 只负责把页面显示出来。',
        '登录失效的典型表现：同步课表时提示「登录已失效」。这时回「我的」页重新点一次登录就行。',
      ],
    },
    {
      cat: '教务与课表',
      t: '课表对不上 / 少了课 / 周次差一周',
      b: [
        '先确认学期对不对。「我的」页的「学期」应该显示当前学年学期，比如 2026-2027-1 表示 2026 年秋季学期。',
        '再确认周次。「课表」页顶部显示的是第几周，如果和实际差一周，说明开学日设错了。',
        '如果都对但个别课缺失：有些课是分批录入的，教务系统里刚调过课，重新同步一次即可。',
        '周次不对还有个常见原因：调休、运动会那几周学校会临时改课，教务系统里的周次和实际周历会错开。',
        '还是不对就把「我的 → 关于本软件 → 诊断」里的信息复制给开发者，里面含版本、学号、数据来源、课程数。',
      ],
    },
    {
      cat: '教务与课表',
      t: '空教室准不准',
      b: [
        '「课表」页右上角「空教室」按你选的星期和时段，列出本机课表里没有课占用的教室。',
        '注意：这个结果只依据「你自己课表里出现过的教室」，看不到别的班的课，所以只能当参考，不能保证一定空。',
        '要准确结果，点浮层里的「用教务系统查」，会打开学校教务系统的空闲教室查询页（需要先登录教务）。',
        '自习高峰是晚上和周末白天，这时候空教室最紧张，建议提前去看一眼。',
      ],
    },
    {
      cat: '学习通',
      t: '作业和考试在哪看',
      b: [
        '「学习」页会列出学习通上未完成的作业和待考的考试，可以按「紧急度」或「按课程」排。',
        '点某一条会打开 App 内置的学习通页面 —— 不要用系统浏览器打开，因为浏览器里没有你的学习通登录态，打开就是登录页。',
        '第一次用内置页面时需要登录一次学习通，之后就不用再登了。',
        '如果某条作业提示「没有可用链接」，通常是老师还没发布，或者那条数据比较旧，点「重新检查」再试一次。',
      ],
    },
    {
      cat: '学习通',
      t: '签到 / 位置签到',
      b: [
        '签到必须在学习通官方页面里完成，App 只是把页面打开。',
        '位置签到需要给学习通网页定位权限，如果一直提示获取位置失败，检查系统设置里浏览器的定位权限。',
        '签到有时间窗口，过期补不了，这是学习通的规则，App 改不了。',
      ],
    },
    {
      cat: '校园事务',
      t: '饮水机怎么用（胖乖生活）',
      b: [
        '学校的直饮水机是「胖乖生活」平台的，机器上有二维码。平时用法是扫码解锁、支付宝碰一碰解锁，然后出水。',
        '本 App 的「校园事务」页可以把机器绑到手机上：扫一次机器上的二维码，之后在 App 里点一下就出水，不用每次扫码。',
        '前提是你在 App 里用手机号登录过一次胖乖生活（在「校园事务 → 饮水机」里点，会打开官方登录页）。',
        'App 只替你发「解锁」这一个请求，扣费还是走平台原来那套。余额、充值、绑定一卡通请去官方的「慧生活798」里做 —— 动钱的操作 App 不代办。',
        '出水时请守着机器，接满了点「停止」。如果点了没反应，多半是上一个用户还在用，等一会儿再试。',
      ],
    },
    {
      cat: '数据与隐私',
      t: '数据会上传吗 / 隐私',
      b: [
        '课表、作业、成绩这些数据只存在你自己的手机里，不上传到开发者那里。',
        'App 没有存你课表的后端。课表、作业都是你的手机直接访问学校教务系统和学习通。',
        '唯一的服务器是激活校验那台：它只知道「某学号已开通」和「某设备的随机指纹」，不知道你的课表、成绩、密码。',
        '设备指纹是本机随机生成的 32 位十六进制串，不含 IMEI、不含手机号、不含任何硬件标识。',
        '所以「开发者能不能看到我的课表」—— 看不到，除非你把诊断信息主动发给他。',
      ],
    },
    {
      cat: '数据与隐私',
      t: '本地缓存清了会丢什么',
      b: [
        '「我的 → 清除本机缓存」会清掉课表缓存、作业缓存、饮水机列表、你自己补的 WIKI 条目。',
        '不会清掉：激活状态、教务登录 Cookie、管理员口令。',
        '清了之后重新点「从教务同步课表」和「重新检查」就能拿回来，只是要多等一次网络。',
        'WIKI 里你自己补的条目会丢，建议先用「导出」复制一份出来。',
      ],
    },
    {
      cat: '出问题了',
      t: 'App 打不开 / 闪退',
      b: [
        '先更新到最新版本。旧版本有过启动就崩的问题，已经修了。',
        '如果还闪退：进「我的 → 关于本软件 → 诊断」，把「上次崩溃」那一段复制出来发给开发者。',
        '崩溃信息里含设备型号、Android 版本、WebView 版本和堆栈，有这些基本能定位。',
        '实在打不开，可以先用浏览器打开学校教务系统应急。',
      ],
    },
    {
      cat: '出问题了',
      t: '点了按钮没反应 / 页面卡住',
      b: [
        '先等 3 秒。有些操作（同步课表、检查更新、出水）要等网络回来，这期间按钮会显示「…中」。',
        '如果整个页面能上下滑但点哪里都没反应，说明有请求卡住了：把 App 从后台划掉重开。',
        '重开还卡，就是网络问题（学校网络、运营商），换个网络或者在信号好的地方再试。',
        '反复出现请把设备型号和操作步骤发给开发者。',
      ],
    },
    {
      cat: '出问题了',
      t: '怎么反馈问题',
      b: [
        '进「我的 → 关于本软件」，里面有开发者的 QQ 和邮箱。',
        '点「复制诊断」会把版本、学号、设备型号、数据来源、崩溃记录一次性复制好，直接粘给对方。',
        '描述问题时说清楚：哪个页面、点了什么、期望看到什么、实际看到什么。只说「不好用」没法查。',
        '能截图就截图，尤其是报错文案。',
      ],
    },
  ];

  /* ---------------- 存储 ---------------- */

  function loadMine() {
    try {
      const raw = XXMU.pref(K_MINE);
      if (!raw) return [];
      const a = JSON.parse(raw);
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  function saveMine(list) {
    try { XXMU.pref(K_MINE, JSON.stringify(list)); } catch (e) {}
  }

  function all() {
    return BUILTIN.map((x, i) => ({ id: 'b' + i, cat: x.cat, t: x.t, b: x.b, mine: false }))
      .concat(loadMine().map((x, i) => ({
        id: 'm' + i, cat: x.cat || '我补充的', t: x.t, b: x.b || [], mine: true,
      })));
  }

  function cats() {
    const seen = [];
    all().forEach(x => { if (seen.indexOf(x.cat) < 0) seen.push(x.cat); });
    return seen;
  }

  function byCat(cat) {
    return all().filter(x => x.cat === cat);
  }

  function find(id) {
    return all().filter(x => x.id === id)[0] || null;
  }

  /* ---------------- 渲染 ---------------- */

  function render() {
    const box = document.getElementById('guideBody');
    if (!box) return;
    box.innerHTML = '';

    const inp = document.getElementById('guideSearch');
    const kw = ((inp && inp.value) || '').trim();

    if (kw) {
      const hits = all().filter(x =>
        (x.t + ' ' + x.cat + ' ' + x.b.join(' ')).toLowerCase().indexOf(kw.toLowerCase()) >= 0);
      box.appendChild(el('div', 'wiki-cat', '搜索「' + kw + '」· ' + hits.length + ' 条'));
      if (!hits.length) {
        box.appendChild(el('p', 'hint', '没找到。可以换个词，或者自己补一条。'));
      }
      hits.forEach(x => box.appendChild(card(x)));
      return;
    }

    cats().forEach(cat => {
      box.appendChild(el('div', 'wiki-cat', cat));
      const grid = el('div', 'wiki-grid');
      byCat(cat).forEach(x => grid.appendChild(card(x)));
      box.appendChild(grid);
    });

    box.appendChild(el('p', 'hint',
      '以上是这一版 App 的用法说明。界面改动后个别步骤可能略有出入，以你看到的实际界面为准。'));
  }

  function card(x) {
    const b = el('div', 'wiki-card' + (x.mine ? ' mine' : ''));
    b.appendChild(el('div', 'wiki-t', x.t));
    if (x.mine) b.appendChild(el('span', 'wiki-tag', '我补充'));
    b.onclick = () => open(x.id);
    return b;
  }

  function open(id) {
    const x = find(id);
    if (!x) return;
    document.getElementById('sh-name').textContent = x.t;
    const body = document.getElementById('sh-body');
    body.innerHTML = '';
    body.appendChild(el('div', 'wiki-cat2', x.cat));
    x.b.forEach(p => body.appendChild(el('p', 'wiki-p', p)));

    if (x.mine) {
      const del = el('button', 'btn ghost', '删除这条');
      del.onclick = async () => {
        if (!await askConfirm('删除「' + x.t + '」？', { danger: true })) return;
        const list = loadMine();
        list.splice(parseInt(x.id.slice(1), 10), 1);
        saveMine(list);
        document.getElementById('sheet').classList.remove('on');
        render();
      };
      body.appendChild(del);
    }
    document.getElementById('sheet').classList.add('on');
  }

  /* 补一条：用 prompt() 三级问答。
   *
   * v1.1.6 之前这里点了没反应 —— Android WebView 的 WebChromeClient 默认
   * 不实现 onJsPrompt，prompt() 静默返回 null。现在 MainActivity.Chrome
   * 接管了 onJsPrompt 自己弹对话框，这条路才真正通了。
   * WIKI 的同类入口顺势换成了页面内表单（更长的输入更适合表单），
   * 这里三条都很短，保持 prompt 更省事。
   */
  function addMine() {
    const t = (prompt('标题（例如：同步课表总是失败怎么办）') || '').trim();
    if (!t) return;
    const cat = (prompt('分类（开始使用 / 教务与课表 / 学习通 / 校园事务 / 数据与隐私 / 出问题了，或自己写）', '出问题了') || '').trim() || '出问题了';
    const txt = (prompt('内容（一段话就行）') || '').trim();
    if (!txt) return;
    const list = loadMine();
    list.push({ t: t, cat: cat, b: [txt], at: Math.floor(Date.now() / 1000) });
    saveMine(list);
    render();
    XXMU.toast('已存在本机');
  }

  function exportText() {
    const lines = ['# 河医大助手 · 使用说明导出', ''];
    cats().forEach(cat => {
      lines.push('## ' + cat);
      byCat(cat).forEach(x => {
        lines.push('');
        lines.push('### ' + x.t);
        x.b.forEach(p => lines.push(p));
      });
      lines.push('');
    });
    return lines.join('\n');
  }

  let inited = false;

  function init() {
    /* 与 wiki.js 同理：app.js 底部 + __onUnlocked 会各 init 一次，
     * addEventListener 叠成两份就会一次输入渲染两遍。 */
    if (inited) return;
    inited = true;
    const s = document.getElementById('guideSearch');
    if (s) {
      s.addEventListener('input', render);
      s.addEventListener('search', render);
    }
    const add = document.getElementById('guideAdd');
    if (add) add.onclick = addMine;
    const exp = document.getElementById('guideExport');
    if (exp) {
      exp.onclick = () => {
        const t = exportText();
        try {
          if (typeof Host !== 'undefined' && Host.clip) {
            Host.clip(t);
            XXMU.toast('已复制全部条目');
            return;
          }
        } catch (e) {}
        XXMU.toast('复制失败，条目数：' + all().length);
      };
    }
    render();
  }

  return { init, render, all, cats, byCat, find, open, addMine, exportText };
})();
