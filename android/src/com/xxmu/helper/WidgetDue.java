package com.xxmu.helper;

/* 河医大助手 · 桌面小组件的「最近要交」计算层（v2.12.0）
 *
 * 为什么单独一个类、为什么一行业务代码都不碰 Android：
 *   这段逻辑是纯算术与纯字符串（状态词判定、剩余时间文案、紧急度配色、排序取前 N 条），
 *   没有一处需要 Context / RemoteViews / JSON。抽出来就能用 javac + java 直接跑真单测
 *   （tools/test_widgetdue.js），不用为了测一句话去开模拟器。
 *   同一条理由已经在 WidgetClock / WidgetOps 上用过两次，这里是第三次。
 *
 * 三条硬规矩（错了会在桌面上说假话，比不显示更糟）：
 *   1. 读不到截止时间的一条都不上桌。dueTs <= 0 直接丢弃 —— 桌面上挂一个永远不动的
 *      「还剩 -- 」等于骗人，宁可少显示一条。
 *   2. 已过截止的不上桌。过期的东西在桌面上只剩噪声，用户要看会自己进 App。
 *   3. 状态判定与 web/chaoxing.js 的 CX.classify() 逐字对齐，顺序也不能反：
 *      「待批阅」是我的活干完了等老师，属完成；「待互评」里虽然有个「待」，但也是我的活，
 *      属未完成。先匹配完成词，再匹配未开始词，最后匹配待办词。
 *
 * 与 web/app.js 的对齐关系：
 *   leftText() 对应 web/app.js 的 fmtLeft(h)（那边按小时，这边按秒算，口径一致）
 *   stateOf()  对应 web/chaoxing.js 的 CX.classify(status)
 */

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

public final class WidgetDue {

    /** 状态。与 web/chaoxing.js 的 'open' / 'done' / 'notstart' / 'unknown' 一一对应。 */
    public static final int OPEN = 0;
    public static final int DONE = 1;
    public static final int NOTSTART = 2;
    public static final int UNKNOWN = 3;

    /** 种类，只影响行首那个记号。 */
    public static final int KIND_WORK = 0;
    public static final int KIND_EXAM = 1;

    /* ---- 状态词表：一个字都不能改，改了就和 App 里说的不是一回事 ----
     * done 侧包含「待批阅 / 未批阅 / 已批阅」：三者的共同事实都是「我已经交了」。
     * notstart 侧是「还动不了手」：未开始、未开考。
     * open 侧是「还得我做」：待做 / 待完成 / 未交 / 未提交 / 重新编辑 / 待互评 / 进行中。
     */
    private static final String[] DONE_WORDS = {
            "\u5df2\u5b8c\u6210",     // 已完成
            "\u5df2\u63d0\u4ea4",     // 已提交
            "\u5df2\u4ea4",           // 已交
            "\u5f85\u6279\u9605",     // 待批阅
            "\u672a\u6279\u9605",     // 未批阅
            "\u5df2\u6279\u9605",     // 已批阅
            "\u5df2\u4e92\u8bc4",     // 已互评
            "\u5df2\u8fc7\u671f",     // 已过期
            "\u5df2\u7ed3\u675f",     // 已结束
            "\u5df2\u622a\u6b62"      // 已截止
    };
    private static final String[] NOTSTART_WORDS = {
            "\u672a\u5f00\u59cb",     // 未开始
            "\u672a\u5f00\u8003"      // 未开考
    };
    private static final String[] OPEN_WORDS = {
            "\u5f85\u505a",           // 待做
            "\u5f85\u5b8c\u6210",     // 待完成
            "\u672a\u4ea4",           // 未交
            "\u672a\u63d0\u4ea4",     // 未提交
            "\u91cd\u65b0\u7f16\u8f91", // 重新编辑
            "\u5f85\u4e92\u8bc4",     // 待互评
            "\u8fdb\u884c\u4e2d"      // 进行中
    };

