# -*- coding: utf-8 -*-
"""青果(KINGOSOFT)教务平台客户端：登录 + 课表 + 成绩。
接口：https://qgjw.xxmu.edu.cn  （校外可直连，无需 VPN）
"""
import urllib.request, urllib.parse, re, json, os, base64, subprocess, hashlib, time

BASE = "https://qgjw.xxmu.edu.cn"
UA = ("Mozilla/5.0 (Linux; Android 14; PLK110) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36")
HERE = os.path.dirname(os.path.abspath(__file__))
SESS = os.path.join(HERE, "..", "data", "session.json")
SECRET = os.path.join(HERE, "..", "secrets.json")

def _h(cookie=""):
    h = {"User-Agent": UA, "Accept": "*/*"}
    if cookie:
        h["Cookie"] = cookie
        h["Referer"] = BASE + "/frame/homes.action"
        h["X-Requested-With"] = "XMLHttpRequest"
    return h

def get(path, cookie="", referer=None, timeout=25):
    h = _h(cookie)
    if referer: h["Referer"] = referer
    r = urllib.request.Request(BASE + path, headers=h)
    return urllib.request.urlopen(r, timeout=timeout).read()

def get_gbk(path, cookie="", referer=None):
    return get(path, cookie, referer).decode("gbk", "replace")

def _node_bin():
    """找 node 可执行文件：环境变量 XXMU_NODE > PATH > 常见安装路径。"""
    import shutil as _sh
    cand = os.environ.get("XXMU_NODE")
    if cand and os.path.exists(cand):
        return cand
    p = _sh.which("node")
    if p:
        return p
    for c in (r"C:\Program Files\nodejs\node.exe",
              r"C:\Program Files (x86)\nodejs\node.exe",
              "/usr/bin/node", "/usr/local/bin/node",
              "/data/data/com.termux/files/usr/bin/node"):
        if os.path.exists(c):
            return c
    return "node"  # 交给 subprocess 报错

# ---------------- 登录 ----------------
def _enc_params(params, deskey, ts):
    """调 node 复现青果的 DES + md5 token"""
    payload = json.dumps({"s": params, "k": deskey, "ts": ts})
    js = r'''
const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const s={console};vm.createContext(s);
for(const f of ['base64.js','md5.js','jkingo.des.js'])
  vm.runInContext(fs.readFileSync(f,'latin1'),s);
const i=JSON.parse(fs.readFileSync(0,'utf8'));
const md5=x=>crypto.createHash('md5').update(x,'utf8').digest('hex');
const enc=s.base64encode(s.strEnc(i.s,i.k,null,null));
const token=md5(md5(i.s)+md5(i.ts));
process.stdout.write(JSON.stringify({enc,token}));
'''
    root = HERE
    r = subprocess.run([_node_bin(), "-e", js], cwd=root,
                       input=payload, capture_output=True, text=True,
                       encoding="utf-8")
    if r.returncode != 0:
        raise RuntimeError("node 加密失败: " + (r.stderr or "")[:300])
    return json.loads(r.stdout)

def login(user, pwd, captcha=None, cookie_jar=None):
    """返回 cookie 字符串。captcha=None 时只取验证码图，返回 (None, img_bytes)"""
    import http.cookiejar
    cj = cookie_jar or http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    if captcha is None:
        # 第一步：建立会话 + 取验证码
        html = op.open(urllib.request.Request(BASE + "/", headers=_h()), timeout=20)\
                 .read().decode("gbk", "replace")
        sid = re.search(r'_sessionid = "([^"]+)"', html).group(1)
        ssid = re.search(r'_ssessionid = "([^"]+)"', html).group(1)
        img = op.open(urllib.request.Request(BASE + "/cas/genValidateCode?v=1",
                                             headers=_h()), timeout=20).read()
        return None, img, (cj, sid, ssid)
    # 第二步：复用已有会话（不能再访问首页，否则 sessionid 会变、验证码作废）
    sid = ssid = next((c.value for c in cj if c.name == "JSESSIONID"), "")
    tk = op.open(urllib.request.Request(BASE + "/frame/homepage?method=getTempDeskey",
                                        headers=_h()), timeout=20).read().decode()
    ts = op.open(urllib.request.Request(BASE + "/frame/homepage?method=getTempNowtime",
                                        headers=_h()), timeout=20).read().decode()
    # 密码算法：md5(md5(pwd) + md5(captcha))
    pwd_enc = hashlib.md5(
        (hashlib.md5(pwd.encode()).hexdigest() +
         hashlib.md5(captcha.lower().encode()).hexdigest()).encode()
    ).hexdigest()
    params = (f"_u{captcha}={base64.b64encode((user+';;'+sid).encode()).decode()}"
              f"&_p{captcha}={pwd_enc}&randnumber={captcha}"
              "&isPasswordPolicy=false&txt_mm_expression=&txt_mm_length="
              "&txt_mm_userzh=&hid_flag=&hidlag=1&hid_dxyzm=")
    enc = _enc_params(params, tk, ts)
    body = (f"params={urllib.parse.quote(enc['enc'], safe='')}"
            f"&token={enc['token']}&timestamp={urllib.parse.quote(ts, safe='')}"
            f"&deskey=&ssessionid={ssid}")
    h2 = _h(); h2["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
    r = op.open(urllib.request.Request(BASE + "/cas/logon.action",
                                       data=body.encode(), headers=h2, method="POST"),
                timeout=25)
    resp = json.loads(r.read().decode("utf-8", "replace"))
    if resp.get("status") != "200":
        raise RuntimeError("登录失败: " + resp.get("message", "?"))
    cookie = "; ".join(f"{c.name}={c.value}" for c in cj)
    return cookie, None, (cj, sid, ssid)

def save_session(cookie):
    os.makedirs(os.path.dirname(SESS), exist_ok=True)
    json.dump({"cookie": cookie, "ts": int(time.time())}, open(SESS, "w"))
    os.chmod(SESS, 0o600)

def load_session():
    try:
        return json.load(open(SESS))["cookie"]
    except Exception:
        return None

# ---------------- 课表 ----------------
def fetch_schedule(cookie, user, xn="2026", xq="0"):
    """返回原始 HTML（青果课表二维表）"""
    p = f"xn={xn}&xq={xq}&xh={user}"
    b64 = base64.b64encode(p.encode()).decode()
    path = "/student/wsxk.xskcb_excel10319.jsp?params=" + urllib.parse.quote(b64)
    ref = BASE + "/student/xkjg.wdkb.jsp?menucode=S20301"
    return get_gbk(path, cookie, ref)

if __name__ == "__main__":
    import sys
    ck = load_session()
    if not ck:
        print("没有 session，请先登录")
        sys.exit(1)
    html = fetch_schedule(ck, "20261440105")
    print("len", len(html))
    print(html[:200])
