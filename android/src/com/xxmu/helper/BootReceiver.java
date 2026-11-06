package com.xxmu.helper;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 开机 / App 更新后把课程提醒重新挂上。
 *
 * 为什么需要它：
 *   AlarmManager 里的闹钟不落盘——手机重启、App 被覆盖安装之后，系统会把它们
 *   全部清掉，而且**不会有任何提示**。用户看到的现象就是「提醒开了，头几天准时，
 *   重启一次以后再也不响了」，他只会认为功能坏了，不会想到要重新开一遍。
 *
 * 收到 BOOT_COMPLETED 时 WebView 还没起来、课表也没解析，所以这里不重算时间，
 * 只把上次落盘的那份列表原样重挂（ReminderScheduler.restore）。
 * 下次打开 App 时前端会 cancel + 重挂最新课表，自动纠正过期项。
 *
 * MY_PACKAGE_REPLACED：自更新装完新包也会清闹钟，同样补挂一次——
 * 否则每次更新完，提醒就静默失效到用户下次打开开关为止。
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String a = intent.getAction();
        if (a == null) return;
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)
                && !"android.intent.action.QUICKBOOT_POWERON".equals(a)) {
            return;
        }
        try {
            ReminderScheduler.restore(context.getApplicationContext());
        } catch (Throwable ignored) {
            // 开机广播里不能崩：崩了系统下次可能不再投递
        }
    }
}
