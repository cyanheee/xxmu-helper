// 河医大助手 · Pages 反向代理（Cloudflare Pages Functions）
//
// 为什么需要这一层：
//   Worker 已经部署成功，真实地址是 https://xxmu-auth.yg-xxmu.workers.dev
//   但 *.workers.dev 在国内被 DNS 污染：
//     A    记录 → 199.59.149.202      （无关 IP）
//     AAAA 记录 → 2a03:2880:f112:83:face:b00c:0:25de（face:b00c 是 Facebook 的标志段）
//   所以学生手机根本连不上，TCP 443 直接超时。
//
//   而 *.pages.dev 解析正常（172.66.44.138，国内可直接访问）。
//
// 做法：把这份极薄的代理挂到 Pages 上。学生访问
//     https://<项目>.pages.dev/v1/xxx
// Pages 边缘在 Cloudflare 内网去取 workers.dev，再把结果原样返回。
// 内网到内网不受国内 DNS 污染影响。
//
// 好处：Pages 这边**不需要配任何 KV、不需要任何密钥**。
//       真正的业务逻辑、数据、密钥全在 Worker 上，
//       以后换 Worker、改配置，这里一个字都不用动。

const UPSTREAM = 'https://xxmu-auth.yg-xxmu.workers.dev';

/* 透传真实客户端 IP 用的头。
 *
 * 为什么必须这么做：Pages Functions 调 fetch() 去 workers.dev 时，
 * 那次子请求是 Cloudflare 内网发起的，到了 Worker 眼里
 * `cf-connecting-ip` 变成 `2a06:98c0:3600::103`（Cloudflare 自己的地址），
 * **学生手机的 IP 完全丢失**。Worker 里所有按 IP 分桶的限流于是退化成
 * 「全校共用一个桶」——实测把 /v1/activate 限到 20 次/10 分钟之后，
 * 全校第 21 台设备就再也激活不了。不是慢，是直接不能用。
 *
 * 做法：在这里把真实 IP 读出来（Pages 这一层还看得见），塞进自定义头带给上游。
 * 上游只在这个标记头存在时才信 x-xxmu-ip，否则用 cf-connecting-ip。
 *
 * 说清楚它的强度：这不是认证，只是一个「这头是我加的」标记，
 * 能自己构造请求的人照样能伪造。IP 限流本来就只挡无脑脚本，不挡有心人；
 * 真正兜底的是 fp 限流 + KV 条数硬上限 + 单请求体积上限。 */
const IP_TAG = 'xxmu-pages-proxy-v1';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type,x-admin-key',
  'access-control-allow-methods': 'GET,POST,OPTIONS'
};

