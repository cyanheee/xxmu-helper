/* 桌面小组件「最近要交」计算层（WidgetDue.java）离线测试 —— v2.12.0
 *
 * 跑法：node tools/test_widgetdue.js
 *
 * 测什么：桌面上那几条作业/考试截止，写得对不对、挑得对不对、颜色分档对不对。
 * 为什么值得单独测：桌面上写错一句话，用户不会去翻日志，他只会觉得这 App 不准。
 *
 * 做法和 test_widget.js / test_widgetops.js 一样：真编真跑 Java。
 * WidgetDue 故意不 import android.* / org.json.*，就是为了能这样测。
 *
 * 必须测到的五件事：
 *   1. 状态词判定与 web/chaoxing.js 的 CX.classify() 逐字对齐，顺序不能反
 *      （「待批阅」是完成、「待互评」是未完成）；
 *   2. 时长文案与 web/app.js 的 fmtLeft(h) 口径一致（不足 1 分钟写 1 分钟，不写 0）；
 *   3. 读不到截止时间的一条都不上桌（dueTs = 0 直接丢），已过截止的也不上桌；
 *   4. 排序按截止时间升序，同刻按名字稳定；
 *   5. pick 返回副本 —— 改返回值不影响传入的那份数据。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const JAVA_DIR = path.join(ROOT, 'android', 'src', 'com', 'xxmu', 'helper');
const DUE = path.join(JAVA_DIR, 'WidgetDue.java');
const WIDGET = path.join(JAVA_DIR, 'ClassWidget.java');
const MAIN_JAVA = path.join(JAVA_DIR, 'MainActivity.java');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, label, extra) {
  if (cond) { pass++; return; }
  fail++;
  fails.push(label + (extra === undefined ? '' : ('  →  ' + extra)));
}

/* ── 第一步：源码纪律 ─────────────────────────────────────────── */

const dueSrc = fs.readFileSync(DUE, 'utf8');
const widgetSrc = fs.readFileSync(WIDGET, 'utf8');
const mainSrc = fs.readFileSync(MAIN_JAVA, 'utf8');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const dueCode = strip(dueSrc);
const widgetCode = strip(widgetSrc);

ok(/^package com\.xxmu\.helper;/m.test(dueCode), 'WidgetDue 有 package 声明');
ok(!/^import\s+android\./m.test(dueCode), 'WidgetDue 不 import android.*（否则不能裸 javac 跑）');
ok(!/^import\s+org\.json\./m.test(dueCode), 'WidgetDue 不 import org.json.*');
ok(!/RemoteViews/.test(dueCode), 'WidgetDue 不碰 RemoteViews');
ok(!/Context/.test(dueCode), 'WidgetDue 不碰 Context');

/* 三组词表必须与 web/chaoxing.js 一致 —— 这里只查关键的那几个，
 * 全表对齐由下面的 Java 侧行为断言保证。 */
['DONE_WORDS', 'NOTSTART_WORDS', 'OPEN_WORDS'].forEach(n => {
  ok(dueCode.indexOf(n) > 0, 'WidgetDue 有 ' + n);
});

/* ClassWidget 必须真的用 WidgetDue，不许自己再写一套挑拣逻辑 */
ok(widgetSrc.indexOf('WidgetDue.pick(') > 0, 'ClassWidget 挑待办走 WidgetDue.pick');
ok(widgetSrc.indexOf('WidgetDue.count(') > 0, 'ClassWidget 数件数走 WidgetDue.count');
ok(widgetSrc.indexOf('WidgetDue.line(') > 0, 'ClassWidget 拼行文字走 WidgetDue.line');
ok(widgetSrc.indexOf('WidgetDue.colorOf(') > 0, 'ClassWidget 上色走 WidgetDue.colorOf');
ok(widgetCode.indexOf('xxmu_cx_homework') > 0, 'ClassWidget 从 xxmu_cx_homework 读作业');

/* setPref 必须给这个键补一次主动重画，否则刚同步完桌面上还是旧值 */
ok(mainSrc.indexOf('"xxmu_cx_homework".equals(key)') > 0,
   'setPref 对 xxmu_cx_homework 有 refresh 触发');

/* ── 第二步：真编译 + 真跑 ────────────────────────────────────── */

