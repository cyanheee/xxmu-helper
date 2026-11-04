# -*- coding: utf-8 -*-
"""解析青果(KINGOSOFT)导出的课表 HTML/xls，转成结构化 JSON。"""
import re, json, sys

def parse(html):
    """返回 [{day, period, courses:[{name, teacher, weeks, room}]}]"""
    out = []
    # 每个单元格: <div class='div1' id='kXY'> ... <span class="xkinfo">...</span>
    for m in re.finditer(r"class='div1'\s+id='k(\d)(\d)'\s*>(.*?)</div>\s*</td>", html, re.S):
        day, period, body = int(m.group(1)), int(m.group(2)), m.group(3)
        courses = []
        for c in re.finditer(r"<div style='padding-bottom:5px;clear:both;'>"
                             r"<font style='font-weight: bolder'>(.*?)</font><br>"
                             r"(.*?)<br>(.*?)<br>(.*?)</div>", body, re.S):
            name = clean(c.group(1))
            teacher = clean(c.group(2))
            weeks = clean(c.group(3))
            room = clean(c.group(4))
            courses.append({"name": name, "teacher": teacher,
                            "weeks": weeks, "room": room})
        if courses:
            out.append({"day": day, "period": period, "courses": courses})
    return out

def clean(s):
    s = re.sub(r'<[^>]+>', '', s)
    s = s.replace('&nbsp;', ' ').replace('\u3000', ' ')
    return re.sub(r'\s+', ' ', s).strip()

if __name__ == "__main__":
    html = open(sys.argv[1], 'rb').read().decode('gbk', 'replace')
    data = parse(html)
    print(json.dumps(data, ensure_ascii=False, indent=1)[:2000])
    print("cells:", len(data), "courses:", sum(len(x['courses']) for x in data))
