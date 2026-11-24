/* 改课表指令的 Java 侧实现（WidgetOps.java）离线测试 —— v2.11.0
 *
 * 跑法：node tools/test_widgetops.js
 *
 * 测什么：桌面小组件叠加「加课 / 停课 / 调课 / 放假」四种指令的结果，
 * 必须与 web/lesson-cmd.js 的 apply() 一致 —— 否则用户在 App 里停了课，
 * 桌面组件上那节课还在，两个地方说两套话。
 *
 * 做法和 test_widget.js 一样：真编真跑 Java。WidgetOps 故意不 import
 * android.* / org.json.*，就是为了能这样测。
 *
 * 必须测到的四件事：
 *   1. 停课：课名 + 日/周/节任一范围命中就整条移除，没给的条件不算条件；
 *   2. 调课：命中后改 day/weeks/periods，没说教室就保留原教室；
 *   3. 放假：把命中的周次剔掉，剔空了整条移除；
 *   4. 加课：打 _cmd 标记，且不改入参（apply 是纯函数）。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const JAVA_DIR = path.join(ROOT, 'android', 'src', 'com', 'xxmu', 'helper');
const OPS = path.join(JAVA_DIR, 'WidgetOps.java');
const WIDGET = path.join(JAVA_DIR, 'ClassWidget.java');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, label, extra) {
  if (cond) { pass++; return; }
  fail++;
  fails.push(label + (extra === undefined ? '' : ('  →  ' + extra)));
}

/* ── 第一步：源码纪律 ─────────────────────────────────────────── */

const opsSrc = fs.readFileSync(OPS, 'utf8');
const widgetSrc = fs.readFileSync(WIDGET, 'utf8');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const opsCode = strip(opsSrc);
const widgetCode = strip(widgetSrc);

ok(/^package com\.xxmu\.helper;/m.test(opsCode), 'WidgetOps 有 package 声明');
ok(!/^import\s+android\./m.test(opsCode), 'WidgetOps 不 import android.*（否则不能裸 javac 跑）');
ok(!/^import\s+org\.json\./m.test(opsCode), 'WidgetOps 不 import org.json.*');

/* 四种 type 一个都不能少，且名字要与 web 端一致 */
['"add"', '"stop"', '"move"', '"holiday"'].forEach(t => {
  ok(opsCode.indexOf(t) > 0, 'WidgetOps 认识 ' + t);
});

/* ClassWidget 必须真的走 WidgetOps，不许留一份自己的叠加逻辑 */
ok(widgetSrc.indexOf('WidgetOps.apply(') > 0, 'ClassWidget 叠加指令走 WidgetOps.apply');
ok(widgetSrc.indexOf('WidgetOps.has(') > 0, 'ClassWidget 筛周次走 WidgetOps.has');
ok(widgetCode.indexOf('"add".equals(op.optString("type"))') < 0,
   'ClassWidget 里没有「只认加课」的老分支');

/* ── 第二步：真编译 + 真跑 ────────────────────────────────────── */

