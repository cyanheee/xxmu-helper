package com.xxmu.helper;

import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;

/**
 * 离线验证 buildGrabJs 生成的探测脚本（不进 APK，只给 tools/ 用）。
 *
 * 为什么不直接跑 App：判定的核心是「一段在登录页里跑的 JS 读到了什么」，
 * 拿真实 DOM 跑一遍比在手机上肉眼看提示可靠得多。这里把生成出来的 JS
 * 写成 UTF-8 文件，交给 tools/test_grab.js 用一个极小的 DOM 垫片执行。
 *
 * 注意：**不要用 System.out 输出这段 JS**。Windows 控制台重定向默认是
 * GBK/936，占位词表里的中文会变成乱码，测试就变成在测乱码能不能挡住，
 * 而不是在测真实行为（第一次跑就踩了这个坑）。
 *
 * 用法：
 *   java -cp ... com.xxmu.helper.TestGrab <输出路径> [选择器]
 */
public final class TestGrab {
    public static void main(String[] a) throws Exception {
        String out = a.length > 0 ? a[0] : "build_test/grab.js";
        String sel = a.length > 1 ? a[1]
                : "input#username,input[name=username],input#username1";
        java.lang.reflect.Method m = WebActivity.class.getDeclaredMethod(
                "buildGrabJs", String.class);
        m.setAccessible(true);
        String js = (String) m.invoke(null, sel);
        Writer w = new OutputStreamWriter(new FileOutputStream(out), "UTF-8");
        try {
            w.write(js);
        } finally {
            w.close();
        }
        System.out.println("wrote " + out + " (" + js.length() + " chars)");
    }
}
