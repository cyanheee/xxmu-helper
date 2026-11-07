package com.xxmu.helper;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;

/**
 * 河医大助手 · WebView 壳
 *
 * 数据获取有三条通道，优先级从高到低：
 *   1. Host.externalSchedule() / externalHomework() —— 外部 JSON 文件（PC 同步，不重打包换数据）
 *   2. Host.cachedSchedule() / cachedHomework()     —— App 内登录抓取后缓存的 JSON
 *   3. window.SCHEDULE / window.HOMEWORK            —— APK 内置兜底
 *
 * 登录：不在 App 内自绘登录页，而是内嵌学校官方登录页。
 * 学校随时可能改密码加密算法或加滑块，自绘登录必须跟着改；内嵌官方页让用户
 * 看到什么就操作什么，学校改版也不用发新版 App。登录完成后把 WebView 的
 * Cookie 全部导出给前端，前端用同一套 Cookie 去拉课表 HTML。
 */
public class MainActivity extends Activity {

    private WebView web;

    private static final String PREFS = "xxmu";
    private static final String K_KB = "schedule_cache.json";
    private static final String K_HW = "homework_cache.json";

    private static final String KB_URL =
            "https://qgjw.xxmu.edu.cn/student/wsxk.xskcb_excel10319.jsp?params=";
    private static final String KB_REFERER =
            "https://qgjw.xxmu.edu.cn/student/xkjg.wdkb.jsp?menucode=S20301";

    // ---------------------------------------------------------------- 文件

