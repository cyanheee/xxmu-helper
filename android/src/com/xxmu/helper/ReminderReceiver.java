package com.xxmu.helper;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * 课程提醒的闹钟接收器。
 *
 * 闹钟到点后系统广播到这里，我们发一条本地通知。通知点进去回到主界面。
 *
 * 为什么通知要放在这里、而不是 MainActivity 里做：
 *   闹钟触发时 App 可能根本没在前台（甚至被系统杀了），
 *   AlarmManager 只会把广播丢给 manifest 里注册的 Receiver，
 *   所以 Receiver 必须是独立类、并能在没有 Activity 的情况下工作。
 *
 * 关于小图标：项目没有自定义通知图标资源，用系统的 ic_dialog_info。
 *   smallIcon 是必填且不能为空，否则在部分 ROM 上通知直接不显示。
 */
public class ReminderReceiver extends BroadcastReceiver {

    private static final String CHANNEL_ID = "xxmu_class_reminder";
    private static final String CHANNEL_NAME = "课程提醒";

    @Override
    public void onReceive(Context context, Intent intent) {
        String name = intent == null ? null : intent.getStringExtra("name");
        String room = intent == null ? null : intent.getStringExtra("room");
        int mins = intent == null ? 15 : intent.getIntExtra("mins", 15);
        show(context, name, room, mins);
    }

    /** 发通知。抽成 static 方便以后从别处（比如调试）直接调。 */
    static void show(Context context, String name, String room, int mins) {
        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // API 26+ 必须先建 channel，否则通知静默不显示（且没有报错）
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("上课前提醒");
            nm.createNotificationChannel(ch);
        }

        Intent it = new Intent(context, MainActivity.class);
        it.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent pi = PendingIntent.getActivity(context, 0, it, flags);

        String title = (name == null || name.length() == 0) ? "要上课了" : name;
        String text = mins > 0 ? (mins + " 分钟后上课") : "现在上课";
        if (room != null && room.length() > 0) text += " · " + room;

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(context, CHANNEL_ID)
                : new Notification.Builder(context);
        b.setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(text)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setPriority(Notification.PRIORITY_HIGH);

        // notify 的 id 用当前时间兜底，避免连续两条课的通知互相覆盖
        int id = (int) (System.currentTimeMillis() % Integer.MAX_VALUE);
        try {
            nm.notify(id, b.build());
        } catch (Throwable ignored) {
        }
    }
}
