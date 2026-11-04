# -*- coding: utf-8 -*-
"""离线验证 Http.java 的分段下载逻辑（不需要手机）。

为什么要这个装置：
    分段下载的 bug 全部只在「网络不听话」时才现形 —— 断流、少给字节、
    不支持 Range、服务端只给一段。真机复现这些既慢又靠运气（adb 还经常
    连不上）。所以拿一个本地 HTTP 服务端把这些情形演一遍，然后把
    Http.downloadToFile 直接跑在上面。

做两件事：
    1. 起一个可控的 Range 服务端（支持 206 / 故意少给 / 拒绝 Range /
       中途掐断 / 慢速），把同一份 1 MB 二进制发出去；
    2. 用一个 Java 小程序（tools/TestHttp.java）调 Http.downloadToFile，
       每次都用 sha256 校验落盘结果 —— 半截包必须被当成失败，不能被当成
       成功。

用法：
    python tools/test_http_range.py
"""

import hashlib
import http.server
import os
import random
import re
import socket
import subprocess
import sys
import threading
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build_httptest")
ANDROID_JAR = r"D:\android-sdk\platforms\android-33\android.jar"

# 1.2 MB：比 256 KB 的门槛大，会真的走分段
PAYLOAD = bytes(random.Random(20261103).getrandbits(8) for _ in range(1200 * 1024))
PAYLOAD_SHA = hashlib.sha256(PAYLOAD).hexdigest()

# 服务端行为开关，测试用
MODE = {"name": "normal", "slow_kb": 0, "cut_budget": 0}
CUT_LOCK = threading.Lock()
SEEN = set()