    /** 外部课表文件：App 私有外部目录，PC 可用 adb push 覆盖 */
    private File scheduleFile() {
        File dir = getExternalFilesDir(null);
        if (dir == null) dir = new File(getFilesDir(), "ext");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, "schedule.json");
    }

    private File homeworkFile() {
        File dir = getExternalFilesDir(null);
        if (dir == null) dir = new File(getFilesDir(), "ext");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, "homework.json");
    }

    /** App 内抓取后的缓存（私有目录，不进外部存储） */
    private File cacheFile(String name) {
        return new File(getFilesDir(), name);
    }

    private static String readAll(InputStream in) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
        return new String(bo.toByteArray(), "UTF-8");
    }

    /* 读文件。
     *
     * 返回值语义**必须区分三种情况**（v1.1.15）：
     *   · null  = 读失败（磁盘满、文件被并发删、OOM、编码炸了）
     *   · ""    = 确实没有这个文件 / 文件太小（当成「没有数据」）
     *   · 非空  = 正常内容
     *
     * 原来失败也返回 ""，与「没有文件」同形。上层 `externalSchedule()`
     * 拿到的空串被解释成「没有外部课表」，于是退回读缓存；可缓存文件
     * 恰好也读失败时，前端会拿内置 window.SCHEDULE 顶上 —— 学生看到的是
     * **上一学期甚至别人的课表**，而界面上写的是「已同步」。
     * 一个读失败被伪装成「数据是新的」，这是本项目最反复的那类坑。
     *
     * 有了 null，Host 那几个读接口就能把失败明确报给前端，前端据此
     * 保留现有数据并提示「读不出来」，而不是拿旧数据冒充。 */
    private String readFileIfBig(File f, int minLen) {
        try {
            if (f == null || !f.exists()) return "";
            if (f.length() < minLen) return "";
            try (FileInputStream in = new FileInputStream(f)) {
                return readAll(in).trim();
            }
        } catch (Throwable e) {
            return null;
        }
    }

    private boolean writeFile(File f, String content) {
        try {
            if (f.getParentFile() != null) f.getParentFile().mkdirs();
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(content.getBytes("UTF-8"));
                out.flush();
            }
            return true;
        } catch (Throwable e) {
            return false;
        }
    }

    // ---------------------------------------------------------------- Host 桥

    public class Host {

        /** 外部课表（PC 推送），空串表示没有 */
        @JavascriptInterface
        public String externalSchedule() {
            return readFileIfBig(scheduleFile(), 20);
        }

        @JavascriptInterface
        public String schedulePath() {
            return scheduleFile().getAbsolutePath();
        }

        @JavascriptInterface
        public String externalHomework() {
            return readFileIfBig(homeworkFile(), 20);
        }

        @JavascriptInterface
        public String homeworkPath() {
            return homeworkFile().getAbsolutePath();
        }

        /** App 内登录抓取后缓存的课表，空串表示还没抓过 */
        @JavascriptInterface
        public String cachedSchedule() {
            return readFileIfBig(cacheFile(K_KB), 20);
        }

        @JavascriptInterface
        public String cachedHomework() {
            return readFileIfBig(cacheFile(K_HW), 20);
        }

        @JavascriptInterface
        public boolean saveCachedSchedule(String json) {
            if (json == null || json.length() < 20) return false;
            return writeFile(cacheFile(K_KB), json);
        }

        @JavascriptInterface
        public boolean saveCachedHomework(String json) {
            if (json == null || json.length() < 20) return false;
            return writeFile(cacheFile(K_HW), json);
        }

        /** 当前已登录的 Cookie（登录页拿到的），空串表示没登录 */
        @JavascriptInterface
        public String cookies() {
            String c = CookieManager.getInstance().getCookie("https://qgjw.xxmu.edu.cn");
            return c == null ? "" : c;
        }

        /** 清掉教务 Cookie（退出登录 / 强制重新登录） */
        @JavascriptInterface
        public void clearCookies() {
            runOnUiThread(new Runnable() {
                public void run() {
                    CookieManager.getInstance().removeAllCookies(null);
                    CookieManager.getInstance().flush();
                    toast("已退出登录");
                }
            });
        }

        /**
         * 打开学校官方登录页。用户在里面正常登录，登录成功后自动关闭并回调前端。
         * 回调通过 JS 全局函数 window.__onLoginDone(ok) 通知。
         */
        @JavascriptInterface
        public void openLogin() {
            runOnUiThread(new Runnable() {
                public void run() {
                    // 顺手把用户在登录页填的学号读回来：取消激活码之后，
                    // 「他登录的是哪个学号」就是唯一的身份依据。
                    //
                    // 选择器顺序有讲究：青果登录页的可见框 input#username1
                    // 是硬编码 value="账号" 的装饰框，真输入框 input#username
                    // 才是 display:none 的那个 —— 曾经把 #username1 排在前面，
                    // 抓到的一直是「账号」，学号核对从此永久失败（见 v1.1.2）。
                    // 现在真框优先，#username1 只作为别的青果版本的兜底。
                    openWebActivityGrab("https://qgjw.xxmu.edu.cn/", "登录教务", true,
                            "input#username,input[name=username],input#username1");
                }
            });
        }

        /**
         * 抓取课表 HTML。
         *
         * 青果的课表接口有两个硬约束（见 HANDOFF 坑 4 的同类问题）：
         *   1. params 是 base64("xn=2026&xq=0&xh=学号")，必须 URL 编码后拼在 query 里
         *   2. Referer 必须指向 /student/xkjg.wdkb.jsp?menucode=S20301，否则拿不到数据
         *
         * @param b64Params 已 base64 的 params（前端用 Host.b64 生成）
         * @return "<状态码>|<HTML>" 或 "ERR:..."
         */
        @JavascriptInterface
        public String fetchScheduleHtml(String b64Params) {
            String enc = Uri.encode(b64Params);
            return Http.request(KB_URL + enc, null, cookies(), null, KB_REFERER);
        }

        /**
         * 下面三个「带教务 Cookie」的桥只允许打学校自己的域名。
         *
         * 为什么必须加这道闸：这三个方法会自动把**教务的 Cookie** 附到任意
         * URL 上。它们经 addJavascriptInterface 暴露给 WebView 里的页面，
         * 而页面里跑的是我们的 assets —— 但只要哪天出现一处能拼接字符串的
         * 渲染漏洞（或者用户装了带注入的输入法、剪贴板粘贴进一段 HTML），
         * 攻击者就能让这行代码把教务凭据发到自己的服务器上。
         * 白名单是零成本的兜底：真出事时，请求连不出去。
         */
        private boolean allowedCookieHost(String url) {
            try {
                String u = url == null ? "" : url.toLowerCase();
                if (u.startsWith("https://")) u = u.substring(8);
                else if (u.startsWith("http://")) u = u.substring(7);
                else return false;
                int slash = u.indexOf('/');
                String host = slash >= 0 ? u.substring(0, slash) : u;
                int colon = host.indexOf(':');
                if (colon >= 0) host = host.substring(0, colon);
                /* xxmu.edu.cn 与它的所有子域；hamu.edu.cn 是更名后的备用域。 */
                return host.equals("xxmu.edu.cn") || host.endsWith(".xxmu.edu.cn")
                        || host.equals("hamu.edu.cn") || host.endsWith(".hamu.edu.cn");
            } catch (Throwable e) {
                return false;
            }
        }

        /** 通用 GET（带教务 Cookie + 教务 Referer） */
        @JavascriptInterface
        public String httpGet(String url) {
            if (!allowedCookieHost(url)) return "ERR:BlockedHost:只能访问学校域名";
            return Http.request(url, null, cookies(), null, KB_REFERER);
        }

        /** 通用 GET（不带 Cookie）*/
        @JavascriptInterface
        public String httpGetPlain(String url) {
            return Http.request(url, null, "", null, null);
        }

        /** 通用 POST 表单 */
        @JavascriptInterface
        public String httpPost(String url, String body) {
            if (!allowedCookieHost(url)) return "ERR:BlockedHost:只能访问学校域名";
            return Http.request(url, body, cookies(),
                    "application/x-www-form-urlencoded; charset=UTF-8", KB_REFERER);
        }

        /**
         * 通用 HTTP（第三方接口用，比如胖乖生活 userapi.qiekj.com）。
         *
         * 和上面几个的区别：
         *   - 不带教务 Cookie，全部头由前端给（第三方接口要的是自己的 token）
         *   - 支持 GET/POST、自定义 Content-Type、multipart
         *
         * @param method  GET / POST
         * @param headers "k: v\nk: v"，可为空串
         * @param asMultipart "1" 时用 multipart/form-data 提交 body（body 是 k=v&k=v）
         * @return "<状态码>|<ISO-8859-1 字节串>" 或 "ERR:..."，前端用 TextDecoder 解 UTF-8
         */
        @JavascriptInterface
        public String httpFetch(String url, String method, String body,
                                String contentType, String headers, String asMultipart) {
            try {
                if ("1".equals(asMultipart)) {
                    return Http.postMultipart(url, body, "", null, headers);
                }
                return Http.request(url,
                        method == null || method.length() == 0 ? "GET" : method,
                        body, "", contentType, null, headers);
            } catch (Throwable e) {
                return "ERR:" + e.getClass().getSimpleName() + ":" + e.getMessage();
            }
        }

        /**
         * 打开胖乖生活 h5 做一次性登录/选机抓取。
         *
         * 为什么不在 App 里自绘登录框：h5 用手机号+图形码+短信码，还可能随时
         * 换成微信授权；自绘就得一直跟版。用官方页面登录一次，之后我们只接管
         * 已经拿到的 token —— 官方改版时用户重登一次即可，我们不用发新版。
         *
         * 回调：window.__onWaterCapture(json)，json 是 {u, t, ls} 的 JSON 字符串。
         */
        @JavascriptInterface
        public void openWaterCapture(final String url) {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        android.content.Intent it = new android.content.Intent(
                                MainActivity.this, WebActivity.class);
                        it.putExtra(WebActivity.EXTRA_URL, url);
                        it.putExtra(WebActivity.EXTRA_TITLE, "胖乖生活 · 登录并选择饮水机");
                        it.putExtra(WebActivity.EXTRA_CAPTURE, true);
                        startActivityForResult(it, REQ_CAPTURE);
                    } catch (Throwable e) {
                        showToast("无法打开页面：" + e.getClass().getSimpleName());
                    }
                }
            });
        }

        /** 读取打包在 assets 里的文本文件（如 licenses/说明），读不到返回空串 */
        @JavascriptInterface
        public String readAsset(String name) {
            try {
                java.io.InputStream in = getAssets().open(name);
                String s = readAll(in);
                in.close();
                return s;
            } catch (Throwable e) {
                return "";
            }
        }

        /**
         * 从相册选一张图，回传 dataURL 给前端做二维码解码。
         *
         * 为什么不用 WebView 的 <input type="file">：那需要在 Java 侧实现
         * onShowFileChooser 才能开相机/相册，链路更长；这里直接走系统相册，
         * 前端只拿一张压缩后的 JPEG（长边 ≤ 1000px），jsQR 解码完全够用。
         *
         * 回调：window.__onImagePicked(dataUrl)  失败时 dataUrl 为空串。
         */
        @JavascriptInterface
        public void pickImage() {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        android.content.Intent it = new android.content.Intent(
                                android.content.Intent.ACTION_GET_CONTENT);
                        it.setType("image/*");
                        it.addCategory(android.content.Intent.CATEGORY_OPENABLE);
                        startActivityForResult(it, REQ_IMAGE);
                    } catch (Throwable e) {
                        showToast("无法打开相册：" + e.getClass().getSimpleName());
                        notifyImagePicked("");
                    }
                }
            });
        }

        /**
         * 打开相机扫二维码（独立页面）。
         *
         * 为什么单独做一个 Activity：相机要独占 Surface、要权限、要处理生命周期，
         * 塞进主页会把 WebView 壳搅乱；独立页还顺便让返回键自然表示「取消」。
         *
         * 回调：window.__onQrText(text)
         */
        @JavascriptInterface
        public void scanQr() {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        android.content.Intent it = new android.content.Intent(
                                MainActivity.this, ScanActivity.class);
                        startActivityForResult(it, REQ_SCAN);
                    } catch (Throwable e) {
                        showToast("打不开相机：" + e.getClass().getSimpleName());
                        notifyQrText("");
                    }
                }
            });
        }

        // ---- 本地设置：学号 / 学期参数 / 上次同步时间 ----

        @JavascriptInterface
        public String getPref(String key) {
            return getSharedPreferences(PREFS, MODE_PRIVATE).getString(key, "");
        }

        @JavascriptInterface
        public void setPref(String key, String value) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                    .putString(key, value == null ? "" : value).apply();
        }

        /* ---- v1.1.39 主题：两个桥，都只做「读一个状态 / 改一次 UI」，不碰网络不碰文件 ---- */

        /** 系统夜间模式的真值来自 Configuration.uiMode，不靠 WebView 的
         *  prefers-color-scheme（定制 ROM 上两者经常不一致）。 */
        @JavascriptInterface
        public boolean isSystemDark() {
            return MainActivity.this.isSystemDark();
        }

        /** 由 theme.js 在首屏 / 切主题 / 系统变化时调用。
         *  @JavascriptInterface 跑在 JavaBridge 线程，改 UI 必须 post 回主线程。 */
        @JavascriptInterface
        public void setAppTheme(final boolean dark) {
            runOnUiThread(new Runnable() {
                public void run() { MainActivity.this.applyAppTheme(dark); }
            });
        }

        @JavascriptInterface
        public boolean removePref(String key) {
            if (key == null || key.length() == 0) return false;
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(key).apply();
            return true;
        }

        /**
         * 退出软件账号：把「这台手机属于谁」的一切痕迹清干净。
         *
         * 为什么必须在 Java 里做，而不是前端一个个删 pref：
         *   前端只知道 pref 的键名，不知道还有一堆文件（课表缓存、作业缓存、
         *   外部推送的 schedule.json）也是连着上一个人的。漏掉任何一个，
         *   下一个人打开就会看见别人的课表和作业——这是隐私事故，不是 BUG。
         *
         * 保留什么：只保留 xxmu_fp（设备指纹）。
         *   它是「这台机器」的标识，不是「这个人」的。清掉的话同一台手机
         *   每换一次账号就多占一个设备名额，几次之后管理员得手工解绑。
         *
         * 不动什么：教务 Cookie 由前端单独清（clearCookies），因为「退出软件账号」
         *   和「退出教务」是两个动作，有人只想换卡密账号而不想重新登录教务。
         */
        @JavascriptInterface
        public void clearAccount() {
            try {
                android.content.SharedPreferences sp =
                        getSharedPreferences(PREFS, MODE_PRIVATE);
                String fp = sp.getString("xxmu_fp", "");
                /* 必须合并成一个 Editor。
                 *
                 * 原来是两次独立 edit().apply()：先 clear() 再 putString(fp)。
                 * SharedPreferences 的 apply() 是异步落盘、不保证两次调用的
                 * 写入顺序 —— 万一 clear 后落盘、put 先落盘，xxmu_fp 就被抹掉，
                 * 下次启动重新生成指纹，同一台手机被当成新设备，白白占掉
                 * 一个名额（默认只给 3 台），换几次号就满了。 */
                android.content.SharedPreferences.Editor ed = sp.edit();
                ed.clear();
                if (fp != null && fp.length() > 0) ed.putString("xxmu_fp", fp);
                ed.apply();
            } catch (Throwable ignored) {}
            // 缓存文件：两个 JSON 都不带学号字段，留着就是上一个人的课表
            try { cacheFile(K_KB).delete(); } catch (Throwable ignored) {}
            try { cacheFile(K_HW).delete(); } catch (Throwable ignored) {}
            // 外部推送进来的也可能是上一个人的，一并清掉
            try { scheduleFile().delete(); } catch (Throwable ignored) {}
            try { homeworkFile().delete(); } catch (Throwable ignored) {}
        }

        /** 上次崩溃的堆栈（没有则空串）。给「关于」页显示，方便反馈问题 */
        @JavascriptInterface
        public String crashLog() {
            return CrashGuard.read(MainActivity.this);
        }

        @JavascriptInterface
        public void clearCrashLog() {
            CrashGuard.clear(MainActivity.this);
        }

        /** 系统与 WebView 版本信息，排查兼容性问题用 */
        @JavascriptInterface
        public String deviceInfo() {
            String wv = "";
            try {
                if (android.os.Build.VERSION.SDK_INT >= 26) {
                    wv = WebView.getCurrentWebViewPackage() != null
                            ? WebView.getCurrentWebViewPackage().versionName : "";
                }
            } catch (Throwable ignored) {}
            return android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL
                    + " | Android " + android.os.Build.VERSION.RELEASE
                    + " (API " + android.os.Build.VERSION.SDK_INT + ")"
                    + " | WebView " + wv;
        }

        /**
         * 当前安装包的 versionCode。
         *
         * 为什么前端要这个数：更新判断不能比版本号字符串（"0.10.0" < "0.9.0"
         * 这种字符串比较是错的），versionCode 单调递增，比大小最可靠。
         */
        @JavascriptInterface
        public String appCode() {
            try {
                return String.valueOf(getPackageManager()
                        .getPackageInfo(getPackageName(), 0).versionCode);
            } catch (Throwable e) {
                return "0";
            }
        }

        /** 当前安装包的 versionName，用于「关于」页展示与诊断 */
        @JavascriptInterface
        public String appVer() {
            try {
                return getPackageManager()
                        .getPackageInfo(getPackageName(), 0).versionName;
            } catch (Throwable e) {
                return "";
            }
        }

        /** base64 编码（前端拼青果课表 params 用） */
        @JavascriptInterface
        public String b64(String s) {
            try {
                return android.util.Base64.encodeToString(
                        s.getBytes("UTF-8"), android.util.Base64.NO_WRAP);
            } catch (Exception e) {
                return "";
            }
        }

        /** 教务 URL 前缀，前端拼请求用 */
        @JavascriptInterface
        public String kbUrl() {
            return KB_URL;
        }

        @JavascriptInterface
        public void openUrl(final String url) {
            try {
                android.content.Intent i = new android.content.Intent(
                        android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url));
                i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception e) {
                toast("没有可用的浏览器");
            }
        }

        /**
         * 按包名直接拉起已安装的 App（宿舍空调缴费要跳「完美校园」用）。
         * 为什么不用 scheme：完美校园不注册公开 scheme，intent:// 落空只会报
         * 「没有可用的浏览器」（真机已踩坑）。getLaunchIntentForPackage 是
         * 系统提供的按包名打开启动页的正路，没装返回 null，前端据此给指引。
         * 注意：Android 11+（API 30）包可见性限制——必须在 AndroidManifest 的
         * <queries> 里声明 <package name="com.newcapec.mobile.ncp"/> 才能查到，
         * 否则这里恒返回 null（v1.1.33 曾因此一直「不跳转」）。
         */
        @JavascriptInterface
        public boolean openApp(final String pkg) {
            try {
                android.content.Intent i = getPackageManager().getLaunchIntentForPackage(pkg);
                if (i == null) return false;
                i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /**
         * 在 App 内的 WebView 打开链接（用于学习通作业/考试页）。
         *
         * 为什么必须走内置 WebView 而不是系统浏览器：
         *   学习通的作业页/考试页都要求登录态。系统浏览器里没有学习通 cookie，
         *   打开只会跳 passport2 登录页；而且就算登录了也是另一个会话，
         *   跳回来仍然是未登录状态。内置 WebView 有独立 cookie 池，
         *   用户在里面登录一次，之后就能一直在 App 内访问。
         *
         * 注意 @JavascriptInterface 是运行在 JavaBridge 线程，不能直接操作 UI，
         * 所以这里 post 到 UI 线程再弹。
         */
        @JavascriptInterface
        public void openInApp(final String url) {
            runOnUiThread(new Runnable() {
                public void run() {
                    openWebActivity(url, "学习通", false);
                }
            });
        }

        @JavascriptInterface
        public void toast(final String msg) {
            runOnUiThread(new Runnable() {
                public void run() {
                    Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
                }
            });
        }

        /**
         * 复制文本到剪贴板。
         *
         * 为什么要走原生：file:// 页面下 navigator.clipboard.writeText 在
         * 非安全上下文里是 undefined，document.execCommand('copy') 也需要
         * 先聚焦一个真实输入框，弹窗里的按钮点起来经常静默失败。
         */
        @JavascriptInterface
        public void clip(final String text) {
            if (text == null) return;
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        android.content.ClipboardManager cm =
                            (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                        cm.setPrimaryClip(android.content.ClipData.newPlainText("xxmu", text));
                    } catch (Throwable t) {
                        Toast.makeText(MainActivity.this, "复制失败", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }
        /* ===== 异步 HTTP 桥（v0.9.4 修复） =====
         *
         * 教训：v0.9.3 把 httpFetchAsync / httpFetchPoll / fetchScheduleHtmlAsync
         * 写在了 Host 类的右花括号【外面】，它们因此属于 MainActivity 而不是 Host。
         * JS 侧 `typeof Host.httpFetchAsync === 'function'` 恒为 false，
         * sync.js / auth.js 全部静默退回同步版 Host.httpFetch ——
         * Java 里同步等 HTTP 回来，JS 线程就被卡住 25 秒，
         * 表现正是「页面能上下滑动（渲染线程没事）但点哪都没反应」。
         *
         * 现在在 Host 里补三个转发方法，把调用交给 MainActivity 的实现。
         * 用 MainActivity.this.xxx 显式限定，否则会调回自己无限递归。
         */

        @JavascriptInterface
        public void httpFetchAsync(String key, String url, String method, String body,
                                   String contentType, String headers, String asMultipart) {
            MainActivity.this.httpFetchAsync(key, url, method, body,
                    contentType, headers, asMultipart);
        }

        @JavascriptInterface
        public String httpFetchPoll(String key) {
            return MainActivity.this.httpFetchPoll(key);
        }

        @JavascriptInterface
        public void fetchScheduleHtmlAsync(String key, String b64Params) {
            MainActivity.this.fetchScheduleHtmlAsync(key, b64Params);
        }

        /**
         * 带指定站点 Cookie 的后台请求（学习通用）。
         *
         * 为什么不用 httpFetchAsync：那个方法故意不带任何 Cookie（给胖乖生活这种
         * 靠 token 的第三方接口用）。学习通整条链路都靠 Cookie 认人，
         * 而且 Cookie 存在 WebView 的 cookie 池里，JS 侧拿不到也没法自己塞进头，
         * 只能由 Java 从 CookieManager 取。
         *
         * @param cookieUrl 取哪个域名的 Cookie（如 https://mooc1.chaoxing.com）
         */
        @JavascriptInterface
        public void httpFetchCkAsync(String key, String url, String method, String body,
                                     String contentType, String headers,
                                     String cookieUrl, String referer) {
            MainActivity.this.httpFetchCkAsync(key, url, method, body,
                    contentType, headers, cookieUrl, referer);
        }

        /** 某个站点当前有没有 Cookie（>=20 字符算有） */
        @JavascriptInterface
        public boolean hasCookieFor(String url) {
            try {
                String c = CookieManager.getInstance().getCookie(url);
                return c != null && c.length() >= 20;
            } catch (Throwable e) {
                return false;
            }
        }

        /**
         * 清掉指定站点的 Cookie。
         *
         * v1.1.9：原来注释写「指定站点」，代码却是 removeAllCookies(null) ——
         * 一次「退出学习通」把教务（青果）的 Cookie 一起清了。用户的下场是：
         * 只是不想再看学习通，回头一看课表变成「未登录」，还得重新过一次
         * 验证码。现在按域名逐个把名字对应的 Cookie 置空（Max-Age=0），
         * 只动这一个站点。
         *
         * 为什么不用 removeAllCookies：CookieManager 没有「按域名删除」的 API，
         * 想删单个站点只能自己拿 getCookie(url) 里的名字去覆盖成过期值。
         */
        @JavascriptInterface
        public void clearCookieFor(final String url) {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        android.webkit.CookieManager cm = android.webkit.CookieManager.getInstance();
                        String all = cm.getCookie(url);
                        if (all != null && all.length() > 0) {
                            for (String kv : all.split(";")) {
                                String one = kv.trim();
                                int eq = one.indexOf('=');
                                String name = (eq > 0) ? one.substring(0, eq).trim() : one;
                                if (name.length() == 0) continue;
                                /* 同一个名字可能在多个 path 上存在（青果有 / 和 /jsxsd），
                                 * 只清 / 会留下一条，等于没退出。两条都置过期。 */
                                cm.setCookie(url, name + "=; Max-Age=0; path=/");
                                cm.setCookie(url, name + "=; Max-Age=0; path=/jsxsd");
                            }
                        }
                        cm.flush();
                    } catch (Throwable ignored) {}
                }
            });
        }

        /**
         * 通用打开网页（给学习通登录用）。
         *
         * detect 为真时顶栏会多一个「完成」按钮，并且页面跳离登录页后自动关闭。
         * 回调走 window.__onCxDone(ok)，和教务登录的 __onLoginDone 分开，
         * 否则学习通登完会被当成教务登完，去拉课表然后拿空数据。
         *
         * 顺带把用户在学习通登录页填的账号读回来（input#phone）。
         * 注意：学习通那个框是「手机号或学号」二合一，读到 11 位手机号时
         * 无法判定身份，前端只记下来不拦人 —— 见 license.js 的 noteCxAccount。
         */
        @JavascriptInterface
        public void openWebFor(final String url, final String title, final boolean detect) {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        android.content.Intent it = new android.content.Intent(
                                MainActivity.this, WebActivity.class);
                        it.putExtra(WebActivity.EXTRA_URL, url);
                        it.putExtra(WebActivity.EXTRA_TITLE, title);
                        it.putExtra(WebActivity.EXTRA_DETECT_LOGIN, detect);
                        // 学习通的登录判据和教务完全不同
                        it.putExtra(WebActivity.EXTRA_BAD_HINTS, "passport2.chaoxing.com||/login");
                        it.putExtra(WebActivity.EXTRA_OK_HINTS,
                                "mooc1.chaoxing.com||i.chaoxing.com||/visit/||/mycourse/");
                        // 只在真去登录时读账号；别的页面（如胖乖付款页）传的
                        // detect=false，没有输入框可读，给了选择器也只是空跑。
                        if (detect) it.putExtra(WebActivity.EXTRA_GRAB, "input#phone,input#uname");
                        startActivityForResult(it, REQ_CX);
                    } catch (Throwable e) {
                        showToast("无法打开页面：" + e.getClass().getSimpleName());
                    }
                }
            });
        }

        /* ================= 安装包托管：选包 / 上传 / 下载安装 =================
         *
         * 为什么整条链路都放在 Java 侧：APK 是几 MB 的二进制。走
         * 「JS 读成 base64 → 桥传字符串 → Java 再解码」这条老路，
         * 内存在 WebView 里要翻三倍（原始 + base64 + 解码后的字节数组），
         * 16 MB 的包在低端机上直接 OOM。所以：
         *   选包 → Java 直接拿到 File 路径，字节从不进 JS；
         *   上传 → Java 边读边写 HTTP 流，JS 只收一个 JSON 结果；
         *   下载 → Java 边读边写文件，装完才回调 JS。
         */

        /** 选一个 APK。回调 window.__onApkPicked(name, size, path)；取消时三者都空。 */
        @JavascriptInterface
        public void pickApk() {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        android.content.Intent it = new android.content.Intent(
                                android.content.Intent.ACTION_GET_CONTENT);
                        // 有些文件管理器不认 apk 这个 MIME，给 */* 再在 Java 侧自己判后缀，
                        // 否则用户在小米/华为的文件管理器里根本选不到自己的安装包。
                        it.setType("*/*");
                        it.addCategory(android.content.Intent.CATEGORY_OPENABLE);
                        startActivityForResult(it, REQ_APK);
                    } catch (Throwable e) {
                        showToast("打不开文件选择器：" + e.getClass().getSimpleName());
                        notifyApkPicked("", 0, "");
                    }
                }
            });
        }

        /**
         * 上传安装包到服务器。异步，回调 window.__onApkUpload(key, "<code>|<body>")。
         *
         * @param uploadUrl 完整地址（含 name/ver/code/publish 查询参数，JS 侧拼好）
         */
        @JavascriptInterface
        public void uploadApk(final String key, final String uploadUrl, final String adminKey,
                              final String filePath) {
            if (key == null || key.length() == 0) return;
            /* 只允许上传应用自己私有目录里的文件。
             *
             * filePath 是页面 JS 给的。原来直接 new File(filePath) 就发出去，
             * 于是页面里任意一段能拼字符串的代码都能把
             * /data/data/com.xxmu.helper/shared_prefs/xxmu.xml（里面有票据、指纹）
             * 当「安装包」上传到管理员接口，或者更糟——上传到别处。
             * 真实路径只有两个来源：pickApk 的返回值和 installCache，
             * 都在 getFilesDir()/getCacheDir() 下面。 */
            File f;
            try {
                f = new File(filePath).getCanonicalFile();
            } catch (Throwable e) {
                final String jsBad = "window.__onApkUpload && window.__onApkUpload("
                        + org.json.JSONObject.quote(key) + ","
                        + org.json.JSONObject.quote("ERR:BadPath:文件路径不合法") + ")";
                runOnUiThread(new Runnable() {
                    public void run() { if (web != null) web.evaluateJavascript(jsBad, null); }
                });
                return;
            }
            if (!insideAppDirs(f)) {
                final String jsBad = "window.__onApkUpload && window.__onApkUpload("
                        + org.json.JSONObject.quote(key) + ","
                        + org.json.JSONObject.quote("ERR:BadPath:只能上传应用自己的文件") + ")";
                runOnUiThread(new Runnable() {
                    public void run() { if (web != null) web.evaluateJavascript(jsBad, null); }
                });
                return;
            }
            final File src = f;
            Thread t = new Thread(new Runnable() {
                public void run() {
                    String out;
                    try {
                        out = Http.uploadFile(uploadUrl, src, adminKey);
                    } catch (Throwable e) {
                        out = "ERR:" + e.getClass().getSimpleName() + ":" + e.getMessage();
                    }
                    poolPut(key, out);
                    final String js = "window.__onApkUpload && window.__onApkUpload("
                            + org.json.JSONObject.quote(key) + ","
                            + org.json.JSONObject.quote(out) + ")";
                    runOnUiThread(new Runnable() {
                        public void run() {
                            if (web != null) web.evaluateJavascript(js, null);
                        }
                    });
                }
            }, "xxmu-upload");
            t.setDaemon(true);
            t.start();
        }

        /** 判断 f 是否落在 filesDir / cacheDir（含子目录）之内。 */
        private boolean insideAppDirs(File f) {
            try {
                String p = f.getCanonicalPath();
                String[] roots = new String[] {
                        getFilesDir().getCanonicalPath(),
                        getCacheDir().getCanonicalPath(),
                };
                for (String root : roots) {
                    if (p.equals(root)) return false;          // 目录本身不是文件
                    if (p.startsWith(root + File.separator)) return true;
                }
            } catch (Throwable e) {}
            return false;
        }

        /**
         * 选一张相册图片，压缩后上传到「校园图片」待审队列。
         *
         * 为什么整条链路放 Java 侧（和装包上传同一个理由）：
         * 一张手机原图 3~8 MB，走 base64 进 JS 再回传，中间至少三份拷贝，
         * 低端机直接 OOM。这里选完就地压缩成 ≤1600px 的 JPEG，写进私有
         * 目录，再用 Http.uploadRaw 流式发出去——字节始终不进 JS。
         *
         * 回调：
         *   window.__onPhotoProgress(stage)            stage = 'compress' | 'upload'
         *   window.__onPhotoUploaded(ok, msgOrKey, st) st = 'pending'|'fail'
         */
        @JavascriptInterface
        public void pickPhotoForUpload(final String cap, final String sid) {
            pendingPhotoCap = cap == null ? "" : cap;
            pendingPhotoSid = sid == null ? "" : sid;
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        android.content.Intent it = new android.content.Intent(
                                android.content.Intent.ACTION_GET_CONTENT);
                        it.setType("image/*");
                        it.addCategory(android.content.Intent.CATEGORY_OPENABLE);
                        startActivityForResult(it, REQ_PHOTO);
                    } catch (Throwable e) {
                        showToast("打不开相册：" + e.getClass().getSimpleName());
                        notifyPhotoUploaded(false, "打不开相册", "fail");
                    }
                }
            });
        }

        /**
         * 下载安装包并交给系统安装器。回调 window.__onApkDownload(ok, msg)，
         * 过程中调 window.__onApkProgress(got, total) 报进度。
         *
         * 为什么不用 Host.openUrl 让系统浏览器去下：那样用户下完还要自己去
         * 「文件管理 → 下载」里点一遍，而且国产 ROM 的浏览器经常把 apk 拦下
         * 说是「风险文件」。自己在 App 内下完直接拉起安装器，路径最短。
         *
         * 为什么要有进度回调（v1.1.4）：
         * 之前按钮变成「下载中…」之后就再没有任何变化，学生看不出是在下、
         * 卡住了、还是已经死了。网络上单连接被限速到几十 KB/s 时，480 KB
         * 也要十几秒，没有进度就是干等。进度由 Http 的分段下载累加出来。
         *
         * 为什么要有 expectSha（v1.1.8）：
         * 分段下载只保证「每段字节数对」，不保证「拼起来是原文件」。
         * 原来收尾只判 `out.length() > 1024` —— 一个被中间设备改了字节、
         * 或者服务端正在换包时取到的半新半旧文件，长度完全可能对得上，
         * 然后被交给安装器。丢坏包一般签名过不去，但错在 zip 未签名区域
         * （assets 里的 JS）时签名照样过，学生就装上一个半坏的 App。
         * 服务端 /v1/config 的 latest.sha256 一直有这个值，白白没被用。
         * 传空串表示调用方没有哈希（老前端），此时跳过校验并保留原行为。
         */
        @JavascriptInterface
        public void downloadAndInstall(final String url, final String expectSha) {
            Thread t = new Thread(new Runnable() {
                public void run() {
                    String msg = "";
                    boolean ok = false;
                    File out = null;
                    try {
                        File dir = new File(getCacheDir(), ApkProvider.DIR);
                        if (!dir.exists()) dir.mkdirs();
                        out = new File(dir, "update.apk");
                        if (out.exists()) out.delete();
                        Http.downloadToFile(url, out, new Http.Progress() {
                            private long lastAt = 0;
                            private long lastPct = -1;
                            public void on(long got, long total) {
                                /* 4 段并发下 on() 会被调上千次，每次都过一遍
                                 * WebView 的 evaluateJavascript 是把 UI 线程和
                                 * JS 引擎一起拖慢。所以按「距上次 ≥150ms」或
                                 * 「百分比变了」两个条件节流。 */
                                long now = System.currentTimeMillis();
                                long pct = total > 0 ? (got * 100 / total) : -1;
                                if (now - lastAt < 150 && pct == lastPct) return;
                                lastAt = now;
                                lastPct = pct;
                                pushProgress(got, total);
                            }
                        });
                        ok = out.length() > 1024;
                        if (!ok) {
                            msg = "下载到的文件太小，可能不是安装包";
                        } else {
                            /* v1.1.8：整包哈希校验。不一致就把文件删掉 ——
                             * 留着只会让下一次「文件存在」的判断误以为已经下好。 */
                            String want = (expectSha == null) ? "" : expectSha.trim().toLowerCase();
                            if (want.length() >= 32) {
                                String got = Http.sha256(out);
                                if (!want.equals(got)) {
                                    ok = false;
                                    msg = "安装包校验没过（可能下载时被断过），请重试一次";
                                    try { out.delete(); } catch (Throwable ignored) {}
                                }
                            }
                        }
                    } catch (Throwable e) {
                        msg = e.getClass().getSimpleName() + ": " + e.getMessage();
                        /* 分段下载失败时文件是 RandomAccessFile setLength 出来的
                         * 空洞文件，可能已经有几百 KB —— 不删掉的话下一次
                         * 「下载到的文件太小」判断会误判成成功，然后装上一个
                         * 全是 0 的包。 */
                        try { if (out != null && out.exists()) out.delete(); } catch (Throwable ignored) {}
                    }
                    final boolean fOk = ok;
                    final String fMsg = msg;
                    final File fFile = out;
                    runOnUiThread(new Runnable() {
                        public void run() {
                            if (fOk) startInstall(fFile);
                            if (web != null) {
                                web.evaluateJavascript("window.__onApkDownload && window.__onApkDownload("
                                        + fOk + "," + org.json.JSONObject.quote(fMsg) + ")", null);
                                /* 收尾时补一个满进度：分段结束时最后一次回调可能
                                 * 因为节流被丢掉，前端会永远停在 97% 那种数字上。 */
                                if (fOk) {
                                    web.evaluateJavascript(
                                            "window.__onApkProgress && window.__onApkProgress("
                                            + (fFile == null ? 0 : fFile.length()) + ","
                                            + (fFile == null ? 0 : fFile.length()) + ")", null);
                                }
                            }
                        }
                    });
                }
            }, "xxmu-download");
            t.setDaemon(true);
            t.start();
        }

        /** 把进度丢给前端（已在 UI 线程，或从下载线程转进去） */
        private void pushProgress(final long got, final long total) {
            runOnUiThread(new Runnable() {
                public void run() {
                    if (web == null) return;
                    web.evaluateJavascript("window.__onApkProgress && window.__onApkProgress("
                            + got + "," + total + ")", null);
                }
            });
        }

        /** 有没有「安装未知来源应用」的权限（Android 8+ 要用户手动给） */
        @JavascriptInterface
        public boolean canInstall() {
            try {
                if (android.os.Build.VERSION.SDK_INT >= 26) {
                    return getPackageManager().canRequestPackageInstalls();
                }
                return true;
            } catch (Throwable e) {
                return true;
            }
        }

        /** 跳到系统的「允许安装未知应用」设置页 */
        @JavascriptInterface
        public void openInstallSettings() {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        if (android.os.Build.VERSION.SDK_INT >= 26) {
                            android.content.Intent it = new android.content.Intent(
                                    android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                    Uri.parse("package:" + getPackageName()));
                            startActivity(it);
                        }
                    } catch (Throwable e) {
                        showToast("打不开设置页，请手动到「设置 → 应用 → 特殊权限」里允许");
                    }
                }
            });
        }

        // ---- 课程提醒（本地通知）----
        //
        // 前端（reminder.js）算好「下一次课的绝对毫秒时间戳」，把这一批
        // 闹钟一次性传下来；这里在 Java 侧用 AlarmManager.setExactAndAllowWhileIdle
        // 挂精确闹钟。到点后系统广播给 ReminderReceiver，由它发通知。
        //
        // 为什么闹钟要放在 Java、而不是前端 setInterval 里数秒：
        //   锁屏 / 切后台后 WebView 的定时器会被系统节流甚至冻结，
        //   前台数秒的提醒在真机上几乎必然晚点或漏掉；AlarmManager 由系统
        //   定时，App 被杀也能唤醒（用 setExactAndAllowWhileIdle 在 Doze 下也尽量准）。

        /** 取消所有已挂的课程提醒（改课表 / 关提醒时先清空再重挂） */
        @JavascriptInterface
        public void cancelReminders() {
            // v1.1.35：逻辑搬进 ReminderScheduler，和 BootReceiver 的重挂共用一份。
            // 之前这里有第二份 PendingIntent 构造，两处一旦改岔就 cancel 不掉旧闹钟。
            try {
                ReminderScheduler.cancelAll(MainActivity.this);
            } catch (Throwable ignored) {}
        }

        /**
         * 挂一批课程提醒。参数是一个 JSON 数组，每项：
         *   { "at": 绝对毫秒时间戳, "name": 课程名, "room": 教室, "mins": 提前分钟数 }
         * 返回挂了条数。at 必须是未来时间，过去的不挂（避免一开就弹一堆过期通知）。
         */
        @JavascriptInterface
        public int scheduleReminders(String json) {
            try {
                return ReminderScheduler.schedule(MainActivity.this, json);
            } catch (Throwable e) {
                return 0;
            }
        }

        /** 有没有发通知的权限（Android 13+ 才需要问，老版本默认有） */
        @JavascriptInterface
        public boolean canNotify() {
            try {
                if (android.os.Build.VERSION.SDK_INT >= 33) {
                    return checkSelfPermission(
                            "android.permission.POST_NOTIFICATIONS")
                            == android.content.pm.PackageManager.PERMISSION_GRANTED;
                }
                return true;
            } catch (Throwable e) {
                return true;
            }
        }

        /** 请求发通知权限（Android 13+ 弹系统框，老版本直接返回 true） */
        @JavascriptInterface
        public void requestNotifyPermission() {
            if (android.os.Build.VERSION.SDK_INT >= 33) {
                try {
                    if (checkSelfPermission("android.permission.POST_NOTIFICATIONS")
                            != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                        requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"},
                                3001);
                    }
                } catch (Throwable ignored) {}
            }
        }

        /** v1.1.41：「试一下」——不挂闹钟，立刻出一条当前方式的提醒。
         *  用户能当场比出响铃/静默/短信哪档合意，不用改手机时间等真闹钟。 */
        @JavascriptInterface
        public void previewReminder(String mode, String name, String room, int mins) {
            ReminderReceiver.show(MainActivity.this,
                    name == null ? "高等数学（示例）" : name,
                    room == null ? "A101" : room,
                    mins, mode);
        }

        /** 短信那档的「试一下」直接把系统短信编辑页拉起来（正文写好、收件人空着）。 */
        @JavascriptInterface
        public void openSmsDraft(String name, String room, int mins) {
            ReminderReceiver.openSmsDraft(MainActivity.this, name, room, mins);
        }

        /**
         * 精确闹钟能不能用（Android 12+ 用户可以关掉「闹钟和提醒」特殊权限）。
         * 关掉后提醒仍然会响，但可能晚几分钟——前端据此给一句诚实提示，
         * 而不是让学生以为「设了没反应」。
         */
        @JavascriptInterface
        public boolean exactAlarmOk() {
            try {
                if (android.os.Build.VERSION.SDK_INT >= 31) {
                    android.app.AlarmManager am = (android.app.AlarmManager)
                            getSystemService(android.content.Context.ALARM_SERVICE);
                    return am == null || am.canScheduleExactAlarms();
                }
                return true;
            } catch (Throwable e) {
                return true;
            }
        }

        /** 跳到系统的「闹钟和提醒」特殊权限页（精确闹钟被关掉时给用户一个出口） */
        @JavascriptInterface
        public void openExactAlarmSettings() {
            runOnUiThread(new Runnable() {
                public void run() {
                    try {
                        if (android.os.Build.VERSION.SDK_INT >= 31) {
                            android.content.Intent it = new android.content.Intent(
                                    android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                                    Uri.parse("package:" + getPackageName()));
                            startActivity(it);
                        }
                    } catch (Throwable e) {
                        showToast("打不开设置页，请到「设置 → 应用 → 特殊权限 → 闹钟和提醒」里允许");
                    }
                }
            });
        }
    }

    // ---------------------------------------------------------------- 内置浏览（Activity）

    private static final int REQ_WEB = 1001;
    private static final int REQ_LOGIN = 1002;
    private static final int REQ_CAPTURE = 1003;
    private static final int REQ_IMAGE = 1004;
    private static final int REQ_SCAN = 1005;
    private static final int REQ_CX = 1006;   // 学习通登录
    private static final int REQ_APK = 1007;  // 选安装包
    private static final int REQ_PHOTO = 1008; // 选一张校园图片上传

    /**
     * 用独立 Activity 打开网页。
     *
     * 为什么不用 AlertDialog：见 WebActivity 顶部注释——对话框的 WRAP_CONTENT
     * 容器会让 WebView 高度算成 0，且其 Window 带 FLAG_ALT_FOCUSABLE_IM 会压住
     * 软键盘。两轮在对话框上打补丁都没解决，改用 Activity 后两个问题从根上消失。
     */
    private void openWebActivity(String url, String title, boolean detectLogin) {
        openWebActivityGrab(url, title, detectLogin, null);
    }

    /**
     * 打开网页并可指定要读值的输入框。
     *
     * grabSel 非空时 WebActivity 会持续轮询那个输入框，把用户填过的账号
     * 随结果一起交回（EXTRA_ACCOUNT）。教务登录用这个拿学号：青果用学号
     * 当登录名，能登进去就说明他确实掌握该学号的密码。
     */
    private void openWebActivityGrab(String url, String title, boolean detectLogin,
                                     String grabSel) {
        try {
            android.content.Intent it = new android.content.Intent(this, WebActivity.class);
            it.putExtra(WebActivity.EXTRA_URL, url);
            it.putExtra(WebActivity.EXTRA_TITLE, title);
            it.putExtra(WebActivity.EXTRA_DETECT_LOGIN, detectLogin);
            if (grabSel != null) it.putExtra(WebActivity.EXTRA_GRAB, grabSel);
            startActivityForResult(it, detectLogin ? REQ_LOGIN : REQ_WEB);
        } catch (Throwable e) {
            showToast("无法打开页面：" + e.getClass().getSimpleName());
        }
    }

    @Override
    protected void onActivityResult(int req, int res, android.content.Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_LOGIN) {
            CookieManager.getInstance().flush();
            String acct = "";
            try {
                if (res == RESULT_OK && data != null) {
                    String a = data.getStringExtra(WebActivity.EXTRA_ACCOUNT);
                    if (a != null) acct = a.trim();
                }
            } catch (Throwable ignored) {
            }
            notifyLoginAccount(res == RESULT_OK, acct);
        } else if (req == REQ_CAPTURE) {
            CookieManager.getInstance().flush();
            String payload = "null";
            try {
                if (data != null) {
                    String s = data.getStringExtra(WebActivity.EXTRA_RESULT);
                    if (s != null && s.length() > 4) payload = s;
                }
            } catch (Throwable ignored) {}
            notifyWaterCapture(payload);
        } else if (req == REQ_IMAGE) {
            handleImageResult(res, data);
        } else if (req == REQ_SCAN) {
            String text = "";
            try {
                if (res == RESULT_OK && data != null) {
                    String s = data.getStringExtra(ScanActivity.EXTRA_TEXT);
                    if (s != null) text = s;
                }
            } catch (Throwable ignored) {}
            notifyQrText(text);
        } else if (req == REQ_CX) {
            CookieManager.getInstance().flush();
            String acct = "";
            try {
                if (res == RESULT_OK && data != null) {
                    String a = data.getStringExtra(WebActivity.EXTRA_ACCOUNT);
                    if (a != null) acct = a.trim();
                }
            } catch (Throwable ignored) {
            }
            notifyCxDone(res == RESULT_OK, acct);
        } else if (req == REQ_APK) {
            handleApkResult(res, data);
        } else if (req == REQ_PHOTO) {
            handlePhotoResult(res, data);
        }
    }

    /**
     * 通知权限（Android 13+）申请结果。
     *
     * 必须回调前端：用户点了「允许」以后，前面挂好的闹钟才算真的能弹出通知。
     * 若前端只调 requestNotifyPermission() 然后就什么都不等，它无从知道用户
     * 是同意了还是又点了「不允许」——只能显示「已开启」，而实际上一条都不会响。
     */
    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] grants) {
        super.onRequestPermissionsResult(req, perms, grants);
        if (req != 3001) return;
        boolean ok = false;
        try {
            if (grants != null && grants.length > 0) {
                ok = grants[0] == android.content.pm.PackageManager.PERMISSION_GRANTED;
            }
        } catch (Throwable ignored) {}
        final boolean granted = ok;
        runOnUiThread(new Runnable() {
            public void run() {
                if (web == null) return;
                web.evaluateJavascript(
                        "window.__onNotifyPerm && window.__onNotifyPerm(" + granted + ")", null);
            }
        });
    }

    /**
     * 选中安装包 → 复制到私有 cacheDir 再回传路径。
     *
     * 为什么不直接把 content:// URI 交给上传线程：上传要跑几秒，
     * 期间如果用户切走或系统回收，那个临时授权可能已经失效，
     * 读一半抛 SecurityException。先复制到自己的目录，后面就完全自主了。
     *
     * v1.1.9：整段复制搬到后台线程，并且用 try-with-resources。
     * 原来这段是在 onActivityResult 的 UI 线程上跑 64 KiB 缓冲的整包拷贝 ——
     * 一个 50 MB 的安装包在主线程上要几百毫秒到好几秒，期间界面完全不动，
     * 系统随时可能弹「应用无响应」。而且 in / fo 的 close 写在 try 末尾，
     * 中途抛异常两个流都不会关，fd 泄漏；失败分支还留下一个半截的
     * picked.apk，下次进管理页点「已选的包」会被当成有效文件读。
     */
    private void handleApkResult(int res, final android.content.Intent data) {
        if (res != RESULT_OK || data == null || data.getData() == null) {
            notifyApkPicked("", 0, "");
            return;
        }
        final Uri uri = data.getData();
        new Thread(new Runnable() {
            public void run() {
                String name = "update.apk";
                long size = 0;
                try {
                    android.database.Cursor c = getContentResolver().query(uri, null, null, null, null);
                    try {
                        if (c != null) {
                            int i = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                            int j = c.getColumnIndex(android.provider.OpenableColumns.SIZE);
                            if (c.moveToFirst()) {
                                if (i >= 0) name = c.getString(i);
                                if (j >= 0) size = c.getLong(j);
                            }
                        }
                    } finally {
                        if (c != null) { try { c.close(); } catch (Throwable ignored) {} }
                    }
                    if (name == null || name.length() == 0) name = "update.apk";

                    File dir = new File(getCacheDir(), ApkProvider.DIR);
                    if (!dir.exists()) dir.mkdirs();
                    File dst = new File(dir, "picked.apk");
                    /* 上一轮失败留下的半截文件先删，否则这次如果也失败，
                     * 界面会把旧的那份当成「刚选好的包」。 */
                    if (dst.exists()) dst.delete();

                    boolean okCopy = false;
                    try (InputStream in = getContentResolver().openInputStream(uri);
                         FileOutputStream fo = new FileOutputStream(dst)) {
                        if (in == null) throw new java.io.IOException("openInputStream returned null");
                        byte[] buf = new byte[64 * 1024];
                        int n;
                        while ((n = in.read(buf)) > 0) fo.write(buf, 0, n);
                        fo.flush();
                        okCopy = true;
                    }
                    if (!okCopy || dst.length() < 1024) {
                        try { dst.delete(); } catch (Throwable ignored) {}
                        showToast("读取安装包失败：文件是空的");
                        notifyApkPicked("", 0, "");
                        return;
                    }
                    final String fName = name;
                    final long fLen = dst.length();
                    final String fPath = dst.getAbsolutePath();
                    runOnUiThread(new Runnable() {
                        public void run() { notifyApkPicked(fName, fLen, fPath); }
                    });
                } catch (final Throwable e) {
                    try {
                        File dst2 = new File(new File(getCacheDir(), ApkProvider.DIR), "picked.apk");
                        if (dst2.exists()) dst2.delete();
                    } catch (Throwable ignored) {}
                    runOnUiThread(new Runnable() {
                        public void run() {
                            showToast("读取安装包失败：" + e.getClass().getSimpleName());
                            notifyApkPicked("", 0, "");
                        }
                    });
                }
            }
        }, "xxmu-pickapk").start();
    }

    /** 拉起系统安装器 */
    private void startInstall(File apk) {
        try {
            if (android.os.Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                showToast("请先允许「安装未知应用」，再点一次下载");
                openInstallSettingsInner();
                return;
            }
            Uri u = ApkProvider.uriFor(this, apk);
            android.content.Intent it = new android.content.Intent(android.content.Intent.ACTION_VIEW);
            it.setDataAndType(u, "application/vnd.android.package-archive");
            it.addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION);
            it.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(it);
        } catch (Throwable e) {
            showToast("打不开安装器：" + e.getClass().getSimpleName());
        }
    }

    private void openInstallSettingsInner() {
        try {
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                startActivity(new android.content.Intent(
                        android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName())));
            }
        } catch (Throwable ignored) {}
    }

    /* ================= 校园图片上传（v1.1.6） =================
     *
     * 流程：相册选图 → 就地压缩到长边 ≤1600px / JPEG 82 → 写私有 cache
     *      → 流式 POST 到 /v1/photo?cap=&id= → 回调前端。
     *
     * 为什么长边定 1600：校园照片的用途是「给人看这是哪」，不是摄影作品。
     * 1600px 在 2K 屏上放大看细节也够，而手机直出 4000px 的图压到 1600
     * 通常只剩 200~400 KB —— 学生用流量上传也不心疼。
     * 为什么质量 82：低于 75 时文字/招牌会糊得认不出，高于 88 体积翻倍。
     */
    /* v1.1.8：加 volatile。写发生在 JS 线程（pickPhotoForUpload），读发生在
     * UI 线程（handlePhotoResult）。runOnUiThread 入队实践上能建立可见性，
     * 但那是实现细节不是语言保证 —— 加一个关键字就不用赌。 */
    private volatile String pendingPhotoCap = "";
    private volatile String pendingPhotoSid = "";

    private void handlePhotoResult(int res, android.content.Intent data) {
        if (res != RESULT_OK || data == null || data.getData() == null) {
            notifyPhotoUploaded(false, "已取消", "fail");
            return;
        }
        notifyPhotoProgress("compress");
        final android.net.Uri uri = data.getData();
        final String cap = pendingPhotoCap;
        final String sid = pendingPhotoSid;
        /* 解码 + 缩放 + JPEG 编码全部搬到后台线程。
         *
         * 原来这一整段直接在 onActivityResult 里跑（UI 线程）：学生从相册选
         * 一张 12MP 的原图，主线程要 decode 两次 + createScaledBitmap + 编码，
         * 几百毫秒到一秒以上完全无响应 —— 转屏、返回键、下拉都不动，系统随时
         * 可能弹 ANR 对话框。
         *
         * 同时修了三个泄漏：
         *   · 两次 openInputStream 的 close 都放进了 try-with-resources
         *     （decodeStream 抛 OOM 时原来的 close 会被跳过，fd 累积）；
         *   · FileOutputStream 也走 try-with-resources；
         *   · 失败时删掉半截的 upload.jpg —— 不删的话下次上传会先被
         *     `tmp.length() < 1024` 拦成「压缩后文件异常」，用户反复重试都失败，
         *     而且提示指向的方向完全不对（他会以为是这张图的问题）。 */
        Thread t = new Thread(new Runnable() {
            public void run() {
                File tmp = null;
                android.graphics.Bitmap src = null;
                android.graphics.Bitmap out = null;
                try {
                    android.content.ContentResolver cr = getContentResolver();

                    // 先只读尺寸，再按需采样解码——直接解码 8000x6000 的原图会吃掉 200 MB
                    android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
                    o.inJustDecodeBounds = true;
                    try (InputStream in0 = cr.openInputStream(uri)) {
                        if (in0 == null) {
                            notifyPhotoUploaded(false, "读不出这张图", "fail");
                            return;
                        }
                        android.graphics.BitmapFactory.decodeStream(in0, null, o);
                    }

                    int longest = Math.max(o.outWidth, o.outHeight);
                    int sample = 1;
                    while (longest / sample > 3200) sample *= 2;   // 两步：先粗采样，再精确缩放

                    android.graphics.BitmapFactory.Options o2 = new android.graphics.BitmapFactory.Options();
                    o2.inSampleSize = sample;
                    try (InputStream in1 = cr.openInputStream(uri)) {
                        if (in1 == null) {
                            notifyPhotoUploaded(false, "读不出这张图", "fail");
                            return;
                        }
                        src = android.graphics.BitmapFactory.decodeStream(in1, null, o2);
                    }
                    if (src == null) {
                        notifyPhotoUploaded(false, "读不出这张图（可能是格式不支持）", "fail");
                        return;
                    }

                    int w = src.getWidth(), h = src.getHeight();
                    int mx = Math.max(w, h);
                    out = src;
                    if (mx > 1600) {
                        float k = 1600f / mx;
                        out = android.graphics.Bitmap.createScaledBitmap(
                                src, Math.max(1, (int) (w * k)), Math.max(1, (int) (h * k)), true);
                    }

                    File dir = new File(getCacheDir(), "photo");
                    if (!dir.exists()) dir.mkdirs();
                    tmp = new File(dir, "upload.jpg");
                    try (FileOutputStream fo = new FileOutputStream(tmp)) {
                        if (!out.compress(android.graphics.Bitmap.CompressFormat.JPEG, 82, fo)) {
                            throw new java.io.IOException("compress returned false");
                        }
                        fo.flush();
                    }
                } catch (Throwable e) {
                    if (tmp != null) {
                        try { tmp.delete(); } catch (Throwable ignored) {}
                    }
                    recycleQuietly(out);
                    if (src != null && src != out) recycleQuietly(src);
                    notifyPhotoUploaded(false, "压缩失败：" + e.getClass().getSimpleName(), "fail");
                    return;
                }
                // 位图用完立刻还回去：一张 1600px 的 ARGB_8888 占 10 MB 上下
                if (out != null && out != src) recycleQuietly(out);
                recycleQuietly(src);

                if (tmp == null || !tmp.isFile() || tmp.length() < 1024) {
                    if (tmp != null) {
                        try { tmp.delete(); } catch (Throwable ignored) {}
                    }
                    notifyPhotoUploaded(false, "压缩后文件异常", "fail");
                    return;
                }

                final File f = tmp;
                /* 带上设备指纹，让服务端按「设备」而不是「IP」算上传额度。
                 * 学校里几百人共用一个出口 IP，按 IP 计数会让「全校 10 分钟只能传 3 张」。
                 * fp 是前端 auth.js 生成后存进 pref 的，这里直接读，不用再穿一层参数。 */
                String fpv = "";
                try { fpv = getSharedPreferences(PREFS, MODE_PRIVATE).getString("xxmu_fp", ""); } catch (Throwable ignored) {}
                String outS;
                try {
                    String path = "/v1/photo?cap=" + java.net.URLEncoder.encode(
                            cap == null ? "" : cap, "UTF-8")
                            + "&id=" + java.net.URLEncoder.encode(sid == null ? "" : sid, "UTF-8")
                            + "&fp=" + java.net.URLEncoder.encode(fpv == null ? "" : fpv, "UTF-8");
                    notifyPhotoProgress("upload");
                    /* uploadAny 而不是直接 Http.uploadRaw：某台手机的 DNS
                     * 可能还没刷到新域名，那就自动走 pages.dev（见 BASES 的说明）。 */
                    outS = uploadAny(path, f, "image/jpeg");
                } catch (Throwable e) {
                    outS = "ERR:" + e.getClass().getSimpleName() + ":" + e.getMessage();
                }
                try { f.delete(); } catch (Throwable ignored) {}

                String code = "";
                String body = outS == null ? "" : outS;
                int bar = body.indexOf('|');
                if (bar > 0 && body.startsWith("20")) { code = body.substring(0, bar); body = body.substring(bar + 1); }
                if (code.isEmpty()) {
                    /* 别把服务端 JSON 原文弹给学生。
                     * 原来这里是 `"上传失败：" + body`，429 时上屏的就是
                     * {"ok":false,"msg":"上传太频繁了，10 分钟内最多传 3 张..."}
                     * —— 学生看到的是带花括号和英文键名的一坨，而不是那句中文。 */
                    String shown = body;
                    try {
                        org.json.JSONObject j = new org.json.JSONObject(body);
                        String m = j.optString("msg", "");
                        if (!m.isEmpty()) shown = m;
                    } catch (Throwable ignored) {}
                    if (shown == null || shown.isEmpty()) shown = "网络不通或服务器没响应，检查一下网络再试。";
                    notifyPhotoUploaded(false, "上传失败：" + shown, "fail");
                    return;
                }
                String msg = "";
                boolean ok = false;
                try {
                    org.json.JSONObject j = new org.json.JSONObject(body);
                    ok = j.optBoolean("ok", false);
                    msg = j.optString("msg", "");
                } catch (Throwable e) {
                    ok = false;
                    msg = body.length() > 120 ? body.substring(0, 120) : body;
                }
                notifyPhotoUploaded(ok, msg, ok ? "pending" : "fail");
            }
        }, "xxmu-photo");
        t.setDaemon(true);
        t.start();
    }

    /** 回收位图，异常一律吞掉（recycle 在已回收的位图上会抛） */
    private static void recycleQuietly(android.graphics.Bitmap b) {
        if (b == null) return;
        try { b.recycle(); } catch (Throwable ignored) {}
    }

    /** 上传地址的候选宿主，与 web/auth.js 里的 HOSTS 保持一致、顺序也一致。
     *
     *  v1.1.17：改成「双入口 + 失败自动回退」。
     *
     *  2026-11-04 的真实事故：新域名 www.xxmuhelper.top 证书、服务器、公共 DNS
     *  全绿，我据此发布了一个只写新域名的包；但**学生校园网的 DNS
     *  （111.6.174.198）当时还查不到这个域名**（注册局刚解 hold，负缓存没刷完），
     *  更新了的学生一联网全部连不上。教训见 tools/check_domain.py 文件头。
     *
     *  现在两个地址都试：谁通走谁。pages.dev 是 Pages 自带子域，永远不会失效，
     *  所以它兜底能把「某台手机的 DNS 没刷到新域名」这种情况完全吃掉。
     */
    private static final String[] BASES = {
            "https://www.xxmuhelper.top",
            "https://xxmu-auth.pages.dev",
    };

    /** 探通后记住的宿主（空 = 还没探过，从第一个试起）。 */
    private volatile String liveBase = "";

    /** 当前该用的宿主。没探过时给首选，探过就用探通的。 */
    private String baseNow() {
        return liveBase.length() > 0 ? liveBase : BASES[0];
    }

    /**
     * 依次尝试各宿主上传，**只有网络层失败才换下一个**。
     *
     * 判据必须与 web/auth.js 的 isNetFail 同一套：Http.uploadRaw 返回
     * "ERR:..." 才是网络层失败（DNS 解析不了 / 连不上 / TLS 握手失败）；
     * 返回 "4xx|..." / "5xx|..." 说明这个主机是活的，绝不能换 ——
     * 否则服务端一次抖动会让每张图都白等一轮超时，还可能重复提交。
     */
    private String uploadAny(String path, java.io.File f, String contentType) {
        String[] order = liveBase.length() > 0
                ? new String[]{liveBase}
                : BASES;
        String last = "ERR:NoHost:没有可用入口";
        for (int i = 0; i < order.length; i++) {
            String out;
            try {
                out = Http.uploadRaw(order[i] + path, f, contentType);
            } catch (Throwable e) {
                out = "ERR:" + e.getClass().getSimpleName() + ":" + e.getMessage();
            }
            if (out == null || !out.startsWith("ERR:")) {
                // 通了（哪怕是 4xx/5xx）—— 记住这一台，后面不再探测
                if (liveBase.length() == 0) liveBase = order[i];
                return out == null ? "" : out;
            }
            last = out;
        }
        return last;
    }

    private void notifyPhotoProgress(final String stage) {
        final String js = "window.__onPhotoProgress && window.__onPhotoProgress("
                + org.json.JSONObject.quote(stage == null ? "" : stage) + ")";
        runOnUiThread(new Runnable() {
            public void run() {
                if (web != null) web.evaluateJavascript(js, null);
            }
        });
    }

    private void notifyPhotoUploaded(final boolean ok, final String msg, final String st) {
        final String js = "window.__onPhotoUploaded && window.__onPhotoUploaded(" + ok + ","
                + org.json.JSONObject.quote(msg == null ? "" : msg) + ","
                + org.json.JSONObject.quote(st == null ? "fail" : st) + ")";
        runOnUiThread(new Runnable() {
            public void run() {
                if (web != null) web.evaluateJavascript(js, null);
            }
        });
    }

    private void notifyApkPicked(final String name, final long size, final String path) {
        runOnUiThread(new Runnable() {
            public void run() {
                if (web == null) return;
                web.evaluateJavascript("window.__onApkPicked && window.__onApkPicked("
                        + org.json.JSONObject.quote(name == null ? "" : name) + ","
                        + size + ","
                        + org.json.JSONObject.quote(path == null ? "" : path) + ")", null);
            }
        });
    }

    /** 学习通登录结果回调（和教务的 __onLoginDone 分开，避免串台） */
    private void notifyCxDone(final boolean ok) {
        notifyCxDone(ok, "");
    }

    /** 带账号的学习通登录结果。acct 是登录页 input#phone 的值（可能是手机号）。 */
    private void notifyCxDone(final boolean ok, final String acct) {
        runOnUiThread(new Runnable() {
            public void run() {
                if (web != null) {
                    web.evaluateJavascript(
                            "window.__onCxDone && window.__onCxDone(" + ok + ","
                                    + org.json.JSONObject.quote(acct == null ? "" : acct) + ")", null);
                }
            }
        });
    }

    /**
     * 相册选图 → 解码二维码。
     *
     * v0.9.6 起先在 Java 侧用原始位图直接解（ZXing），解出来就不用把图传给前端；
     * 解不出来才退回老路（压缩成 dataURL 交给前端 jsQR 再试一次）。
     *
     * 为什么改：原来先压到长边 1000px / JPEG 88 再给 jsQR，二维码的黑白模块
     * 边界被压糊，用户拍得再清楚也识别不了。ZXing 用原图 + 多尺度/切块/反色，
     * 识别率是数量级的差别。
     *
     * v1.1.8 两处补：
     *   ① 整段搬到后台线程。原来 decodeStream 主线程解 4000×3000 要 48 MB 堆，
     *      加上 ZXing 再分配 int[w*h]（48 MB×N 份），旗舰机都可能 OOM，
     *      低端机必 ANR —— 而用户看到的是「点了相册就卡住」。
     *   ② 解码前先 inJustDecodeBounds 读尺寸算 inSampleSize。
     *      原来直接 decodeStream 全尺寸，等于把「先粗采样」这步整个跳过。
     *      这里只在「最大边超过 3000」时才降采样（不是无脑降 —— 二维码最怕
     *      被缩小后模块糊在一起，能全尺寸解就别动）。ZXing 那条路仍拿原图。
     */
    private void handleImageResult(int res, final android.content.Intent data) {
        if (res != RESULT_OK || data == null || data.getData() == null) {
            notifyImagePicked("");
            return;
        }
        final android.net.Uri uri = data.getData();
        Thread t = new Thread(new Runnable() {
            public void run() {
                decodeQrFromUri(uri);
            }
        }, "xxmu-qr");
        t.setDaemon(true);
        t.start();
    }

    /** 在后台线程执行：解码 + ZXing + 兜底压缩。所有回调都自己切回 UI 线程。 */
    private void decodeQrFromUri(android.net.Uri uri) {
        android.graphics.Bitmap src = null;
        try {
            /* 先量尺寸，再决定要不要降采样。 */
            android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            try (java.io.InputStream in0 = getContentResolver().openInputStream(uri)) {
                android.graphics.BitmapFactory.decodeStream(in0, null, o);
            }
            int longest = Math.max(o.outWidth, o.outHeight);
            int sample = 1;
            /* 3000 是「能保住二维码模块」和「别把堆吃穿」之间的折中：
             * 4000×3000 不采样要 48 MB，采样 2 倍后 12 MB，ZXing 依然解得出来。 */
            while (longest / sample > 3000) sample *= 2;
            android.graphics.BitmapFactory.Options o2 = new android.graphics.BitmapFactory.Options();
            o2.inSampleSize = sample;
            o2.inPreferredConfig = android.graphics.Bitmap.Config.ARGB_8888;
            try (java.io.InputStream in = getContentResolver().openInputStream(uri)) {
                src = android.graphics.BitmapFactory.decodeStream(in, null, o2);
            }
        } catch (Throwable e) {
            src = null;
        }
        if (src == null) { notifyImagePicked(""); return; }

        // 1) Java 侧直解
        String text = null;
        try {
            text = QrDecoder.decodeBitmap(src);
        } catch (Throwable ignored) {}

        if (text != null && text.length() > 0) {
            recycleQuietly(src);
            notifyQrText(text);
            return;
        }

        // 2) 兜底：老路子，压缩后交给前端 jsQR
        try {
            int w = src.getWidth(), h = src.getHeight();
            int max = Math.max(w, h);
            android.graphics.Bitmap bmp = src;
            if (max > 1000) {
                float k = 1000f / max;
                bmp = android.graphics.Bitmap.createScaledBitmap(
                        src, Math.max(1, (int) (w * k)), Math.max(1, (int) (h * k)), true);
            }
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 88, bo);
            String b64s = android.util.Base64.encodeToString(
                    bo.toByteArray(), android.util.Base64.NO_WRAP);
            if (bmp != src) recycleQuietly(bmp);
            recycleQuietly(src);
            notifyImagePicked("data:image/jpeg;base64," + b64s);
        } catch (Throwable e) {
            recycleQuietly(src);
            notifyImagePicked("");
        }
    }

    /* ==================================================================
     * 异步 HTTP 桥（v0.9.3）
     *
     * 同步版 httpFetch 是在 JS 线程里跑的：WebView 调用 @JavascriptInterface
     * 方法时，JS 线程会一直等这个 Java 方法返回。Http.request 超时 25 秒，
     * 于是一旦网络慢或域名被墙，整个页面就僵住 —— 手指能滑动（渲染线程没事），
     * 但点任何按钮都没反应（JS 线程还在等）。
     *
     * 这里改成：立刻返回一个 key，真正的请求丢到后台线程，拿到结果再
     * evaluateJavascript 回调 window.__onHttpDone(key, "<code>|<body>")。
     */
    /** 池里的一条结果：值 + 入池时刻（毫秒）。时刻用来淘汰陈旧项。 */
    private static final class PoolItem {
        final String value;
        final long at;
        PoolItem(String v, long t) { value = v; at = t; }
    }

    private final java.util.concurrent.ConcurrentHashMap<String, PoolItem> HTTP_POOL =
            new java.util.concurrent.ConcurrentHashMap<String, PoolItem>();

    /** 结果在池里最多留 60 秒：超过这个时间的没人来取，说明前端那边早超时了 */
    private static final long POOL_TTL = 60000;
    /** 池子超过这个条数就开始淘汰 */
    private static final int POOL_MAX = 64;

    /* 淘汰策略：先扔过期项，还超就扔最早入池的。
     *
     * 原来是「按插入顺序删最早的若干个」，不看年龄也不区分这条结果是不是
     * 还有人等着。`HTTP_POOL` 里存的都是**已经完成、等前端来取**的结果，
     * 一次课表同步 + 作业列表 + 配置并发就能把池子撑到接近上限，被扔掉的
     * key 在前端 `pendingNet` 里还挂着，唯一出路是等 HTTP_WAIT = 20 秒超时
     * —— 学生看到的是「同步中…」卡 20 秒然后报超时，而后台其实早就成功了。
     *
     * 现在先按年龄清（真过期的丢了没人受损），只有全部新鲜时才动最早的那条，
     * 并且一次只扔到 POOL_MAX（不是一口气砍到 48）。 */
    private void poolPut(String key, String value) {
        if (HTTP_POOL.size() >= POOL_MAX) {
            long now = System.currentTimeMillis();
            for (java.util.Iterator<java.util.Map.Entry<String, PoolItem>> it =
                 HTTP_POOL.entrySet().iterator(); it.hasNext(); ) {
                if (now - it.next().getValue().at > POOL_TTL) it.remove();
            }
            while (HTTP_POOL.size() >= POOL_MAX) {
                String oldestKey = null;
                long oldestAt = Long.MAX_VALUE;
                for (java.util.Map.Entry<String, PoolItem> en : HTTP_POOL.entrySet()) {
                    if (en.getValue().at < oldestAt) {
                        oldestAt = en.getValue().at;
                        oldestKey = en.getKey();
                    }
                }
                if (oldestKey == null) break;
                HTTP_POOL.remove(oldestKey);
            }
        }
        HTTP_POOL.put(key, new PoolItem(value, System.currentTimeMillis()));
    }

    private String poolGet(String key) {
        if (key == null) return "";
        PoolItem it = HTTP_POOL.remove(key);
        if (it == null) return "";
        return it.value == null ? "" : it.value;
    }

    /**
     * 后台发起一次 HTTP 请求，完成后回调 window.__onHttpDone(key, result)。
     * 参数含义与 httpFetch 完全一致。
     */
    @JavascriptInterface
    public void httpFetchAsync(final String key, final String url, final String method,
                               final String body, final String contentType,
                               final String headers, final String asMultipart) {
        if (key == null || key.length() == 0) return;
        Thread t = new Thread(new Runnable() {
            public void run() {
                String out;
                try {
                    if ("1".equals(asMultipart)) {
                        out = Http.postMultipart(url, body, "", null, headers);
                    } else {
                        out = Http.request(url,
                                method == null || method.length() == 0 ? "GET" : method,
                                body, "", contentType, null, headers);
                    }
                } catch (Throwable e) {
                    out = "ERR:" + e.getClass().getSimpleName() + ":" + e.getMessage();
                }
                poolPut(key, out);
                final String lit = org.json.JSONObject.quote(out);
                final String js = "window.__onHttpDone && window.__onHttpDone("
                        + org.json.JSONObject.quote(key) + "," + lit + ")";
                runOnUiThread(new Runnable() {
                    public void run() {
                        if (web != null) web.evaluateJavascript(js, null);
                    }
                });
            }
        }, "xxmu-http");
        t.setDaemon(true);
        t.start();
    }

    /** 取走某个 key 的结果；还没完成时返回空串（前端轮询兜底用） */
    @JavascriptInterface
    public String httpFetchPoll(String key) {
        return poolGet(key);
    }

    /**
     * 带指定站点 Cookie 的后台请求（学习通专用）。
     *
     * 与 httpFetchAsync 的区别只有两点：
     *   1. 从 CookieManager 取 cookieUrl 那个域的 Cookie 塞进请求头
     *   2. 可以指定 Referer（学习通的作业/考试清单接口拿不到 Referer 会返回 3004）
     * 其余（线程、回调键、超时、gzip）完全复用同一套机制。
     */
    @JavascriptInterface
    public void httpFetchCkAsync(final String key, final String url, final String method,
                                 final String body, final String contentType,
                                 final String headers, final String cookieUrl,
                                 final String referer) {
        if (key == null || key.length() == 0) return;
        Thread t = new Thread(new Runnable() {
            public void run() {
                String out;
                try {
                    String ck = "";
                    if (cookieUrl != null && cookieUrl.length() > 0) {
                        String c = CookieManager.getInstance().getCookie(cookieUrl);
                        if (c != null) ck = c;
                    }
                    out = Http.request(url,
                            method == null || method.length() == 0 ? "GET" : method,
                            body, ck, contentType, referer, headers);
                } catch (Throwable e) {
                    out = "ERR:" + e.getClass().getSimpleName() + ":" + e.getMessage();
                }
                poolPut(key, out);
                final String lit = org.json.JSONObject.quote(out);
                final String js = "window.__onHttpDone && window.__onHttpDone("
                        + org.json.JSONObject.quote(key) + "," + lit + ")";
                runOnUiThread(new Runnable() {
                    public void run() {
                        if (web != null) web.evaluateJavascript(js, null);
                    }
                });
            }
        }, "xxmu-httpck");
        t.setDaemon(true);
        t.start();
    }

    /** 课表抓取的后台版（带教务 Cookie + Referer），完成回调 __onHttpDone */
    @JavascriptInterface
    public void fetchScheduleHtmlAsync(final String key, final String b64Params) {
        if (key == null || key.length() == 0) return;
        Thread t = new Thread(new Runnable() {
            public void run() {
                String out;
                try {
                    String ck = CookieManager.getInstance().getCookie("https://qgjw.xxmu.edu.cn");
                    out = Http.request(KB_URL + Uri.encode(b64Params), null,
                            ck == null ? "" : ck, null, KB_REFERER);
                } catch (Throwable e) {
                    out = "ERR:" + e.getClass().getSimpleName() + ":" + e.getMessage();
                }
                poolPut(key, out);
                final String lit = org.json.JSONObject.quote(out);
                final String js = "window.__onHttpDone && window.__onHttpDone("
                        + org.json.JSONObject.quote(key) + "," + lit + ")";
                runOnUiThread(new Runnable() {
                    public void run() {
                        if (web != null) web.evaluateJavascript(js, null);
                    }
                });
            }
        }, "xxmu-kb");
        t.setDaemon(true);
        t.start();
    }

    /**
     * 把识别到的二维码文本交给前端。
     *
     * 相机扫码和相册解码都走这一个回调——前端不用关心文本从哪条路来，
     * 拿到就是「已经识别成功的原始内容」，再做 machineId 提取。
     */
    private void notifyQrText(final String text) {
        final String lit = org.json.JSONObject.quote(text == null ? "" : text);
        final String js = "window.__onQrText && window.__onQrText(" + lit + ")";
        runOnUiThread(new Runnable() {
            public void run() {
                if (web != null) web.evaluateJavascript(js, null);
            }
        });
    }

    private void notifyImagePicked(final String dataUrl) {
        final String lit = org.json.JSONObject.quote(dataUrl == null ? "" : dataUrl);
        final String js = "window.__onImagePicked && window.__onImagePicked(" + lit + ")";
        runOnUiThread(new Runnable() {
            public void run() {
                if (web != null) web.evaluateJavascript(js, null);
            }
        });
    }

    /**
     * 把抓取到的页面态交给前端。
     *
     * payload 本身已经是 JSON 文本（不是带引号的 JS 字符串），这里包一层
     * JSONObject.quote 让它成为合法的 JS 字符串字面量，前端 JSON.parse 即可。
     */
    private void notifyWaterCapture(final String payload) {
        final String lit = org.json.JSONObject.quote(payload == null ? "null" : payload);
        final String js = "window.__onWaterCapture && window.__onWaterCapture(" + lit + ")";
        runOnUiThread(new Runnable() {
            public void run() {
                if (web != null) web.evaluateJavascript(js, null);
            }
        });
    }

    /** 通知前端登录结果 */
    private void notifyLoginResult(final boolean ok) {
        notifyLoginAccount(ok, "");
    }

    /**
     * 通知前端登录结果，并带上用户在登录页填的账号。
     *
     * 前端 __onLoginDone(ok, acct) 用 acct 判断「他登录的学号」与软件里
     * 记录的学号是否一致；空串表示没读到（用户用了别的登录方式、
     * 或者学校改版换了输入框），这时前端只做提示不做拦截。
     */
    private void notifyLoginAccount(final boolean ok, final String acct) {
        final String js = "window.__onLoginDone && window.__onLoginDone(" + ok + ","
                + org.json.JSONObject.quote(acct == null ? "" : acct) + ")";
        runOnUiThread(new Runnable() {
            public void run() {
                if (web != null) web.evaluateJavascript(js, null);
            }
        });
    }

    /** 供外层类使用的 toast（Host.toast 是 JS 接口，外层调不到） */
    private void showToast(final String msg) {
        runOnUiThread(new Runnable() {
            public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
            }
        });
    }

    /**
     * 页面用的 WebChromeClient。
     *
     * 只为了一个东西：让 prompt() 能用。
     *
     * 血案（v1.1.6 才发现）：Android 的 WebChromeClient 默认实现里
     * onJsPrompt 直接返回 false，既不弹框也不回调 —— 于是页面里所有
     * prompt() 都**静默返回 null**。表现是「点了按钮，什么都没发生」，
     * 没有报错、没有日志、界面不动，用户只会以为 App 卡了。
     * WIKI 的「+ 补一条」和 GUIDE 的「+ 补一条」从上线起就是死的，
     * 一直没人报，因为大家点了没反应就直接放弃了。
     *
     * 这里接管后自己弹一个 AlertDialog 把结果回填。
     * 注意必须在 UI 线程回调（对话框本来就在 UI 线程，没问题）。
     *
     * alert / confirm 不重写：默认实现会弹系统对话框，是能用的。
     * 只有 prompt 是默认不实现的那一个。
     */
    private class Chrome extends WebChromeClient {
        @Override
        public boolean onJsPrompt(WebView view, String url, String message,
                                  String defaultValue, final android.webkit.JsPromptResult result) {
            try {
                /* v1.1.15：Activity 已销毁时不要 show()。
                 * onJsPrompt 是在页面异步回调里触发的（WIKI/GUIDE 的「+ 补一条」
                 * 点开一个聊天气泡后才调），这期间用户完全可能按返回键退出。
                 * 此时 `new AlertDialog.Builder(MainActivity.this).show()` 抛
                 * WindowManager$BadTokenException，被下面的 catch 兜成 result.cancel()
                 * ——现象正是「点『+ 补一条』，什么都没发生」，
                 * 也就是这段代码注释里（v1.1.6）想修的那个症状换了个原因又回来了。
                 * 先在入口把它判掉，并且明确 cancel，绝不留 pending promise。 */
                if (isFinishing() || isDestroyed()) {
                    result.cancel();
                    return true;
                }
                final android.widget.EditText input = new android.widget.EditText(MainActivity.this);
                input.setText(defaultValue == null ? "" : defaultValue);
                if (defaultValue != null && defaultValue.length() > 0) {
                    input.setSelection(input.getText().length());
                }
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle(message == null ? "" : message)
                        .setView(input)
                        .setPositiveButton("确定", new DialogInterface.OnClickListener() {
                            public void onClick(DialogInterface d, int w) {
                                result.confirm(input.getText().toString());
                            }
                        })
                        .setNegativeButton("取消", new DialogInterface.OnClickListener() {
                            public void onClick(DialogInterface d, int w) {
                                result.cancel();
                            }
                        })
                        .setOnCancelListener(new DialogInterface.OnCancelListener() {
                            public void onCancel(DialogInterface d) {
                                result.cancel();
                            }
                        })
                        .show();
            } catch (Throwable e) {
                /* 弹不出来就明确返回取消，不要留一个永远不 resolve 的 prompt
                 * ——那会让调用方的 Promise 永久 pending，界面卡在「处理中…」。 */
                result.cancel();
            }
            return true;
        }
    }

    // ---------------------------------------------------------------- 生命周期

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);

        // 先把崩溃处理器挂上，保证任何启动期异常都能落盘（否则用户只能看到闪退）
        CrashGuard.install(this);

        // Cookie 必须允许持久化，否则 App 重启就掉登录态
        CookieManager.getInstance().setAcceptCookie(true);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        /* v1.1.39：关掉 WebView 的自动反色。
         * 系统开夜间模式时，Android 10+ 的 WebView 会自己把页面反一遍色；
         * 我们自己写了 html[data-theme="dark"]，两套叠在一起的结果是
         * 「深底上的浅卡片被反成黑卡片」，比不做主题还难看。
         * 颜色只允许由 app.css 的变量决定。
         * 两个 API 互斥，且 targetSdk 33 上 setForceDark 已是 no-op ——
         * 所以按版本只调其中一个：29~32 用 setForceDark(OFF)，33+ 用
         * setAlgorithmicDarkeningAllowed(false)。低版本执行到会 NoSuchMethodError，
         * 整个包 try/catch 兜住。 */
        try {
            if (android.os.Build.VERSION.SDK_INT >= 33) {
                s.setAlgorithmicDarkeningAllowed(false);
            } else if (android.os.Build.VERSION.SDK_INT >= 29) {
                s.setForceDark(WebSettings.FORCE_DARK_OFF);
            }
        } catch (Throwable ignored) {
        }

        // 第三方 cookie 必须在 WebView 创建之后设置，且第一个参数不能为 null
        // （早期版本误传 null，直接在 onCreate 抛 NullPointerException 导致闪退）
        if (android.os.Build.VERSION.SDK_INT >= 21) {
            try {
                CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
            } catch (Throwable ignored) {
                // 某些定制 ROM 可能不支持，忽略即可，不影响主功能
            }
        }

        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new Chrome());
        web.addJavascriptInterface(new Host(), "Host");

        /* v1.1.39：首屏底色要在 loadUrl **之前**按已存的主题设好。
         * 否则深色用户冷启动会先看到一帧浅色再变深（「闪一下白」）。
         * 这里读的是和 theme.js 同一个 pref；theme.js 在 <head> 里再设一次
         * data-theme，两边判据一致，不需要等 JS 跑起来。 */
        applyAppTheme(themeDarkNow());

        /* v1.1.49：先把 /v1/config 的握手抢跑掉，再让网页去加载。
         *
         * 用户连着两次说「更新弹窗还是慢」。查下来时间不在服务端：
         * /v1/config 只有 2 KB，Worker 里早有 60 秒边缘缓存（x-edge: hit
         * 实测为真），命中缓存后 TTFB 只有 40~90ms。慢的是 TLS 握手：
         * 同一域名实测 200~2150ms，冷启动首帧之后才发请求，等于把这
         * 一两秒整个暴露在用户眼前。
         *
         * 为什么在 Java 里预热有用：App 里所有 /v1/ 请求都不是 WebView
         * 自己发的，而是经 Host.httpFetchAsync 转给 Http.request 走
         * HttpURLConnection（见 sync.js 的 net() 与 auth.js 的 fetchAny）。
         * 也就是说预热与真正的请求共用同一个连接池，握手只做一次。
         *
         * 说明白一点：这是抢跑，不是保证。若握手没在 JS 发请求前完成，
         * 它只是白做一次请求（2 KB），不会拖慢、也不会影响结果 —— 
         * 结果直接丢弃，一切仍以网页那次请求的响应为准。 */
        warmUpConfig();

        web.loadUrl("file:///android_asset/index.html");
        setContentView(web);
    }

    /**
     * 冷启动时先把 /v1/config 的连接握手做掉，让更新检查少等一个 RTT 往返。
     * 见 onCreate 里的说明；失败一律忽略。
     */
    private void warmUpConfig() {
        try {
            final String url = baseNow() + "/v1/config";
            Thread t = new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Http.request(url, "GET", "", "", "", null, "");
                    } catch (Throwable ignored) {
                    }
                }
            }, "xxmu-warm");
            t.setDaemon(true);
            t.start();
        } catch (Throwable ignored) {
        }
    }

    /** 系统夜间模式的真值（Java 侧唯一判据，JS 的 prefers-color-scheme 可能不跟系统走）。 */
    public boolean isSystemDark() {
        try {
            int m = getResources().getConfiguration().uiMode
                    & android.content.res.Configuration.UI_MODE_NIGHT_MASK;
            return m == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        } catch (Throwable ignored) {
            return false;
        }
    }

    /** 读本机存的三档主题，算出「现在是深色吗」。auto 存空串 / 乱码都当跟随系统。 */
    private boolean themeDarkNow() {
        String m = "";
        try { m = getSharedPreferences(PREFS, MODE_PRIVATE).getString("xxmu_theme", ""); }
        catch (Throwable ignored) { }
        if ("dark".equals(m)) return true;
        if ("light".equals(m)) return false;
        return isSystemDark();
    }

    /** 一次性把「状态栏 / 导航栏 / WebView 底色」对齐到当前主题。
     *  由 onCreate（首屏）和 Host.setAppTheme（JS 切换/系统变化）两条路调用。 */
    private void applyAppTheme(boolean dark) {
        try {
            if (web != null) web.setBackgroundColor(dark ? 0xFF0E1320 : 0xFFF4F6FB);
        } catch (Throwable ignored) { }
        try {
            android.view.Window w = getWindow();
            int bar = dark ? 0xFF171E2D : 0xFFFFFFFF;
            w.setStatusBarColor(bar);
            w.setNavigationBarColor(bar);
            if (android.os.Build.VERSION.SDK_INT >= 23) {
                android.view.View v = w.getDecorView();
                int f = v.getSystemUiVisibility();
                /* 浅底要深色图标（LIGHT_* 置位），深底要浅色图标（LIGHT_* 清掉）。 */
                if (dark) {
                    f &= ~android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    if (android.os.Build.VERSION.SDK_INT >= 26) {
                        f &= ~android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    }
                } else {
                    f |= android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    if (android.os.Build.VERSION.SDK_INT >= 26) {
                        f |= android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    }
                }
                v.setSystemUiVisibility(f);
            }
        } catch (Throwable ignored) { }
    }

    /* v1.1.39：系统夜间模式变了，Activity 不重建（manifest 的 configChanges 含 uiMode），
     * 由这里通知页面重算一次颜色，避免切系统主题后 App 还是旧配色、也不丢当前页面状态。
     * 用 evaluateJavascript 而不是 loadUrl("javascript:")——后者会把返回值当导航。 */
    @Override
    public void onConfigurationChanged(android.content.res.Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        try {
            applyAppTheme(themeDarkNow());
            if (web != null) {
                web.evaluateJavascript(
                        "(function(){try{window.__onThemeSys&&window.__onThemeSys()}catch(e){}})()", null);
            }
        } catch (Throwable ignored) { }
    }

    @Override
    protected void onResume() {
        super.onResume();
        /* 从别的 App（完美校园、支付宝）切回来时告诉页面一声。
         * WebView 里 visibilitychange 不一定触发（真机切后台 WebView 常保持「可见」状态），
         * 所以由 Java 侧补一条回调，页面自己决定要不要刷新（宿舍空调度数就是靠这个）。
         * 用 evaluateJavascript 而不是 loadUrl("javascript:")——后者会把返回值当导航。 */
        if (web != null) {
            try {
                web.evaluateJavascript(
                        "(function(){try{window.__onResume&&window.__onResume()}catch(e){}})()", null);
            } catch (Throwable ignored) {
            }
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_BACK) {
            // 先交给页面自己判断：浮层开着就关浮层、不在课表页就回课表页。
            // 页面说「我处理了」就不退出；否则才允许系统走默认的退出流程。
            // 这样「点开空教室 → 返回」不会再一路退到桌面。
            if (web != null) {
                web.evaluateJavascript(
                        "(function(){try{return window.__onBack?window.__onBack():false}catch(e){return false}})()",
                        new android.webkit.ValueCallback<String>() {
                            public void onReceiveValue(String v) {
                                if (!"true".equals(v)) {
                                    // 页面不管，按原来规则：能回退就回退，否则退出
                                    if (web != null && web.canGoBack()) {
                                        web.goBack();
                                    } else {
                                        finish();
                                    }
                                }
                            }
                        });
                return true;
            }
        }
        return super.onKeyDown(code, e);
    }

    @Override
    protected void onDestroy() {
        /* 什么都不清是有代价的：
         *   · WebView 持有的原生 buffer 与 JS 引擎不释放，退出后还占几十 MB；
         *   · Host 桥仍然挂在 WebView 上，残留的 JS 能调到已经销毁的 Activity
         *     （getCacheDir、getSharedPreferences 在 destroy 之后行为未定义）；
         *   · HTTP_POOL 里还在飞的回调会向一个死掉的 web 调 evaluateJavascript。
         * 先摘桥、把页面导航到空白（停掉所有 JS 定时器与请求），再 destroy。 */
        try {
            if (web != null) {
                try { web.removeJavascriptInterface("Host"); } catch (Throwable ignored) {}
                try { web.stopLoading(); } catch (Throwable ignored) {}
                try { web.loadUrl("about:blank"); } catch (Throwable ignored) {}
                try { web.destroy(); } catch (Throwable ignored) {}
            }
        } catch (Throwable ignored) {}
        web = null;
        try { HTTP_POOL.clear(); } catch (Throwable ignored) {}
        super.onDestroy();
    }
}
