#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""出包后四件套校验（v1.1.2 起）。

    python tools/verify_apk.py [apk 路径]

不给路径时自动挑 apk/ 下版本号最大的那个包，期望的 versionCode/versionName
从 android/AndroidManifest.xml 里读 —— 免得每次发版都回来手改这个脚本。

四件：
  1. assets/ 15 个文件与 web/ 逐字节一致（打包最容易静默出错的一环：
     sync_assets 扫目录复制，漏一个就是白屏或功能凭空消失）
  2. classes.dex 里能搜到本版新增的符号（证明改的是代码不是注释）
  3. aapt2 badging：包名 / versionCode / versionName / label 全对
  4. apksigner 证书 SHA-256 与上一版一致（不一致 = 老用户装不上，只能卸载重装）

任一项不过就 exit 1，可以直接挂到发布流程里。
"""
import hashlib
import os
import re
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BT = r"D:\android-sdk\build-tools\33.0.2"
AAPT2 = os.path.join(BT, "aapt2.exe")
SIGNER = os.path.join(BT, "lib", "apksigner.jar")

# 上一版（v1.1.1）的签名证书指纹，包名同、证书必须同
EXPECT_CERT_SHA256 = "0e6848450afca6dfba98588c1c684367ee38a9e5752706a80f88ee8a11157799"

# 本版必须能在 dex 里找到的字符串（改的是 Java，改注释不会让符号出现）
# 这几条是 v1.1.2 的抓账号修复，必须一直在，属于回归护栏。
NEW_DEX_SYMBOLS = [
    "PLACEHOLDER_WORDS",
    "isPlaceholderLike",
    "placeholderJsArray",
    # v1.1.4 的分段下载：缺了任何一个都说明 Http.java 没编进去，
    # 前端却已经按「有进度」在显示，用户会看到按钮永远停在「下载中…」。
    "probeLength",
    "fetchRange",
    "downloadSingle",
    "onApkProgress",
    # v1.1.6 校园图片上传：Http.uploadRaw 不塞 X-Admin-Key（学生也是上传者），
    # 缺了它前端点「选照片」会走一条根本不存在的桥。
    "uploadRaw",
    "pickPhotoForUpload",
    "handlePhotoResult",
    "notifyPhotoUploaded",
    # v1.1.6 顺带修的老 bug：WebChromeClient 默认不实现 onJsPrompt，
    # 页面里所有 prompt() 静默返回 null。这个类不存在就等于没修。
    "onJsPrompt",
    # v1.1.7 上传时把设备指纹一起带上：限流键从 IP 改成 fp。
    # 少了它，全校几百人共用一个出口 IP，第 4 张图 / 第 6 条留言就开始 429。
    "xxmu_fp",
    # v1.1.8 审计修复（docs/audit-backend.md + docs/audit-frontend.md）：
    # 服务端那几个符号不在 dex 里（它们是 worker.js 的），放到下面的
    # WORKER_SYMBOLS 检查。dex 这边只盯真正编进包的 Java 侧改动。
    "sha256",
    # v1.1.8 桥的白名单：httpGet 带教务 Cookie，uploadApk 能读文件，
    # 两个都必须先验目标。
    "allowedCookieHost",
    "insideAppDirs",
    # v1.1.8 二维码解码搬到后台线程 + 采样（4 万像素原图在 UI 线程解会 ANR）。
    "decodeQrFromUri",
    "recycleQuietly",
    # v1.1.9：选包回调也搬后台线程 + try-with-resources + 失败删半截文件
    "xxmu-pickapk",
]

# 本版必须能在前端资产里找到的字符串（改的是 JS）
NEW_JS_SYMBOLS = {
    "assets/license.js": ["looksLikeAccount", "PLACEHOLDER_WORDS", "clearCheck",
                          # v1.1.8 学号格式收紧（isActivated / whoami 都只认 6-20 位数字）
                          "\\d{6,20}"],
    "assets/app.js": ["kbMismatchAck", "kbMismatchToastShown", "APKDL",
                      "__onApkProgress", "重试下载",
                      # v1.1.5 作业状态：这一批全是「静默失败」型 bug ——
                      # 解析不到就 status=''，然后被当成「已完成」，不报错不报警。
                      "isDoneStatus", "status_known",
                      # v1.1.6 管理端审核面板
                      "loadRevPhotos", "loadRevFb", "revPhotoList",
                      # v1.1.7 错误信息不再拼 innerHTML
                      "function errText", "function hintInto",
                      # v1.1.8 审计：重入锁 / 叠放不丢课 / 倒计时不重建 / 审核图走 objectURL
                      "SYNCING", "crowded", "it.__x = x", "revPhotoSrc",
                      "尺寸未知", "重新上架", "function firstTime",
                      # v1.1.13 课表空态：状态说明必须能看见、必须有诊断出口
                      "function paintKbBar", "function kbWeekStats",
                      "function kbDiagText", "kbBarBound",
                      # v1.1.14 详情卡：改完 display 必须跟着滚动，否则卡片落在视口外
                      "function showDetail(id, fromRow)", "DETAIL_FROM",
                      "card.scrollIntoView"],
    "assets/about.js": ["btnClearCheck", "btnShowHwRaw", "Tut.afterUnlock",
                        "已过期，重新登录一次",
                        # v1.1.13 课表抓取原文
                        "btnShowKbRaw", "version: () => APP_VERSION"],
    "assets/chaoxing.js": ["pickStatus", "wordIn", "status_known",
                           "diagReset", "未批阅",
                           # v1.1.9：缓存坏了要说出来，不能当成「没同步过」
                           "LAST_READ_ERR", "readErr"],
    "assets/index.html": ["btnShowHwRaw", "fbHw",
                          # v1.1.6
                          'id="tut"', 'id="rowTut"', 'id="revPhotoList"',
                          'id="revFbList"', 'src="tut.js"',
                          # v1.1.8 概览区的提示位
                          'id="admStatMsg"',
                          # v1.1.11 使用声明：首次弹窗 + 关于页完整版 + 我的页入口
                          'id="disc"', 'id="discOk"', 'id="discX"',
                          'id="rowDisc"', 'id="discCard"',
                          'src="disc.js"',
                          # v1.1.13 课表状态条（必须排在 #grid 之前）
                          'id="kbBar"', 'id="kbBarT"', 'id="kbBarS"',
                          'id="kbBarSync"', 'id="kbBarDiag"',
                          'id="btnShowKbRaw"',
                          # v1.1.14 详情卡必须排在名单卡之前（排下面会落在视口外）
                          'id="admDetailCard"', 'id="admDetailBody"'],
    # v1.1.11：声明必须能独立工作（不联网、读不到 pref 当没看过）
    "assets/disc.js": ["xxmu_disc_done", "function afterUnlock", "function replay",
                       "replayMode", "function gateLocked"],
    "assets/tut.js": ["xxmu_tut_done", "afterUnlock", "replay", "replayMode"],
    "assets/wiki.js": ["photosSection", "fbSection", "startUpload",
                       "composeFeedback", "__onPhotoUploaded",
                       # v1.1.8 失败态不再退化成「暂无内容」
                       "PHOTO_ERR", "FB_ERR"],
    "assets/auth.js": ["const Photos =", "const Feedback =", "/v1/photos",
                       "/v1/feedback",
                       # v1.1.7 留言带上 fp，限流不再按 IP（全校共享额度）
                       "fp: f",
                       # v1.1.8 服务器拒绝分档：别把「限流」当成「你被封了」
                       "const HARD =", "const KEEP =", "photoRaw"],
    "assets/sync.js": ["showable", "bad_weeks",
                       # v1.1.13 解析器两个洞 + 诊断留样
                       "k(\\d)(\\d{1,2})",
                       "(?=[^>]*padding-bottom:\\s*5px)(?=[^>]*clear:\\s*both)",
                       "function diagReset", "function keepSample", "LAST.err"],
    "assets/onboard.js": ["__onLoginSuccess = function (chk)", "oldKb(chk)"],
}

ok = True


def manifest_version():
    """从 AndroidManifest.xml 读出版本号，作为 badging 对比的期望值。"""
    p = os.path.join(ROOT, "android", "AndroidManifest.xml")
    txt = open(p, encoding="utf-8").read()
    code = re.search(r'android:versionCode="(\d+)"', txt)
    name = re.search(r'android:versionName="([^"]+)"', txt)
    return (code.group(1) if code else "112",
            name.group(1) if name else "1.1.2")


def newest_apk():
    """apk/ 下版本号最大的包（按 (x,y,z) 排序，不靠字符串）。"""
    d = os.path.join(ROOT, "apk")
    best = None
    for f in os.listdir(d):
        m = re.match(r"xxmu-helper-v(\d+)\.(\d+)\.(\d+)\.apk$", f)
        if not m:
            continue
        key = tuple(int(x) for x in m.groups())
        if best is None or key > best[0]:
            best = (key, os.path.join(d, f))
    return best[1] if best else os.path.join(d, "xxmu-helper-v1.1.2.apk")


def fail(msg):
    global ok
    ok = False
    print("  [FAIL] " + msg)


def check_assets(apk):
    print("[1] assets 逐字节比对")
    web = os.path.join(ROOT, "web")
    exts = (".html", ".css", ".js")
    names = sorted(f for f in os.listdir(web)
                   if f.lower().endswith(exts) and os.path.isfile(os.path.join(web, f)))
    with zipfile.ZipFile(apk) as z:
        entries = {n: z.getinfo(n) for n in z.namelist()}
        for n in names:
            key = "assets/" + n
            if key not in entries:
                fail("APK 里缺 " + key)
                continue
            packed = z.read(key)
            local = open(os.path.join(web, n), "rb").read()
            if packed != local:
                fail("%s 不一致 (apk %d / web %d)" % (n, len(packed), len(local)))
            else:
                print("    OK %-14s %d bytes" % (n, len(local)))
    print("    共 %d 个前端文件" % len(names))


def check_dex(apk):
    print("[2] 符号落盘（dex + 前端资产）")
    with zipfile.ZipFile(apk) as z:
        dex = z.read("classes.dex")
        for s in NEW_DEX_SYMBOLS:
            if s.encode("utf-8") in dex:
                print("    OK dex/%-22s" % s)
            else:
                fail("dex 里找不到 " + s)
        for name, syms in NEW_JS_SYMBOLS.items():
            blob = z.read(name)
            for s in syms:
                if s.encode("utf-8") in blob:
                    print("    OK %-14s %-20s" % (name.split("/")[-1], s))
                else:
                    fail("%s 里找不到 %s" % (name, s))


WORKER_SYMBOLS = [
    # 服务端自毁类：一次 KV 读失败就用空数组覆盖真实名单（不可逆）
    "function idxApply(",
    "拒绝自动重建",
    # 管理列表一次请求 200 次 KV 读，超免费版 50 子请求上限
    "const PAGE = 40;",
    # 管理员口令必须定长比较（safeEq 会把内容转大写，不能比口令）
    "function constEq(",
    # 图片索引读改写竞态留下的孤儿字节，要能清理
    "act === 'orphan'",
    # 边缘缓存要显式调 caches.default，只写 cache-control 头等于没做
    "function edgeCache(",
    # 反代会把学生 IP 换成 Cloudflare 自己的，限流必须能认回真实 IP
    "xxmu-pages-proxy-v1",
    # v1.1.9：名单条数上限（假学号无限新增会把全站 KV 写额度刷爆）
    "const IDX_CAP = 5000;",
    # v1.1.9：cfg 解析失败不许把默认值缓存成事实
    "cfg 解析失败，本次不缓存",
    # v1.1.9：激活时的管理员口令也要定长比较
    "!constEq(ak, want)",
    # v1.1.10 抗打三条：随机 query 不许绕过边缘缓存
    "ignoreQuery",
    # v1.1.10：404 也要能进负缓存（/v1/photo?k=随机 每次都读 ph:idx）
    "negTtl",
    # v1.1.10：没匹配到任何路由的请求必须有兜底限流
    "all:ip:",
    # v1.1.10：回源本身也要限额（换着 key 刷负缓存救不了）
    "costLimit",
]

# pages 代理层的锚点（不在 APK 也不在 worker.js 里，单独钉）
PAGES_SYMBOLS = [
    # 读 body 失败要回 413 JSON，而不是让平台默认 500 HTML 冒上去
    "init.body = await request.arrayBuffer();",
    "status: 413",
]


def check_worker():
    """服务端代码不在 APK 里，但它们是同一个发布批次的一部分。

    前两次发版都出现过「App 更新了、worker 忘了部署」—— 前端在等一个
    新接口，线上跑的还是老代码，报错全是 404，看代码怎么看都是对的。
    这里把 worker.js 的锚点也钉住，出包时顺手确认它已经改到位。
    """
    print("[5] worker.js / pages 代理锚点")
    wp = os.path.join(ROOT, "server", "worker.js")
    txt = open(wp, encoding="utf-8").read()
    for s in WORKER_SYMBOLS:
        if s in txt:
            print("    OK worker/%-24s" % s)
        else:
            fail("worker.js 里找不到 " + s)
    pp = os.path.join(ROOT, "server", "pages", "dist", "_worker.js")
    ptxt = open(pp, encoding="utf-8").read()
    if "headers.set('x-xxmu-ip', ip)" in ptxt:
        print("    OK pages/转发真实 IP")
    else:
        fail("pages 代理没把真实 IP 转给上游（限流退化成全校共享一个桶）")
    for s in PAGES_SYMBOLS:
        if s in ptxt:
            print("    OK pages/%-24s" % s)
        else:
            fail("pages 代理里找不到 " + s)


def check_badging(apk):
    print("[3] aapt2 badging")
    r = subprocess.run([AAPT2, "dump", "badging", apk],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    txt = r.stdout
    want = {
        "package": r"package: name='([^']+)'",
        "versionCode": r"versionCode='([^']+)'",
        "versionName": r"versionName='([^']+)'",
        "label": r"application-label:'([^']*)'",
    }
    got = {}
    for k, pat in want.items():
        m = re.search(pat, txt)
        got[k] = m.group(1) if m else "(未找到)"
        print("    %-12s %s" % (k, got[k]))
    exp_code, exp_name = manifest_version()
    if got["package"] != "com.xxmu.helper":
        fail("包名不对")
    if got["versionCode"] != exp_code:
        fail("versionCode 应为 %s（manifest 里写的）" % exp_code)
    if got["versionName"] != exp_name:
        fail("versionName 应为 %s（manifest 里写的）" % exp_name)
    if got["label"] != "河医大助手":
        fail("应用名不对（中文可能被写坏）")


def check_cert(apk):
    print("[4] 签名证书")
    r = subprocess.run(["java", "-jar", SIGNER, "verify", "--print-certs", apk],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    m = re.search(r"SHA-256 digest: ([0-9a-f]+)", r.stdout)
    if not m:
        fail("apksigner 没输出指纹\n" + r.stdout[-800:] + r.stderr[-800:])
        return
    d = m.group(1)
    print("    SHA-256 " + d)
    if d != EXPECT_CERT_SHA256:
        fail("证书变了！老用户会装不上（必须与 v1.1.1 一致）")
    else:
        print("    与 v1.1.1 一致")


def main():
    apk = sys.argv[1] if len(sys.argv) > 1 else newest_apk()
    if not os.path.exists(apk):
        raise SystemExit("找不到 APK：" + apk)
    print("APK: " + apk)
    print("大小: %d bytes" % os.path.getsize(apk))
    print("SHA-256: %s\n" % hashlib.sha256(open(apk, "rb").read()).hexdigest())
    check_assets(apk)
    print()
    check_dex(apk)
    print()
    check_badging(apk)
    print()
    check_cert(apk)
    print()
    check_worker()
    print()
    if ok:
        print("[PASS] 四件套全部通过")
        return 0
    print("[FAIL] 有检查项未通过，不要发这个包")
    return 1


if __name__ == "__main__":
    sys.exit(main())
