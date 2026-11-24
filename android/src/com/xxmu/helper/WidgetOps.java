package com.xxmu.helper;

/* 河医大助手 · 改课表指令的 Java 侧实现（v2.11.0）
 *
 * 为什么要有这个文件：
 *   App 里「改课表指令」（web/lesson-cmd.js）会在渲染前把 xxmu_kb_ops 叠加到课表上，
 *   停课 / 调课 / 放假三种变换都只在内存里发生，缓存文件里存的仍是教务原始课表。
 *   桌面小组件自己读缓存，于是只认得「加课」一条 —— 用户停了课、调了课、放了假，
 *   组件照旧显示原课表。v2.10.0 当时的注释写「宁可少显示，也不显示错的」，
 *   但那是回避：显示一份已经改过的课表的旧版本，本身就是错的。
 *
 * 这一版把 web/lesson-cmd.js 的 apply() 逐条搬到 Java 侧，四种变换全部对齐：
 *   add     加课（clone 后打 _cmd 标记，与教务原始记录区分）
 *   stop    停课（课名 + 日/周/节任一范围命中即整条移除）
 *   move    调课（同上命中后改 day / weeks / periods，room 没给就保留原教室）
 *   holiday 放假（把命中的周次从 weeks 里剔掉，剔空了整条移除）
 *
 * 为什么不用 org.json：
 *   这个类不 import 任何 android.* / org.json.* —— 抽出来就能用 javac + java 直接跑真断言
 *   （见 tools/test_widget.js）。android.jar 里的 org.json 是 Stub，真跑必抛。
 *   所以课与指令都用纯 Java 结构：Course 类 + 扁平 key/value 数组。
 *
 * 边界约定（与调用方共享）：
 *   · 任何字段缺失 / 解析失败 → 当作「没给这个条件」，绝不当 0 去筛（0 会误伤全部）
 *   · 空 ops 或 null → 原样返回副本，不返回入参本身（调用方可能改）
 *   · 绝不抛异常：坏指令跳过，让组件继续画剩下的
 */
import java.util.ArrayList;
import java.util.List;

public final class WidgetOps {

    private WidgetOps() { }

    /** 一门课。字段与 web 端 clone() 对齐，但只用组件需要的那些。 */
    public static final class Course {
        public String name = "";
        public String room = "";
        public int day = 0;                 // 周一=1 … 周日=7
        public int[] weeks = new int[0];
        public int[] periods = new int[0];
        public boolean cmd = false;         // 指令加进来的课

        public Course copy() {
            Course c = new Course();
            c.name = name;
            c.room = room;
            c.day = day;
            c.weeks = weeks.clone();
            c.periods = periods.clone();
            c.cmd = cmd;
            return c;
        }
    }

    public static Course make(String name, String room, int day, int[] weeks, int[] periods) {
        Course c = new Course();
        c.name = name == null ? "" : name;
        c.room = room == null ? "" : room;
        c.day = day;
        c.weeks = weeks == null ? new int[0] : weeks.clone();
        c.periods = periods == null ? new int[0] : periods.clone();
        return c;
    }

    /* ---------- 指令：扁平 key/value ----------
     * 用扁平数组而不是嵌套结构，是为了让调用方（读 org.json 的那边）与测试（手写断言的那边）
     * 用同一种形状，不必各造一套。奇数位丢失时当没给。 */
    public static String get(List<String> kv, String key, String def) {
        if (kv == null) return def;
        for (int i = 0; i + 1 < kv.size(); i += 2) {
            if (key.equals(kv.get(i))) return kv.get(i + 1);
        }
        return def;
    }

    public static int getInt(List<String> kv, String key, int def) {
        String s = get(kv, key, "");
        if (s == null || s.length() == 0) return def;
        try { return Integer.parseInt(s.trim()); } catch (Throwable e) { return def; }
    }

    /** "1,2,3" / "3-4" / "3~4" → int[]；空串或全坏 → 空数组（= 没给条件）。 */
    public static int[] ints(String csv) {
        if (csv == null) return new int[0];
        String s = csv.trim();
        if (s.length() == 0) return new int[0];
        String[] parts = s.split("[,，\\s]+");
        List<Integer> out = new ArrayList<Integer>();
        for (int i = 0; i < parts.length; i++) {
            String p = parts[i].trim();
            if (p.length() == 0) continue;
            int dash = -1;
            for (int k = 0; k < p.length(); k++) {
                char ch = p.charAt(k);
                if (ch == '-' || ch == '~' || ch == '～' || ch == '–' || ch == '—') { dash = k; break; }
            }
            if (dash > 0 && dash < p.length() - 1) {
                int a = num(p.substring(0, dash), -1);
                int b = num(p.substring(dash + 1), -1);
                if (a > 0 && b >= a && b - a < 60) {
                    for (int n = a; n <= b; n++) out.add(Integer.valueOf(n));
                }
                continue;
            }
            int v = num(p, -1);
            if (v > 0) out.add(Integer.valueOf(v));
        }
        int[] r = new int[out.size()];
        for (int i = 0; i < r.length; i++) r[i] = out.get(i).intValue();
        return r;
    }

    private static int num(String s, int def) {
        if (s == null) return def;
        try { return Integer.parseInt(s.trim()); } catch (Throwable e) { return def; }
    }

