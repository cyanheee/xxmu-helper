package com.xxmu.helper;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 课程提醒的闹钟调度（唯一实现）。
 *
 * 为什么单独抽一个类：
 *   挂闹钟这件事有两个入口——①用户在 App 里开提醒（前端调 Host.scheduleReminders）；
 *   ②手机重启 / App 自更新之后，系统会把 AlarmManager 里所有闹钟清空，
 *   需要从本地存的那份列表重新挂回去（BootReceiver 调 restore）。
 *   两处必须用完全一样的 requestCode、一样的 PendingIntent 构造方式，
 *   否则 cancel 不掉、或者重复挂两条同样的通知。放一处才不会分叉。
 *
 * 存的是什么：
 *   存「已经过滤掉过去时刻」的那份 JSON 数组，原样存 SharedPreferences。
 *   重启后直接重放，不需要重新算课表（重启时 WebView 没起来，算不了）。
 *   代价是学期中改了课表但没打开 App 的话，重启会重挂旧课表——
 *   可下次打开 App 前端会立刻 cancel + 重挂，自动纠正。
 */
final class ReminderScheduler {

    /** SharedPreferences 文件名，与 MainActivity.PREFS 一致 */
    static final String PREFS = "xxmu";
    /** 待重挂的提醒列表（JSON 数组字符串） */
    static final String KEY_LIST = "xxmu_remind_list";

    /** 与前端约定：最多挂 200 条，requestCode 1..200 */
    static final int MAX = 200;

    private ReminderScheduler() {}

    /** 生成闹钟 PendingIntent。schedule 与 cancel 必须走同一份构造，否则对不上。 */
    private static PendingIntent pi(Context ctx, int code) {
        Intent it = new Intent(ctx, ReminderReceiver.class);
        int flags = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        return PendingIntent.getBroadcast(ctx, code, it, flags);
    }

    /** 清掉所有已挂闹钟 + 本地存的那份列表 */
    static void cancelAll(Context ctx) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am != null) {
                for (int i = 1; i <= MAX; i++) {
                    PendingIntent p = pi(ctx, i);
                    if (p != null) am.cancel(p);
                }
            }
        } catch (Throwable ignored) {}
        try {
            prefs(ctx).edit().remove(KEY_LIST).apply();
        } catch (Throwable ignored) {}
    }

    /**
     * 挂一批提醒（参数为前端算好的 JSON 数组），并落盘供重启后重挂。
     * 返回真正挂上的条数。
     */
    static int schedule(Context ctx, String json) {
        if (json == null || json.length() == 0) return 0;
        int n = 0;
        JSONArray keep = new JSONArray();   // 只留未来项，存这份
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return 0;
            JSONArray arr = new JSONArray(json);
            long now = System.currentTimeMillis();
            for (int i = 0; i < arr.length() && keep.length() < MAX; i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                long at = o.optLong("at", 0);
                if (at <= now) continue;    // 过去的不挂，避免一开就弹一堆过期通知

                Intent it = new Intent(ctx, ReminderReceiver.class);
                it.putExtra("name", o.optString("name", ""));
                it.putExtra("room", o.optString("room", ""));
                it.putExtra("mins", o.optInt("mins", 15));
                /* v1.1.41：提醒方式一起落盘。前端 build() 每项都带 mode，
                 * optString 默认 alarm —— 老版本存的列表里没有这个字段，
                 * 重挂时照常响铃，不会因为升级就变成静默。 */
                it.putExtra("mode", o.optString("mode", ReminderReceiver.MODE_ALARM));
                int flags = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
                PendingIntent p = PendingIntent.getBroadcast(
                        ctx, keep.length() + 1, it,
                        flags | PendingIntent.FLAG_UPDATE_CURRENT);

                boolean ok = set(am, at, p);
                if (ok) {
                    n++;
                    keep.put(o);
                }
            }
        } catch (Throwable ignored) {}

        try {
            prefs(ctx).edit().putString(KEY_LIST, keep.toString()).apply();
        } catch (Throwable ignored) {}
        return n;
    }

    /** 重启 / 更新后，按本地那份列表重挂。 */
    static void restore(Context ctx) {
        try {
            String json = prefs(ctx).getString(KEY_LIST, "");
            if (json == null || json.length() == 0) return;
            schedule(ctx, json);
        } catch (Throwable ignored) {}
    }

    /** 挂一个闹钟：优先精确；被系统拒（Android 12+ 用户关了「闹钟和提醒」）时退非精确。 */
    private static boolean set(AlarmManager am, long at, PendingIntent p) {
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                // 非精确：可能晚几分钟，但提醒还在，比一条都挂不上要好
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
            } else if (Build.VERSION.SDK_INT >= 23) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, at, p);
            }
            return true;
        } catch (Throwable e) {
            try {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
                return true;
            } catch (Throwable ignored) {
                return false;
            }
        }
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
