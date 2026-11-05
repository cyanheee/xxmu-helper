#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把项目产物送到「用户真正会去看的地方」。

为什么需要这个脚本
==================
用户是这么报的：「我咋没看见出包在哪」。
原因是**「桌面」有两个**，而我一直往错的那个放：
  · `D:\\dsh\\DSH Desktop\\`  —— 这是 DSH 的工作目录，名字里带 Desktop，但它不是桌面
  · `C:\\Users\\<用户>\\Desktop\\` —— 这才是他在资源管理器里看到的桌面
2026-11-05 用户点名：「以后这个项目的文件放在桌面新建一个叫 xxmuhelper 的文件夹里」。
所以交付路径统一走这里，不再散落在两个「桌面」上。

用法
    python tools/deliver.py                    # 把 apk/ 里最新的包和 STATE.md 送过去
    python tools/deliver.py --apk apk/x.apk    # 指定某个包
    python tools/deliver.py --no-apk           # 只更新状态文档
    python tools/deliver.py --print            # 只看目标路径，不动文件

判定「送达成功」的标准（不是「文件复制了」）
    逐字节 hash 比对源与目标；不一致就 exit 1。
    —— 「文件生成了」≠「文件对」，这条在本项目上已经犯过四次。
"""
import argparse
import hashlib
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APK_DIR = os.path.join(ROOT, 'apk')


def desktop():
    """真正的桌面路径。

    不用 `os.path.expanduser('~/Desktop')` —— 中文用户目录、OneDrive 重定向、
    多用户环境下它都可能指错。优先问 Windows 本身（注册表里的 Desktop 位置），
    问不到再退回 USERPROFILE。
    """
    try:
        import winreg                                       # noqa: PLC0415
        k = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r'Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders')
        v, _ = winreg.QueryValueEx(k, 'Desktop')
        if v and os.path.isdir(v):
            return v
    except Exception:                                       # noqa: BLE001
        pass
    p = os.path.join(os.path.expanduser('~'), 'Desktop')
    return p if os.path.isdir(p) else os.path.expanduser('~')


def target_dir():
    """用户指定的落点：桌面\\xxmuhelper\\"""
    return os.path.join(desktop(), 'xxmuhelper')


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def latest_apk():
    if not os.path.isdir(APK_DIR):
        return None
    cands = [f for f in os.listdir(APK_DIR) if f.endswith('.apk')]

    def key(f):
        m = re.search(r'v(\d+)\.(\d+)\.(\d+)', f)
        return tuple(int(x) for x in m.groups()) if m else (0, 0, 0)

    if not cands:
        return None
    return os.path.join(APK_DIR, sorted(cands, key=key)[-1])


def send(src, dst, label):
    """复制并**校验**。返回 (ok, 说明)。"""
    if not os.path.exists(src):
        return False, '源不存在：' + src
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    a = sha(src)
    shutil.copyfile(src, dst)
    b = sha(dst)
    if a != b:
        return False, '%s 复制后 hash 不一致（%s → %s）' % (label, a[:12], b[:12])
    return True, '%-26s %8d 字节  %s…' % (label, os.path.getsize(dst), a[:12])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apk', default='')
    ap.add_argument('--no-apk', action='store_true')
    ap.add_argument('--print', action='store_true')
    a = ap.parse_args()

    dst_dir = target_dir()
    if a.print:
        print('桌面      :', desktop())
        print('交付目录  :', dst_dir)
        print('存在      :', os.path.isdir(dst_dir))
        return 0

    os.makedirs(dst_dir, exist_ok=True)
    bad = 0

    # ---- 1. APK ----
    if not a.no_apk:
        src = a.apk or latest_apk()
        if not src:
            print('[--] apk/ 里没有安装包，跳过')
        else:
            src = src if os.path.isabs(src) else os.path.join(ROOT, src)
            # 目录里的名字沿用用户习惯的中文名，但版本号从包名里取。
            # 版本号段必须锚在末尾的 .apk 之前：早期写成 r'v([\d.]+)' 会把
            # 「xxmu-helper-v1.1.22.apk」的 `.apk` 也吞进去，得到 `v1.1.22.`
            # 再拼 `.apk` 就成了 `河医大助手-v1.1.22..apk`（双点）。
            m = re.search(r'-v(\d+(?:\.\d+)*)\.apk$', os.path.basename(src))
            if not m:                                        # 包名不规范时退回宽松匹配
                m = re.search(r'v(\d+(?:\.\d+)*)', os.path.basename(src))
            ver = m.group(1) if m else 'unknown'
            ok, msg = send(src, os.path.join(dst_dir, '河医大助手-v%s.apk' % ver), 'APK v' + ver)
            print(('[OK] ' if ok else '[!!] ') + msg)
            if not ok:
                bad += 1

    # ---- 2. 状态文档 ----
    st = os.path.join(ROOT, 'STATE.md')
    if os.path.exists(st):
        ok, msg = send(st, os.path.join(dst_dir, '河医大助手-当前状态.md'), 'STATE.md')
        print(('[OK] ' if ok else '[!!] ') + msg)
        if not ok:
            bad += 1

    print('\n交付目录：%s' % dst_dir)
    if bad:
        print('[FAIL] %d 项没送达或校验不一致' % bad)
    else:
        print('已送达并逐字节校验通过。')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