    public static boolean has(int[] arr, int v) {
        if (arr == null) return false;
        for (int i = 0; i < arr.length; i++) if (arr[i] == v) return true;
        return false;
    }

    public static boolean intersect(int[] a, int[] b) {
        if (a == null || b == null || a.length == 0 || b.length == 0) return false;
        for (int i = 0; i < a.length; i++) if (has(b, a[i])) return true;
        return false;
    }

    /** 与 web 端 match(c, q) 同口径：课名必须相等；日/周/节给了才比，没给不算条件。 */
    public static boolean match(Course c, String name, int day, int[] weeks, int[] periods) {
        if (c == null) return false;
        if (!clean(c.name).equals(clean(name))) return false;
        if (day > 0 && c.day != day) return false;
        if (weeks != null && weeks.length > 0 && !intersect(c.weeks, weeks)) return false;
        if (periods != null && periods.length > 0 && !intersect(c.periods, periods)) return false;
        return true;
    }

    private static String clean(String s) {
        if (s == null) return "";
        String t = s.replace('\u3000', ' ');
        StringBuilder b = new StringBuilder(t.length());
        boolean prevSpace = false;
        for (int i = 0; i < t.length(); i++) {
            char ch = t.charAt(i);
            boolean sp = (ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r');
            if (sp) {
                if (!prevSpace && b.length() > 0) b.append(' ');
                prevSpace = true;
            } else {
                b.append(ch);
                prevSpace = false;
            }
        }
        String r = b.toString();
        return r.endsWith(" ") ? r.substring(0, r.length() - 1) : r;
    }

    /**
     * 把指令叠加到课表上。返回新列表，**不改入参**。
     * 每条 op 是一个扁平 key/value 列表：type / name / day / weeks / periods / room /
     * from.day / from.weeks / from.periods / to.day / to.weeks / to.periods / to.room。
     */
    public static List<Course> apply(List<Course> courses, List<List<String>> ops) {
        List<Course> out = new ArrayList<Course>();
        if (courses != null) for (int i = 0; i < courses.size(); i++) {
            Course c = courses.get(i);
            if (c != null) out.add(c.copy());
        }
        if (ops == null) return out;

        for (int i = 0; i < ops.size(); i++) {
            List<String> op = ops.get(i);
            String type = get(op, "type", "");
            if ("add".equals(type)) {
                Course a = make(get(op, "name", ""), get(op, "room", ""),
                        getInt(op, "day", 0),
                        ints(get(op, "weeks", "")), ints(get(op, "periods", "")));
                a.cmd = true;      // 指令加进来的课永远带标记，与教务原始记录区分
                out.add(a);
            } else if ("stop".equals(type)) {
                String nm = get(op, "name", "");
                int day = getInt(op, "day", 0);
                int[] wk = ints(get(op, "weeks", ""));
                int[] ps = ints(get(op, "periods", ""));
                List<Course> keep = new ArrayList<Course>();
                for (int k = 0; k < out.size(); k++) {
                    Course c = out.get(k);
                    if (!match(c, nm, day, wk, ps)) keep.add(c);
                }
                out = keep;
            } else if ("move".equals(type)) {
                String nm = get(op, "name", "");
                int fDay = getInt(op, "from.day", 0);
                int[] fWk = ints(get(op, "from.weeks", ""));
                int[] fPs = ints(get(op, "from.periods", ""));
                int tDay = getInt(op, "to.day", 0);
                int[] tWk = ints(get(op, "to.weeks", ""));
                int[] tPs = ints(get(op, "to.periods", ""));
                String tRoom = get(op, "to.room", "");
                for (int k = 0; k < out.size(); k++) {
                    Course c = out.get(k);
                    if (!match(c, nm, fDay, fWk, fPs)) continue;
                    if (tDay > 0) c.day = tDay;
                    if (tWk.length > 0) c.weeks = tWk.clone();
                    if (tPs.length > 0) c.periods = tPs.clone();
                    if (tRoom.length() > 0) c.room = tRoom;
                }
            } else if ("holiday".equals(type)) {
                int[] wk = ints(get(op, "weeks", ""));
                if (wk.length == 0) continue;
                List<Course> live = new ArrayList<Course>();
                for (int k = 0; k < out.size(); k++) {
                    Course c = out.get(k);
                    List<Integer> rest = new ArrayList<Integer>();
                    for (int w = 0; w < c.weeks.length; w++) {
                        if (!has(wk, c.weeks[w])) rest.add(Integer.valueOf(c.weeks[w]));
                    }
                    if (rest.size() == 0) continue;          // 剔空了整条移除
                    int[] nw = new int[rest.size()];
                    for (int w = 0; w < nw.length; w++) nw[w] = rest.get(w).intValue();
                    c.weeks = nw;
                    live.add(c);
                }
                out = live;
            }
            /* 认不出的 type 一律跳过：一份坏指令不该让整张课表消失 */
        }
        return out;
    }

    /** 给诊断用的一句话，不算业务逻辑。 */
    public static String typeName(String type) {
        if ("add".equals(type)) return "加课";
        if ("stop".equals(type)) return "停课";
        if ("move".equals(type)) return "调课";
        if ("holiday".equals(type)) return "放假";
        return "未知(" + (type == null ? "" : type) + ")";
    }
}
