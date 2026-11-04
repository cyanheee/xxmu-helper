#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PC 端 APK 构建（Windows，无需 gradle / Termux）。

流程：sync assets -> aapt2 compile -> aapt2 link -> javac -> d8 -> 合并 dex
      -> zipalign -> apksigner

用法：
    python tools/build_apk.py                 # 完整构建
    python tools/build_apk.py --no-sync       # 跳过 assets 同步
    python tools/build_apk.py --install       # 构建后 adb 安装

依赖（本机已装）：
    JDK 17            C:\\Program Files\\Eclipse Adoptium\\jdk-17...\\bin
    Android SDK       D:\\android-sdk  (platforms/android-33, build-tools/33.0.2)
    keystore          android/xxmu.jks  (pass: xxmu123)

注意：d8.bat / apksigner.bat 在 JDK17 下会因 -Djava.ext.dirs 报错，
      所以这里直接 java -cp / java -jar 调 jar。
"""
import argparse
import os
import shutil
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AND = os.path.join(ROOT, "android")
BUILD = os.path.join(AND, "build")

SDK = os.environ.get("ANDROID_HOME") or r"D:\android-sdk"
BT = os.path.join(SDK, "build-tools", "33.0.2")
ANDROID_JAR = os.path.join(SDK, "platforms", "android-33", "android.jar")
D8_JAR = os.path.join(BT, "lib", "d8.jar")
SIGNER_JAR = os.path.join(BT, "lib", "apksigner.jar")
AAPT2 = os.path.join(BT, "aapt2.exe")
ZIPALIGN = os.path.join(BT, "zipalign.exe")

KS = os.path.join(AND, "xxmu.jks")
KS_PASS = "xxmu123"

LIBS = os.path.join(AND, "libs")


def lib_jars():
    """android/libs/*.jar —— 第三方 java 库（目前只有 ZXing）。

    为什么用手搓 classpath 而不是 gradle：本工程本来就是 javac + d8 直调，
    加 gradle 等于重做构建体系；jar 直接喂给 javac 的 -classpath 和 d8 的输入即可。
    """
    if not os.path.isdir(LIBS):
        return []
    return [os.path.join(LIBS, n) for n in sorted(os.listdir(LIBS))
            if n.lower().endswith(".jar")]


# 前端资产清单不再写死：sync_assets() 扫 web/ 目录全量同步


def run(cmd, desc, cwd=None):
    print("[*] " + desc)
    r = subprocess.run(cmd, cwd=cwd or AND, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print(r.stdout[-3000:] if r.stdout else "")
        print(r.stderr[-3000:] if r.stderr else "")
        raise SystemExit("%s 失败 (exit %d)" % (desc, r.returncode))
    if r.stdout.strip():
        tail = r.stdout.strip().splitlines()[-3:]
        for line in tail:
            print("    " + line)
    return r


def sync_assets():
    """把 web/ 下所有前端文件同步进 android/assets/。

    故意改成「扫目录」而不是写死文件名：v0.5.0 加了 jsQR.js / wiki.js /
    water.js，写死的清单漏掉它们会让 APK 里缺脚本、一开就白屏。
    """
    web = os.path.join(ROOT, "web")
    dst = os.path.join(AND, "assets")
    exts = (".html", ".css", ".js")
    files = sorted(f for f in os.listdir(web)
                   if f.lower().endswith(exts) and os.path.isfile(os.path.join(web, f)))
    if not files:
        raise SystemExit("web/ 下没有任何前端文件")
    # assets 里多出来的旧文件（重命名/删除后残留）要清掉，避免装进无用脚本
    for old in os.listdir(dst):
        if old.lower().endswith(exts) and old not in files:
            os.remove(os.path.join(dst, old))
            print("    - 移除残留 %s" % old)
    for f in files:
        shutil.copyfile(os.path.join(web, f), os.path.join(dst, f))
    print("[*] assets 已同步 (%d 个文件)" % len(files))


def check_sdk():
    missing = [p for p in (ANDROID_JAR, D8_JAR, SIGNER_JAR, AAPT2, ZIPALIGN)
               if not os.path.exists(p)]
    if missing:
        raise SystemExit("SDK 不完整，缺：\n  " + "\n  ".join(missing))
    if not os.path.exists(KS):
        raise SystemExit("缺少签名文件：%s\n  生成：keytool -genkeypair -keystore %s "
                         "-alias xxmu -keyalg RSA -keysize 2048 -validity 10000 "
                         "-storepass %s -keypass %s -dname \"CN=XXMU Helper\""
                         % (KS, KS, KS_PASS, KS_PASS))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-sync", action="store_true", help="跳过 web -> assets 同步")
    ap.add_argument("--install", action="store_true", help="构建后 adb install")
    a = ap.parse_args()

    check_sdk()
    if not a.no_sync:
        sync_assets()

    for d in ("gen", "classes", "res"):
        p = os.path.join(BUILD, d)
        os.makedirs(p, exist_ok=True)
    for f in ("classes.dex", "res.zip", "app.unsigned.apk",
              "app.dexed.apk", "app.aligned.apk", "app-signed.apk"):
        p = os.path.join(BUILD, f)
        if os.path.exists(p):
            os.remove(p)

    # 1. 资源
    run([AAPT2, "compile", "--dir", "res", "-o", os.path.join(BUILD, "res.zip")],
        "aapt2 compile")

    # 2. 链接（-A assets 把 web 打进去）
    run([AAPT2, "link", "-o", os.path.join(BUILD, "app.unsigned.apk"),
         "-I", ANDROID_JAR, "--manifest", "AndroidManifest.xml",
         "-R", os.path.join(BUILD, "res.zip"),
         "--java", os.path.join(BUILD, "gen"),
         "--min-sdk-version", "24", "--target-sdk-version", "33",
         "-A", "assets", "--auto-add-overlay"],
        "aapt2 link")

    # 3. javac
    srcs = [os.path.join(AND, "src", "com", "xxmu", "helper", n)
            for n in sorted(os.listdir(os.path.join(AND, "src", "com", "xxmu", "helper")))
            if n.endswith(".java")]
    rjava = os.path.join(BUILD, "gen", "com", "xxmu", "helper", "R.java")
    jars = lib_jars()
    javac = "javac"
    jcmd = [javac, "-source", "8", "-target", "8", "-encoding", "UTF-8",
            "-bootclasspath", ANDROID_JAR, "-d", os.path.join(BUILD, "classes")]
    if jars:
        jcmd += ["-classpath", os.pathsep.join(jars)]
        print("[*] 依赖 jar: %s" % ", ".join(os.path.basename(j) for j in jars))
    run(jcmd + srcs + [rjava],
        "javac (%d 个源文件)" % len(srcs))

    # 4. d8（直接调 jar，绕开 d8.bat 的 -Djava.ext.dirs）
    classes = [os.path.join(BUILD, "classes", "com", "xxmu", "helper", n)
               for n in sorted(os.listdir(os.path.join(BUILD, "classes", "com", "xxmu", "helper")))
               if n.endswith(".class")]
    run(["java", "-cp", D8_JAR, "com.android.tools.r8.D8",
         "--min-api", "24", "--lib", ANDROID_JAR, "--output", BUILD]
        + classes + jars,
        "d8 (%d 个 class, %d 个 jar)" % (len(classes), len(jars)))

    # 5. 合并 dex
    print("[*] 合并 classes.dex 进 apk")
    shutil.copyfile(os.path.join(BUILD, "app.unsigned.apk"),
                    os.path.join(BUILD, "app.dexed.apk"))
    with zipfile.ZipFile(os.path.join(BUILD, "app.dexed.apk"), "a",
                         zipfile.ZIP_DEFLATED) as z:
        z.write(os.path.join(BUILD, "classes.dex"), "classes.dex")

    # 6. 对齐
    run([ZIPALIGN, "-f", "4", os.path.join(BUILD, "app.dexed.apk"),
         os.path.join(BUILD, "app.aligned.apk")], "zipalign")

    # 7. 签名
    out = os.path.join(BUILD, "app-signed.apk")
    run(["java", "-jar", SIGNER_JAR, "sign",
         "--ks", KS, "--ks-pass", "pass:" + KS_PASS,
         "--key-pass", "pass:" + KS_PASS,
         "--out", out, os.path.join(BUILD, "app.aligned.apk")],
        "apksigner sign")

    size = os.path.getsize(out) / 1024
    print("\n[OK] %s  (%.1f KB)" % (out, size))

    # 8. 复制到 apk/ 并带版本号
    import re
    mani = open(os.path.join(AND, "AndroidManifest.xml"), encoding="utf-8").read()
    vn = re.search(r'versionName="([^"]+)"', mani).group(1)
    apkdir = os.path.join(ROOT, "apk")
    os.makedirs(apkdir, exist_ok=True)
    final = os.path.join(apkdir, "xxmu-helper-v%s.apk" % vn)
    shutil.copyfile(out, final)
    print("[OK] 成品 -> %s" % final)

    # 9. 校验
    r = run(["java", "-jar", SIGNER_JAR, "verify", "--print-certs", out], "apksigner verify")
    for line in r.stdout.splitlines()[:2]:
        print("    " + line)

    if a.install:
        adb = os.path.join(SDK, "platform-tools", "adb.exe")
        run([adb, "install", "-r", out], "adb install", cwd=ROOT)

    return 0


if __name__ == "__main__":
    sys.exit(main())
