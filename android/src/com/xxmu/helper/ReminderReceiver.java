package com.xxmu.helper;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

/**
 * 课程提醒的闹钟接收器。
 *
 * 闹钟到点后系统广播到这里，我们按用户选的方式给出提醒。通知点进去回到主界面
 * （短信方式是拉起系统短信编辑页）。
 *
 * 为什么通知要放在这里、而不是 MainActivity 里做：
 *   闹钟触发时 App 可能根本没在前台（甚至被系统杀了），
 *   AlarmManager 只会把广播丢给 manifest 里注册的 Receiver，
 *   所以 Receiver 必须是独立类、并能在没有 Activity 的情况下工作。
 *
 * v1.1.41：三种方式（用户原话「还有课前提醒，不一定非要是闹钟，
 *   可以只设置一条短信，因为有的人不喜欢闹钟提醒」）
 *     alarm  = 响铃，IMPORTANCE_HIGH，heads-up + 声音（老行为，默认值）
 *     silent = 静默，IMPORTANCE_LOW，只进通知栏，不弹不响
 *     sms    = 短信草稿，通知用静默载体，点开拉起系统短信编辑页，
 *              正文预填好，**收件人和「发送」都由用户自己点**
 *
 *   ★ 两个 channel 必须分开建：NotificationChannel 的 importance 是
 *     创建时定死的，之后用 createNotificationChannel 再设一次也改不了。
 *     共用同一个 channel 再动态调低，结果是「选了静默但照样响」——
 *     而且没有任何报错。所以 alarm 沿用旧的 xxmu_class_reminder
 *     （老用户升级后行为不变），静默另开 xxmu_class_reminder_silent。
 *
 *   ★ 绝不自动发短信：不申请 SEND_SMS、不读通讯录、不预填收件人。
 *     ACTION_SENDTO 只是把内容交给系统短信 App 的编辑页，最后一下是用户点的。
 *     「只提示不放行」的反面在这里是「别替用户把话发出去」。
 *
 * 关于小图标：项目没有自定义通知图标资源，用系统的 ic_dialog_info。
 *   smallIcon 是必填且不能为空，否则在部分 ROM 上通知直接不显示。
 */
public class ReminderReceiver extends BroadcastReceiver {

    private static final String CHANNEL_ALARM = "xxmu_class_reminder";
    private static final String CHANNEL_SILENT = "xxmu_class_reminder_silent";

    public static final String MODE_ALARM = "alarm";
    public static final String MODE_SILENT = "silent";
    public static final String MODE_SMS = "sms";

    @Override
    public void onReceive(Context context, Intent intent) {
        String name = intent == null ? null : intent.getStringExtra("name");
        String room = intent == null ? null : intent.getStringExtra("room");
        int mins = intent == null ? 15 : intent.getIntExtra("mins", 15);
        String mode = intent == null ? MODE_ALARM : intent.getStringExtra("mode");
        show(context, name, room, mins, norm(mode));
    }

    /** 脏值一律回落「响铃」：老版本存的列表里没有 mode，也必须照常响。 */
    public static String norm(String m) {
        if (MODE_SILENT.equals(m)) return MODE_SILENT;
        if (MODE_SMS.equals(m)) return MODE_SMS;
        return MODE_ALARM;
    }

    /** 供「试一下」预览按钮直接调（不经过闹钟）。 */
    static void show(Context context, String name, String room, int mins, String modeRaw) {
        final String mode = norm(modeRaw);
        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // API 26+ 必须先建 channel，否则通知静默不显示（且没有报错）
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(
                    MODE_ALARM.equals(mode) ? CHANNEL_ALARM : CHANNEL_SILENT,
                    MODE_ALARM.equals(mode) ? "课程提醒" : "课程提醒（静默）",
                    MODE_ALARM.equals(mode)
                            ? NotificationManager.IMPORTANCE_HIGH
                            : NotificationManager.IMPORTANCE_LOW);
            ch.setDescription(MODE_ALARM.equals(mode) ? "上课前响铃提醒" : "上课前安静提醒，不响不弹");
            nm.createNotificationChannel(ch);
        }

        final String title = (name == null || name.length() == 0) ? "要上课了" : name;
        String text = mins > 0 ? (mins + " 分钟后上课") : "现在上课";
        if (room != null && room.length() > 0) text += " · " + room;

        /* 短信方式：点通知 → 系统短信编辑页，正文写好，收件人空着。
         * smsto: 不带号码，多数 ROM 会开一条新短信让用户自己选联系人。
         * 用 getActivity 而不是 getBroadcast：这一步不该再回到我们自己的代码。 */
        PendingIntent pi;
        int flags = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        if (MODE_SMS.equals(mode)) {
            Intent sms = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:"));
            sms.putExtra("sms_body", smsBody(title, text, room, mins));
            sms.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            pi = PendingIntent.getActivity(context, (int) (System.currentTimeMillis() % 100000),
                    sms, flags | PendingIntent.FLAG_UPDATE_CURRENT);
        } else {
            Intent it = new Intent(context, MainActivity.class);
            it.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            pi = PendingIntent.getActivity(context, 0, it, flags);
        }

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(context,
                        MODE_ALARM.equals(mode) ? CHANNEL_ALARM : CHANNEL_SILENT)
                : new Notification.Builder(context);
        b.setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(MODE_SMS.equals(mode) ? "点这里写短信提醒" : title)
                .setContentText(MODE_SMS.equals(mode)
                        ? (title + "，" + text + "（点开后自己选人发送）") : text)
                .setContentIntent(pi)
                .setAutoCancel(true);

        if (MODE_ALARM.equals(mode)) {
            b.setPriority(Notification.PRIORITY_HIGH);
        } else {
            b.setPriority(Notification.PRIORITY_LOW);
            // 静默：不响、不震、不弹 heads-up，只在下拉通知栏里安静躺着
            if (Build.VERSION.SDK_INT >= 21) b.setCategory(Notification.CATEGORY_REMINDER);
        }

        // notify 的 id 用当前时间兜底，避免连续两条课的通知互相覆盖
        int id = (int) (System.currentTimeMillis() % Integer.MAX_VALUE);
        try {
            nm.notify(id, b.build());
        } catch (Throwable ignored) {
        }
    }

    /** 短信正文：一句话说清哪门课、还有几分钟、在哪间教室。不写学号、不写姓名。 */
    static String smsBody(String name, String text, String room, int mins) {
        StringBuilder sb = new StringBuilder();
        sb.append("【河医大助手】").append(name);
        sb.append("，").append(text);
        if (room != null && room.length() > 0) sb.append("，教室 ").append(room);
        sb.append("。");
        return sb.toString();
    }

    /** 「试一下」里短信那档：直接把编辑页拉起来，让用户当场看清楚会发出什么。 */
    static void openSmsDraft(Context context, String name, String room, int mins) {
        try {
            Intent sms = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:"));
            sms.putExtra("sms_body", smsBody(
                    (name == null || name.length() == 0) ? "要上课了" : name,
                    mins > 0 ? (mins + " 分钟后上课") : "现在上课", room, mins));
            sms.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(sms);
        } catch (Throwable ignored) {
        }
    }
}
