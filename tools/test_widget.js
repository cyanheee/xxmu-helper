/* 桌面小组件的时间算术（WidgetClock.java）离线测试 —— v2.10.0
 *
 * 跑法：node tools/test_widget.js
 *
 * 做法和别的 test_*.js 不一样：那些用 vm 沙箱跑 JS，这里直接把
 * android/src/com/xxmu/helper/WidgetClock.java 编译成 class、再配一个
 * 临时 Main 类用 java 跑真断言 —— 因为要测的就是 Java 里的算术。
 *
 * 为什么做得到：WidgetClock 故意不 import 任何 Android / JSON / RemoteViews，
 * 只有一个 package 声明。抽它出来的全部理由就是这个（见该文件头注释）。
 *
 * 三件必须测到的事：
 *   1. 钟点读不出来时绝不自己编时间（宁可整块放弃）；
 *   2. 下课那一分钟算「已上完」、上课那一分钟算「正在上」（与 web/nowline.js 同一口径）；
 *   3. 副标题四档文案与实际状态一致 —— 说「下节 08:50」时，那节必须真的是下一节。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const JAVA_DIR = path.join(ROOT, 'android', 'src', 'com', 'xxmu', 'helper');
const CLOCK = path.join(JAVA_DIR, 'WidgetClock.java');
const WIDGET = path.join(JAVA_DIR, 'ClassWidget.java');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, label, extra) {
  if (cond) { pass++; return; }
  fail++;
  fails.push(label + (extra === undefined ? '' : ('  →  ' + extra)));
}

/* ── 第一步：源码纪律（先查，免得白编译） ────────────────────────── */

const clockSrc = fs.readFileSync(CLOCK, 'utf8');
const widgetSrc = fs.readFileSync(WIDGET, 'utf8');

/* 剥注释再判：WidgetClock 的文件头正好写着「不需要 RemoteViews」，
 * 不剥注释就会被自己的说明文字判红（这个坑在 check_web / check_apk_inside 里已经踩过四次）。 */
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const clockCode = strip(clockSrc);
const widgetCode = strip(widgetSrc);

ok(/^package com\.xxmu\.helper;/m.test(clockCode), 'WidgetClock 有 package 声明');
ok(!/^import\s+android\./m.test(clockCode), 'WidgetClock 不 import 任何 android.*（否则不能裸 javac 跑）');
ok(!/^import\s+org\.json\./m.test(clockCode), 'WidgetClock 不 import org.json.*');
ok(!/RemoteViews/.test(clockCode), 'WidgetClock 不碰 RemoteViews');
ok(!/\bContext\b/.test(clockCode), 'WidgetClock 不碰 Context');

ok(widgetSrc.indexOf('WidgetClock.subText(') > 0, 'ClassWidget 副标题走 WidgetClock.subText');
ok(widgetSrc.indexOf('WidgetClock.colorOf(') > 0, 'ClassWidget 行色走 WidgetClock.colorOf');
ok(widgetSrc.indexOf('WidgetClock.markOf(') > 0, 'ClassWidget 记号走 WidgetClock.markOf');
ok(widgetSrc.indexOf('WidgetClock.stateOf(') > 0, 'ClassWidget 状态走 WidgetClock.stateOf');
ok(widgetSrc.indexOf('WidgetClock.build(') > 0, 'ClassWidget 作息表走 WidgetClock.build');

/* 老的重复实现必须已经删干净，否则两套逻辑会各自漂移 */
const wCode = widgetCode;
ok(wCode.indexOf('private static int[] parseSeg') < 0, 'ClassWidget 里没有第二份 parseSeg');
ok(wCode.indexOf('private static String span') < 0, 'ClassWidget 里没有第二份 span');
ok(wCode.indexOf('private static String hm') < 0, 'ClassWidget 里没有第二份 hm');
ok(wCode.indexOf('private static int minuteOf') < 0, 'ClassWidget 里没有第二份 minuteOf');
ok(wCode.indexOf('START_DEFAULT') < 0, 'ClassWidget 里没有硬编码开学日 START_DEFAULT');
/* 「今天没课，去玩吧」只许在「确实查到课表且今天真的没课」的分支里出现：
 * 周次算不出来时不许走到那句（那是老版本撒谎的地方）。 */
ok(wCode.indexOf('还没设开学日') > 0, '没设开学日时说的是「还没设开学日」');
ok(wCode.indexOf('已经上完了') > 0, '超出总周数时说的是「已经上完了」');

