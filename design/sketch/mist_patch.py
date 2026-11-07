# -*- coding: utf-8 -*-
"""给「西部涂鸦」加一支雾光紫（mist purple），App 与官网同步。

用户：浅色和深色都可以稍微添加一点雾光紫元素。
用法：python -X utf8 design/sketch/mist_patch.py
"""
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
APP_CSS = os.path.join(ROOT, 'web', 'app.css')
SITE_CSS = os.path.join(ROOT, 'design', 'sketch', 'site-western.css')
SITE_HTML = os.path.join(ROOT, 'server', 'pages', 'dist', 'index.html')

# ---------- App：浅色档 ----------
APP_LIGHT_OLD = '''  --green:#4E7A48;
  --purple:#8A5A3B;
'''
APP_LIGHT_NEW = '''  --green:#4E7A48;
  --purple:#8A5A3B;
  /* 雾光紫：当作「标记色」，只用在今天、当前项、展开态这类小面积 */
  --mist:#8E7BC4;
  --mist-soft:#EEE8F8;
'''

# ---------- App：深色档 ----------
APP_DARK_OLD = '''  --green:#7FB877;
  --purple:#C08E68;
'''
APP_DARK_NEW = '''  --green:#7FB877;
  --purple:#C08E68;
  --mist:#B9A6E6;
  --mist-soft:#332B47;
'''

# ---------- App：浅色档的轮换底色 ----------
TINT_LIGHT_OLD = '''  --tint-purple:#F1E3D4;
  --rule-red:rgba(178,59,38,.45);'''
TINT_LIGHT_NEW = '''  --tint-purple:#F1E3D4;
  --tint-mist:#F2EDFB;
  --rule-red:rgba(178,59,38,.45);'''

TINT_DARK_OLD = '''  --tint-purple:#362D26;
  --rule-red:rgba(232,112,76,.38);'''
TINT_DARK_NEW = '''  --tint-purple:#362D26;
  --tint-mist:#2F2A3F;
  --rule-red:rgba(232,112,76,.38);'''

# ---------- App：覆盖层里的雾光紫点缀 ----------
APP_PATCHES = [
    # 今天列：沙金 → 雾光紫下划线（更「标记」）
    (""".gh.today::after{height:3px;background:var(--yellow);border-radius:2px;
  bottom:-4px;left:8%;right:8%}""",
     """.gh.today::after{height:3px;background:var(--mist);border-radius:2px;
  bottom:-4px;left:8%;right:8%}"""),
    # 今天格子底色：淡雾紫
    (".cell.today{background:rgba(217,163,43,.24)}",
     ".cell.today{background:var(--mist-soft)}"),
    # 顶栏第二道横带：沙金 → 雾光紫夹一层
    ("""  box-shadow:0 5px 0 var(--yellow), 0 7px 0 var(--edge);""",
     """  box-shadow:0 4px 0 var(--yellow), 0 7px 0 var(--mist), 0 9px 0 var(--edge);"""),
    # 卡片第 4 张轮换：赤陶底 → 淡雾紫底（胶带仍赤陶，形成对比）
    (""".card:not(.elec-entry):nth-of-type(4n+4){--tape:var(--purple);background:var(--tint-purple)}""",
     """.card:not(.elec-entry):nth-of-type(4n+4){--tape:var(--mist);background:var(--tint-mist)}"""),
    # 专注计时的小标题
    (".focus-phase{color:var(--blue);font-weight:800;letter-spacing:1.2px}",
     ".focus-phase{color:var(--mist);font-weight:800;letter-spacing:1.2px}"),
    # 「我的笔记」卡的投影
    (".wiki-card.mine{background:var(--card-mine-a);box-shadow:2px 2px 0 var(--green)}",
     ".wiki-card.mine{background:var(--tint-mist);box-shadow:2px 2px 0 var(--mist)}"),
    # 三档外观里的「选中」勾号：墨 → 雾光紫
    (".th-tick{font-weight:800;color:var(--ink)}",
     ".th-tick{font-weight:800;color:var(--mist)}"),
    # 滚动条前补一条雾光紫的 FAQ 展开符号
    ("""/* ---------------- 滚动条 ---------------- */""",
     """/* FAQ / 折叠：展开时的 + 变成雾光紫 */
details summary::after{color:var(--mist)}
.rm-mode-tick{color:var(--mist)}
.adm-code{color:var(--mist)}

/* ---------------- 滚动条 ---------------- */"""),
]