const MAIN = `package com.xxmu.helper;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public final class WidgetOpsTestMain {
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
    static List<String> kv(String... p) {
        List<String> l = new ArrayList<String>();
        for (int i = 0; i < p.length; i++) l.add(p[i]);
        return l;
    }
    static List<List<String>> ops(List<String>... a) {
        List<List<String>> l = new ArrayList<List<String>>();
        for (int i = 0; i < a.length; i++) l.add(a[i]);
        return l;
    }
    static String names(List<WidgetOps.Course> cs) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < cs.size(); i++) {
            if (b.length() > 0) b.append('|');
            b.append(cs.get(i).name);
        }
        return b.toString();
    }
    static String weeks(WidgetOps.Course c) { return Arrays.toString(c.weeks); }
    static String periods(WidgetOps.Course c) { return Arrays.toString(c.periods); }

    static List<WidgetOps.Course> base() {
        List<WidgetOps.Course> l = new ArrayList<WidgetOps.Course>();
        l.add(WidgetOps.make("系统解剖学", "A201", 1, new int[]{1, 2, 3, 4}, new int[]{1, 2}));
        l.add(WidgetOps.make("生理学", "B305", 3, new int[]{1, 2, 3, 4}, new int[]{3, 4}));
        l.add(WidgetOps.make("病理学", "C102", 5, new int[]{2, 3, 4}, new int[]{5, 6}));
        return l;
    }

    public static void main(String[] args) {
        /* —— ints 解析 —— */
        eq(Arrays.toString(WidgetOps.ints("1,2,3")), "[1, 2, 3]", "ints 逗号");
        eq(Arrays.toString(WidgetOps.ints("3-5")), "[3, 4, 5]", "ints 连字符区间");
        eq(Arrays.toString(WidgetOps.ints("3~5")), "[3, 4, 5]", "ints 波浪区间");
        eq(Arrays.toString(WidgetOps.ints("1, 3-4")), "[1, 3, 4]", "ints 混合");
        eq(Arrays.toString(WidgetOps.ints("")), "[]", "ints 空串 → 空");
        eq(Arrays.toString(WidgetOps.ints(null)), "[]", "ints null → 空");
        eq(Arrays.toString(WidgetOps.ints("abc")), "[]", "ints 全坏 → 空（不是 0）");
        eq(Arrays.toString(WidgetOps.ints("0")), "[]", "ints 0 不算有效节次");

        /* —— match：没给的条件不算条件 —— */
        WidgetOps.Course c1 = WidgetOps.make("系统解剖学", "A201", 1, new int[]{1, 2}, new int[]{1, 2});
        ok(WidgetOps.match(c1, "系统解剖学", 0, null, null), "match 只给课名 → 命中");
        ok(!WidgetOps.match(c1, "生理学", 0, null, null), "match 课名不同 → 不命中");
        ok(WidgetOps.match(c1, "系统解剖学", 1, null, null), "match 同一天 → 命中");
        ok(!WidgetOps.match(c1, "系统解剖学", 2, null, null), "match 不同天 → 不命中");
        ok(WidgetOps.match(c1, "系统解剖学", 1, new int[]{2}, new int[]{2}), "match 周次/节次有交集 → 命中");
        ok(!WidgetOps.match(c1, "系统解剖学", 1, new int[]{9}, null), "match 周次没交集 → 不命中");
        ok(WidgetOps.match(c1, " 系统解剖学 ", 0, null, null), "match 课名两侧空格不算不同");

        /* —— 空 ops 原样返回，且不返回入参本身 —— */
        List<WidgetOps.Course> b0 = base();
        List<WidgetOps.Course> r0 = WidgetOps.apply(b0, null);
        eq(names(r0), "系统解剖学|生理学|病理学", "apply 空 ops 原样返回");
        ok(r0.get(0) != b0.get(0), "apply 返回的是副本（改产物不该碰入参）");
        r0.get(0).name = "改过了";
        eq(b0.get(0).name, "系统解剖学", "apply 产物被改不影响入参");

        /* —— 停课 —— */
        List<WidgetOps.Course> r1 = WidgetOps.apply(base(),
                ops(kv("type", "stop", "name", "生理学", "weeks", "2")));
        eq(names(r1), "系统解剖学|病理学", "停课：整条移除");

        List<WidgetOps.Course> r1b = WidgetOps.apply(base(),
                ops(kv("type", "stop", "name", "生理学", "weeks", "9")));
        eq(names(r1b), "系统解剖学|生理学|病理学", "停课：周次没命中就不动");

        List<WidgetOps.Course> r1c = WidgetOps.apply(base(),
                ops(kv("type", "stop", "name", "生理学", "day", "4")));
        eq(names(r1c), "系统解剖学|生理学|病理学", "停课：同日名不同天不动");

        /* —— 调课 —— */
        List<WidgetOps.Course> r2 = WidgetOps.apply(base(),
                ops(kv("type", "move", "name", "病理学",
                        "from.day", "5", "from.weeks", "2,3,4", "from.periods", "5,6",
                        "to.day", "6", "to.weeks", "5", "to.periods", "1,2")));
        WidgetOps.Course mv = r2.get(2);
        eq(mv.name, "病理学", "调课：课名不变");
        eq(mv.day, 6, "调课：改到周六");
        eq(weeks(mv), "[5]", "调课：周次换成第 5 周");
        eq(periods(mv), "[1, 2]", "调课：节次换成 1-2");
        eq(mv.room, "C102", "调课：没说教室就保留原教室");

        List<WidgetOps.Course> r2b = WidgetOps.apply(base(),
                ops(kv("type", "move", "name", "病理学",
                        "from.day", "5", "to.day", "6", "to.room", "D401")));
        WidgetOps.Course mv2 = r2b.get(2);
        eq(mv2.room, "D401", "调课：给了教室就换");
        eq(weeks(mv2), "[2, 3, 4]", "调课：没给周次就保留");
        eq(periods(mv2), "[5, 6]", "调课：没给节次就保留");

        List<WidgetOps.Course> r2c = WidgetOps.apply(base(),
                ops(kv("type", "move", "name", "病理学", "from.day", "1", "to.day", "7")));
        eq(r2c.get(2).day, 5, "调课：from 没命中就不动");

        /* —— 放假 —— */
        List<WidgetOps.Course> r3 = WidgetOps.apply(base(),
                ops(kv("type", "holiday", "weeks", "2")));
        eq(names(r3), "系统解剖学|生理学|病理学", "放假：三门都还在（都没被剔空）");
        eq(weeks(r3.get(0)), "[1, 3, 4]", "放假：第 2 周剔掉");
        eq(weeks(r3.get(1)), "[1, 3, 4]", "放假：第 2 周剔掉（第二门）");

        List<WidgetOps.Course> r3b = WidgetOps.apply(base(),
                ops(kv("type", "holiday", "weeks", "2,3,4")));
        eq(names(r3b), "系统解剖学|生理学", "放假：剔空了整条移除（病理学只有 2-4 周）");
        eq(weeks(r3b.get(0)), "[1]", "放假：剩下第 1 周");

        List<WidgetOps.Course> r3c = WidgetOps.apply(base(),
                ops(kv("type", "holiday", "weeks", "")));
        eq(names(r3c), "系统解剖学|生理学|病理学", "放假：没给周次 → 什么都不做");

        /* —— 加课 —— */
        List<WidgetOps.Course> r4 = WidgetOps.apply(base(),
                ops(kv("type", "add", "name", "形势与政策", "room", "E101",
                        "day", "2", "weeks", "1-16", "periods", "7,8")));
        eq(r4.size(), 4, "加课：多一条");
        WidgetOps.Course ad = r4.get(3);
        eq(ad.name, "形势与政策", "加课：课名对");
        eq(ad.room, "E101", "加课：教室对");
        eq(ad.day, 2, "加课：星期对");
        eq(weeks(ad), "[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]", "加课：周次区间展开");
        ok(ad.cmd, "加课：打了 _cmd 标记");

        /* —— 坏指令不炸、不误伤 —— */
        List<WidgetOps.Course> r5 = WidgetOps.apply(base(),
                ops(kv("type", "remove_all")));
        eq(names(r5), "系统解剖学|生理学|病理学", "认不出的 type 一律跳过");
        List<WidgetOps.Course> r5b = WidgetOps.apply(base(), ops(kv("type", "stop")));
        eq(r5b.size(), 3, "stop 没给课名 → 不动（不是全删）");

        /* —— 组合：先停再放假，与 App 端同一顺序 —— */
        List<WidgetOps.Course> r6 = WidgetOps.apply(base(), ops(
                kv("type", "stop", "name", "生理学"),
                kv("type", "holiday", "weeks", "1"),
                kv("type", "add", "name", "补课", "day", "1", "weeks", "1", "periods", "9")));
        eq(names(r6), "系统解剖学|病理学|补课", "组合：停→假→加 顺序生效");
        eq(weeks(r6.get(0)), "[2, 3, 4]", "组合：病理学的第 1 周已剔");

        /* —— 空白与 HTML 实体：与 web 端 clean() 同口径 —— */
        WidgetOps.Course c2 = WidgetOps.make("系统&ensp;解剖学  ", "", 1, null, null);
        ok(WidgetOps.match(c2, "系统 解剖学", 0, null, null) ||
           WidgetOps.match(c2, "系统&ensp;解剖学", 0, null, null),
           "match 对多余空白宽容");

        System.out.println("pass=" + pass + " fail=" + fail);
        if (fail > 0) {
            System.out.print(bad.toString());
            System.exit(1);
        }
    }
}
`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xxmu-widgetops-'));
const out = path.join(dir, 'classes');
fs.mkdirSync(out);