const MAIN = `package com.xxmu.helper;

import java.util.ArrayList;
import java.util.List;

public final class WidgetDueTestMain {
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
    static List<WidgetDue.Item> list(WidgetDue.Item... a) {
        List<WidgetDue.Item> l = new ArrayList<WidgetDue.Item>();
        for (int i = 0; i < a.length; i++) l.add(a[i]);
        return l;
    }

    /* 固定基准时刻：2026-11-21 20:00:00 北京时间 = 1795262400 */
    static final long NOW = 1795262400L;
    static final long MIN = 60L;
    static final long HOUR = 3600L;
    static final long DAY = 86400L;

    static void stateTests() {
        eq(WidgetDue.stateOf("已完成"), WidgetDue.DONE, "状态：已完成 → DONE");
        eq(WidgetDue.stateOf("待批阅"), WidgetDue.DONE, "状态：待批阅 → DONE（我的活干完了）");
        eq(WidgetDue.stateOf("未批阅"), WidgetDue.DONE, "状态：未批阅 → DONE");
        eq(WidgetDue.stateOf("已过期"), WidgetDue.DONE, "状态：已过期 → DONE");
        eq(WidgetDue.stateOf("未开始"), WidgetDue.NOTSTART, "状态：未开始 → NOTSTART");
        eq(WidgetDue.stateOf("未开考"), WidgetDue.NOTSTART, "状态：未开考 → NOTSTART");
        eq(WidgetDue.stateOf("待做"), WidgetDue.OPEN, "状态：待做 → OPEN");
        eq(WidgetDue.stateOf("待互评"), WidgetDue.OPEN, "状态：待互评 → OPEN（有个「待」但是我的活）");
        eq(WidgetDue.stateOf("进行中"), WidgetDue.OPEN, "状态：进行中 → OPEN");
        eq(WidgetDue.stateOf("重新编辑"), WidgetDue.OPEN, "状态：重新编辑 → OPEN");
        eq(WidgetDue.stateOf(""), WidgetDue.UNKNOWN, "状态：空串 → UNKNOWN");
        eq(WidgetDue.stateOf(null), WidgetDue.UNKNOWN, "状态：null → UNKNOWN");
        eq(WidgetDue.stateOf("随便什么"), WidgetDue.UNKNOWN, "状态：不认识 → UNKNOWN");
        /* 学习通时常夹 &nbsp; 与全角空格，必须照样认出来 */
        eq(WidgetDue.stateOf("待&nbsp;做"), WidgetDue.OPEN, "状态：待&nbsp;做 也认（清掉 &nbsp;）");
        eq(WidgetDue.stateOf("\u5f85\u505a\u3000"), WidgetDue.OPEN, "状态：尾部全角空格也认");
    }

    static void durTests() {
        eq(WidgetDue.durText(NOW + 30, NOW), "1 分钟", "时长：剩 30 秒写 1 分钟，不写 0");
        eq(WidgetDue.durText(NOW, NOW), "1 分钟", "时长：正好到点也写 1 分钟（与 web fmtLeft 一致，不写 0）");
        eq(WidgetDue.durText(NOW - 1, NOW), "", "时长：已过点 → 空串（让 leftText 去说「已过期」）");
        eq(WidgetDue.durText(NOW + 5 * MIN, NOW), "5 分钟", "时长：5 分钟");
        eq(WidgetDue.durText(NOW + 59 * MIN, NOW), "59 分钟", "时长：59 分钟");
        eq(WidgetDue.durText(NOW + HOUR, NOW), "1 小时", "时长：整点不写 0 分");
        eq(WidgetDue.durText(NOW + HOUR + 7 * MIN, NOW), "1 小时 7 分", "时长：1 小时 7 分");
        eq(WidgetDue.durText(NOW + 47 * HOUR + 59 * MIN, NOW), "47 小时 59 分", "时长：47 小时 59 分（还没到天）");
        eq(WidgetDue.durText(NOW + 48 * HOUR, NOW), "2 天", "时长：48 小时 → 2 天");
        eq(WidgetDue.durText(NOW + 5 * DAY + 3 * HOUR, NOW), "5 天", "时长：5 天（向下取整）");
        eq(WidgetDue.durText(0, NOW), "", "时长：读不到时间 → 空串");
        eq(WidgetDue.durText(NOW + HOUR, 0), "", "时长：nowSec=0 → 空串（不猜）");
    }

    static void leftTests() {
        eq(WidgetDue.leftText(NOW + 25 * MIN, NOW), "还剩 25 分钟", "剩余：25 分钟");
        eq(WidgetDue.leftText(NOW + 2 * HOUR, NOW), "还剩 2 小时", "剩余：2 小时");
        eq(WidgetDue.leftText(NOW - 1, NOW), "已过期", "剩余：已过期");
        eq(WidgetDue.leftText(0, NOW), "", "剩余：读不到时间 → 空串（不写已过期）");
    }

    static void colorTests() {
        eq(WidgetDue.colorOf(NOW + 23 * HOUR, NOW), 0xFFFF8A80, "配色：23 小时 → 红");
        eq(WidgetDue.colorOf(NOW + 24 * HOUR, NOW), 0xFFE8A34E, "配色：24 小时整 → 琥珀");
        eq(WidgetDue.colorOf(NOW + 71 * HOUR, NOW), 0xFFE8A34E, "配色：71 小时 → 琥珀");
        eq(WidgetDue.colorOf(NOW + 72 * HOUR, NOW), 0xFFEFE9FF, "配色：72 小时整 → 正常");
        eq(WidgetDue.colorOf(0, NOW), 0xFFEFE9FF, "配色：读不到时间 → 正常色兜底，不抛");
    }

    static void markTests() {
        eq(WidgetDue.markOf(WidgetDue.KIND_WORK, false), "\\u23f0 ", "记号：作业 ⏰");
        eq(WidgetDue.markOf(WidgetDue.KIND_EXAM, true), "\\u23f3 ", "记号：未开考考试 ⏳");
        eq(WidgetDue.markOf(WidgetDue.KIND_EXAM, false), "\\u270e ", "记号：考试 ✎");
    }

    static void lineTests() {
        WidgetDue.Item w = WidgetDue.make(WidgetDue.KIND_WORK, "病理实验报告", "病理学", NOW + 25 * MIN, "待做", false);
        eq(WidgetDue.line(w, NOW), "\\u23f0 病理实验报告 · 还剩 25 分钟", "整行：作业 + 剩余");
        WidgetDue.Item e = WidgetDue.make(WidgetDue.KIND_EXAM, "期中考试", "药理学", NOW + 3 * DAY, "未开始", true);
        eq(WidgetDue.line(e, NOW), "\\u23f3 期中考试 · 还剩 3 天", "整行：未开考考试 + 剩余");
        WidgetDue.Item noTime = WidgetDue.make(WidgetDue.KIND_WORK, "读书笔记", "生理学", 0L, "待做", false);
        eq(WidgetDue.line(noTime, NOW), "\\u23f0 读书笔记", "整行：读不到时间就只说名字，不编剩余");
        WidgetDue.Item noName = WidgetDue.make(WidgetDue.KIND_WORK, "   ", "生理学", NOW + HOUR, "待做", false);
        eq(WidgetDue.line(noName, NOW), "\\u23f0 未命名作业 · 还剩 1 小时", "整行：空名字兜底「未命名作业」");
        eq(WidgetDue.line(null, NOW), "", "整行：null → 空串");
    }

    static void pickTests() {
        WidgetDue.Item a = WidgetDue.make(WidgetDue.KIND_WORK, "A 三天后", "x", NOW + 3 * DAY, "待做", false);
        WidgetDue.Item b = WidgetDue.make(WidgetDue.KIND_WORK, "B 一小时", "x", NOW + HOUR, "待做", false);
        WidgetDue.Item c = WidgetDue.make(WidgetDue.KIND_WORK, "C 已完成", "x", NOW + 2 * HOUR, "已完成", false);
        WidgetDue.Item d = WidgetDue.make(WidgetDue.KIND_WORK, "D 已过期", "x", NOW - HOUR, "待做", false);
        WidgetDue.Item e = WidgetDue.make(WidgetDue.KIND_WORK, "E 读不到时间", "x", 0L, "待做", false);
        WidgetDue.Item f = WidgetDue.make(WidgetDue.KIND_WORK, "F 半天", "x", NOW + 12 * HOUR, "未交", false);
        List<WidgetDue.Item> all = list(a, b, c, d, e, f);

        List<WidgetDue.Item> top = WidgetDue.pick(all, NOW, 4);
        eq(top.size(), 3, "挑选：六条里只有三条该上桌（完成/过期/无时间都被筛掉）");
        eq(top.get(0).name, "B 一小时", "挑选：最近的排第一");
        eq(top.get(1).name, "F 半天", "挑选：第二近排第二");
        eq(top.get(2).name, "A 三天后", "挑选：最远排最后");

        eq(WidgetDue.pick(all, NOW, 1).size(), 1, "挑选：max=1 只取一条");
        eq(WidgetDue.pick(all, NOW, 1).get(0).name, "B 一小时", "挑选：max=1 取最近那条");
        eq(WidgetDue.pick(all, NOW, 0).size(), 0, "挑选：max=0 返回空表");
        eq(WidgetDue.pick(all, NOW, -2).size(), 0, "挑选：max 负数返回空表");
        eq(WidgetDue.pick(null, NOW, 4).size(), 0, "挑选：null 入参返回空表");
        eq(WidgetDue.pick(all, 0, 4).size(), 0, "挑选：nowSec=0 返回空表（不猜现在几点）");

        /* pick 必须返回副本：改返回值不许影响调用方手里那份 */
        List<WidgetDue.Item> copy = WidgetDue.pick(all, NOW, 4);
        copy.get(0).name = "被改了";
        eq(all.get(1).name, "B 一小时", "挑选：返回值是副本，改它不影响入参");

        eq(WidgetDue.count(all, NOW), 3, "数件数：三条待交");
        eq(WidgetDue.count(all, 0), 0, "数件数：nowSec=0 → 0");
        eq(WidgetDue.count(null, NOW), 0, "数件数：null → 0");

        /* 同刻按名字稳定排序 */
        WidgetDue.Item s1 = WidgetDue.make(WidgetDue.KIND_WORK, "乙", "x", NOW + HOUR, "待做", false);
        WidgetDue.Item s2 = WidgetDue.make(WidgetDue.KIND_WORK, "甲", "x", NOW + HOUR, "待做", false);
        List<WidgetDue.Item> same = WidgetDue.pick(list(s1, s2), NOW, 4);
        eq(same.get(0).name, "乙", "挑选：同刻按名字排，结果稳定（乙在甲前）");
    }

    /* 与 web 端口径的一致性：stateOf 说的状态与「该不该上桌」必须自洽 */
    static void consistencyTests() {
        String[] statuses = { "已完成", "已提交", "待批阅", "未批阅", "已批阅", "已互评", "已过期",
                              "已结束", "已截止", "未开始", "未开考", "待做", "待完成", "未交",
                              "未提交", "重新编辑", "待互评", "进行中", "", "乱七八糟" };
        int wrong = 0;
        for (int i = 0; i < statuses.length; i++) {
            WidgetDue.Item it = WidgetDue.make(WidgetDue.KIND_WORK, "X", "x", NOW + HOUR, statuses[i], false);
            boolean on = WidgetDue.pick(list(it), NOW, 4).size() == 1;
            boolean should = WidgetDue.stateOf(statuses[i]) != WidgetDue.DONE;
            if (on != should) {
                wrong++;
                bad.append(statuses[i]).append(" 该上桌=").append(should).append(" 实际=").append(on).append('\\n');
            }
        }
        ok(wrong == 0, "一致性：20 个状态词上桌与否都与 stateOf 自洽");
    }

    public static void main(String[] args) throws Exception {
        /* Windows 控制台默认 GBK，node 按 UTF-8 读会得到乱码；
         * 显式把 stdout 钉成 UTF-8，失败时那条中文标签才看得懂。 */
        System.setOut(new java.io.PrintStream(
                new java.io.FileOutputStream(java.io.FileDescriptor.out), true, "UTF-8"));
        stateTests();
        durTests();
        leftTests();
        colorTests();
        markTests();
        lineTests();
        pickTests();
        consistencyTests();
        System.out.println("pass=" + pass + " fail=" + fail);
        if (bad.length() > 0) System.out.print(bad.toString());
    }
}
`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xxmu-widgetdue-'));
const out = path.join(dir, 'classes');
fs.mkdirSync(out);

