package com.xxmu.helper;

/* 河医大助手 · 桌面小组件的时间算术（v2.10.0 抽出）
 *
 * 为什么单独一个类：这段逻辑（把 times 切成起止分钟、"08:00" ↔ 480、"23 分钟" / "1 小时 7 分"、
 * 一条课现在是「已上完 / 正在上 / 还没开始」）是整块小组件里唯一有分支、会算错、且错了会
 * 当着用户面说错话的部分。它不需要 Android、不需要 JSON、不需要 RemoteViews ——
 * 抽出来就能用 javac + java 直接跑真单测（tools/test_widget.js 就是这么做的）。
 *
 * 剩下的那些（读文件、拼 RemoteViews、JSON、PendingIntent）都是「有线就连」的代码，
 * 错了一眼能看出来，不值得为它造一套 Android 测试环境。
 *
 * 三条与调用方共享的约定：
 *   · 任何表（starts / ends）越界或没建起来 → seg() 返回 -1，调用方据此闭嘴不报时间
 *   · stateOf() 返回 -1 = 不知道（没钟点表），此时不许加记号、不许改颜色
 *   · 所有方法对 null / 空串都返回安全值，绝不抛
 */
public final class WidgetClock {

    public static final int UNKNOWN = -1;
    public static final int TODO = 0;
    public static final int NOW = 1;
    public static final int DONE = 2;

    private WidgetClock() { }

    /** "08:00" → 480；"8:00" 也行；认不出返回 -1。 */
    public static int minuteOf(String hhmm) {
        if (hhmm == null) return -1;
        String s = hhmm.trim();
        int c = s.indexOf(':');
        if (c <= 0 || c + 1 >= s.length()) return -1;
        try {
            int h = Integer.parseInt(s.substring(0, c).trim());
            int m = Integer.parseInt(s.substring(c + 1).trim());
            if (h < 0 || h > 24 || m < 0 || m > 59) return -1;
            if (h == 24 && m != 0) return -1;
            return h * 60 + m;
        } catch (Throwable e) {
            return -1;
        }
    }

    /** "08:00~08:40" → {480, 520}；"~" "-" "～" "–" 都认；认不出返回 null。 */
    public static int[] parseSeg(String seg) {
        if (seg == null) return null;
        int cut = -1;
        String seps = "~-～–—";
        for (int i = 0; i < seg.length(); i++) {
            if (seps.indexOf(seg.charAt(i)) >= 0) { cut = i; break; }
        }
        if (cut <= 0 || cut + 1 >= seg.length()) return null;
        int a = minuteOf(seg.substring(0, cut));
        int b = minuteOf(seg.substring(cut + 1));
        if (a < 0 || b < 0 || b <= a) return null;
        return new int[]{a, b};
    }

    /**
     * 把 times 数组建成「下标 = 节次」的表。第 i 档落在下标 i+1（第 1 节 = times[0]）。
     * 任何一档解析失败就整块放弃、返回 null —— 宁可不报时间，也不报错时间。
     * @param starts true 取每档的起始分钟，false 取结束分钟
     */
    public static int[] build(String[] segs, boolean starts) {
        if (segs == null || segs.length == 0) return null;
        int[] t = new int[segs.length + 1];
        for (int i = 0; i < segs.length; i++) {
            int[] pair = parseSeg(segs[i]);
            if (pair == null) return null;
            t[i + 1] = starts ? pair[0] : pair[1];
        }
        return t;
    }

    /** 越界 / 表没建起来 → -1。 */
    public static int seg(int[] t, int period) {
        if (t == null || period < 1 || period >= t.length) return -1;
        return t[period];
    }

    /** 480 → "08:00" */
    public static String hm(int min) {
        if (min < 0) return "";
        int h = min / 60, m = min % 60;
        return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
    }

    /** 23 → "23 分钟"；67 → "1 小时 7 分"；60 → "1 小时"；负数按 0 算。 */
    public static String span(int min) {
        if (min < 0) min = 0;
        if (min < 60) return min + " 分钟";
        int h = min / 60, m = min % 60;
        return m == 0 ? (h + " 小时") : (h + " 小时 " + m + " 分");
    }

    /**
     * 一条课此刻的状态。没钟点表（st/en 为 null）或这一条算不出起止 → UNKNOWN。
     * 边界口径：下课那一分钟算「已上完」，上课那一分钟算「正在上」（与 web 端 nowline.js 一致）。
     */
    public static int stateOf(int[] st, int[] en, int first, int last, int nowMin) {
        int a = seg(st, first);
        int b = seg(en, last);
        if (a < 0 || b < 0 || nowMin < 0) return UNKNOWN;
        if (nowMin > b) return DONE;
        if (nowMin >= a) return NOW;
        return TODO;
    }

    /** 行首记号。UNKNOWN 与 TODO 都给空白：不知道就不许装懂。 */
    public static String markOf(int state) {
        if (state == NOW) return "▶ ";
        if (state == DONE) return "· ";
        return "   ";
    }

    /** 行文字颜色（ARGB）。与 widget_bg 的深舱渐变 #1D1538→#100B22 对比度都过 4.5。 */
    public static int colorOf(int state) {
        if (state == NOW) return 0xFF9E8CFF;
        if (state == DONE) return 0xFF8A82A0;
        return 0xFFEFE9FF;
    }

    /**
     * 副标题。这是小组件上唯一一句人话，四档：
     *   不知道钟点 → 「今天 N 节课 · 点开看课表」（老文案，不装懂）
     *   正在上     → 「正在上 · 还有 23 分钟 下课」
     *   还没开始   → 「下节 14:30 · 1 小时 7 分后」
     *   都上完了   → 「今天的课上完了 · 共 3 节」
     * @param firsts / lasts 已按 first 升序排好的节次；n 为有效条数
     */
    public static String subText(int[] st, int[] en, int[] firsts, int[] lasts, int n, int nowMin) {
        if (st == null || en == null) return "今天 " + n + " 节课 · 点开看课表";
        int cur = -1, next = -1;
        for (int i = 0; i < n; i++) {
            int state = stateOf(st, en, firsts[i], lasts[i], nowMin);
            if (state == NOW && cur < 0) cur = i;
            else if (state == TODO && next < 0) next = i;
        }
        if (cur >= 0) {
            int left = seg(en, lasts[cur]) - nowMin;
            return "正在上 · 还有 " + span(left) + " 下课";
        }
        if (next >= 0) {
            int at = seg(st, firsts[next]);
            return "下节 " + hm(at) + " · " + span(at - nowMin) + "后";
        }
        return "今天的课上完了 · 共 " + n + " 节";
    }
}