/* ── 第二步：真编译 + 真跑 ──────────────────────────────────────── */
const MAIN = `package com.xxmu.helper;

public final class WidgetClockTestMain {
    static int pass = 0, fail = 0;
    static StringBuilder bad = new StringBuilder();

    static void ok(boolean c, String label) {
        if (c) { pass++; return; }
        fail++;
        bad.append("FAIL ").append(label).append('\\n');
    }
    static void eq(Object a, Object b, String label) {
        boolean same = (a == null) ? (b == null) : a.equals(b);
        ok(same, label + (same ? "" : ("  →  实际 " + a + " / 期望 " + b)));
    }

    public static void main(String[] args) {
        /* —— minuteOf —— */
        eq(WidgetClock.minuteOf("08:00"), 480, "minuteOf 08:00");
        eq(WidgetClock.minuteOf("8:00"), 480, "minuteOf 8:00");
        eq(WidgetClock.minuteOf("00:00"), 0, "minuteOf 00:00");
        eq(WidgetClock.minuteOf("24:00"), 1440, "minuteOf 24:00");
        eq(WidgetClock.minuteOf(" 09:05 "), 545, "minuteOf 带空格");
        eq(WidgetClock.minuteOf("24:30"), -1, "minuteOf 24:30 非法");
        eq(WidgetClock.minuteOf("08:60"), -1, "minuteOf 08:60 非法");
        eq(WidgetClock.minuteOf("0800"), -1, "minuteOf 无冒号非法");
        eq(WidgetClock.minuteOf(""), -1, "minuteOf 空串");
        eq(WidgetClock.minuteOf(null), -1, "minuteOf null");

        /* —— parseSeg —— */
        int[] a = WidgetClock.parseSeg("08:00~08:40");
        ok(a != null && a[0] == 480 && a[1] == 520, "parseSeg 波浪号");
        int[] b = WidgetClock.parseSeg("08:00-08:40");
        ok(b != null && b[0] == 480 && b[1] == 520, "parseSeg 连字符");
        int[] c = WidgetClock.parseSeg("8:00～8:40");
        ok(c != null && c[0] == 480 && c[1] == 520, "parseSeg 全角波浪");
        int[] d = WidgetClock.parseSeg("08:00–08:40");
        ok(d != null && d[0] == 480 && d[1] == 520, "parseSeg en dash");
        int[] e = WidgetClock.parseSeg("08:00—08:40");
        ok(e != null && e[0] == 480 && e[1] == 520, "parseSeg em dash");
        ok(WidgetClock.parseSeg("08:40~08:00") == null, "parseSeg 结束早于开始 → null");
        ok(WidgetClock.parseSeg("08:00~08:00") == null, "parseSeg 起止相同 → null");
        ok(WidgetClock.parseSeg("0800") == null, "parseSeg 无分隔符 → null");
        ok(WidgetClock.parseSeg("~08:40") == null, "parseSeg 缺前半 → null");
        ok(WidgetClock.parseSeg("08:00~") == null, "parseSeg 缺后半 → null");
        ok(WidgetClock.parseSeg("") == null, "parseSeg 空串 → null");
        ok(WidgetClock.parseSeg(null) == null, "parseSeg null → null");

        /* —— build —— */
        String[] segs = {"08:00~08:40", "08:40~09:20", "09:30~10:10"};
        int[] st = WidgetClock.build(segs, true);
        int[] en = WidgetClock.build(segs, false);
        ok(st != null && en != null, "build 正常三段");
        eq(WidgetClock.seg(st, 1), 480, "build 第 1 节开始");
        eq(WidgetClock.seg(en, 1), 520, "build 第 1 节结束");
        eq(WidgetClock.seg(st, 3), 570, "build 第 3 节开始");
        eq(WidgetClock.seg(en, 3), 610, "build 第 3 节结束");
        eq(WidgetClock.seg(st, 0), -1, "build 第 0 节越界 → -1");
        eq(WidgetClock.seg(st, 4), -1, "build 超出长度 → -1");
        eq(WidgetClock.seg(null, 1), -1, "build null 表 → -1");
        ok(WidgetClock.build(new String[]{"08:00~08:40", "坏的"}, true) == null,
                "build 有一档坏 → 整块放弃（宁可不报时间）");
        ok(WidgetClock.build(new String[]{}, true) == null, "build 空数组 → null");
        ok(WidgetClock.build(null, true) == null, "build null → null");

        /* 真实课表里的 16 档（data/schedule.json 原样），必须全部解析成功 */
        String[] real = {
            "08:00~08:40", "08:40~09:20", "09:30~10:10", "10:20~11:00",
            "11:10~11:50", "11:50~12:30", "14:30~15:10", "15:10~15:50",
            "16:00~16:40", "16:50~17:30", "17:30~18:10", "19:00~19:40",
            "19:40~20:20", "20:30~21:10", "21:10~21:30", "21:30~22:00"
        };
        int[] rst = WidgetClock.build(real, true);
        int[] ren = WidgetClock.build(real, false);
        ok(rst != null && ren != null, "真实 16 档作息全部解析成功");
        eq(WidgetClock.seg(rst, 1), 480, "真实：第 1 节 08:00");
        eq(WidgetClock.seg(ren, 16), 1320, "真实：第 16 节 22:00");
        eq(WidgetClock.seg(rst, 12), 1140, "真实：第 12 节 19:00");
        /* 第 15 节只有 20 分钟 —— 排课表要能如实算出来 */
        eq(WidgetClock.seg(ren, 15) - WidgetClock.seg(rst, 15), 20, "真实：第 15 节只有 20 分钟");

        /* —— hm / span —— */
        eq(WidgetClock.hm(480), "08:00", "hm 480");
        eq(WidgetClock.hm(0), "00:00", "hm 0");
        eq(WidgetClock.hm(1440), "24:00", "hm 1440");
        eq(WidgetClock.hm(-1), "", "hm 负数 → 空");
        eq(WidgetClock.span(0), "0 分钟", "span 0");
        eq(WidgetClock.span(23), "23 分钟", "span 23");
        eq(WidgetClock.span(59), "59 分钟", "span 59");
        eq(WidgetClock.span(60), "1 小时", "span 60 整点不带 0 分");
        eq(WidgetClock.span(67), "1 小时 7 分", "span 67");
        eq(WidgetClock.span(120), "2 小时", "span 120");
        eq(WidgetClock.span(-5), "0 分钟", "span 负数按 0");

        /* —— stateOf 边界（与 web/nowline.js 同口径） —— */
        int[] s1 = WidgetClock.build(new String[]{"08:00~08:40"}, true);
        int[] e1 = WidgetClock.build(new String[]{"08:00~08:40"}, false);
        eq(WidgetClock.stateOf(s1, e1, 1, 1, 479), WidgetClock.TODO, "课前 1 分钟 → 还没开始");
        eq(WidgetClock.stateOf(s1, e1, 1, 1, 480), WidgetClock.NOW, "上课那一分钟 → 正在上");
        eq(WidgetClock.stateOf(s1, e1, 1, 1, 500), WidgetClock.NOW, "课中 → 正在上");
        eq(WidgetClock.stateOf(s1, e1, 1, 1, 520), WidgetClock.NOW, "下课那一分钟仍算在上");
        eq(WidgetClock.stateOf(s1, e1, 1, 1, 521), WidgetClock.DONE, "下课下一分钟 → 已上完");
        eq(WidgetClock.stateOf(null, null, 1, 1, 500), WidgetClock.UNKNOWN, "没钟点表 → 不知道");
        eq(WidgetClock.stateOf(s1, e1, 9, 9, 500), WidgetClock.UNKNOWN, "节次超表 → 不知道");
        eq(WidgetClock.stateOf(s1, e1, 1, 1, -1), WidgetClock.UNKNOWN, "时钟未知 → 不知道");

        /* —— markOf / colorOf —— */
        eq(WidgetClock.markOf(WidgetClock.NOW), "▶ ", "markOf 正在上");
        eq(WidgetClock.markOf(WidgetClock.DONE), "· ", "markOf 已上完");
        eq(WidgetClock.markOf(WidgetClock.TODO), "   ", "markOf 还没开始 → 三空格占位");
        eq(WidgetClock.markOf(WidgetClock.UNKNOWN), "   ", "markOf 不知道 → 也不许装懂");
        ok(WidgetClock.colorOf(WidgetClock.NOW) == 0xFF9E8CFF, "colorOf 正在上用主色");
        ok(WidgetClock.colorOf(WidgetClock.DONE) == 0xFF8A82A0, "colorOf 已上完用灰");
        ok(WidgetClock.colorOf(WidgetClock.TODO) == 0xFFEFE9FF, "colorOf 还没开始用原色");
        ok(WidgetClock.colorOf(WidgetClock.UNKNOWN) == WidgetClock.colorOf(WidgetClock.TODO),
                "colorOf 不知道与还没开始同色（不额外提示）");

        /* —— subText 四档 —— */
        /* 两节课：1-2 节（08:00~09:20）、3 节（09:30~10:10） */
        String[] three = {"08:00~08:40", "08:40~09:20", "09:30~10:10"};
        int[] ts = WidgetClock.build(three, true);
        int[] te = WidgetClock.build(three, false);
        int[] firsts = {1, 3};
        int[] lasts = {2, 3};
        eq(WidgetClock.subText(null, null, firsts, lasts, 2, 500),
                "今天 2 节课 · 点开看课表", "subText 没钟点 → 退回老文案");
        eq(WidgetClock.subText(ts, te, firsts, lasts, 2, 500),
                "正在上 · 还有 1 小时 下课", "subText 正在上（连堂算到最后一节 09:20）");
        eq(WidgetClock.subText(ts, te, firsts, lasts, 2, 555),
                "正在上 · 还有 5 分钟 下课", "subText 09:15 仍在上（09:20 才下课）");
        eq(WidgetClock.subText(ts, te, firsts, lasts, 2, 565),
                "下节 09:30 · 5 分钟后", "subText 课间说下一节");
        eq(WidgetClock.subText(ts, te, firsts, lasts, 2, 700),
                "今天的课上完了 · 共 2 节", "subText 都上完了");
        /* 上课前一分钟也走「下一节」 */
        eq(WidgetClock.subText(ts, te, firsts, lasts, 2, 479),
                "下节 08:00 · 1 分钟后", "subText 上课前一分钟");
        /* 只有一节、正在上 */
        eq(WidgetClock.subText(ts, te, new int[]{1}, new int[]{1}, 1, 490),
                "正在上 · 还有 30 分钟 下课", "subText 单节正在上");

        /* —— 一致性：副标题说的状态必须与每行 stateOf 一致 —— */
        boolean agree = true;
        for (int now = 470; now <= 620; now++) {
            String txt = WidgetClock.subText(ts, te, firsts, lasts, 2, now);
            int q0 = WidgetClock.stateOf(ts, te, firsts[0], lasts[0], now);
            int q1 = WidgetClock.stateOf(ts, te, firsts[1], lasts[1], now);
            if (txt.startsWith("正在上")) {
                if (!(q0 == WidgetClock.NOW || q1 == WidgetClock.NOW)) { agree = false; break; }
            } else if (txt.startsWith("下节")) {
                int nxt = (q0 == WidgetClock.TODO) ? 0 : 1;
                if (WidgetClock.stateOf(ts, te, firsts[nxt], lasts[nxt], now) != WidgetClock.TODO) { agree = false; break; }
                if (q0 == WidgetClock.NOW || q1 == WidgetClock.NOW) { agree = false; break; }
            } else if (txt.startsWith("今天的课上完了")) {
                if (q0 != WidgetClock.DONE || q1 != WidgetClock.DONE) { agree = false; break; }
            }
        }
        ok(agree, "subText 与 stateOf 在 151 个时刻上口径一致");

        System.out.println("pass=" + pass + " fail=" + fail);
        if (fail > 0) {
            System.out.print(bad.toString());
            System.exit(1);
        }
    }
}
`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xxmu-widget-'));
const out = path.join(dir, 'classes');
fs.mkdirSync(out);