export default {
  async fetch(request, env, ctx) {
    const u = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    /* v1.1.18：这里是「API 代理 + 官网静态页」两个职责，必须按路径分开。
     *
     * 原来这份 _worker.js 会接管**所有**请求，一律转发到 workers.dev。
     * 那样一来在 dist/ 里放 index.html 也永远不会被访问到 ——
     * 传到 Cloudflare 的静态文件会被 Functions 抢在前面，
     * 浏览器打开首页拿到的是 Worker 的 JSON（`{"ok":true,"name":"xxmu-auth"}`）。
     *
     * 规则：只有 /v1/ 开头（以及少数几个明确是接口的路径）才走代理，
     * 其余全部交给 Pages 的静态资源。这样加官网不用动代理逻辑，
     * 也不会有一天不小心把 API 挡在静态文件后面。
     *
     * 用 env.ASSETS 是 Pages Functions 提供的静态资源绑定；
     * 万一没绑定（很老的运行时），退回 fetch(request) 让平台自己处理。 */
    const p = u.pathname;
    /* 只有 `/v1/` 开头才是接口。注意根路径 `/` **不是** API ——
     * 那正是官网首页。Worker 自己的根路径接口（返回 name/ver）
     * 只在直连 workers.dev 时有人用，经 Pages 的根路径一律当官网。 */
    const apiPath = p.indexOf('/v1/') === 0;

    if (!apiPath) {
      if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        /* v1.1.18：静态资源这一支要把 404 修对。
         *
         * 直接 `return env.ASSETS.fetch(request)` 时，Pages 对不存在的路径会
         * 回落到 index.html 并给 **200** —— 单页应用常见做法，但对本站是错的：
         * 这不是 SPA，只有一个页面，随便编个路径也返回 200 会让搜索引擎
         * 把一堆乱七八糟的 URL 当成有效页收录，也让人分不清「路径写错」和
         * 「页面正常」。
         *
         * 规则：只认 `/` 与 `/index.html` 是首页；其它静态路径如果拿回来
         * 的仍是那个 index.html（说明没命中真实文件），改判 404。 */
        const r = await env.ASSETS.fetch(request);
        const isHome = (p === '/' || p === '/index.html');
        if (!isHome && r.ok) {
          const ct = (r.headers.get('content-type') || '').toLowerCase();
          /* 命中了真文件（图片/css/js）就原样返回。只有「拿回了 HTML
           * 但请求的不是首页」才是回落，判 404。 */
          if (ct.indexOf('text/html') >= 0) {
            return new Response('页面不存在（404）。回首页：/', {
              status: 404,
              headers: { 'content-type': 'text/plain; charset=utf-8' },
            });
          }
        }
        return r;
      }
      /* 没有 ASSETS 绑定时的兜底：直接打上游会返回 JSON，对浏览器是坏体验；
       * 这里明确告诉调用方「静态资源没绑定」，而不是悄悄给一段 JSON。 */
      return new Response('static assets binding missing', {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    const target = UPSTREAM + u.pathname + u.search;

    // 复制请求头，但去掉这些由边缘重新生成/会干扰上游路由的头
    const headers = new Headers(request.headers);
    ['host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray',
     'cf-visitor', 'x-forwarded-proto', 'x-real-ip',
     'content-length'].forEach(function (k) { headers.delete(k); });

    /* 把真实客户端 IP 带过内网这一跳（原因见文件顶部 IP_TAG 的注释）。 */
    const ip = String(request.headers.get('cf-connecting-ip') || '').trim();
    if (ip) {
      headers.set('x-xxmu-ip', ip);
      headers.set('x-xxmu-via', IP_TAG);
    }

    const init = { method: request.method, headers: headers, redirect: 'manual' };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      /* v1.1.9：读 body 也要兜住。
       *
       * 原来这一行 `init.body = await request.arrayBuffer();` 裸露在 try 外。
       * 上传被掐断、客户端提前关连接、或者超了平台体积上限时，这一行会抛，
       * 异常直接冒到 Pages 运行时 → 返回平台默认的 500 HTML 页。
       * 客户端（MainActivity 的上传线程）拿到的是一坨 HTML，按 `|` 拆不开，
       * 于是整串当成错误消息弹给学生：「上传失败：<!DOCTYPE html>...」。
       * 现在明确回 413 + JSON，客户端那条 `j.optString("msg")` 才有东西可读。 */
      try {
        init.body = await request.arrayBuffer();
      } catch (e) {
        return new Response(JSON.stringify({
          ok: false,
          msg: '上传内容读取失败（可能传输中断或超出大小上限），请重试一次',
          error: 'body'
        }), {
          status: 413,
          headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, CORS)
        });
      }
    }

    let r;
    try {
      r = await fetch(target, init);
    } catch (e) {
      return new Response(JSON.stringify({
        success: false, error: 'upstream', detail: String(e)
      }), {
        status: 502,
        headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, CORS)
      });
    }

    const out = new Headers();
    // 只透传业务需要的响应头，其余（CSP / X-Frame-Options 之类）丢弃。
    // content-disposition / content-length 是给 /v1/apk 下载用的：少了它们
    // 浏览器存下来的文件名会变成路径最后一段（"apk"），也没有下载进度。
    // accept-ranges / content-range 是分段下载（206）用的：上游会按 Range
    // 返回一段，这一层如果把 content-range 丢了，客户端拿到 206 却不知道
    // 这段是哪一段，拼不起来，只能退化成单流——那就等于没做分段。
    // x-edge 是上游 Cache API 的命中标记（hit/miss），留着它才能在线上
    // 直接验证「边缘缓存到底生效没生效」，否则只能靠猜。
    ['content-type', 'cache-control', 'content-disposition',
     'content-length', 'content-encoding',
     'accept-ranges', 'content-range', 'etag', 'x-edge',
     'x-apk-sha256', 'x-apk-ver'].forEach(function (k) {
      const v = r.headers.get(k);
      if (v) out.set(k, v);
    });
    Object.keys(CORS).forEach(function (k) { out.set(k, CORS[k]); });

    return new Response(r.body, { status: r.status, headers: out });
  }
};
