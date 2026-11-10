/* 河医大助手 - 校园 WIKI（学校资料）
 *
 * 定位变更（从 v0.9.5 起）：
 *   这一页原来混着「App 怎么用」和「学校有什么流程」，两类东西挤在一个列表里。
 *   现在「App 怎么用」全部搬到「我的 → 使用帮助」（guide.js），
 *   这一页只放**学校本身**的资料：官方入口、官方自媒体、校史校训、附属医院、办事去处。
 *
 * 内容原则（重要，别破坏）：
 *   1. 只写**能从学校官网核实**的东西。核定来源标在条目的 src 字段里。
 *   2. 不写会变化的具体数字（食堂几点开、宿舍几人间、报修电话、水电费）。
 *      这类信息我无法验证，写错比不写更糟 —— 用户会照着错的去跑一趟。
 *   3. 网址一律写官方域名；第三方转载站不收录。
 *   4. 每条都提醒「以学校官方最新通知为准」，因为学校会改域名、改入口。
 */

const WIKI = (() => {
  const K_MINE = 'xxmu_wiki_mine';   // 用户自己补的条目（JSON 数组）

  /* ---------------- 内置条目 ----------------
   * cat: 分类；t: 标题；b: 正文段落；src: 核实来源
   * u: 可点击的官方链接（可选） */
  const BUILTIN = [
    /* ========== 学校概况 ========== */
    {
      cat: '学校概况',
      t: '学校基本情况和地址',
      b: [
        '河南医药大学位于河南省新乡市，是河南省唯一独立设置的公办西医本科院校，河南省特色骨干学科和博士学位授予重点立项建设高校。',
        '地址：河南省新乡市红旗区金穗大道 601 号，邮编 453003。',
        '现有教职工 1.4 万余人（含 5 所临床学院），各类在校生 2.7 万余人，附属医院 14 所。',
        '本科专业 39 个，涵盖医学、理学、管理学、工学、文学、法学、教育学 7 个学科门类。',
        '临床医学、药理与毒理学等 8 个学科进入 ESI 全球前 1%。',
      ],
      src: '学校官网「学校简介」，数据截至 2026 年 9 月',
      u: 'https://www.xxmu.edu.cn/xxgk1/xxjj.htm',
    },
    {
      cat: '学校概况',
      t: '校名变更：新乡医学院 → 河南医药大学',
      b: [
        '学校前身可追溯到 1896 年在卫辉开办的西医诊所，医学教育始于 1922 年惠民医院护士学校。',
        '1950 年成立平原省医科学校，1962 年更名豫北医学专科学校，1982 年升格本科并更名新乡医学院。',
        '2025 年 6 月，经教育部批复更名为河南医药大学；同年 8 月获批研究生推免资格高校。',
        '所以在老资料、老网址、学长学姐口中看到的「新乡医学院」「新医」指的都是这所学校。',
        '域名 xxmu.edu.cn 就是「新乡医学院」的缩写，更名后没有换域名 —— 这就是为什么学校网址看起来还是老名字。',
      ],
      src: '教育部更名批复函 + 学校官网「历史沿革」',
      u: 'https://www.xxmu.edu.cn/xxgk1/lsyg.htm',
    },
    {
      cat: '学校概况',
      t: '校训与学校精神',
      b: [
        '校训：明德博学，精业济世。',
        '新时代学校精神：求是、精进、求新、超越。',
        '新时代校风：团结、奋进、自信、开放。',
      ],
      src: '学校官网「学校简介」「校园文化核心理念」',
      u: 'https://www.xxmu.edu.cn/xxgk1/xywhhxln1.htm',
    },
    {
      cat: '学校概况',
      t: '校历在哪看',
      b: [
        '每学年的校历（开学、考试周、放假时间）由学校官网发布，在「学校概况 → 校历」栏目里。',
        '校历和教务系统里的教学周不一定完全对齐，遇到调休、运动会会临时调整。',
        '本 App 的周次是按你设置的开学日推算的。如果和校历差一周，在「我的 → 学期设置」里把开学日前或后挪 7 天即可。',
      ],
      src: '学校官网「校历」栏目',
      u: 'https://www.xxmu.edu.cn/xxgk1/xl.htm',
    },

    /* ========== 官方入口 ========== */
    {
      cat: '官方入口',
      t: '常用网站一览（官网 / 一网通办 / 邮箱）',
      b: [
        '学校官网：www.xxmu.edu.cn —— 通知公告、校历、新闻都从这里发。',
        '一网通办：ehall.xxmu.edu.cn —— 各类线上办事的统一入口，很多流程在这里发起。',
        '校园 AI：ai.xxmu.edu.cn/chat —— 学校提供的 AI 助手，用统一身份认证登录。',
        '电子邮箱：mail.hamu.edu.cn（学生邮箱另有 xzmail.xxmu.edu.cn 入口）。',
        '以上入口在官网首页顶部和底部图标栏都能直接点到，域名记不住就从官网首页进。',
      ],
      src: '学校官网首页「一网通办 / 校园AI / 电子邮箱」快捷入口',
      u: 'https://www.xxmu.edu.cn/',
    },
    {
      cat: '官方入口',
      t: '教务系统',
      b: [
        '教务系统是查课表、选课、查成绩、评教、报名考试的地方，登录用学号 + 密码。',
        '本 App 的「登录教务」打开的就是学校官方登录页，你在官方页面上输密码，App 不接触你的密码。',
        '青果教务（qgjw.xxmu.edu.cn）需要图形验证码，这是学校页面本身的机制，App 只负责把页面显示出来。',
        '教务系统经常在选课、查成绩的高峰期卡顿，这不是 App 的问题，错峰登录会好很多。',
      ],
      src: '学校官网「教务管理」入口',
      u: 'https://www.xxmu.edu.cn/jwb',
    },
    {
      cat: '官方入口',
      t: '图书馆 / 财务 / 后勤 / 迎新',
      b: [
        '图书馆：从官网「图书资源」进，借阅、续借、电子资源都在里面。',
        '财务平台：cwcx.xxmu.edu.cn —— 学费缴纳、缴费记录查询。',
        '后勤大厅：zhhq.xxmu.edu.cn —— 宿舍报修、后勤服务相关。',
        '迎新系统：yx.xxmu.edu.cn —— 新生报到、宿舍分配等。',
        '这些入口的域名学校改过几次，从官网首页底部的图标栏进最保险，不要存旧链接。',
      ],
      src: '学校官网首页底部快捷入口图标栏',
      u: 'https://www.xxmu.edu.cn/',
    },
    {
      cat: '官方入口',
      t: '学习通（超星）',
      b: [
        '很多课程的课件、作业、考试、签到都在学习通上，用学号登录。',
        '学习通不是学校自建平台，是第三方（超星）提供的，所以它的网址、App 界面和学校官网完全不是一套。',
        '本 App「学习」页的作业和考试数据来自你的学习通账号，点进去是 App 内置的学习通页面。',
        '学习通偶尔会改版导致作业链接失效，遇到报错就在「学习」页点「重新检查」。',
      ],
      src: '课程实际使用情况',
    },

    /* ========== 官方自媒体 ========== */
    {
      cat: '官方自媒体',
      t: '学校官方微信 / 微博 / 抖音',
      b: [
        '学校官网首页底部有「官方微信」「官方微博」「官方抖音」三个二维码，扫码关注即可。',
        '这三个是学校党委宣传部维护的主号，重要通知（放假、开学、评优、招聘）都会同步发。',
        '注意区分「学校官方号」和「各学院/社团/招生办自己的号」—— 后者只发本部门的事，不代表全校。',
        '网上有很多名字像「河南医药大学表白墙」「河医大百事通」的账号，那些都是学生自建的非官方号，信息未经核实。',
      ],
      src: '学校官网首页底部「官方微信 / 官方微博 / 官方抖音」二维码',
      u: 'https://www.xxmu.edu.cn/',
    },
    {
      cat: '官方自媒体',
      t: '招生办的联系方式和账号',
      b: [
        '招生办公室电话：0373-3029485。',
        '招生咨询 QQ：3527049930。',
        '招生办抖音号：xxyxyzjc。',
        '招生办微信公众号：xxyxyzsb。',
        '招生相关信息（招生章程、招生计划、往年录取分数）都在招生信息网 zjc.xxmu.edu.cn。',
        '注意：招生办的号是管招生的，在校生的日常事务（选课、成绩、宿舍）找教务处或学院教务员，不要打招生电话。',
      ],
      src: '河南医药大学招生信息网「联系方式」页',
      u: 'https://zjc.xxmu.edu.cn/zsxxw/lxwm/lxfs.htm',
    },
    {
      cat: '官方自媒体',
      t: '校报和学术刊物',
      b: [
        '《河南医药大学报》（原《新乡医学院报》）有电子版，在 xxmu.ihwrm.com 可以按期刊浏览。',
        '学报类刊物：《河南医药大学学报》《眼科新进展》《中华实用儿科临床杂志》《临床心身疾病杂志》。',
        '这些是学术刊物，本科生平时用不到，考研、保研找导师时可能要看。',
      ],
      src: '学校官网「学术刊物」「校内媒体」栏目',
      u: 'http://xxmu.ihwrm.com/',
    },

    /* ========== 院系与附属医院 ========== */
    {
      cat: '院系与附属医院',
      t: '学院和专业的设置',
      b: [
        '学校设多个二级学院和学部、书院，具体名单在官网「机构设置 → 教学单位」里。',
        '本科专业 39 个，其中国家级和省级特色专业 14 个、一流本科专业建设点 23 个。',
        '儿科学是全国首批恢复儿科专业招生的八所高校之一。',
        '智能影像工程专业连续在 2024、2025 年软科中国大学专业排名中位列全国第一。',
        '五年制医学类专业招生人数多年占河南省一半以上。',
      ],
      src: '学校官网「学校简介」「教学单位」',
      u: 'https://www.xxmu.edu.cn/jxdw.htm',
    },
    {
      cat: '院系与附属医院',
      t: '附属医院有哪些',
      b: [
        '学校有附属医院 14 所，其中官网「附属单位」栏直接列出的是：',
        '第一附属医院（xyyfy.com）、第二附属医院（河南省精神病医院）、第三附属医院、附属中心医院（新乡市中心医院）、附属人民医院（新乡市人民医院）。',
        '见习、实习的安排由各学院和临床学院对接，不通过 App 也不通过教务系统自助选择。',
        '看病用哪家：学生在校医院首诊，需要转诊时校医院会开转诊单，直接去附属医院可以按校医院的规定报销。',
      ],
      src: '学校官网「附属单位」栏目',
      u: 'https://www.xxmu.edu.cn/',
    },

    /* ========== 办事去处 ========== */
    {
      cat: '办事去处',
      t: '在校证明 / 成绩单怎么开',
      b: [
        '在校证明、成绩单一般由学院教务员或教务处出具，需要说明用途（考研、实习、签证等）。',
        '部分证明可以在教务系统里自助打印，打印后到教务处盖章。',
        '出国、考研用的成绩单常要求英文版和密封件，提前问清楚要求再跑一趟。',
        '教务处一般在行政楼，办公时间只在工作日白天，跑之前先打电话确认人在不在。',
      ],
      src: '常规高校流程，具体以教务处通知为准',
    },
    {
      cat: '办事去处',
      t: '请假 / 缓考 / 免修',
      b: [
        '请假先找辅导员，超过一定天数要学院审批，具体天数看学生手册。',
        '病假需要医院证明；缓考一般要在考试前申请，考完再补办通常不认。',
        '免修、重修、辅修都在教务系统里按学期通知的时间段申请，错过要等下一轮。',
        '所有流程走完记得留一份审批截图，出问题时有据可查。',
      ],
      src: '常规高校流程，以学生手册和学院通知为准',
    },
    {
      cat: '办事去处',
      t: '转专业 / 大类分流',
      b: [
        '转专业一般在大一结束前后开放申请，条件（成绩排名、不能挂科、不能跨批次）由学校当年文件规定。',
        '流程大致是：看通知 → 网上报名 → 资格审核 → 笔试/面试 → 公示 → 办手续。',
        '转成功后课表会变，要在教务系统里重新选课，别漏了补修。',
        '每年政策会有调整，以教务处当年发布的通知为准，别照学长的经验办。',
      ],
      src: '常规高校流程，以教务处当年通知为准',
    },
    {
      cat: '办事去处',
      t: '一卡通 / 校园卡',
      b: [
        '校园卡用于食堂、开水、洗浴、门禁、图书借阅，丢了要先挂失。',
        '挂失和补办一般在学校的卡务中心（或后勤服务大厅）办理，需要带学生证或身份证。',
        '卡里的钱和卡是绑定的，挂失后原卡余额可以转到新卡，具体问卡务中心。',
        '食堂刷卡机和饮水机是两套系统，饮水机的钱在「慧生活798」里，不是校园卡余额。',
      ],
      src: '常规高校流程，以后勤通知为准',
    },
    {
      cat: '办事去处',
      t: '宿舍报修',
      b: [
        '水电、门窗、床铺、网络故障分开报：水电和家具一般找宿管或后勤维修（后勤大厅 zhhq.xxmu.edu.cn），网络找网络中心。',
        '报修时说清楚楼栋、房间号、具体坏了什么，最好拍张照片。',
        '紧急情况（漏水、跳闸、门锁坏了进不去）直接找宿管值班室，比线上报修快。',
      ],
      src: '常规高校流程，以后勤通知为准',
    },
    {
      cat: '办事去处',
      t: '快递在哪取',
      b: [
        '校内快递点通常在生活区或超市附近，不同快递公司可能不在同一个点。',
        '取件要报手机号后四位或取件码，部分代收点会核对身份。',
        '大件（行李、家电）建议直接寄到驿站并当天取，代收点存放时间有限。',
      ],
      src: '校园生活常识，具体点位每学期可能变化',
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

  /** 全部条目：内置 + 用户补充 */
  function all() {
    return BUILTIN.map((x, i) => ({
      id: 'b' + i, cat: x.cat, t: x.t, b: x.b, src: x.src, u: x.u, mine: false,
    })).concat(loadMine().map((x, i) => ({
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
    const box = document.getElementById('wikiBody');
    if (!box) return;
    box.innerHTML = '';

    const inp = document.getElementById('wikiSearch');
    const kw = ((inp && inp.value) || '').trim();

    /* 校园图片墙永远排在最前面（不在搜索时）。
     * 为什么放最前：这是全校学生上传、管理员审过的实景照，是这一页里
     * 唯一「只有本校人才拍得到」的内容。文字条目哪都能搜到，照片不能。 */
    if (!kw) {
      box.appendChild(photosSection());
      box.appendChild(fbSection());
    }

    // 有搜索词就直接出结果列表，不出分类
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
      '资料来自学校官网公开信息。学校会改域名、改入口、改政策，涉及具体时间、电话、金额的，以学校官方最新通知为准。'));
  }

  function card(x) {
    const b = el('div', 'wiki-card' + (x.mine ? ' mine' : ''));
    b.appendChild(el('div', 'wiki-t', x.t));
    if (x.mine) b.appendChild(el('span', 'wiki-tag', '我补充'));
    /* NOVA 剪报抽屉（nova-organs.js）只从真实卡片 DOM 取数据：把整条原始资料
       挂到节点上，抽屉就能原样渲染正文 / 来源 / 官方链接，不用另造一份数据，
       也不必把 IIFE 里的 find()/open() 暴露到 window。经典皮肤完全无感。 */
    b.__wiki = x;
    b.onclick = () => open(x.id);
    return b;
  }

  /* ================= 校园图片墙（v1.1.6） =================
   *
   * 数据流：学生拍照 → Java 侧压缩到 ≤1600px → POST /v1/photo →
   *        进待审队列 → 管理员在「管理控制台 → 审核」点通过 → 出现在这里。
   *
   * 为什么必须人工审核：这是给全校看的公开页面，一张不合适的图
   * （隐私、恶搞、广告）挂上去，删得再快也已经被人截图了。
   */

  let PHOTOS = [];        // 已通过的图片清单
  let PHOTOS_AT = 0;      // 上次拉取时间（秒）
  let PHOTO_TRIED = false; // 本次启动是否已试过拉取

  function photosSection() {
    const wrap = el('div', 'ph-sec');
    const head = el('div', 'ph-head');
    head.appendChild(el('span', 'ph-title', '校园实景'));
    const rph = el('button', 'pill', '↻ 刷新');
    rph.onclick = () => loadPhotos(true);
    head.appendChild(rph);
    const up = el('button', 'pill', '+ 传一张');
    up.onclick = () => startUpload();
    head.appendChild(up);
    wrap.appendChild(head);

    if (!PHOTOS.length) {
      if (PHOTO_ERR) {
        /* 拉失败 → 明确说失败，并给一个能点的重试。
         * 不能和「还没有人传过」共用一句话：那会让人以为学校没人上传，
         * 而其实是自己网断了。 */
        const box = el('div', 'ph-err');
        box.appendChild(el('p', 'hint left tight', PHOTO_ERR));
        const again = el('button', 'pill', '重试');
        again.onclick = () => { loadPhotos(true); };
        box.appendChild(again);
        wrap.appendChild(box);
      } else {
        wrap.appendChild(el('p', 'hint left tight',
          PHOTO_TRIED
            ? '还没有通过的校园图片。你拍一张传上来，管理员看完就会出现在这里。'
            : '正在加载校园图片…'));
      }
    } else {
      const grid = el('div', 'ph-grid');
      PHOTOS.forEach(p => grid.appendChild(photoCard(p)));
      wrap.appendChild(grid);
    }

    wrap.appendChild(el('p', 'hint left tight',
      '这些是同学自己拍的。上传后要管理员审核通过才会公开，只放校园实景，别放人脸和宿舍内部。'));

    if (!PHOTO_TRIED) setTimeout(loadPhotos, 60);
    return wrap;
  }

  /* 方向元数据 → 展示时转正。rot 只存 0/90/180/270，不改图片字节，
   * 所以公开墙、点开大图、拍立得照片墙都是同一个角度，且随时能改回来。
   * 只在需要旋转时套一层固定 4:3 的框兜住横竖互换；rot=0 的图走原样
   * 路径，一点都不回归（老图的宽高比、看着的样子全部保持）。 */
  function rotWrap(p, img, full) {
    const r = Number(p.rot) || 0;
    if (!r) return img;
    const f = el('div', 'img-frame' + (full ? ' img-frame-full' : ''));
    f.setAttribute('data-rot', String(r));
    f.appendChild(img);
    return f;
  }

  function photoCard(p) {
    const c = el('div', 'ph-card');
    const img = document.createElement('img');
    img.className = 'ph-img';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = p.cap || '校园图片';
    img.src = (typeof AUTH !== 'undefined' && AUTH.Photos)
      ? AUTH.Photos.url(p.k)
      /* 兜底只在 AUTH 没加载时走（浏览器里预览 web/ 会这样）。
       * 这里也写首选域名：AUTH 不在时没有探测机制可依赖，
       * 用新域名至少是对的；真在 App 里跑一定走上面那条 AUTH.Photos.url。 */
      : ('https://www.xxmuhelper.top/v1/photo?k=' + encodeURIComponent(p.k));
    /* 宽高比在服务端解析出来了就直接用，图片没到之前也占好位，
     * 不会出现「先是一行小方块，加载完整个页面跳一下」。
     * 旋转过的图宽高由 .img-frame 固定，别再按原始比例撑。 */
    if (!Number(p.rot) && p.w > 0 && p.h > 0) img.style.aspectRatio = p.w + ' / ' + p.h;
    c.appendChild(rotWrap(p, img, false));
    if (p.cap) c.appendChild(el('div', 'ph-cap', p.cap));
    c.onclick = () => openPhoto(p);
    return c;
  }

  function openPhoto(p) {
    document.getElementById('sh-name').textContent = p.cap || '校园图片';
    const body = document.getElementById('sh-body');
    body.innerHTML = '';
    const img = document.createElement('img');
    img.className = 'ph-full';
    img.alt = p.cap || '校园图片';
    img.src = (typeof AUTH !== 'undefined' && AUTH.Photos)
      ? AUTH.Photos.url(p.k) : '';
    body.appendChild(rotWrap(p, img, true));
    if (p.cap) body.appendChild(el('p', 'wiki-p', p.cap));
    document.getElementById('sheet').classList.add('on');
  }

  /* 单飞 + 时间窗。一次启动里 loadPhotos 会被叫三次：init() 里的定时器、
   * photosSection() 里的定时器、以及 App 侧的双重 WIKI.init（v1.1.6 前）。
   * 三条都走 edgeCache，命中时只是白跑一趟往返；一旦 cache miss（刚发图、
   * 刚 purge），就是三次回源读 ph:idx + KV 字节。这里保证同一时刻只有
   * 一个请求在飞，且 60 秒内不重复拉。 */
  let PHOTO_INFLIGHT = null;
  let PHOTO_ERR = '';
  let PHOTO_FP = '';
  /* 单飞 + 60 秒时间窗仍在；v1.1.62 多一条「指纹」：轮询/手动刷新拿到
   * 一模一样的清单就别 render —— render 会整页重建 DOM，打断正在输入的
   * 搜索词和已打开的大图弹层。 */
  function loadPhotos(force) {
    if (!force && PHOTO_TRIED && (Math.floor(Date.now() / 1000) - PHOTOS_AT) < 60) return PHOTO_INFLIGHT || Promise.resolve();
    if (PHOTO_INFLIGHT) return PHOTO_INFLIGHT;
    PHOTO_TRIED = true;
    PHOTO_ERR = '';
    if (typeof AUTH === 'undefined' || !AUTH.Photos) { render(); return Promise.resolve(); }
    PHOTO_INFLIGHT = AUTH.Photos.list().then(res => {
      /* 服务端返回的字段叫 rows，不是 list。两个都接，免得改名静默失效。 */
      const arr = res && res.ok ? (res.rows || res.list) : null;
      if (Array.isArray(arr)) {
        const fp = JSON.stringify(arr);
        PHOTOS = arr;
        PHOTOS_AT = Math.floor(Date.now() / 1000);
        if (fp !== PHOTO_FP) { PHOTO_FP = fp; render(); }
      } else {
        PHOTO_ERR = '服务器返回的内容看不懂，点重试';
        PHOTO_TRIED = false;
        PHOTO_FP = '';
        render();
      }
    }, (e) => {
      /* v1.1.8：失败不能把 PHOTO_TRIED 留在 true，否则再不重试，要杀 App。 */
      PHOTOS = [];
      PHOTO_ERR = '校园图片没拉到（' + (typeof errText === 'function' ? errText(e) : String(e)) + '）';
      PHOTO_TRIED = false;
      PHOTO_FP = '';
      render();
    }).then(() => {
      PHOTO_INFLIGHT = null;
    });
    return PHOTO_INFLIGHT;
  }

  /** 开始上传：先问一句说明，再交给 Java 侧开相册 */
  function startUpload() {
    if (typeof Host === 'undefined' || !Host.pickPhotoForUpload) {
      XXMU.toast('这个版本还不支持上传，更新一下 App');
      return;
    }
    /* 说明文字自己收集：WebView 里 prompt() 默认返回 null（Android 的
     * WebChromeClient 不实现 prompt 对话框），以前「补一条」点了没反应
     * 就是这个原因。图片说明改用页面内输入，不再用 prompt。 */
    document.getElementById('sh-name').textContent = '上传校园图片';
    const body = document.getElementById('sh-body');
    body.innerHTML = '';
    body.appendChild(el('p', 'wiki-p',
      '选一张校园实景照片。会自动压到长边 1600 像素再传，一张通常只有几百 KB，不费多少流量。'));
    body.appendChild(el('p', 'hint left tight',
      '别拍人脸和宿舍内部，别带个人信息。上传后要管理员审核，通过了才会公开。'));

    const lab = el('label', 'gate-label', '图片说明（可留空，例如「三教楼下樱花」）');
    body.appendChild(lab);
    const inp = document.createElement('input');
    inp.className = 'fr-input';
    inp.type = 'text';
    inp.maxLength = 40;
    inp.placeholder = '这是什么地方';
    body.appendChild(inp);

    const go = el('button', 'btn', '选照片');
    const st = el('div', 'gate-err');
    go.onclick = () => {
      go.disabled = true;
      go.textContent = '正在打开相册…';
      const sid = (typeof LICENSE !== 'undefined' && LICENSE.accounts)
        ? (LICENSE.accounts().id || '') : '';
      try { Host.pickPhotoForUpload((inp.value || '').trim(), sid); } catch (e) {
        go.disabled = false;
        go.textContent = '选照片';
        st.textContent = '打不开相册：' + (e && e.message ? e.message : e);
      }
    };
    body.appendChild(go);
    body.appendChild(st);
    document.getElementById('sheet').classList.add('on');

    window.__PHOTO_UI = { btn: go, msg: st };
  }

  /* Java 侧回调：window.__onPhotoProgress(stage) / __onPhotoUploaded(ok, msg, st) */
  window.__onPhotoProgress = function (stage) {
    const ui = window.__PHOTO_UI;
    if (!ui || !ui.btn) return;
    ui.btn.textContent = stage === 'compress' ? '正在压缩…' : '正在上传…';
  };

  window.__onPhotoUploaded = function (ok, msg, st) {
    const ui = window.__PHOTO_UI;
    if (ui && ui.btn) {
      ui.btn.disabled = false;
      ui.btn.textContent = '选照片';
    }
    if (ok) {
      if (ui && ui.msg) ui.msg.textContent = msg || '已提交，等管理员审核。';
      XXMU.toast(msg || '已提交，等管理员审核');
      setTimeout(() => {
        const sheet = document.getElementById('sheet');
        if (sheet) sheet.classList.remove('on');
      }, 1400);
    } else if (ui && ui.msg) {
      ui.msg.textContent = msg || '上传失败';
    } else {
      XXMU.toast(msg || '上传失败');
    }
  };

  /* ================= 留言板（v1.1.6） =================
   *
   * 为什么做：大部分同学不想为了一句反馈去加 QQ 群。加了群要验证、
   * 要暴露 QQ 号、还要看别人聊天。这里发一条就走，管理员回了就出现在
   * 下面的公开列表里。
   *
   * 隐私取舍：公开列表只显示**管理员已经回复**的留言，且学号只露后四位。
   * 因为留言里常带「我是 3 号楼 512 的」「我电话 138…」这类内容，
   * 全公开等于把学生隐私摆到墙上。
   */

  let FBS = [];
  let FB_TRIED = false;
  let FB_AT = 0;

  function fbSection() {
    const wrap = el('div', 'fb-sec');
    const head = el('div', 'ph-head');
    head.appendChild(el('span', 'ph-title', '留言板'));
    const rfb = el('button', 'pill', '↻ 刷新');
    rfb.onclick = () => loadFeedback(true);
    head.appendChild(rfb);
    const go = el('button', 'pill', '+ 说两句');
    go.onclick = () => composeFeedback();
    head.appendChild(go);
    wrap.appendChild(head);

    wrap.appendChild(el('p', 'hint left tight',
      '想加功能、发现 bug、资料有错，都可以在这里说，不用加群。管理员回复后会显示在下面。'));

    if (!FBS.length) {
      if (FB_ERR) {
        const box = el('div', 'ph-err');
        box.appendChild(el('p', 'hint left tight', FB_ERR));
        const again = el('button', 'pill', '重试');
        again.onclick = () => { loadFeedback(true); };
        box.appendChild(again);
        wrap.appendChild(box);
      } else if (FB_TRIED) {
        wrap.appendChild(el('p', 'hint left tight', '还没有公开的留言。'));
      }
    } else {
      const list = el('div', 'fb-list');
      FBS.forEach(f => list.appendChild(fbCard(f)));
      wrap.appendChild(list);
    }

    if (!FB_TRIED) setTimeout(loadFeedback, 80);
    return wrap;
  }

  function fbCard(f) {
    const c = el('div', 'fb-card');
    const top = el('div', 'fb-top');
    top.appendChild(el('span', 'fb-from', f.from || '匿名'));
    top.appendChild(el('span', 'fb-kind', f.kind || '其它'));
    if (f.at) top.appendChild(el('span', 'fb-at', fmtAt(f.at)));
    c.appendChild(top);
    c.appendChild(el('div', 'fb-text', f.text || ''));
    if (f.reply) {
      const r = el('div', 'fb-reply');
      r.appendChild(el('div', 'fb-reply-t', '管理员回复'));
      r.appendChild(el('div', 'fb-reply-b', f.reply));
      c.appendChild(r);
    }
    return c;
  }

  function fmtAt(t) {
    const d = new Date(t * 1000);
    const p = n => (n < 10 ? '0' + n : '' + n);
    return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  let FB_ERR = '';
  let FB_INFLIGHT = null;
  let FB_FP = '';
  function loadFeedback(force) {
    /* 与 loadPhotos 同构：单飞 + 60 秒时间窗 + 失败可重试 + 无变化不重绘。 */
    if (!force && FB_TRIED && (Math.floor(Date.now() / 1000) - FB_AT) < 60) return FB_INFLIGHT || Promise.resolve();
    if (FB_INFLIGHT) return FB_INFLIGHT;
    FB_TRIED = true;
    FB_ERR = '';
    if (typeof AUTH === 'undefined' || !AUTH.Feedback) { render(); return Promise.resolve(); }
    FB_INFLIGHT = AUTH.Feedback.list().then(res => {
      const arr = res && res.ok ? (res.rows || res.list) : null;
      if (Array.isArray(arr)) {
        const fbp = JSON.stringify(arr);
        FBS = arr;
        FB_AT = Math.floor(Date.now() / 1000);
        if (fbp !== FB_FP) { FB_FP = fbp; render(); }
      } else {
        FB_ERR = '服务器返回的内容看不懂，点重试';
        FB_TRIED = false;
        FB_FP = '';
        render();
      }
    }, (e) => {
      FBS = [];
      FB_ERR = '留言没拉到（' + (typeof errText === 'function' ? errText(e) : String(e)) + '）';
      FB_TRIED = false;
      FB_FP = '';
      render();
    }).then(() => {
      FB_INFLIGHT = null;
    });
    return FB_INFLIGHT;
  }

  function composeFeedback() {
    document.getElementById('sh-name').textContent = '给管理员留言';
    const body = document.getElementById('sh-body');
    body.innerHTML = '';
    body.appendChild(el('p', 'wiki-p',
      '不用加群，写在这里就行。管理员看到会回复，回复后会公开显示在留言板（学号只露后四位）。'));

    body.appendChild(el('label', 'gate-label', '类型'));
    const kinds = ['优化建议', 'bug', '内容纠错', '其它'];
    let kind = '优化建议';
    const seg = el('div', 'seg');
    kinds.forEach((k, i) => {
      const b = el('button', k, k);
      if (i === 0) b.classList.add('on');
      b.onclick = () => {
        kind = k;
        seg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
      };
      seg.appendChild(b);
    });
    body.appendChild(seg);

    body.appendChild(el('label', 'gate-label', '想说的话'));
    const ta = document.createElement('textarea');
    ta.className = 'adm-in';
    ta.rows = 5;
    ta.maxLength = 500;
    ta.spellcheck = false;
    ta.placeholder = '例如：课表能不能支持左右滑动切周？现在只能点上面的箭头。';
    body.appendChild(ta);

    body.appendChild(el('label', 'gate-label', '联系方式（可留空，方便我找你确认）'));
    const ct = document.createElement('input');
    ct.className = 'fr-input';
    ct.type = 'text';
    ct.maxLength = 60;
    ct.placeholder = 'QQ / 微信 / 邮箱，随便留一个';
    body.appendChild(ct);

    const go = el('button', 'btn', '发送');
    const st = el('div', 'gate-err');
    go.onclick = () => {
      const txt = (ta.value || '').trim();
      if (txt.length < 2) { st.textContent = '至少写两个字'; return; }
      if (txt.length > 500) { st.textContent = '太长了，500 字以内'; return; }
      /* 守卫必须写在 disable 之前。
       *
       * 同文件的 startUpload 一直有这个守卫，这里没有：AUTH 未定义时
       * `AUTH.Feedback.post(...)` 同步抛 ReferenceError，then 挂不上，
       * 下面两处「恢复按钮」的代码永远不执行 —— 按钮永久停在「发送中…」，
       * 用户只能关掉弹层重开。 */
      if (typeof AUTH === 'undefined' || !AUTH.Feedback) {
        st.textContent = '这个版本还不支持留言，更新一下 App';
        return;
      }
      go.disabled = true;
      go.textContent = '发送中…';
      const sid = (typeof LICENSE !== 'undefined' && LICENSE.accounts)
        ? (LICENSE.accounts().id || '') : '';
      let req;
      try {
        req = AUTH.Feedback.post(txt, kind, (ct.value || '').trim(), sid);
      } catch (err) {
        go.disabled = false;
        go.textContent = '发送';
        st.textContent = '发送失败：' + (err && err.message ? err.message : err);
        return;
      }
      req.then(res => {
        go.disabled = false;
        go.textContent = '发送';
        if (res && res.ok) {
          st.textContent = '已发送，谢谢';
          XXMU.toast('已发送，管理员看到会回你');
          ta.value = '';
          ct.value = '';
          setTimeout(() => {
            const sheet = document.getElementById('sheet');
            if (sheet) sheet.classList.remove('on');
          }, 1200);
        } else {
          st.textContent = (res && res.msg) || '发送失败，稍后再说？';
        }
      }, e => {
        go.disabled = false;
        go.textContent = '发送';
        st.textContent = '发送失败：' + (e && e.message ? e.message : '网络问题');
      });
    };
    body.appendChild(go);
    body.appendChild(st);
    document.getElementById('sheet').classList.add('on');
  }

  function open(id) {
    const x = find(id);
    if (!x) return;
    document.getElementById('sh-name').textContent = x.t;
    const body = document.getElementById('sh-body');
    body.innerHTML = '';
    body.appendChild(el('div', 'wiki-cat2', x.cat));
    x.b.forEach(p => body.appendChild(el('p', 'wiki-p', p)));

    /* 官方链接：只在有 u 字段时出现，点了用系统浏览器打开。
     * 为什么给链接：这一页的条目大多是「去哪办、怎么看」，光有文字描述
     * 用户还得自己搜一遍网址，直接给出口更省事。 */
    if (x.u) {
      const go = el('button', 'btn soft', '打开官方页面');
      go.onclick = () => {
        if (typeof Host !== 'undefined' && Host.openUrl) Host.openUrl(x.u);
      };
      body.appendChild(go);
    }

    if (x.src) {
      const s = el('p', 'wiki-src', '来源：' + x.src);
      body.appendChild(s);
    }

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

  /* ---------------- 用户补充 ---------------- */

  /* v1.1.6：不再用 prompt()。
   *
   * 血案：Android WebView 默认的 WebChromeClient **不实现 prompt 对话框**，
   * 所以 prompt() 直接返回 null —— 用户点「+ 补一条」，界面毫无反应，
   * 什么也没发生，也没有报错。这个功能从上线起就是死的，只是没人报过。
   * 现在改成页面内表单（和留言板、传图同一个交互）。
   */
  function addMine() {
    document.getElementById('sh-name').textContent = '补一条校园资料';
    const body = document.getElementById('sh-body');
    body.innerHTML = '';
    body.appendChild(el('p', 'wiki-p',
      '你补的条目只存在这台手机上，不会上传。适合记「三教 302 有插座」这种官方资料里没有的信息。'));

    body.appendChild(el('label', 'gate-label', '标题'));
    const ti = document.createElement('input');
    ti.className = 'fr-input';
    ti.type = 'text';
    ti.maxLength = 60;
    ti.placeholder = '例如：三教 302 有插座';
    body.appendChild(ti);

    body.appendChild(el('label', 'gate-label', '分类'));
    const catSel = document.createElement('select');
    catSel.className = 'fr-input';
    const CATS = ['办事去处', '学校概况', '官方入口', '官方自媒体', '院系与附属医院', '我补充的'];
    CATS.forEach(c => {
      const o = document.createElement('option');
      o.value = c;
      o.textContent = c;
      catSel.appendChild(o);
    });
    body.appendChild(catSel);

    body.appendChild(el('label', 'gate-label', '内容'));
    const ta = document.createElement('textarea');
    ta.className = 'adm-in';
    ta.rows = 4;
    ta.maxLength = 600;
    ta.spellcheck = false;
    ta.placeholder = '一段话就行';
    body.appendChild(ta);

    const go = el('button', 'btn', '存到本机');
    const st = el('div', 'gate-err');
    go.onclick = () => {
      const t = (ti.value || '').trim();
      if (!t) { st.textContent = '标题不能空'; return; }
      const txt = (ta.value || '').trim();
      if (!txt) { st.textContent = '内容不能空'; return; }
      const list = loadMine();
      list.push({
        t: t,
        cat: (catSel.value || '我补充的'),
        b: [txt],
        at: Math.floor(Date.now() / 1000),
      });
      saveMine(list);
      document.getElementById('sheet').classList.remove('on');
      render();
      XXMU.toast('已存在本机');
    };
    body.appendChild(go);
    body.appendChild(st);
    document.getElementById('sheet').classList.add('on');
  }

  /** 导出成纯文本，方便发群里 */
  function exportText() {
    const lines = ['# 河南医药大学 · 校园 WIKI 导出', ''];
    cats().forEach(cat => {
      lines.push('## ' + cat);
      byCat(cat).forEach(x => {
        lines.push('');
        lines.push('### ' + x.t);
        x.b.forEach(p => lines.push(p));
        if (x.u) lines.push('链接：' + x.u);
        if (x.src) lines.push('来源：' + x.src);
      });
      lines.push('');
    });
    return lines.join('\n');
  }

  let inited = false;

  function init() {
    /* 必须幂等：app.js 底部无条件 init 一次，Gate.boot() 走 __onUnlocked
     * 又 init 一次。onclick 重复赋值无害，但 addEventListener 会叠成两份，
     * 结果是一次输入触发两次 render（每次都重建整页 DOM，长列表下能看出卡顿）。 */
    if (inited) return;
    inited = true;
    const s = document.getElementById('wikiSearch');
    if (s) {
      s.addEventListener('input', render);
      s.addEventListener('search', render);
    }
    const add = document.getElementById('wikiAdd');
    if (add) add.onclick = addMine;
    const exp = document.getElementById('wikiExport');
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
    /* v1.1.62：管理员审核通过 / 回复留言后，已经开着 WIKI 页没退出的
     * 同学原本要杀 App 重进才看得到。挂一个 3 分钟轮询，只在
     * 「WIKI 页可见 + 没在搜索 + App 在前台」时才拉，省流量。 */
    try {
      setInterval(() => {
        if (document.hidden) return;
        const top = document.getElementById('top');
        if (top && top.dataset.page && top.dataset.page !== 'wiki') return;
        const s = document.getElementById('wikiSearch');
        if (s && (s.value || '').trim()) return;
        loadPhotos(true);
        loadFeedback(true);
      }, 180000);
      /* 从后台切回前台，距上次超过 30 秒就顺手拉一次，不用等满 3 分钟。 */
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        const now = Math.floor(Date.now() / 1000);
        if (now - PHOTOS_AT >= 30) loadPhotos(true);
        if (now - FB_AT >= 30) loadFeedback(true);
      });
    } catch (e) {}
    /* 图片和留言的拉取交给 photosSection() / fbSection() 自己在首帧后触发
     * （它们各自有 `!PHOTO_TRIED` / `!FB_TRIED` 守卫）。
     *
     * 原来这里还有两条 setTimeout(loadPhotos, 300) / setTimeout(loadFeedback, 500)，
     * 再加上 App 侧在 v1.1.6 里会调两次 WIKI.init()，一次启动能把
     * /v1/photos 打三遍、/v1/feedback 打两遍。命不命中边缘缓存都亏：
     * 命中是白跑往返，未命中就是三次回源读 ph:idx + KV 字节。
     * 现在只在「渲染到那一段」时才拉，且 loadPhotos 自带单飞与 60 秒时间窗。 */
  }

  return {
    init, render, all, cats, byCat, find, open, addMine, exportText,
    loadPhotos, loadFeedback, composeFeedback, startUpload,
    photos: () => PHOTOS, feedbacks: () => FBS,
  };
})();
