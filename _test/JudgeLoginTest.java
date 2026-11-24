import java.io.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;

public class JudgeLoginTest {
    private static class Verdict {
        final boolean ok; final String why;
        Verdict(boolean o, String w) { ok = o; why = w; }
    }

    private static boolean bodyHas(String body, String word) {
        if (body == null || body.length() == 0 || word == null || word.length() == 0) return false;
        try {
            if (body.indexOf(new String(word.getBytes("UTF-8"), "ISO-8859-1")) >= 0) return true;
        } catch (Throwable ignored) {
        }
        try {
            return body.indexOf(new String(word.getBytes("GBK"), "ISO-8859-1")) >= 0;
        } catch (Throwable ignored) {
            return false;
        }
    }

    private static Verdict judgeLogin(String raw) {
        if (raw == null || raw.length() == 0) {
            return new Verdict(false, "登录校验没有响应，请再试一次");
        }
        if (raw.startsWith("ERR:")) {
            return new Verdict(false, "登录校验失败（网络异常），请再试一次");
        }
        int p = raw.indexOf('|');
        if (p < 0) {
            return new Verdict(false, "登录校验失败（响应异常），请再试一次");
        }
        int code = 0;
        try {
            code = Integer.parseInt(raw.substring(0, p).trim());
        } catch (Throwable ignored) {
        }
        String body = raw.substring(p + 1);
        if (code != 200) {
            return new Verdict(false, "登录校验失败（HTTP " + code + "），请重新登录");
        }
        if (bodyHas(body, "凭证已失效") || bodyHas(body, "请重新登录")) {
            return new Verdict(false, "还没登录成功：密码或验证码没填完");
        }
        /* 失效锚点只认「青果自己的登录表单」和「那段跳转脚本」，两条都要窄。
         *
         * 别用 login.action：登录成功后的业务页里登出链接也指向它。
         * 别用裸 frmbody：那是青果框架里到处都在的全局 frame 变量，登录后的
         * 页面同样会引用它，拿它当锚点会把真登录判成没登录。
         * 这里只认三样：① CAS 登录表单独有的 id="dosub" / name="randnumber" /
         * id="username"（2026-11-14 实测登录页 35287 字节里三者齐全）；
         * ② 那段「alert(...) 然后 location.href='/'」的失效跳转脚本，且整页极短
         * （实测 547 字节；正常业务页不可能这么小）。 */
        if (body.indexOf("id=\"dosub\"") >= 0
                || body.indexOf("name=\"randnumber\"") >= 0
                || body.indexOf("id=\"username\"") >= 0) {
            return new Verdict(false, "还没登录成功：密码或验证码没填完");
        }
        if (body.length() < 1000 && body.indexOf("location.href") >= 0) {
            return new Verdict(false, "还没登录成功：密码或验证码没填完");
        }
        /* 只留一个极小的地板，只挡空响应，别拿长度当判据。
         *
         * /frame/homes.action 登录后可能只回一个紧凑 frameset
         * （<html><frameset><frame src=...></frameset></html> 不到 60 字节），
         * 任何有意义的长度阈值都会把真登录误判成失败：v1.1.90 拍的 1200 是错的，
         * v1.1.92 的 300 依然偏高。这里只挡「空」「全是空白」和「短到装不下
         * 一个 frameset」的响应；真正的失效识别全靠上面 ③④ 两组特征。 */
        if (body.trim().length() < 40) {
            return new Verdict(false, "还没登录成功：拿到的不是登录后的页面");
        }
        return new Verdict(true, "");
    }

    static String read(String p) throws Exception {
        byte[] b = Files.readAllBytes(Paths.get(p));
        return new String(b, StandardCharsets.ISO_8859_1);
    }

    static int bad = 0;

    static void check(String name, boolean got, boolean want) {
        boolean ok = got == want;
        if (!ok) bad++;
        System.out.println((ok ? "[OK]   " : "[BAD]  ") + name + "  got=" + got + " want=" + want);
    }

    public static void main(String[] a) throws Exception {
        String expired = read("fixtures/expired.html");
        String cas = read("fixtures/cas_login.html");
        String kb = read("fixtures/kb_real.html");
        String empty = read("fixtures/empty.html");
        String frameset = read("fixtures/frameset.html");

        check("expired page", judgeLogin("200|" + expired).ok, false);
        check("CAS login page", judgeLogin("200|" + cas).ok, false);
        check("real timetable", judgeLogin("200|" + kb).ok, true);
        check("empty body", judgeLogin("200|").ok, false);
        check("tiny frameset", judgeLogin("200|" + frameset).ok, true);
        check("http 500", judgeLogin("500|" + kb).ok, false);
        check("ERR", judgeLogin("ERR:IOException").ok, false);
        System.out.println(bad == 0 ? "JAVA UNIT PASS" : "JAVA UNIT FAIL " + bad);
        System.exit(bad == 0 ? 0 : 1);
    }
}