    /* 三档紧急度配色，与小组件那套深舱底（#1D1538 附近）都过 4.5:1：
     * 24 小时以内 = 红（和 App 里 HW_INK.bad 同一个语义）
     * 72 小时以内 = 琥珀
     * 其余        = 正常行色（与 WidgetClock.colorOf(TODO) 一致，保证同一张卡上字色统一）
     */
    private static final int C_SOON = 0xFFFF8A80;
    private static final int C_MID = 0xFFE8A34E;
    private static final int C_NORMAL = 0xFFEFE9FF;

    private WidgetDue() { }

    /** 一条待办。dueTs 是「截止时刻的秒」，读不到就是 0，0 的一条永远不会上桌。 */
    public static final class Item {
        public int kind;
        public String name = "";
        public String course = "";
        public long dueTs;
        public String status = "";
        public boolean upcoming;

        public Item copy() {
            Item x = new Item();
            x.kind = kind;
            x.name = name;
            x.course = course;
            x.dueTs = dueTs;
            x.status = status;
            x.upcoming = upcoming;
            return x;
        }
    }

    public static Item make(int kind, String name, String course, long dueTs, String status, boolean upcoming) {
        Item it = new Item();
        it.kind = kind;
        it.name = name == null ? "" : name;
        it.course = course == null ? "" : course;
        it.dueTs = dueTs;
        it.status = status == null ? "" : status;
        it.upcoming = upcoming;
        return it;
    }

    /** 状态 → OPEN / DONE / NOTSTART / UNKNOWN。顺序不能反，理由见文件头。 */
    public static int stateOf(String status) {
        String s = squash(status);
        if (s.length() == 0) return UNKNOWN;
        for (int i = 0; i < DONE_WORDS.length; i++) if (s.indexOf(DONE_WORDS[i]) >= 0) return DONE;
        for (int i = 0; i < NOTSTART_WORDS.length; i++) if (s.indexOf(NOTSTART_WORDS[i]) >= 0) return NOTSTART;
        for (int i = 0; i < OPEN_WORDS.length; i++) if (s.indexOf(OPEN_WORDS[i]) >= 0) return OPEN;
        return UNKNOWN;
    }

    /** 去掉 &nbsp; 与所有空白。学习通的状态词里常夹着 &nbsp;，不清掉匹配不上。 */
    private static String squash(String s) {
        if (s == null) return "";
        String t = s.replace("&nbsp;", "").replace("\u00a0", "");
        StringBuilder b = new StringBuilder(t.length());
        for (int i = 0; i < t.length(); i++) {
            char c = t.charAt(i);
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\u3000') continue;
            b.append(c);
        }
        return b.toString();
    }

    /**
     * 时长文案（不带「还剩」前缀）。对应 web/app.js 的 fmtLeft(h)，口径逐条对齐：
     *   &lt;1 分钟   → N 分钟，最少 1（绝不写「0 分钟」）
     *   &lt;1 小时   → N 分钟
     *   &lt;48 小时  → H 小时 [M 分]（整点不写 0 分）
     *   ≥48 小时   → N 天（向下取整）
     * 时间戳读不到 / 已过期 → 空串，调用方不许拿空串当「已过期」。
     */
    public static String durText(long ts, long nowSec) {
        if (ts <= 0 || nowSec <= 0) return "";
        long leftSec = ts - nowSec;
        if (leftSec < 0) return "";
        long leftMin = leftSec / 60;
        if (leftMin < 60) {
            long m = leftMin < 1 ? 1 : leftMin;
            return m + " \u5206\u949f";                                // N 分钟
        }
        if (leftMin < 48 * 60) {
            long h = leftMin / 60;
            long m = leftMin % 60;
            if (m == 0) return h + " \u5c0f\u65f6";                    // H 小时
            return h + " \u5c0f\u65f6 " + m + " \u5206";
        }
        return (leftMin / 1440) + " \u5929";                           // N 天
    }

