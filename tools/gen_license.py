#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""激活码生成器（管理员用）

激活码 = Base32(HMAC-SHA256(SECRET, 学号)) 前 16 位，与学号一一对应。
App 内用同样的算法和密钥本地校验，不联网。

用法：
    python tools/gen_license.py 20261440105            # 生成单个
    python tools/gen_license.py 20261440105 20261440106  # 批量
    python tools/gen_license.py --file ids.txt          # 从文件读（每行一个学号）
    python tools/gen_license.py --file ids.txt -o licenses.csv

注意：
    SECRET 必须与 web/license.js 里的常量完全一致，否则生成的码在 App 里无效。
"""
import argparse
import hashlib
import hmac
import os
import sys

# !!! 必须与 web/license.js 的 SECRET 保持一致 !!!
SECRET = "XXMU-HELPER-GU-2026-v1"
ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"  # Crockford Base32
GROUP = 4
GROUPS = 4
CODE_LEN = GROUP * GROUPS


def to_base32(data: bytes, chars: int) -> str:
    bits = 0
    value = 0
    out = []
    for byte in data:
        value = (value << 8) | byte
        bits += 8
        while bits >= 5 and len(out) < chars:
            out.append(ALPHABET[(value >> (bits - 5)) & 31])
            bits -= 5
        if len(out) >= chars:
            break
    return "".join(out)


def code_for(student_id: str) -> str:
    sid = str(student_id).strip()
    if not sid:
        return ""
    mac = hmac.new(SECRET.encode("utf-8"), sid.encode("utf-8"), hashlib.sha256).digest()
    raw = to_base32(mac, CODE_LEN)
    return "-".join(raw[i:i + GROUP] for i in range(0, len(raw), GROUP))


def normalize(code: str) -> str:
    s = "".join(c for c in str(code).upper() if c.isalnum())
    return s.replace("O", "0").replace("I", "1").replace("L", "1").replace("U", "V")


def verify(student_id: str, code: str) -> bool:
    return normalize(code) == normalize(code_for(student_id))


def read_ids(args, file_path):
    ids = list(args or [])
    if file_path:
        with open(file_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    ids.append(line.split()[0])
    return ids


def main():
    ap = argparse.ArgumentParser(description="生成 xxmu-app 激活码")
    ap.add_argument("ids", nargs="*", help="学号")
    ap.add_argument("--file", help="学号列表文件，每行一个")
    ap.add_argument("-o", "--out", help="输出 CSV 文件")
    ap.add_argument("--selftest", action="store_true", help="跑内置自检向量")
    a = ap.parse_args()

    if a.selftest:
        # 与 web/license.js 的 JS 实现交叉验证过的向量
        vectors = [("20261440105", "24DN-JFSG-7NKV-RNBT"),
                   ("123456789", "0MZP-84D9-WEKE-S1JC")]
        ok = True
        for sid, expect in vectors:
            got = code_for(sid)
            flag = "OK  " if got == expect else "FAIL"
            if got != expect:
                ok = False
            print("%s  %-14s -> %s (期望 %s)" % (flag, sid, got, expect))
        print("\n自检结果:", "通过" if ok else "不一致！SECRET 或算法被改动过")
        return 0 if ok else 1

    ids = read_ids(a.ids, a.file)
    if not ids:
        ap.print_help()
        return 1

    rows = []
    for sid in ids:
        c = code_for(sid)
        if not c:
            print("跳过空学号", file=sys.stderr)
            continue
        rows.append((sid, c))

    width = max(len(r[0]) for r in rows)
    print("%-*s  %s" % (width, "学号", "激活码"))
    print("-" * (width + 2 + 19))
    for sid, c in rows:
        print("%-*s  %s" % (width, sid, c))

    if a.out:
        with open(a.out, "w", encoding="utf-8-sig", newline="") as f:
            f.write("学号,激活码\n")
            for sid, c in rows:
                f.write("%s,%s\n" % (sid, c))
        print("\n已写入 %s（%d 条）" % (a.out, len(rows)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
