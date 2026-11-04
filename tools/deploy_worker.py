# -*- coding: utf-8 -*-
"""部署 Cloudflare Worker（xxmu-auth）到线上。

用法：
    python tools/deploy_worker.py

令牌来源（按顺序，取到即用）：
    1. 环境变量 CLOUDFLARE_API_TOKEN
    2. 文件 D:\\_cftoken.txt

为什么必须 multipart：
    Worker 是 ES module（源码里有 export default）。直接 PUT 源码，Cloudflare
    会把它当 classic worker 解析，报 `Unexpected token 'export'`（错误码 10021）。
    必须带 metadata part 声明 main_module + compatibility_date，源码 part 的
    content-type 用 application/javascript+module。

为什么三个 secret 不会丢：
    上传 metadata 里的 bindings 只写 kv_namespace。已经存在的 secret_text
    绑定（ADMIN_KEY / SECRET / SIGN_KEY）由 Cloudflare 保留，不用重传。
    上传后务必回读 /bindings 确认四条都在。
"""
import io
import json
import os
import sys
import time
import uuid
import urllib.error
import urllib.request

ACCOUNT_ID = 'ebb7ecfd16008b9e3696ad5b4bc930d7'
KV_NAMESPACE = '02669ca1cef04c5e930d4e3bb2d0d780'
SCRIPT_NAME = 'xxmu-auth'
COMPAT_DATE = '2024-11-01'

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'server', 'worker.js')


def read_token():
    tok = os.environ.get('CLOUDFLARE_API_TOKEN', '').strip()
    if tok:
        return tok
    path = r'D:\_cftoken.txt'
    if os.path.exists(path):
        return open(path, encoding='utf-8').read().strip()
    sys.exit('缺少令牌：设置环境变量 CLOUDFLARE_API_TOKEN，或写入 D:\\_cftoken.txt')


# 实测（本机 Windows + 校园网）：python-urllib 用默认 UA 走 TLS 访问
# api.cloudflare.com 会被间歇性 RST —— 报 ConnectionResetError [WinError 10054]，
# 同一个地址用 PowerShell 或第二次带正常 UA 重试就通。所以这里统一加 UA + 重试，
# 否则部署脚本会随机失败，看着像代码有错。
UA = 'xxmu-deploy/1.0 (+https://xxmu-auth.pages.dev)'


def _open(req, timeout, tries=3):
    last = None
    for i in range(tries):
        try:
            return urllib.request.urlopen(req, timeout=timeout)
        except urllib.error.HTTPError:
            raise                       # 4xx/5xx 是真实响应，不重试
        except Exception as e:          # 网络层错误才重试
            last = e
            time.sleep(1.2 * (i + 1))
    raise last


def api(url, token, data=None, method='GET'):
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Authorization', 'Bearer ' + token)
    req.add_header('User-Agent', UA)
    if data is not None:
        req.add_header('Content-Type', 'application/json')
    try:
        with _open(req, 60) as r:
            return json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return {'success': False, 'http': e.code,
                'body': e.read().decode('utf-8', 'replace')[:800]}


def build_multipart(src_bytes):
    meta = {
        'main_module': 'worker.js',
        'compatibility_date': COMPAT_DATE,
        'bindings': [
            {'type': 'kv_namespace', 'name': 'AUTH', 'namespace_id': KV_NAMESPACE},
        ],
    }
    bnd = '----xxmu' + uuid.uuid4().hex
    buf = io.BytesIO()

    def part(name, filename, ctype, data):
        buf.write(('--%s\r\n' % bnd).encode())
        if filename:
            buf.write(('Content-Disposition: form-data; name="%s"; filename="%s"\r\n'
                       % (name, filename)).encode())
            buf.write(('Content-Type: %s\r\n\r\n' % ctype).encode())
        else:
            buf.write(('Content-Disposition: form-data; name="%s"\r\n\r\n' % name).encode())
        buf.write(data)
        buf.write(b'\r\n')

    part('metadata', None, None, json.dumps(meta).encode())
    part('worker.js', 'worker.js', 'application/javascript+module', src_bytes)
    buf.write(('--%s--\r\n' % bnd).encode())
    return buf.getvalue(), bnd


def main():
    token = read_token()
    src = open(SRC, 'rb').read()
    print('worker.js bytes =', len(src))

    body, bnd = build_multipart(src)
    url = ('https://api.cloudflare.com/client/v4/accounts/%s/workers/scripts/%s'
           % (ACCOUNT_ID, SCRIPT_NAME))
    req = urllib.request.Request(url, data=body, method='PUT')
    req.add_header('Authorization', 'Bearer ' + token)
    req.add_header('User-Agent', UA)
    req.add_header('Content-Type', 'multipart/form-data; boundary=' + bnd)

    try:
        with _open(req, 120) as r:
            out = json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print('上传失败 HTTP', e.code)
        print(e.read().decode('utf-8', 'replace')[:2000])
        return 1

    if not out.get('success'):
        print('上传失败:', json.dumps(out, ensure_ascii=False)[:1500])
        return 1

    res = out.get('result') or {}
    print('上传成功 modified_on =', res.get('modified_on'))
    print('etag =', res.get('etag'))

    # 回读绑定：确认三个 secret 还在
    b = api('https://api.cloudflare.com/client/v4/accounts/%s/workers/scripts/%s/bindings'
            % (ACCOUNT_ID, SCRIPT_NAME), token)
    names = [x.get('name') + ':' + x.get('type') for x in (b.get('result') or [])]
    print('bindings =', ', '.join(names))
    need = {'ADMIN_KEY', 'AUTH', 'SECRET', 'SIGN_KEY'}
    got = {x.get('name') for x in (b.get('result') or [])}
    if not need.issubset(got):
        print('!! 绑定缺失：', need - got, '——请立刻用 secrets API 重设')
        return 1
    print('四条绑定齐全')
    return 0


if __name__ == '__main__':
    sys.exit(main())
