# -*- coding: utf-8 -*-
"""把青果课表单元格规整成：每门课 -> 星期/节次/周次列表"""
import re

def parse_weeks(s):
    """'10-12[1-2]' -> (weeks=[10,11,12], periods=[1,2])"""
    m = re.match(r'([\d,\-]+)\[([\d\-]+)\]', s.strip())
    if not m: return [], []
    weeks = []
    for part in m.group(1).split(','):
        part = part.strip()
        if not part: continue
        if '-' in part:
            a, b = part.split('-')[:2]
            weeks += list(range(int(a), int(b)+1))
        else:
            weeks.append(int(part))
    periods = []
    for part in m.group(2).split(','):
        part = part.strip()
        if '-' in part:
            a, b = part.split('-')[:2]
            periods += list(range(int(a), int(b)+1))
        else:
            periods.append(int(part))
    return sorted(set(weeks)), sorted(set(periods))

def normalize(cells):
    out = []
    for cell in cells:
        for c in cell['courses']:
            w, p = parse_weeks(c['weeks'])
            out.append({
                'name': c['name'], 'teacher': c['teacher'], 'room': c['room'],
                'day': cell['day'], 'weeks': w, 'periods': p,
                'raw_weeks': c['weeks'],
            })
    return out

if __name__ == '__main__':
    import json, sys
    d = json.load(open(sys.argv[1]))
    n = normalize(d['cells'])
    d['courses'] = n
    json.dump(d, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
    print('normalized', len(n))