class H(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def do_GET(self):
        total = len(PAYLOAD)
        mode = MODE["name"]
        rng = self.headers.get("Range")

        if mode == "no_range" or not rng:
            self.send_response(200)
            self.send_header("Content-Length", str(total))
            self.send_header("Content-Type", "application/octet-stream")
            self.end_headers()
            self._body(0, total, "normal")
            return

        m = re.match(r"bytes=(\d*)-(\d*)$", rng or "")
        if not m:
            self.send_response(400)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        a_s, b_s = m.group(1), m.group(2)
        if a_s == "" and b_s == "":
            self.send_response(416)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if a_s == "":
            n = int(b_s)
            a, b = max(0, total - n), total - 1
        else:
            a = int(a_s)
            b = min(total - 1, int(b_s)) if b_s else total - 1
        if a > b or a >= total:
            self.send_response(416)
            self.send_header("Content-Range", "bytes */%d" % total)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        # 探测请求（bytes=0-0）永远正常回，否则客户端会以为服务端不支持 Range
        probe = (a == 0 and b == 0)
        want = b - a + 1
        self.send_response(206)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Range", "bytes %d-%d/%d" % (a, b, total))
        self.send_header("Content-Length", str(want))
        self.end_headers()

        if probe:
            self._body(a, b + 1, "normal")
            return

        # 「掐断」不是每次都掐：真实弱网是偶发断流，客户端重试就该能续上。
        # 如果每次都掐，客户端永远拿不全——那是「服务端坏了」，不是「网不好」，
        # 那种情况下客户端本来就应该报失败（宁可失败，也不能装个坏包）。
        if mode == "cut":
            # cut_budget = -1 表示「永远掐」：那是服务端坏了，客户端必须报失败，
            # 而不是把那半截包当成功装上去。
            # cut_budget > 0 表示「总共只掐这么多次」：模拟弱网偶发断流。
            #   不能按 (a,b) 去重 —— 续传的起点变了就是新的 Range 请求，
            #   按 key 去重会导致每次重试都被掐，永远续不上。
            with CUT_LOCK:
                do_cut = (MODE["cut_budget"] < 0) or (MODE["cut_budget"] > 0)
                if do_cut and MODE["cut_budget"] > 0:
                    MODE["cut_budget"] -= 1
            if do_cut:
                half = max(1, want // 2)
                try:
                    self.wfile.write(PAYLOAD[a:a + half])
                    self.wfile.flush()
                except Exception:
                    pass
                try:
                    self.connection.close()
                except Exception:
                    pass
                self.close_connection = True
                return

        self._body(a, b + 1, mode)

    def _body(self, a, b, mode):
        chunk = 16 * 1024
        slow = MODE["slow_kb"]
        off = a
        try:
            while off < b:
                n = min(chunk, b - off)
                piece = PAYLOAD[off:off + n]
                self.wfile.write(piece)
                self.wfile.flush()
                off += n
                if slow:
                    time.sleep(n / (slow * 1024.0))
        except (BrokenPipeError, ConnectionResetError):
            pass


class Srv:
    def __init__(self):
        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
        # 「掐断」用例是故意 RST 的，socketserver 会把它当异常打到 stderr。
        # 那些 traceback 是预期内的，关掉免得掩盖真正的失败信息。
        self.httpd.handle_error = lambda request, client_address: None
        self.port = self.httpd.server_address[1]
        self.t = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.t.start()

    def stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()


def build_harness():
    """编译一个只有 main 的小程序，直接调 Http.downloadToFile"""
    os.makedirs(BUILD, exist_ok=True)
    src_dir = os.path.join(BUILD, "src", "com", "xxmu", "helper")
    os.makedirs(src_dir, exist_ok=True)
    src = '''
package com.xxmu.helper;

import java.io.File;
import java.security.MessageDigest;
import java.io.FileInputStream;

public class TestHttp {
    public static void main(String[] a) throws Exception {
        String url = a[0];
        File dst = new File(a[1]);
        if (dst.exists()) dst.delete();
        final StringBuilder peak = new StringBuilder();
        try {
            long n = Http.downloadToFile(url, dst, new Http.Progress() {
                public void on(long got, long total) {
                    if (total > 0 && got > total) peak.append("OVER");
                }
            });
            System.out.println("OK " + n + " " + sha(dst) + " " + peak);
        } catch (Exception e) {
            System.out.println("FAIL " + e.getClass().getSimpleName() + ":" + e.getMessage());
        }
    }

    static String sha(File f) throws Exception {
        if (!f.exists()) return "-";
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        FileInputStream in = new FileInputStream(f);
        byte[] b = new byte[65536];
        int n;
        while ((n = in.read(b)) > 0) md.update(b, 0, n);
        in.close();
        StringBuilder sb = new StringBuilder();
        for (byte x : md.digest()) sb.append(String.format("%02x", x));
        return sb.toString();
    }
}
'''
    with open(os.path.join(src_dir, "TestHttp.java"), "w", encoding="utf-8") as f:
        f.write(src)

    # 只要 Http.java + TestHttp.java（不引 MainActivity 那一大坨）
    srcs = [os.path.join(ROOT, "android", "src", "com", "xxmu", "helper", "Http.java"),
            os.path.join(src_dir, "TestHttp.java")]
    cls = os.path.join(BUILD, "classes")
    os.makedirs(cls, exist_ok=True)
    r = subprocess.run(["javac", "-encoding", "UTF-8",
                        "-source", "8", "-target", "8",
                        "-bootclasspath", ANDROID_JAR, "-d", cls] + srcs,
                       capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout)
        print(r.stderr)
        sys.exit("javac 失败")
    return cls


def run(cls, url, dst, timeout=40):
    r = subprocess.run(["java", "-cp", cls, "com.xxmu.helper.TestHttp", url, dst],
                       capture_output=True, text=True, timeout=timeout)
    out = (r.stdout or "").strip()
    return out


def main():
    print("payload: %d 字节  sha256=%s" % (len(PAYLOAD), PAYLOAD_SHA[:16]))
    cls = build_harness()
    srv = Srv()
    base = "http://127.0.0.1:%d/apk" % srv.port
    dst = os.path.join(BUILD, "out.apk")
    fails = []

    def case(name, mode, expect_ok, slow_kb=0, timeout=40, cut_budget=0):
        MODE["name"] = mode
        MODE["slow_kb"] = slow_kb
        MODE["cut_budget"] = cut_budget
        SEEN.clear()
        t0 = time.time()
        try:
            out = run(cls, base, dst, timeout=timeout)
        except subprocess.TimeoutExpired:
            out = "TIMEOUT"
        dt = time.time() - t0
        ok = out.startswith("OK ")
        parts = out.split()
        sha_ok = (len(parts) >= 3 and parts[2] == PAYLOAD_SHA)
        # 第 4 个字段是进度峰值标记（Java 侧在 got > total 时写 OVER）
        peak_ok = (len(parts) < 4) or ("OVER" not in parts[3])
        good = (ok == expect_ok) and (sha_ok if expect_ok else True) and peak_ok
        mark = "[OK]  " if good else "[FAIL]"
        print("%s %-26s %5.1fs  %s" % (mark, name, dt, out[:100]))
        if not good:
            fails.append(name)
        return out

    # 1) 正常分段：必须成功、sha 一致、进度不超 100%
    case("正常 4 段并发", "normal", True)
    # 2) 服务端拒绝 Range：应退回单流并成功
    case("服务端不支持 Range", "no_range", True)
    # 3) 服务端偶发掐断（4 段各掐一次，重试续传应成功）
    case("分段偶发掐断（续传）", "cut", True, cut_budget=4)
    # 4) 慢速（50 KB/s）：4 段并发仍应明显快过串行（串行约 24s）
    out = case("慢速 50KB/s", "normal", True, slow_kb=50, timeout=60)
    # 5) 服务端永久掐断：必须报失败，不能把半截包当成功
    case("永久掐断（应失败）", "cut", False, cut_budget=-1)

    srv.stop()

    # 独立的「进度不超 100%」检查已折进各 case 的 peak_ok
    print()
    if fails:
        print("[FAIL] %d 项未过: %s" % (len(fails), ", ".join(fails)))
        sys.exit(1)
    print("[PASS] 分段下载逻辑全部通过")

if __name__ == "__main__":
    main()