try {
  fs.writeFileSync(path.join(dir, 'WidgetOps.java'), fs.readFileSync(OPS, 'utf8'), 'utf8');
  fs.writeFileSync(path.join(dir, 'WidgetOpsTestMain.java'), MAIN, 'utf8');

  const cc = cp.spawnSync('javac', [
    '-encoding', 'UTF-8', '-nowarn',
    '-d', out,
    path.join(dir, 'WidgetOps.java'),
    path.join(dir, 'WidgetOpsTestMain.java'),
  ], { encoding: 'utf8' });

  if (cc.status !== 0) {
    console.error('javac 失败：\n' + (cc.stderr || '') + (cc.stdout || ''));
    process.exit(1);
  }

  const rr = cp.spawnSync('java', ['-cp', out, 'com.xxmu.helper.WidgetOpsTestMain'], { encoding: 'utf8' });
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
    console.log('\n[PASS] 改课表指令 Java 侧 v2.11.0 行为测试通过 ' + total + ' 项');
    console.log('       （源码纪律 ' + pass + ' 项 + WidgetOps 真跑 ' + jPass + ' 项）');
  } else {
    console.log('\n[FAIL] ' + totalFail + ' 项没过：');
    fails.forEach(f => console.log('  · ' + f));
  }
  process.exit(totalFail === 0 ? 0 : 1);
} finally {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { }
}
