package com.xxmu.helper;

import android.content.Context;
import android.os.Build;

import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 崩溃日志落盘。
 *
 * 为什么要它：Android 上未捕获异常默认只进 logcat，用户拿不到，只能看到"闪退"。
 * 这个类把堆栈写到 App 私有目录的 crash.log，前端「关于」页可以读出来给用户看，
 * 反馈问题时一并提供，就能定位真机上的兼容性问题。
 *
 * 只记录本 App 自己的进程，不做任何上报（项目零依赖 + 不收集用户数据）。
 */
final class CrashGuard {

    private static final String FILE = "crash.log";
    private static boolean installed = false;

    private CrashGuard() {}

    static void install(final Context ctx) {
        if (installed) return;
        installed = true;
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread t, Throwable e) {
                try {
                    write(ctx, t, e);
                } catch (Throwable ignored) {
                }
                if (prev != null) prev.uncaughtException(t, e);
            }
        });
    }

    private static void write(Context ctx, Thread t, Throwable e) {
        try {
            StringWriter sw = new StringWriter();
            PrintWriter pw = new PrintWriter(sw);
            pw.println("===== " + new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
                    .format(new Date()) + " =====");
            pw.println("thread=" + t.getName());
            pw.println("device=" + Build.MANUFACTURER + " " + Build.MODEL
                    + " / Android " + Build.VERSION.RELEASE
                    + " (API " + Build.VERSION.SDK_INT + ")");
            e.printStackTrace(pw);
            pw.flush();

            File f = new File(ctx.getFilesDir(), FILE);
            FileOutputStream out = null;
            try {
                // 只留最近一次，避免无限增长
                out = new FileOutputStream(f, false);
                out.write(sw.toString().getBytes("UTF-8"));
                out.flush();
            } finally {
                if (out != null) try { out.close(); } catch (Exception ignored) {}
            }
        } catch (Throwable ignored) {
            // 记录日志本身失败时绝不能再抛，否则二次崩溃
        }
    }

    /** 读崩溃日志，没有则返回空串 */
    static String read(Context ctx) {
        File f = new File(ctx.getFilesDir(), FILE);
        if (!f.exists() || f.length() == 0) return "";
        java.io.FileInputStream in = null;
        try {
            in = new java.io.FileInputStream(f);
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return new String(bo.toByteArray(), "UTF-8");
        } catch (Exception e) {
            return "";
        } finally {
            if (in != null) try { in.close(); } catch (Exception ignored) {}
        }
    }

    static void clear(Context ctx) {
        File f = new File(ctx.getFilesDir(), FILE);
        if (f.exists()) f.delete();
    }
}
