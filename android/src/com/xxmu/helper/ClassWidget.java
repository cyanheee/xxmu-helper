package com.xxmu.helper;

/* 河医大助手 · 今日课程桌面小组件（借鉴 tangli「今日课程」组件）
 *
 * 设计原则：
 *   · 只读本机课表文件，绝不联网、绝不请求教务 Cookie
 *   · 读不到 / 解析失败 → 显示「读不到课表」，绝不拿旧数据冒充
 *   · 周次口径与 web/app.js 一致：开学日是第 1 周周一
 *   · 手动 refresh() 由 Host.saveCachedSchedule 触发，避免等 30 分钟系统轮询
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
    private static final String START_DEFAULT = "2026-08-31";
    private static final int WEEKS_DEFAULT = 21;
    private static final String[] DAYS = {"", "周一", "周二", "周三", "周四", "周五", "周六", "周日"};
    private static final int[] ROW_IDS = {
            R.id.wrow1, R.id.wrow2, R.id.wrow3, R.id.wrow4
    };

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
        if (start == null || start.length() == 0) start = START_DEFAULT;
        int totalWeeks = parseInt(p.getString("xxmu_weeks", ""), WEEKS_DEFAULT);

        Calendar cal = Calendar.getInstance();
        int day = ((cal.get(Calendar.DAY_OF_WEEK) + 5) % 7) + 1;   // 周一=1 … 周日=7
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd", Locale.CHINA);
        long today = parseDay(sdf.format(cal.getTime()));
        long s = parseDay(start);
        int week = s > 0 ? (int) ((today - s) / 604800000L) + 1 : 0;

        v.setTextViewText(R.id.wtitle, (week >= 1 && week <= totalWeeks)
                ? "第 " + week + " 周 · " + DAYS[day] : DAYS[day]);

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

        /* 叠加 AI 改课表指令时只认「加课」；停/调/假需要完整 JSON 变换，
         * 组件上不重算（宁可少显示，也不显示错的）。 */
        String opsRaw = p.getString("xxmu_kb_ops", "");

        List<Row> rows = new ArrayList<>();
        for (int i = 0; i < courses.length(); i++) {
            JSONObject c = courses.optJSONObject(i);
            if (c == null) continue;
            if (c.optInt("day", 0) != day) continue;
            JSONArray wk = c.optJSONArray("weeks");
            if (!contains(wk, week)) continue;
            JSONArray ps = c.optJSONArray("periods");
            int first = firstOf(ps);
            rows.add(new Row(first, text(c.optString("name", "未命名")),
                    text(c.optString("room", ""))));
        }
        /* 只叠加「加课」指令里落在本周本天的条目 */
        if (opsRaw != null && opsRaw.length() > 2) {
            try {
                JSONArray ops = new JSONArray(opsRaw);
                for (int i = 0; i < ops.length(); i++) {
                    JSONObject op = ops.optJSONObject(i);
                    if (op == null || !"add".equals(op.optString("type"))) continue;
                    if (op.optInt("day", 0) != day) continue;
                    if (!contains(op.optJSONArray("weeks"), week)) continue;
                    int first = firstOf(op.optJSONArray("periods"));
                    rows.add(new Row(first, text(op.optString("name", "加课")),
                            text(op.optString("room", ""))));
                }
            } catch (Throwable ignored) { }
        }
        Collections.sort(rows, new Comparator<Row>() {
            public int compare(Row a, Row b) { return a.period - b.period; }
        });

        if (rows.isEmpty()) {
            v.setTextViewText(R.id.wsub, "今天没课，去玩吧");
            for (int rid : ROW_IDS) v.setTextViewText(rid, "");
            return;
        }
        v.setTextViewText(R.id.wsub, "今天 " + rows.size() + " 节课 · 点开看课表");
        for (int i = 0; i < ROW_IDS.length; i++) {
            if (i < rows.size()) {
                Row r = rows.get(i);
                v.setTextViewText(ROW_IDS[i],
                        (r.period > 0 ? r.period + "节 " : "") + r.name
                                + (r.room.length() > 0 ? "  @" + r.room : ""));
            } else {
                v.setTextViewText(ROW_IDS[i], "");
            }
        }
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

    private static boolean contains(JSONArray a, int v) {
        if (a == null) return false;
        for (int i = 0; i < a.length(); i++) if (a.optInt(i, 0) == v) return true;
        return false;
    }
    private static int firstOf(JSONArray a) {
        if (a == null || a.length() == 0) return 0;
        int min = Integer.MAX_VALUE;
        for (int i = 0; i < a.length(); i++) {
            int n = a.optInt(i, 0);
            if (n > 0 && n < min) min = n;
        }
        return min == Integer.MAX_VALUE ? 0 : min;
    }
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
        final int period; final String name; final String room;
        Row(int p, String n, String r) { period = p; name = n; room = r; }
    }
}
