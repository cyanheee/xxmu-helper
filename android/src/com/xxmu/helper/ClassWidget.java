package com.xxmu.helper;

/* 河医大助手 · 今日课程桌面小组件（借鉴 tangli「今日课程」组件）
 *
 * 设计原则：
 *   · 只读本机课表文件，绝不联网、绝不请求教务 Cookie
 *   · 读不到 / 解析失败 → 显示「读不到课表」，绝不拿旧数据冒充
 *   · 周次口径与 web/app.js 一致：开学日是第 1 周周一
 *   · 手动 refresh() 由 Host.saveCachedSchedule 触发，避免等 30 分钟系统轮询
 *
 * v2.10.0（这一版做了什么）：
 *   · 用课表缓存里的 times（16 档作息串，一直躺着没人读）算出「现在几点、这节课几点下课、
 *     下一节还有多久」，副标题从「今天 N 节课」变成「正在上 · 还有 23 分钟下课」这类可执行信息
 *   · 每一行左侧加状态记号与颜色：▶ 正在上（主色）/ · 已上完（灰）/ 空 还没开始（原色），
 *     这样「今天上到哪儿了」不用读文字，扫一眼颜色就知道
 *   · 修两个会说谎的老毛病：①没设开学日时原来拿硬编码 2026-08-31 顶、算出的周次筛不出课，
 *     于是副标题写「今天没课，去玩吧」——现在改成直说「还没设开学日」②周次超过总周数时
 *     同样会落到「今天没课」，现在说「这学期已经上完了」
 *
 * v2.12.0（这一版做了什么）：
 *   · 作业与考试截止上桌面。v2.10/v2.11 的注释里一直写着「作业考试不上组件，
 *     那是学习页的事」—— 但组件本来就有 4 行，两节课的日子空 2 行，没课的日子整片空着。
 *     空着不显示，不是「克制」，是浪费。
 *   · 取舍（写死在这里，改的时候要一起想）：课程行在前、待办行填后面的空位。
 *     今天课多到占满 4 行，待办就不显示 —— 课是「此刻要去哪」，作业是「之后要做什么」，
 *     抢位置时课赢。今天没课时 4 行全给待办，这是收益最大的一格。
 *   · 顺带修一句假话：「今天没课，去玩吧」在有作业待交时不能说。现在说
 *     「今天没课 · N 件要交」；真的一件没有才说去玩吧。
 *   · 计算全在 WidgetDue（纯 Java、无 Android 依赖、有真单测），组件只负责取数据与填 RemoteViews。
 *
 * v2.11.0（这一版做了什么）：
 *   · 改课表指令的四种变换（加课 / 停课 / 调课 / 放假）全部对齐 App。
 *     v2.10.0 时这里只认「加课」，注释写「宁可少显示，也不显示错的」——
 *     但用户在 App 里停了课、调了课、放了假之后，组件照旧显示原课表，
 *     那不是「少显示」，那是显示一份已经不存在的课表。现在走 WidgetOps.apply()，
 *     与 web/lesson-cmd.js 的 apply() 逐条对齐，变换本身在纯 Java 侧跑、有真单测。
 */
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

public class ClassWidget extends AppWidgetProvider {

    private static final String PREFS = "xxmu";
    private static final String K_KB = "schedule_cache.json";
    private static final int WEEKS_DEFAULT = 21;
    private static final String[] DAYS = {"", "周一", "周二", "周三", "周四", "周五", "周六", "周日"};
    private static final int[] ROW_IDS = {
            R.id.wrow1, R.id.wrow2, R.id.wrow3, R.id.wrow4
    };

    /* 行状态三色不在这里定义：v2.10.0 起由 WidgetClock.colorOf() 统一给
     * （抽出去是为了能给颜色/状态判定写不依赖 Android 的真单测，见 WidgetClock 文件头）。 */

