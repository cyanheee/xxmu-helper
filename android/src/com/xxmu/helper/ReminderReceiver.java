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
    /* v2.2.0：作业与考试单独两个 channel。学生可能想留课程响铃、把作业提醒
     * 调成静音（或者反过来），系统设置里能分别关的前提就是 channel 不同。 */
    private static final String CHANNEL_TASK = "xxmu_task_reminder";
    private static final String CHANNEL_TASK_SILENT = "xxmu_task_reminder_silent";

    public static final String MODE_ALARM = "alarm";
    public static final String MODE_SILENT = "silent";
    public static final String MODE_SMS = "sms";

    /* v2.2.0：提醒分三类。class = 上课（老行为，缺字段就回落它）；
     * hw = 作业截止；exam = 考试开考。文案、标题、点进去去哪都不一样。
     * v2.14.0：多一类 todo = 我的待办到期。它跟 hw 一样落在学习页，
     * 但文案完全不同 —— 待办只有一个日子没有钟点，说「还有 11 小时 32 分」
     * 是假精度，只能说「今天到期 / 明天到期 / N 天后到期」。 */
    public static final String KIND_CLASS = "class";
    public static final String KIND_HW = "hw";
    public static final String KIND_EXAM = "exam";
    public static final String KIND_TODO = "todo";

    @Override
    public void onReceive(Context context, Intent intent) {
        String name = intent == null ? null : intent.getStringExtra("name");
        String room = intent == null ? null : intent.getStringExtra("room");
        int mins = intent == null ? 15 : intent.getIntExtra("mins", 15);
        String mode = intent == null ? MODE_ALARM : intent.getStringExtra("mode");
        String kind = intent == null ? KIND_CLASS : intent.getStringExtra("kind");
        long due = intent == null ? 0L : intent.getLongExtra("due", 0L);
        show(context, name, room, mins, norm(mode), normKind(kind), due);
    }

    /** 脏值一律回落「上课」：老列表里没有 kind，必须照旧按上课说。 */
    public static String normKind(String k) {
        if (KIND_HW.equals(k)) return KIND_HW;
        if (KIND_EXAM.equals(k)) return KIND_EXAM;
        if (KIND_TODO.equals(k)) return KIND_TODO;
        return KIND_CLASS;
    }

    /** 脏值一律回落「响铃」：老版本存的列表里没有 mode，也必须照常响。 */
    public static String norm(String m) {
        if (MODE_SILENT.equals(m)) return MODE_SILENT;
        if (MODE_SMS.equals(m)) return MODE_SMS;
        return MODE_ALARM;
    }

    /** 供「试一下」预览按钮直接调（不经过闹钟）。 */
    static void show(Context context, String name, String room, int mins, String modeRaw) {
        show(context, name, room, mins, modeRaw, KIND_CLASS, 0L);
    }

    /**
     * v2.2.0：多了一个 kind（class/hw/exam）与 due（真正的截止/开考毫秒）。
     *
     * 为什么通知不能只有一套文案：课程那条说的是「N 分钟后上课」，作业那条
     * 要说「还有 N 小时截止」，考试那条要说「N 小时后开考」。同一句
     * 「15 分钟后上课」安在作业上就是在骗人——剩 15 分钟交作业和剩 15 分钟上课
     * 是两件完全不同的事。所以文案、标题、channel 全部按 kind 分叉。
     *
     * channel 也分开（课程 / 作业与考试）：学生可能想留课程响铃、
     * 把作业提醒静音，这在系统通知设置里能分别关，前提是 channel 不同。
     */
    static void show(Context context, String name, String room, int mins, String modeRaw,
                     String kindRaw, long due) {
        final String mode = norm(modeRaw);
        final String kind = normKind(kindRaw);
        final boolean isClass = KIND_CLASS.equals(kind);
        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        final boolean loud = MODE_ALARM.equals(mode);
        final String chId = isClass
                ? (loud ? CHANNEL_ALARM : CHANNEL_SILENT)
                : (loud ? CHANNEL_TASK : CHANNEL_TASK_SILENT);
        final String chName = isClass
                ? (loud ? "课程提醒" : "课程提醒（静默）")
                : (loud ? "作业与待办提醒" : "作业与待办提醒（静默）");
        final String chDesc = isClass
                ? (loud ? "上课前响铃提醒" : "上课前安静提醒，不响不弹")
                : (loud ? "作业快到截止、待办到期、考试快到开考时响铃" : "作业与待办提醒，安静出现不响不弹");

        // API 26+ 必须先建 channel，否则通知静默不显示（且没有报错）
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(chId, chName,
                    loud ? NotificationManager.IMPORTANCE_HIGH : NotificationManager.IMPORTANCE_LOW);
            ch.setDescription(chDesc);
            nm.createNotificationChannel(ch);
        }

        /* ---- 文案：四类各说各的 ---- */
        final String label = (name == null || name.length() == 0)
                ? (isClass ? "要上课了"
                   : (KIND_HW.equals(kind) ? "有作业快截止"
                      : (KIND_TODO.equals(kind) ? "有件待办到期" : "有考试快开考")))
                : name;
        String text;
        if (isClass) {
            text = mins > 0 ? (mins + " 分钟后上课") : "现在上课";
        } else if (KIND_TODO.equals(kind)) {
            /* v2.14.0：待办只说「今天 / 明天 / N 天后到期」。
             *
             * 为什么不像作业那样说「还有 11 小时 32 分」：待办记录里只有一个
             * 日子（2026-11-25），没有钟点。要算小时就得先编一个钟点到分钟，
             * 编出来的那个数字是假精度 —— 用户看到「还有 11 小时 32 分」
             * 会以为 App 知道具体几点，其实它只知道哪一天。
             *
             * 这里按**日历天**算差，不是按 24 小时整除：晚上 23:00 提醒时，
             * 明天早上 8 点到期的事按小时整除会算成 0 天（说「今天到期」），
             * 按日历天算才是「明天到期」—— 人说的「明天」就是这个意思。 */
            long leftMin = 0;
            boolean exact = due > 0;
            if (exact) leftMin = Math.max(0, (due - System.currentTimeMillis()) / 60000L);
            else leftMin = Math.max(1, mins);
            text = todoLeftText(due, leftMin);
        } else {
            /* 作业/考试的剩余时长以 due 为准（mins 在作业那条里是「从提醒时刻到
             * 截止的分钟数」，round 过、且可能被 grace 顶成 1）。due=0 说明是老
             * 列表或改过结构，退回 mins 估算，并在句子里带「约」。 */
            long leftMin = 0;
            boolean exact = due > 0;
            if (exact) leftMin = Math.max(0, (due - System.currentTimeMillis()) / 60000L);
            else leftMin = Math.max(1, mins);
            String left = exact ? leftSpan(leftMin) : ("约 " + leftSpan(leftMin));
            if (KIND_HW.equals(kind)) {
                text = (leftMin <= 0) ? "截止时间到了" : ("还有 " + left + "截止");
            } else {
                text = (leftMin <= 0) ? "开考时间到了" : (left + "后开考");
            }
        }
        /* 第二行放课程名（作业/考试的 name 是作业标题，课程名在 room 位传进来） */
        if (room != null && room.length() > 0) {
            text += isClass ? (" · " + room) : (" · " + room);
        }

        /* 短信方式：点通知 → 系统短信编辑页，正文写好，收件人空着。
         * smsto: 不带号码，多数 ROM 会开一条新短信让用户自己选联系人。
         * 用 getActivity 而不是 getBroadcast：这一步不该再回到我们自己的代码。 */
        PendingIntent pi;
        int flags = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        if (MODE_SMS.equals(mode)) {
            Intent sms = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:"));
            sms.putExtra("sms_body", smsBody(label, text, room, mins));
            sms.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            pi = PendingIntent.getActivity(context, (int) (System.currentTimeMillis() % 100000),
                    sms, flags | PendingIntent.FLAG_UPDATE_CURRENT);
        } else {
            Intent it = new Intent(context, MainActivity.class);
            it.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            /* v2.2.0：作业/考试那条点进去直接落到学习页，不是课表页。
             * 课表页对他此刻没用 —— 他要看的是「还有哪几件没交」。 */
            if (!isClass) it.putExtra("xxmu_tab", "learn");
            pi = PendingIntent.getActivity(context, 0, it, flags);
        }

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(context, chId)
                : new Notification.Builder(context);
        b.setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(MODE_SMS.equals(mode) ? "点这里写短信提醒" : label)
                .setContentText(MODE_SMS.equals(mode)
                        ? (label + "，" + text + "（点开后自己选人发送）") : text)
                .setContentIntent(pi)
                .setAutoCancel(true);

        if (loud) {
            b.setPriority(Notification.PRIORITY_HIGH);
        } else {
            b.setPriority(Notification.PRIORITY_LOW);
            // 静默：不响、不震、不弹 heads-up，只在下拉通知栏里安静躺着
            if (Build.VERSION.SDK_INT >= 21) b.setCategory(Notification.CATEGORY_REMINDER);
        }

        /* v2.2.0：id 分两类。原来的「取当前毫秒」完全够用，但作业提醒和课程提醒
         * 在同一分钟撞上时两者会互相覆盖（概率低，但用户只会看到「有一条不见了」）。
         * 现在课程用 1xxxx 段、作业/考试用 2xxxx 段，各自时间兜底。 */
        int tail = (int) (System.currentTimeMillis() % 10000);
        int id = (isClass ? 10000 : 20000) + tail;
        try {
            nm.notify(id, b.build());
        } catch (Throwable ignored) {
        }
    }

    /** v2.14.0：待办的剩余说法 —— 只按日历天，不按小时。
     *
     * due 是那一天 23:59 的毫秒。取「今天 0 点」和「due 那天 0 点」两个
     * 日历日的中点比，得到相差几天：0 = 今天到期、1 = 明天到期、N = N 天后。
     *
     * 为什么不能用 (due - now) / 86400000：晚上 23:00 时，明天 8 点的事
     * 只差 9 小时，整除得 0 会说成「今天到期」；而人说的「明天」指的是
     * 日历上的明天。用 Calendar 归零到当天 0 点再比，得到的才是人话。
     *
     * due <= 0（老列表）：退回 mins 估算，句子里带「约」。 */
    static String todoLeftText(long due, long leftMin) {
        if (due <= 0) {
            if (leftMin <= 0) return "今天到期";
            return "约 " + leftSpan(leftMin) + "后到期";
        }
        long now = System.currentTimeMillis();
        if (due <= now) return "已经到期了";
        java.util.Calendar a = java.util.Calendar.getInstance();
        a.set(java.util.Calendar.HOUR_OF_DAY, 0);
        a.set(java.util.Calendar.MINUTE, 0);
        a.set(java.util.Calendar.SECOND, 0);
        a.set(java.util.Calendar.MILLISECOND, 0);
        long today0 = a.getTimeInMillis();
        java.util.Calendar b = java.util.Calendar.getInstance();
        b.setTimeInMillis(due);
        b.set(java.util.Calendar.HOUR_OF_DAY, 0);
        b.set(java.util.Calendar.MINUTE, 0);
        b.set(java.util.Calendar.SECOND, 0);
        b.set(java.util.Calendar.MILLISECOND, 0);
        long due0 = b.getTimeInMillis();
        long days = Math.round((due0 - today0) / 86400000.0);
        if (days <= 0) return "今天到期";
        if (days == 1) return "明天到期";
        return days + " 天后到期";
    }

    /** 分钟数 → 「2 小时 15 分」这种人类读得懂的说法。超过两天按天。 */
    static String leftSpan(long min) {        if (min < 1) return "不到 1 分钟";
        if (min < 60) return (min + " 分钟");
        long h = min / 60, m = min % 60;
        if (h < 48) {
            return m == 0 ? (h + " 小时") : (h + " 小时 " + m + " 分");
        }
        return (h / 24 + " 天");
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
