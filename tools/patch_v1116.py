#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 app.js 里 v1.1.0~v1.1.15 的结算两块（endWaterAndSettle + openSettle）
整体替换成 v1.1.16 的「停止 / 放水 / 定量放水」。

用脚本做而不是手工 edit：要替换的是一整段 8.7 KB 的连续区域，其中含大量
中文与模板字符串，靠 edit 的 old_string 容易差一个空格就匹配不上。
定位靠「startWater 之前那一段」这个唯一锚点，替换范围由 index 精确算出。

用法：
    python -X utf8 tools/patch_v1116.py --check    # 只看边界，不写
    python -X utf8 tools/patch_v1116.py            # 真替换
"""
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, 'web', 'app.js')
NEWFILE = os.path.join(ROOT, 'tools', '_v1116_startwater.js.txt')

A_ANCHOR = '  /**\n   * 出水。\n'
B_ANCHOR = '  function startWater(dev, fn) {'


def main():
    s = io.open(APP, encoding='utf-8').read()
    a = s.index(A_ANCHOR)
    b = s.index(B_ANCHOR)
    if b <= a:
        raise SystemExit('边界算反了，中止')
    # 安全：这段里必须同时出现两个待删函数名，否则说明定位错了（改版后重跑要重新确认）
    seg = s[a:b]
    for must in ('function endWaterAndSettle(', 'function openSettle('):
        if must not in seg:
            raise SystemExit('待替换区间里没有 %s，定位不对，中止' % must)
    print('替换区间 [%d, %d)，长度 %d' % (a, b, b - a))
    print('首行: %r' % seg[:40])
    print('尾行: %r' % seg[-40:])
    if '--check' in sys.argv:
        print('--check：未写入')
        return 0
    new = io.open(NEWFILE, encoding='utf-8').read()
    s2 = s[:a] + new + s[b:]
    io.open(APP, 'w', encoding='utf-8', newline='\n').write(s2)
    print('已写入，新长度 %d（原 %d）' % (len(s2), len(s)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