    /** 课表缓存写完后调一次，让小组件立刻重画。 */
    public static void refresh(Context ctx) {
        try {
            Intent i = new Intent(ctx, ClassWidget.class)
                    .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            int[] ids = AppWidgetManager.getInstance(ctx)
                    .getAppWidgetIds(new ComponentName(ctx, ClassWidget.class));
            i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            ctx.sendBroadcast(i);
        } catch (Throwable ignored) { }
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_today);
            try {
                paint(ctx, v);
            } catch (Throwable e) {
                v.setTextViewText(R.id.wtitle, "读不到课表");
                v.setTextViewText(R.id.wsub, "打开 App 同步一次");
                for (int rid : ROW_IDS) v.setTextViewText(rid, "");
            }
            /* 点组件打开课表页。PendingIntent 必须带可变 flag 之外的默认即可，
             * 这里用 FLAG_UPDATE_CURRENT；targetSdk 33 下不指定 FLAG_IMMUTABLE
             * 会在部分 ROM 上被拦，显式给 IMMUTABLE 更稳。 */
            try {
                Intent open = new Intent(ctx, MainActivity.class);
                PendingIntent pi = PendingIntent.getActivity(ctx, 0, open,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                v.setOnClickPendingIntent(R.id.wroot, pi);
            } catch (Throwable ignored) { }
            mgr.updateAppWidget(id, v);
        }
    }

    private void paint(Context ctx, RemoteViews v) throws Exception {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String start = p.getString("xxmu_start", "");
        int totalWeeks = parseInt(p.getString("xxmu_weeks", ""), WEEKS_DEFAULT);

        Calendar cal = Calendar.getInstance();
        int day = ((cal.get(Calendar.DAY_OF_WEEK) + 5) % 7) + 1;   // 周一=1 … 周日=7
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd", Locale.CHINA);
        long today = parseDay(sdf.format(cal.getTime()));
        long s = parseDay(start);
        int week = s > 0 ? (int) ((today - s) / 604800000L) + 1 : 0;

        v.setTextViewText(R.id.wtitle, (week >= 1 && week <= totalWeeks)
                ? "第 " + week + " 周 · " + DAYS[day] : DAYS[day]);

        /* v2.10.0：开学日没设过就不算周次。
         * 老版本在这里用硬编码 START_DEFAULT 顶上，算出来的周次跟课表里的 weeks 对不上，
         * 筛不出任何课 → 副标题写「今天没课，去玩吧」。那是撒谎：可能有课，只是不知道第几周。
         * 现在直接说清楚，让人去设置里设一次。 */
        if (week < 1) {
            v.setTextViewText(R.id.wsub, "还没设开学日 · 去设置里设一次");
            for (int rid : ROW_IDS) v.setTextViewText(rid, "");
            return;
        }
        if (week > totalWeeks) {
            v.setTextViewText(R.id.wsub, "这学期（共 " + totalWeeks + " 周）已经上完了");
            for (int rid : ROW_IDS) v.setTextViewText(rid, "");
            return;
        }

        String raw = readSchedule(ctx);
        if (raw == null || raw.length() < 20) {
            v.setTextViewText(R.id.wsub, "还没有课表，去 App 同步一次");
            for (int rid : ROW_IDS) v.setTextViewText(rid, "");
            return;
        }

        JSONObject d = new JSONObject(raw);
        JSONArray courses = d.optJSONArray("courses");
        if (courses == null) {
            v.setTextViewText(R.id.wsub, "课表内容读不出来");
            for (int rid : ROW_IDS) v.setTextViewText(rid, "");
            return;
        }

        /* v2.11.0：改课表指令四种变换全部对齐 App。
         *
         * 原来这里只认「加课」，理由是「停/调/假需要完整 JSON 变换，组件上不重算」。
         * 但用户停了课 / 调了课 / 放了假之后，组件照旧显示原课表 —— 那不是「少显示」，
         * 那是显示一份已经不存在的课表。现在交给 WidgetOps.apply()，四种变换与
         * web/lesson-cmd.js 的 apply() 逐条对齐，且变换在纯 Java 侧跑（有真单测）。
         *
         * 顺序很重要：先叠加再按「今天 + 本周」筛。反过来筛完再叠加，调课到今天的课会看不见，
         * 放假剔了周次的也筛不出来。 */
        List<WidgetOps.Course> all = new ArrayList<>();
        for (int i = 0; i < courses.length(); i++) {
            JSONObject c = courses.optJSONObject(i);
            if (c == null) continue;
            all.add(WidgetOps.make(text(c.optString("name", "未命名")), text(c.optString("room", "")),
                    c.optInt("day", 0), toInts(c.optJSONArray("weeks")),
                    toInts(c.optJSONArray("periods"))));
        }
        all = WidgetOps.apply(all, readOps(p.getString("xxmu_kb_ops", "")));

        List<Row> rows = new ArrayList<>();
        for (int i = 0; i < all.size(); i++) {
            WidgetOps.Course c = all.get(i);
            if (c == null || c.day != day) continue;
            if (!WidgetOps.has(c.weeks, week)) continue;
            rows.add(new Row(firstOf(c.periods), lastOf(c.periods), c.name, c.room));
        }
        Collections.sort(rows, new Comparator<Row>() {
            public int compare(Row a, Row b) {
                if (a.first != b.first) return a.first - b.first;
                return a.last - b.last;
            }
        });

        if (rows.isEmpty()) {
            /* v2.12.0：今天没课也不能张口就说「去玩吧」—— 手里可能还压着作业。
             * 有要交的就把那几行直接摆出来，副标题写清件数。 */
            List<WidgetDue.Item> due0 = readDue(p);
            long now0 = System.currentTimeMillis() / 1000L;
            int cnt0 = WidgetDue.count(due0, now0);
            if (cnt0 <= 0) {
                v.setTextViewText(R.id.wsub, "今天没课，去玩吧");
                for (int rid : ROW_IDS) v.setTextViewText(rid, "");
                return;
            }
            v.setTextViewText(R.id.wsub, "今天没课 · " + cnt0 + " 件要交");
            List<WidgetDue.Item> show0 = WidgetDue.pick(due0, now0, ROW_IDS.length);
            for (int i = 0; i < ROW_IDS.length; i++) {
                if (i >= show0.size()) { v.setTextViewText(ROW_IDS[i], ""); continue; }
                WidgetDue.Item it = show0.get(i);
                v.setTextViewText(ROW_IDS[i], WidgetDue.line(it, now0));
                v.setTextColor(ROW_IDS[i], WidgetDue.colorOf(it.dueTs, now0));
            }
            return;
        }

        /* v2.10.0：把 times 读成「第 N 节 × 起止分钟」。
         * 缓存里少一节 / 有一档解析不了就整块放弃（两个表都是 null），退回老文案 ——
         * 宁可不报时间，也不报错时间。算法全在 WidgetClock，组件这边只负责取数据。 */
        JSONArray times = d.optJSONArray("times");
        String[] segs = null;
        if (times != null && times.length() > 0) {
            segs = new String[times.length()];
            for (int i = 0; i < times.length(); i++) segs[i] = times.optString(i, "");
        }
        int[] tStart = WidgetClock.build(segs, true);
        int[] tEnd = WidgetClock.build(segs, false);
        int nowMin = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE);

        int n = rows.size();
        int[] firsts = new int[n];
        int[] lasts = new int[n];
        for (int i = 0; i < n; i++) {
            firsts[i] = rows.get(i).first;
            lasts[i] = rows.get(i).last;
        }
        v.setTextViewText(R.id.wsub, WidgetClock.subText(tStart, tEnd, firsts, lasts, n, nowMin));

        /* v2.12.0：课程行在前，剩下几行给待办。
         * 抢位置时课赢 —— 课是「此刻要去哪」，作业是「之后要做什么」。
         * 今天课占满 4 行就一条待办都不显示（不是漏了，是排不下）。 */
        List<WidgetDue.Item> due = readDue(p);
        List<WidgetDue.Item> dueShow = due.isEmpty()
                ? due : WidgetDue.pick(due, System.currentTimeMillis() / 1000L, ROW_IDS.length - rows.size());

        for (int i = 0; i < ROW_IDS.length; i++) {
            if (i >= rows.size()) {
                int k = i - rows.size();
                if (k >= dueShow.size()) { v.setTextViewText(ROW_IDS[i], ""); continue; }
                WidgetDue.Item it = dueShow.get(k);
                long nowD = System.currentTimeMillis() / 1000L;
                v.setTextViewText(ROW_IDS[i], WidgetDue.line(it, nowD));
                v.setTextColor(ROW_IDS[i], WidgetDue.colorOf(it.dueTs, nowD));
                continue;
            }
            Row r = rows.get(i);
            int state = WidgetClock.stateOf(tStart, tEnd, r.first, r.last, nowMin);
            /* 行首仍写节次而不是钟点：一行只有 maxLines=1 + ellipsize=end，
             * 「08:00」比「1节」多占三格，会把教室名挤掉；钟点已经在副标题给出。 */
            String head = r.first > 0 ? r.first + "节" : "";
            v.setTextViewText(ROW_IDS[i], WidgetClock.markOf(state)
                    + (head.length() > 0 ? head + " " : "") + r.name
                    + (r.room.length() > 0 ? "  @" + r.room : ""));
            v.setTextColor(ROW_IDS[i], WidgetClock.colorOf(state));
        }
    }

    /**
     * 读作业/考试截止（v2.12.0）。
     *
     * 数据在 SharedPreferences 的 xxmu_cx_homework 键里 —— 那是 web/chaoxing.js 同步成功后
     * 自己 Host.setPref 写进去的整份 JSON（works + exams + meta），不是 homework_cache.json
     * （后者是 Host.saveCachedHomework 的另一条路，web/ 里没有调用点）。
     *
     * 读不到 / 解析失败 / 没同步过 → 空列表。空列表的意思是「桌面上不显示待办」，
     * 不是「没有作业」。这个区别很重要：宁可让用户进 App 看，也不要在桌面上写「没有要交的」。
     */
    private List<WidgetDue.Item> readDue(SharedPreferences p) {
        List<WidgetDue.Item> out = new ArrayList<>();
        String raw;
        try { raw = p.getString("xxmu_cx_homework", ""); }
        catch (Throwable e) { return out; }
        if (raw == null || raw.length() < 20) return out;
        try {
            JSONObject d = new JSONObject(raw);
            JSONArray works = d.optJSONArray("works");
            if (works != null) {
                for (int i = 0; i < works.length(); i++) {
                    JSONObject w = works.optJSONObject(i);
                    if (w == null) continue;
                    out.add(WidgetDue.make(WidgetDue.KIND_WORK,
                            text(w.optString("name", "")), text(w.optString("course", "")),
                            w.optLong("end_ts", 0L), w.optString("status", ""), false));
                }
            }
            JSONArray exams = d.optJSONArray("exams");
            if (exams != null) {
                for (int i = 0; i < exams.length(); i++) {
                    JSONObject e = exams.optJSONObject(i);
                    if (e == null) continue;
                    out.add(WidgetDue.make(WidgetDue.KIND_EXAM,
                            text(e.optString("name", "")), text(e.optString("course", "")),
                            e.optLong("end_ts", 0L), e.optString("status", ""),
                            e.optBoolean("upcoming", false)));
                }
            }
        } catch (Throwable ignored) { }
        return out;
    }

    /** 与前端一致：外部 schedule.json → App 内缓存。读失败返回 null，不假装没数据。 */
    private String readSchedule(Context ctx) {
        File ext = new File(ctx.getExternalFilesDir(null), "schedule.json");
        String a = readFile(ext);
        if (a != null && a.length() >= 20) return a;
        String b = readFile(new File(ctx.getFilesDir(), K_KB));
        return b;
    }

    private String readFile(File f) {
        try {
            if (f == null || !f.exists() || f.length() < 20) return "";
            try (FileInputStream in = new FileInputStream(f)) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                return new String(bo.toByteArray(), "UTF-8").trim();
            }
        } catch (Throwable e) {
            return null;
        }
    }

    /** JSON 数字数组 → int[]。缺字段 / 坏元素一律跳过，不塞 0（0 会污染 max/min）。 */
    private static int[] toInts(JSONArray a) {
        if (a == null || a.length() == 0) return new int[0];
        int n = 0;
        int[] tmp = new int[a.length()];
        for (int i = 0; i < a.length(); i++) {
            int v = a.optInt(i, 0);
            if (v > 0) tmp[n++] = v;
        }
        if (n == a.length()) return tmp;
        int[] r = new int[n];
        System.arraycopy(tmp, 0, r, 0, n);
        return r;
    }

    /** 读 xxmu_kb_ops（App 写的是 JSON 字符串），转成 WidgetOps 认的扁平 key/value 列表。
     *  读坏 / 空 → 空列表 = 不叠加，绝不让一条坏指令把整张课表清空。 */
    private static List<List<String>> readOps(String opsRaw) {
        List<List<String>> out = new ArrayList<>();
        if (opsRaw == null || opsRaw.length() < 2) return out;
        try {
            JSONArray ops = new JSONArray(opsRaw);
            for (int i = 0; i < ops.length(); i++) {
                JSONObject op = ops.optJSONObject(i);
                if (op == null) continue;
                List<String> kv = new ArrayList<>();
                put(kv, "type", op.optString("type", ""));
                put(kv, "name", op.optString("name", ""));
                putNum(kv, "day", op.optInt("day", 0));
                put(kv, "weeks", joinInts(op.optJSONArray("weeks")));
                put(kv, "periods", joinInts(op.optJSONArray("periods")));
                put(kv, "room", op.optString("room", ""));
                JSONObject from = op.optJSONObject("from");
                if (from != null) {
                    putNum(kv, "from.day", from.optInt("day", 0));
                    put(kv, "from.weeks", joinInts(from.optJSONArray("weeks")));
                    put(kv, "from.periods", joinInts(from.optJSONArray("periods")));
                }
                JSONObject to = op.optJSONObject("to");
                if (to != null) {
                    putNum(kv, "to.day", to.optInt("day", 0));
                    put(kv, "to.weeks", joinInts(to.optJSONArray("weeks")));
                    put(kv, "to.periods", joinInts(to.optJSONArray("periods")));
                    put(kv, "to.room", to.optString("room", ""));
                }
                out.add(kv);
            }
        } catch (Throwable ignored) { }
        return out;
    }

    private static void put(List<String> kv, String k, String v) {
        kv.add(k); kv.add(v == null ? "" : v);
    }
    private static void putNum(List<String> kv, String k, int v) {
        kv.add(k); kv.add(v > 0 ? Integer.toString(v) : "");
    }
    private static String joinInts(JSONArray a) {
        if (a == null || a.length() == 0) return "";
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < a.length(); i++) {
            int v = a.optInt(i, 0);
            if (v <= 0) continue;
            if (b.length() > 0) b.append(',');
            b.append(v);
        }
        return b.toString();
    }

    private static int firstOf(int[] a) {
        int min = 0;
        for (int i = 0; i < a.length; i++) if (a[i] > 0 && (min == 0 || a[i] < min)) min = a[i];
        return min;
    }
    /** 连堂课要知道「最后一节」，才能算下课时间。 */
    private static int lastOf(int[] a) {
        int max = 0;
        for (int i = 0; i < a.length; i++) if (a[i] > max) max = a[i];
        return max;
    }
    /** tStart / tEnd 都是「下标 = 节次」的表；越界返回 -1（调用方据此放弃报时间）。 */
    private static int parseInt(String s, int def) {
        try { return Integer.parseInt(String.valueOf(s).trim()); }
        catch (Throwable e) { return def; }
    }
    private static long parseDay(String s) {
        try {
            String[] a = s.split("-");
            Calendar c = Calendar.getInstance();
            c.clear();
            c.set(Integer.parseInt(a[0]), Integer.parseInt(a[1]) - 1, Integer.parseInt(a[2]));
            return c.getTimeInMillis();
        } catch (Throwable e) { return 0; }
    }
    private static String text(String s) {
        return s == null ? "" : s.replace("&ensp;", " ").replace("&nbsp;", " ").trim();
    }

    private static final class Row {
        final int first; final int last; final String name; final String room;
        Row(int f, int l, String n, String r) { first = f; last = l; name = n; room = r; }
    }
}