    /**
     * 剩余时间文案（带「还剩」前缀）。
     *   &lt;0 → 已过期；其余同 durText；读不到时间 → 空串。
     */
    public static String leftText(long dueTs, long nowSec) {
        if (dueTs <= 0 || nowSec <= 0) return "";
        if (dueTs - nowSec < 0) return "\u5df2\u8fc7\u671f";            // 已过期
        String d = durText(dueTs, nowSec);
        return d.length() == 0 ? "" : ("\u8fd8\u5269 " + d);            // 还剩 …
    }

    /** 紧急度颜色。读不到时间的给正常行色（那一档根本不该上桌，这里只是兜底不抛）。 */
    public static int colorOf(long dueTs, long nowSec) {
        if (dueTs <= 0 || nowSec <= 0) return C_NORMAL;
        long leftSec = dueTs - nowSec;
        if (leftSec < 24L * 3600L) return C_SOON;
        if (leftSec < 72L * 3600L) return C_MID;
        return C_NORMAL;
    }

    /** 行首记号。作业 ⏰、考试 ✎；未开考的考试单独一个记号，免得让人以为现在就能做。 */
    public static String markOf(int kind, boolean upcoming) {
        if (kind == KIND_EXAM) return upcoming ? "\u23f3 " : "\u270e ";   // ⏳ / ✎
        return "\u23f0 ";                                                   // ⏰
    }

    /**
     * 一整行文字。形状刻意与课程行分开：课程行是「▶ 1节 系统解剖学  @A201」，
     * 待办行是「⏰ 病理实验报告 · 还剩 25 分钟」，前缀记号不同、分隔符不同，
     * 一眼就能分辨这两类东西。
     */
    public static String line(Item it, long nowSec) {
        if (it == null) return "";
        String nm = it.name == null ? "" : it.name.trim();
        if (nm.length() == 0) nm = "\u672a\u547d\u540d\u4f5c\u4e1a";      // 未命名作业
        String left = leftText(it.dueTs, nowSec);
        String body = markOf(it.kind, it.upcoming) + nm;
        if (left.length() > 0) body = body + " \u00b7 " + left;           // " · "
        return body;
    }

    /**
     * 挑出该上桌的那几条，按截止时间从近到远。
     * 过滤三条：状态是完成的不留、截止已过的不留、读不到时间的不留。
     * max &lt;= 0 返回空表。
     */
    public static List<Item> pick(List<Item> all, long nowSec, int max) {
        List<Item> out = new ArrayList<Item>();
        if (all == null || max <= 0 || nowSec <= 0) return out;
        for (int i = 0; i < all.size(); i++) {
            Item it = all.get(i);
            if (it == null) continue;
            if (stateOf(it.status) == DONE) continue;
            if (it.dueTs <= 0) continue;
            if (it.dueTs <= nowSec) continue;
            out.add(it.copy());
        }
        Collections.sort(out, new Comparator<Item>() {
            public int compare(Item a, Item b) {
                if (a.dueTs != b.dueTs) return a.dueTs < b.dueTs ? -1 : 1;   // 早的在前
                return a.name.compareTo(b.name);                             // 同刻按名字，结果稳定
            }
        });
        if (out.size() > max) return new ArrayList<Item>(out.subList(0, max));
        return out;
    }

    /** 一共有几件还没交、还没过截止、且读得到时间。用于「今天没课 · 有 N 件要交」里的 N。 */
    public static int count(List<Item> all, long nowSec) {
        if (all == null || nowSec <= 0) return 0;
        int n = 0;
        for (int i = 0; i < all.size(); i++) {
            Item it = all.get(i);
            if (it == null) continue;
            if (stateOf(it.status) == DONE) continue;
            if (it.dueTs <= 0) continue;
            if (it.dueTs <= nowSec) continue;
            n++;
        }
        return n;
    }
}
