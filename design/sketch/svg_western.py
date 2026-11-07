# -*- coding: utf-8 -*-
"""把官网示意图 SVG 从「素描纸」重上色到「西部涂鸦」。
用 python 做替换（PowerShell 处理 UTF-8 会吞字符）。
"""
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IMG = os.path.join(ROOT, 'server', 'pages', 'dist', 'img')

PAIRS = [
    ('#faf7ee', '#FAF3E2'),   # 面板白 → 纸白
    ('#f4f0e5', '#EFE2C8'),   # 纸 → 牛皮纸
    ('#d9d2c0', '#D3C0A0'),   # 线 → 淡棕格线
    ('#1b1a17', '#2B2318'),   # 墨 → 深棕墨
    ('#8b8478', '#8E7E64'),   # 铅笔灰
    ('#4a4640', '#5A4B36'),   # 次级字
    ('#5a4a2e', '#8A5A3B'),   # 赤陶
    ('#3f6b46', '#4E7A48'),   # 绿
    ('#e9e3d3', '#E4D4B6'),   # 浅块
    ('#efe6dd', '#F1E3D4'),   # 紫调浅块
    ('#a56a22', '#B27A12'),   # 沙金
    ('#eae4d2', '#EAF0F3'),   # 淡蓝块
    ('#e6ecdf', '#E6EFE3'),   # 淡绿块
    ('#f0ebdf', '#F5EAD4'),   # 次级面
    ('#f1ead6', '#FBF0D2'),   # 便签黄
    ('#5b4a1e', '#6B4A08'),   # 便签字
]


def main():
    total = 0
    for name in ('shot-kb.svg', 'shot-learn.svg', 'shot-water.svg', 'logo.svg'):
        p = os.path.join(IMG, name)
        if not os.path.exists(p):
            print('skip', name)
            continue
        s = io.open(p, encoding='utf-8').read()
        for old, new in PAIRS:
            s = s.replace(old, new)
            s = s.replace(old.upper(), new)
        io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
        total += 1
        print('ok  %s  %d 字节' % (name, len(s.encode('utf-8'))))
    print('共 %d 个' % total)


if __name__ == '__main__':
    main()