try {
  fs.writeFileSync(path.join(dir, 'WidgetDue.java'), fs.readFileSync(DUE, 'utf8'), 'utf8');
  fs.writeFileSync(path.join(dir, 'WidgetDueTestMain.java'), MAIN, 'utf8');

  const cc = cp.spawnSync('javac', [
    '-encoding', 'UTF-8', '-nowarn',
    '-d', out,
    path.join(dir, 'WidgetDue.java'),
    path.join(dir, 'WidgetDueTestMain.java'),
  ], { encoding: 'utf8' });

  if (cc.status !== 0) {
    console.error('javac 失败：\n' + (cc.stderr || '') + (cc.stdout || ''));
    process.exit(1);
  }

  const rr = cp.spawnSync('java', ['-cp', out, 'com.xxmu.helper.WidgetDueTestMain'], { encoding: 'utf8' });
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
    console.log('\n[PASS] 桌面「最近要交」v2.12.0 行为测试通过 ' + total + ' 项');
    console.log('       （源码纪律 ' + pass + ' 项 + WidgetDue 真跑 ' + jPass + ' 项）');
  } else {
    console.log('\n[FAIL] ' + totalFail + ' 项没过：');
    fails.forEach(f => console.log('  · ' + f));
  }
  process.exit(totalFail === 0 ? 0 : 1);
} finally {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { }
}
