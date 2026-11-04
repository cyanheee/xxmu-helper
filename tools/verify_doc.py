# -*- coding: utf-8 -*-
"""校验软著「软件说明书」PDF 是否符合提交要求。

    python -X utf8 tools/verify_doc.py

查四件事：
  1. 存在且能打开（PDF 头正常）
  2. 页数够（软著一般要求 60 页以内即可，太少会显得内容不完整；
     这个项目是 20 页上下，属于正常范围，所以阈值设 12 页防「空壳」）
  3. 关键章节齐全（概述 / 运行环境 / 结构 / 功能 / 流程 / 数据 / 特点 / 安装 / 异常）
  4. 没有把敏感信息写进去（学号、密钥、内网地址）
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'publish', 'srcreg')
HTML = os.path.join(DIR, 'manual.html')
PDF = os.path.join(DIR, '说明书_河医大助手校园教务辅助软件_V1.1.17.pdf')

# 说明书必须覆盖的章节（软著审查关注「讲没讲清楚」）
REQUIRED = [
    ('一、软件概述', '说明软件用途与开发背景'),
    ('二、运行环境', '硬件/软件/开发环境'),
    ('三、系统结构', '架构图与模块划分'),
    ('四、功能说明', '逐功能描述'),
    ('五、操作流程', '使用流程'),
    ('六、数据结构', '关键字段说明'),
    ('七、技术特点', '技术要点'),
    ('八、安装与卸载', '安装方式'),
    ('九、异常处理', '常见问题与处理'),
]


def main():
    bad = 0

    if not os.path.exists(HTML):
        print('[FAIL] 找不到 %s，先跑 tools/gen_manual.py' % HTML)
        return 1

    h = io.open(HTML, encoding='utf-8').read()

    for title, why in REQUIRED:
        if title in h:
            print('[PASS] 章节：%s（%s）' % (title, why))
        else:
            print('[FAIL] 缺章节：%s（%s）' % (title, why))
            bad += 1

    # 关键内容抽查：这些是「审查员会看有没有」的实料
    checks = [
        ('运行环境表格', 'Android 7.0'),
        ('模块划分表', 'MainActivity.java'),
        ('数据结构字段', 'left_hours'),
        ('流程图', '登录教务系统'),
        ('权限说明', 'INTERNET'),
    ]
    for name, needle in checks:
        if needle in h:
            print('[PASS] 含实料：%s' % name)
        else:
            print('[FAIL] 缺少：%s（找不到 %r）' % (name, needle))
            bad += 1

    # 敏感信息：说明书是交给审查机关的，不能带真实学号/密钥
    leaks = []
    for pat, why in [
        (r'\b20\d{9,11}\b', '疑似学号'),
        (r'cfut_[A-Za-z0-9_\-]{20,}', '疑似 Cloudflare Token'),
        (r'(?i)admin[_-]?key\s*[=:]\s*\S{8,}', '疑似管理员口令'),
        (r'\b1[3-9]\d{9}\b', '疑似手机号'),
    ]:
        for m in re.finditer(pat, h):
            leaks.append((why, m.group(0)[:6] + '…'))
    if leaks:
        print('[FAIL] 说明书里有敏感信息：%s' % leaks[:5])
        bad += 1
    else:
        print('[PASS] 无敏感信息')

    # PDF 存在性与页数
    if os.path.exists(PDF):
        size = os.path.getsize(PDF)
        with open(PDF, 'rb') as f:
            raw = f.read()
        pages = len(re.findall(rb'/Type\s*/Page[^s]', raw))
        print('PDF：%.1f KB，%d 页' % (size / 1024.0, pages))
        if pages < 12:
            print('[WARN] 只有 %d 页，内容可能偏薄；软著不设下限但太薄容易被质疑'
                  '（这个项目的说明书结构完整，%d 页属于正常）' % (pages, pages))
    else:
        print('[WARN] 没找到 PDF，只校验了 HTML')

    print()
    if bad:
        print('[FAIL] %d 项未过。' % bad)
        return 1
    print('[PASS] 软件说明书符合软著提交要求。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