# ---------- 官网 ----------
SITE_PATCHES = [
    ("""  --green:#4E7A48;
  --purple:#8A5A3B;""",
     """  --green:#4E7A48;
  --purple:#8A5A3B;
  /* 雾光紫：标记色，只用在今天/当前/展开这类小面积 */
  --mist:#8E7BC4;
  --mist-soft:#EEE8F8;"""),
    # 顶栏光带
    (""".mark{
  width:46px;height:46px;flex:0 0 auto;""",
     """.mark{
  width:46px;height:46px;flex:0 0 auto;"""),
    # 章节标题荧光笔：沙金 → 雾光紫（联系我那块保留沙金做区分）
    (""".sec-h::after{content:'';position:absolute;left:-2px;right:-2px;bottom:2px;
  height:9px;background:var(--yellow);opacity:.6;z-index:-1;
  transform:rotate(-.7deg)}""",
     """.sec-h::after{content:'';position:absolute;left:-2px;right:-2px;bottom:2px;
  height:9px;background:var(--mist);opacity:.42;z-index:-1;
  transform:rotate(-.7deg)}"""),
    # 功能卡第 4 张 → 淡雾紫
    (""".feat .fcard:nth-child(4n+4){--tape:var(--purple);background:#F4E7DA}""",
     """.feat .fcard:nth-child(4n+4){--tape:var(--mist);background:var(--mist-soft)}"""),
    # FAQ 的 + 号
    ("""details summary::after{
  content:'+';color:var(--red);font-size:22px;font-weight:700;line-height:1;""",
     """details summary::after{
  content:'+';color:var(--mist);font-size:22px;font-weight:800;line-height:1;"""),
    # 下载卡右上角蹄铁星：红 → 雾光紫
    (""".dl::after{content:'✦';position:absolute;top:8px;right:11px;
  font-size:13px;color:var(--red);opacity:.75;transform:rotate(12deg)}""",
     """.dl::after{content:'✦';position:absolute;top:8px;right:11px;
  font-size:13px;color:var(--mist);opacity:.85;transform:rotate(12deg)}"""),
    # 点状状态点：绿 → 雾光紫
    ("""  background:var(--green);margin-right:6px;vertical-align:1px;
  box-shadow:none;
}""",
     """  background:var(--mist);margin-right:6px;vertical-align:1px;
  box-shadow:1px 1px 0 var(--ink);
}"""),
    # 步骤序号：红 → 交替，这里改成雾光紫更好看
    ("""  background:var(--red);color:#FDF6E6;
  border:2px solid var(--ink);
  font-size:13px;font-weight:800;""",
     """  background:var(--mist);color:var(--ink);
  border:2px solid var(--ink);
  font-size:13px;font-weight:800;"""),
]


def apply(path, patches, label):
    s = io.open(path, encoding='utf-8').read()
    miss = []
    for old, new in patches:
        if old in s:
            s = s.replace(old, new, 1)
        else:
            miss.append(old.strip().splitlines()[0][:56])
    io.open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print('%-10s %d/%d 处替换  未命中：%s' % (label, len(patches) - len(miss), len(patches),
                                              '、'.join(miss) if miss else '无'))


def main():
    # ---- app.css ----
    s = io.open(APP_CSS, encoding='utf-8').read()
    for old, new in ((APP_LIGHT_OLD, APP_LIGHT_NEW), (APP_DARK_OLD, APP_DARK_NEW),
                     (TINT_LIGHT_OLD, TINT_LIGHT_NEW), (TINT_DARK_OLD, TINT_DARK_NEW)):
        if old in s:
            s = s.replace(old, new, 1)
        else:
            raise SystemExit('令牌块没找到：' + old.strip().splitlines()[0])
    io.open(APP_CSS, 'w', encoding='utf-8', newline='\n').write(s)
    print('令牌写入 web/app.css')
    apply(APP_CSS, APP_PATCHES, 'app.css')

    # ---- 官网 CSS 源 + 注入 ----
    apply(SITE_CSS, SITE_PATCHES, 'site.css')
    css = io.open(SITE_CSS, encoding='utf-8').read()
    html = io.open(SITE_HTML, encoding='utf-8').read()
    st = html.index('<style>')
    en = html.index('</style>')
    html = html[:st] + '<style>\n' + css + '</style>' + html[en + len('</style>'):]
    io.open(SITE_HTML, 'w', encoding='utf-8', newline='\n').write(html)
    print('官网 <style> 已同步')


if __name__ == '__main__':
    main()
