# -*- coding: utf-8 -*-
"""版本号三处同改（外加 pages 无关）。用法： python -X utf8 tools/bump_ver.py 1.1.16 1116"""
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    if len(sys.argv) < 3:
        raise SystemExit('用法： python tools/bump_ver.py <versionName> <versionCode>')
    ver = sys.argv[1]
    code = sys.argv[2]

    def swap(path, pairs):
        p = os.path.join(ROOT, path)
        s = io.open(p, encoding='utf-8').read()
        for old, new in pairs:
            if old not in s:
                raise SystemExit('%s 里找不到 %r，先确认当前版本号' % (path, old))
            s = s.replace(old, new, 1)
        io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
        print('ok  %s' % path)

    import re
    # about.js：APP_VERSION = 'x.y.z'
    ab = os.path.join(ROOT, 'web/about.js')
    s = io.open(ab, encoding='utf-8').read()
    s2, n = re.subn(r"const APP_VERSION = '[\d.]+';", "const APP_VERSION = '%s';" % ver, s, count=1)
    if not n:
        raise SystemExit('web/about.js 里没找到 APP_VERSION')
    io.open(ab, 'w', encoding='utf-8', newline='\n').write(s2)
    print('ok  web/about.js')

    # index.html：#aboutVer 的静态文案
    ix = os.path.join(ROOT, 'web/index.html')
    s = io.open(ix, encoding='utf-8').read()
    s2, n = re.subn(r'id="aboutVer">v[\d.]+<', 'id="aboutVer">v%s<' % ver, s, count=1)
    if not n:
        raise SystemExit('web/index.html 里没找到 id="aboutVer"')
    io.open(ix, 'w', encoding='utf-8', newline='\n').write(s2)
    print('ok  web/index.html')

    # AndroidManifest：versionCode + versionName
    mf = os.path.join(ROOT, 'android/AndroidManifest.xml')
    s = io.open(mf, encoding='utf-8').read()
    s2, n1 = re.subn(r'android:versionCode="\d+"', 'android:versionCode="%s"' % code, s, count=1)
    s2b, n2 = re.subn(r'android:versionName="[\d.]+"', 'android:versionName="%s"' % ver, s2, count=1)
    if not (n1 and n2):
        raise SystemExit('AndroidManifest.xml 里 versionCode/versionName 没找全')
    io.open(mf, 'w', encoding='utf-8', newline='\n').write(s2b)
    print('ok  android/AndroidManifest.xml')

    print('\n现在：%s / versionCode %s' % (ver, code))
    print('别忘了跑：node tools/check_web.js && python tools/build_apk.py')
    return 0


if __name__ == '__main__':
    sys.exit(main())