try {
  fs.writeFileSync(path.join(dir, 'WidgetClock.java'), fs.readFileSync(CLOCK, 'utf8'), 'utf8');
  fs.writeFileSync(path.join(dir, 'WidgetClockTestMain.java'), MAIN, 'utf8');

  const cc = cp.spawnSync('javac', [
    '-encoding', 'UTF-8', '-nowarn',
    '-d', out,
    path.join(dir, 'WidgetClock.java'),
    path.join(dir, 'WidgetClockTestMain.java'),
  ], { encoding: 'utf8' });

  if (cc.status !== 0) {
    console.error('javac 失败：\n' + (cc.stderr || '') + (cc.stdout || ''));
    process.exit(1);
  }

  const rr = cp.spawnSync('java', ['-cp', out, 'com.xxmu.helper.WidgetClockTestMain'], { encoding: 'utf8' });
  const text = (rr.stdout || '') + (rr.stderr || '');
  const m = /pass=(\d+) fail=(\d+)/.exec(text);
  if (!m) {
    console.error('java 没给出结果：\n' + text);
    process.exit(1);
  }
  const jPass = Number(m[1]), jFail = Number(m[2]);
  const badLines = text.split('\n').filter(x => x.indexOf('FAIL ') === 0);
  badLines.forEach(x => ok(false, 'java: ' + x.slice(5)));

  const total = pass + jPass;
  const totalFail = fail + jFail;

  if (totalFail === 0) {
    console.log('\n[PASS] 桌面小组件 v2.10.0 行为测试通过 ' + total + ' 项');
    console.log('       （源码纪律 ' + (pass - 0) + " 项 + WidgetClock 真跑 " + jPass + ' 项）');
  } else {
    console.log('\n[FAIL] ' + totalFail + ' 项没过：');
    fails.forEach(f => console.log('  · ' + f));
  }
  process.exit(totalFail === 0 ? 0 : 1);
} finally {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { }
}
