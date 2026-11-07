package com.xxmu.helper;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.GZIPInputStream;

/**
 * 极简 HTTP 客户端。不引第三方库（项目零依赖原则）。
 *
 * 返回值约定：成功 "<HTTP状态码>|<正文>"，异常 "ERR:<异常类>:<消息>"。
 *
 * 关于编码：青果页面是 GBK。这里不做解码判断，而是把字节按 ISO-8859-1 保留
 * 原始字节位；前端负责真正的解码（TextDecoder('utf-8' / 'gbk')，WebView 里可用）。
 * 这样既不丢信息也不用在 Java 侧维护字符集白名单。
 */
final class Http {

    private static final int TIMEOUT = 25000;
    private static final String UA =
            "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

    private Http() {}

    static String get(String url, String cookie) {
        return request(url, null, cookie, null, null);
    }

    /** 兼容旧签名：body 为 null 走 GET，否则走 POST */
    static String request(String url, String body, String cookie,
                          String contentType, String referer) {
        return request(url, body == null ? "GET" : "POST",
                body, cookie, contentType, referer, null);
    }

    /**
     * 通用请求。
     *
     * @param method       GET / POST
     * @param body         已编码好的请求体（urlencoded 字符串或原始文本），null 表示无体
     * @param contentType  Content-Type，null 表示不设
     * @param extraHeaders 附加头，格式 "k: v\nk: v"，可为 null
     */
    static String request(String url, String method, String body, String cookie,
                          String contentType, String referer, String extraHeaders) {
        HttpURLConnection c = null;
        /* 正常读完 = 这条连接可以还回池子（见 finally 的长注释）。 */
        boolean reusable = false;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(TIMEOUT);
            c.setReadTimeout(TIMEOUT);
            c.setRequestProperty("User-Agent", UA);
            c.setRequestProperty("Accept", "*/*");
            c.setRequestProperty("Accept-Language", "zh-CN,zh;q=0.9");
            c.setRequestProperty("Accept-Encoding", "gzip");
            c.setInstanceFollowRedirects(true);
            if (cookie != null && cookie.length() > 0) {
                c.setRequestProperty("Cookie", cookie);
            }
            if (referer != null && referer.length() > 0) {
                c.setRequestProperty("Referer", referer);
            }
            applyExtra(c, extraHeaders);

            String m = (method == null || method.length() == 0)
                    ? (body == null ? "GET" : "POST")
                    : method.toUpperCase(java.util.Locale.ROOT);
            c.setRequestMethod(m);

            /* ============ 只有真的带体才 setDoOutput ============
             *
             * 这是一个曾经把学习通整条抓取链路打死、而且完全不报错的坑：
             *
             *   HttpURLConnection 只要调用了 setDoOutput(true)，就会把请求方法
             *   **静默改成 POST**，哪怕 setRequestMethod("GET") 写在前面也一样。
             *   实测（JDK17，同一个 URL）：
             *     setDoOutput(true)  + method=GET → 实际发出 POST → 学习通 405
             *     不调 setDoOutput    + method=GET → 实际发出 GET  → 学习通 200
             *
             *   而 JS 侧调用时传的是空字符串 ''（不是 null），旧代码判 `body != null`
             *   就成立 → 每一次「GET」请求实际都是 POST → 学习通一律 405。
             *   现象就是同步说明里只有一句「抓取失败 HTTP 405」，看不出任何线索。
             *
             * 所以判据从「body 非 null」改成「这个方法允许带体，且体非空」。
             * GET / HEAD 一律不带体，也不碰 setDoOutput。 */
            boolean withBody = body != null
                    && (body.length() > 0 || "POST".equals(m) || "PUT".equals(m))
                    && !"GET".equals(m) && !"HEAD".equals(m);
            if (withBody) {
                c.setDoOutput(true);
                if (contentType != null && contentType.length() > 0) {
                    c.setRequestProperty("Content-Type", contentType);
                }
                byte[] out = body.getBytes("UTF-8");
                c.setFixedLengthStreamingMode(out.length);
                OutputStream os = c.getOutputStream();
                os.write(out);
                os.flush();
                os.close();
            }
            String out = readResponse(c);   // 内部已把响应流读完并 close
            reusable = true;                // 完整响应：这条连接可以留池复用
            return out;
        } catch (Exception e) {
            return "ERR:" + e.getClass().getSimpleName() + ":" + e.getMessage();
        } finally {
            /* ============ 不要在成功路径上 disconnect ============
             *
             * 学生的体感问题是「更新弹窗要等一两秒才出来」。
             * 那个弹窗背后是 GET /v1/config，它本身只有 2 KB，
             * 服务端也早有 60 秒边缘缓存（x-edge: hit 实测为真），
             * 命中缓存仍要 0.6~1.1 秒 —— 时间几乎全花在 TLS 握手上：
             * 本机实测同一域名的 TLS 段 200~2150ms，而 TTFB 只有 40~90ms。
             *
             * 为什么每次都握手？因为这里以前无条件 c.disconnect()。
             * Android 的 HttpURLConnection.disconnect() 会把底层 socket
             * 从 keep-alive 池里摘掉并关掉，下一次请求就只能重新 TCP+TLS。
             * readResponse() 已经在 finally 里把输入流读完并 close 了，
             * 响应体完整读过、流已关闭，这条连接本来是可以复用的。
             *
             * 所以：正常返回就不碰它，让池子留着；异常路径仍然断
             * （半截响应、超时、reset 的连接不能还给池子）。
             * 这也是 JDK 文档给的标准用法：读了流就别 disconnect。 */
            if (c != null && !reusable) c.disconnect();
        }
    }

    /**
     * multipart/form-data 提交。
     *
     * 为什么需要它：胖乖生活（h5.qiekj.com）的官方前端用 FormData 提交，
     * 内容类型是 multipart；某些 Spring 端点在只收 multipart 时会拒绝
     * urlencoded 请求。这里允许前端按需切换两种编码，谁通就用谁。
     *
     * @param kvBody "k=v&k=v" 形式的已 urlencoded 键值串
     */
    static String postMultipart(String url, String kvBody, String cookie,
                                String referer, String extraHeaders) {
        String boundary = "----XXMU" + Long.toHexString(System.nanoTime());
        StringBuilder sb = new StringBuilder();
        if (kvBody != null && kvBody.length() > 0) {
            for (String pair : kvBody.split("&")) {
                if (pair.length() == 0) continue;
                int eq = pair.indexOf('=');
                String k = eq < 0 ? pair : pair.substring(0, eq);
                String v = eq < 0 ? "" : pair.substring(eq + 1);
                sb.append("--").append(boundary).append("\r\n");
                sb.append("Content-Disposition: form-data; name=\"")
                  .append(urlDecode(k)).append("\"\r\n\r\n");
                sb.append(urlDecode(v)).append("\r\n");
            }
        }
        sb.append("--").append(boundary).append("--\r\n");
        return request(url, "POST", sb.toString(), cookie,
                "multipart/form-data; boundary=" + boundary, referer, extraHeaders);
    }

    private static void applyExtra(HttpURLConnection c, String extraHeaders) {
        if (extraHeaders == null || extraHeaders.length() == 0) return;
        for (String line : extraHeaders.split("\n")) {
            int i = line.indexOf(':');
            if (i <= 0) continue;
            String k = line.substring(0, i).trim();
            String v = line.substring(i + 1).trim();
            if (k.length() > 0) c.setRequestProperty(k, v);
        }
    }

    /** 只解 %XX 与 +，够 multipart 字段用 */
    private static String urlDecode(String s) {
        try {
            return java.net.URLDecoder.decode(s, "UTF-8");
        } catch (Exception e) {
            return s;
        }
    }

    /* ==================== 安装包：流式上传 / 流式下载 ====================
     *
     * 这两个方法存在的唯一理由是「别把 APK 塞进内存」。
     * 一个 8 MB 的包如果走 byte[] 再 base64，峰值会到 30 MB 以上，
     * WebView 进程很容易被系统杀掉。这里全程用 64 KiB 缓冲区倒腾。
     */

    /**
     * 把本地文件作为请求体 POST 上去。
     *
     * 用 setFixedLengthStreamingMode(文件长度) 而不是 chunked：
     * Cloudflare 对 chunked 上传的支持要绕一圈，而长度我们一开始就知道。
     *
     * @param adminKey 管理员口令，放 X-Admin-Key 头（与其它管理接口一致）
     */
    static String uploadFile(String url, java.io.File f, String adminKey) {
        HttpURLConnection c = null;
        java.io.FileInputStream in = null;
        /* v1.1.15：OutputStream 也要进 finally。
         * 原来只在成功路径 `os.close()`，异常路径（弱网最常见：120 秒读超时、
         * 连接被切、文件被并发删）只剩 finally 里的 in.close() 和 disconnect()。
         * HttpURLConnection.disconnect() 在请求体没写完时只是把连接标记为
         * 「可复用/丢弃」，不保证关闭底层 socket 的写端 —— 半开连接会攒下来，
         * 重试几次后就 fd 耗尽，之后整个 App 的网络与文件功能一起失效，
         * 而现象是「上传老是失败」，完全指不到 fd。 */
        OutputStream os = null;
        try {
            if (f == null || !f.isFile()) return "ERR:NoFile:文件不存在";
            long len = f.length();
            if (len <= 0) return "ERR:EmptyFile:文件是空的";

            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(20000);
            // 上传比下载慢得多：4G 上传 8 MB 要几十秒，给足时间。
            c.setReadTimeout(120000);
            c.setRequestMethod("POST");
            c.setRequestProperty("User-Agent", UA);
            c.setRequestProperty("Accept", "*/*");
            c.setRequestProperty("Content-Type", "application/octet-stream");
            if (adminKey != null && adminKey.length() > 0) {
                c.setRequestProperty("X-Admin-Key", adminKey);
            }
            c.setDoOutput(true);
            c.setFixedLengthStreamingMode(len);

            os = c.getOutputStream();
            in = new java.io.FileInputStream(f);
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            os.flush();
            os.close();
            os = null;              /* 已正常关闭，finally 不再重复关 */
            in.close();
            in = null;
            return readResponse(c);
        } catch (Exception e) {
            return "ERR:" + e.getClass().getSimpleName() + ":" + e.getMessage();
        } finally {
            if (os != null) { try { os.close(); } catch (Exception ignored) {} }
            if (in != null) { try { in.close(); } catch (Exception ignored) {} }
            if (c != null) c.disconnect();
        }
    }

    /**
     * 把本地文件作为请求体上传，不需要任何管理口令（校园图片走这条）。
     *
     * 与 uploadFile 的区别只有两点：
     *   1. 不塞 X-Admin-Key（上传图片是普通学生行为）
     *   2. Content-Type 由调用方给（图片要带 image/jpeg，服务端才好判）
     * 其余（长度先行、64 KiB 缓冲、不走 chunked）完全一样。
     *
     * 为什么要单独的流式方法而不是 base64 走 postMultipart：
     * 一张 1.5 MB 的图 base64 之后是 2 MB，加上 JS 里那份字符串和
     * WebView 桥的又一次拷贝，峰值能吃掉 6 MB 堆——低端机很容易被系统杀掉。
     * 这里字节从不进 JS，只传一个文件路径。
     */
    static String uploadRaw(String url, java.io.File f, String contentType) {
        HttpURLConnection c = null;
        java.io.FileInputStream in = null;
        OutputStream os = null;      /* v1.1.15：异常路径也要关，见 uploadFile 的说明 */
        try {
            if (f == null || !f.isFile()) return "ERR:NoFile:文件不存在";
            long len = f.length();
            if (len <= 0) return "ERR:EmptyFile:文件是空的";

            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(20000);
            c.setReadTimeout(90000);
            c.setRequestMethod("POST");
            c.setRequestProperty("User-Agent", UA);
            c.setRequestProperty("Accept", "*/*");
            c.setRequestProperty("Content-Type",
                    contentType == null || contentType.length() == 0
                            ? "application/octet-stream" : contentType);
            c.setDoOutput(true);
            c.setFixedLengthStreamingMode(len);

            os = c.getOutputStream();
            in = new java.io.FileInputStream(f);
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            os.flush();
            os.close();
            os = null;
            in.close();
            in = null;
            return readResponse(c);
        } catch (Exception e) {
            return "ERR:" + e.getClass().getSimpleName() + ":" + e.getMessage();
        } finally {
            if (os != null) { try { os.close(); } catch (Exception ignored) {} }
            if (in != null) { try { in.close(); } catch (Exception ignored) {} }
            if (c != null) c.disconnect();
        }
    }

    /**
     * 下载到文件。返回写入的字节数。
     *
     * 不做任何编码转换 —— 二进制原样落盘。也不跟随跳转，
     * 因为 Pages 代理不跳转；万一以后加了跳转，走 redirect 会更明确。
     */
    static long downloadToFile(String url, java.io.File dst) throws Exception {
        return downloadToFile(url, dst, null);
    }

    /* ==================== 分段并发下载 ====================
     *
     * 为什么值得为 480 KB 的包写这个（v1.1.4）：
     *   这条线路**单条连接被限速**。实测（同一时刻、同一个包）：
     *     单流          1.59 s   ≈ 300 KB/s
     *     2 段并发      1.17 s
     *     4 段并发      1.02 s
     *     8 段并发      0.87 s   ≈ 560 KB/s
     *     12 段并发     0.85 s（不再变快，说明到顶了）
     *   20 条并发各下整包时聚合到 6.2 MB/s —— 说明限制是「每连接」而不是
     *   「每客户端」也不是服务端总带宽。所以把一个大文件拆成若干段同时拉，
     *   总耗时就按段数往下掉。学生那边是移动网络，单流更慢，收益更大。
     *
     * 为什么不是无脑 N 段：
     *   每条连接都要重新 TLS 握手 + 走一遍边缘路由，段数一多，握手开销会
     *   把这部分收益吃掉（实测 12 段已经不比 8 段快）。定 4 段是因为
     *   1.59 s → 1.02 s 拿到了七成收益，而连接数只有 8 段的一半，
     *   在弱网（丢包、握手慢）下更稳。
     *
     * 为什么必须有退路：
     *   Range 是服务端的能力，不是我们能假定的。老版 Worker、或者将来换了
     *   托管方式，都可能只给 200 全量。所以先用 1 字节探一次，拿不到 206
     *   就老老实实退回单流。**分段的正确性依赖 sha256 校验**——调用方必须
     *   校验总长和哈希，否则半截包会被当成好包装进系统。
     */
    private static final int SEGMENTS = 4;

    /**
     * @param onProgress 已下载字节数 / 总字节数（总长未知时 total 为 -1）；可为 null
     */
    static long downloadToFile(String url, java.io.File dst,
                               final Progress onProgress) throws Exception {
        long total = probeLength(url);
        if (total <= 0) {
            // 服务端不给 Range（或这个包太小，分段没意义）：单流老路。
            return downloadSingle(url, dst, onProgress);
        }

        final int n = (total < 256 * 1024) ? 1 : SEGMENTS;
        if (n == 1) return downloadSingle(url, dst, onProgress);

        /* 每段的 [起, 止] 与读取游标。
         *
         * 游标为什么是数组而不是一个 AtomicLong 累加器：分段中断时那段已经
         * 收下的字节已经写进文件，续传会从游标重新要同一批字节 —— 用累加器
         * 就把这批字节数了两遍，界面百分比能冲到 120%。改成「进度 = 各段游标
         * 相对起点的增量之和」，天然幂等。 */
        final long[] segFrom = new long[n];
        final long[] segTo = new long[n];
        final long[] cursor = new long[n];
        long per = (total + n - 1) / n;
        int used = 0;
        for (int i = 0; i < n; i++) {
            long a = i * per;
            long b = Math.min(total - 1, a + per - 1);
            if (a > b) break;
            segFrom[i] = a;
            segTo[i] = b;
            cursor[i] = a;
            used++;
        }

        final int segs = used;
        final java.io.RandomAccessFile raf = new java.io.RandomAccessFile(dst, "rw");
        try {
            raf.setLength(total);
            final java.util.concurrent.atomic.AtomicReference<Exception> err =
                    new java.util.concurrent.atomic.AtomicReference<Exception>(null);

            java.util.List<Thread> ts = new java.util.ArrayList<Thread>();
            for (int i = 0; i < segs; i++) {
                final int seg = i;
                Thread t = new Thread(new Runnable() {
                    public void run() {
                        /* 单段最多试 3 次。为什么要重试：学生用的是移动网络，
                         * 截图里那条状态栏是 0.41 KB/s —— 这时单个分段中途
                         * 被掐断（RST、切基站、进电梯）是常态，整包重下等于
                         * 把已经下完的另外三段一起扔掉。
                         * 重试是**续传**：从 cursor[seg] 接着要，而不是回到起点。 */
                        for (int attempt = 0; attempt < 3; attempt++) {
                            if (cursor[seg] > segTo[seg]) return;   // 已经拿全了
                            try {
                                fetchRange(url, raf, cursor, segFrom, segTo, seg, total, onProgress);
                                if (cursor[seg] > segTo[seg]) return;
                                throw new Exception("分段没拿全，还差 "
                                        + (segTo[seg] - cursor[seg] + 1) + " 字节");
                            } catch (Exception e) {
                                if (attempt == 2) { err.compareAndSet(null, e); return; }
                                try { Thread.sleep(500L * (attempt + 1)); }
                                catch (InterruptedException ie) {
                                    Thread.currentThread().interrupt();
                                    err.compareAndSet(null, e);
                                    return;
                                }
                            }
                        }
                    }
                }, "xxmu-seg" + i);
                t.setDaemon(true);
                ts.add(t);
                t.start();
            }
            for (Thread t : ts) {
                while (t.isAlive()) {
                    try { t.join(); } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
            if (err.get() != null) throw err.get();
            return total;
        } finally {
            try { raf.close(); } catch (Exception ignored) {}
        }
    }

    /** 进度回调（在下载线程上调用，实现方自己切回 UI 线程） */
    interface Progress {
        void on(long got, long total);
    }

    /**
     * 探一次总长。返回 -1 表示服务端不支持 Range（或没给出 content-range）。
     *
     * 用 "bytes=0-0" 而不是 HEAD：HEAD 在 Cloudflare 上不一定被正确处理，
     * 而 Range 请求本身就能拿到 content-range: bytes 0-0/TOTAL。
     */
    private static long probeLength(String url) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setRequestProperty("User-Agent", UA);
            c.setRequestProperty("Accept", "*/*");
            c.setRequestProperty("Accept-Encoding", "identity");
            c.setRequestProperty("Range", "bytes=0-0");
            int code = c.getResponseCode();
            if (code != 206) return -1;
            String cr = c.getHeaderField("Content-Range");
            if (cr == null) return -1;
            int slash = cr.lastIndexOf('/');
            if (slash < 0) return -1;
            return Long.parseLong(cr.substring(slash + 1).trim());
        } catch (Exception e) {
            return -1;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /**
     * 从 cursor[seg] 拉到 segTo[seg]，边拉边推进游标。
     *
     * readTimeout 只有 25 秒（不是单流那 120 秒）：截图里的现场是 0.41 KB/s，
     * 这种连接不是「慢」而是「僵」—— 一个 read 卡住不动，等 120 秒才超时，
     * 用户看到的就是按钮一直停在「下载中…」。25 秒拿不到新字节就认输，
     * 交给上层重试（重试是续传，不是从头来）。
     */
    private static void fetchRange(String url, java.io.RandomAccessFile raf,
                                   long[] cursor, long[] segFrom, long[] segTo,
                                   int seg, long total, Progress onProgress) throws Exception {
        long from = cursor[seg];
        long to = segTo[seg];
        HttpURLConnection c = null;
        InputStream in = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(25000);
            c.setRequestProperty("User-Agent", UA);
            c.setRequestProperty("Accept", "*/*");
            c.setRequestProperty("Accept-Encoding", "identity");
            c.setRequestProperty("Range", "bytes=" + from + "-" + to);
            int code = c.getResponseCode();
            if (code != 206) throw new Exception("分段请求返回 HTTP " + code);
            /* 不解析 content-range 右端去"修正" to：读循环本来就只读到流结束，
             * 服务端少给了多少，上层看到 cursor[seg] <= segTo[seg] 就会再要一次。
             * 多写一段解析反而要关心边界，出错时更难查。 */
            in = c.getInputStream();
            byte[] buf = new byte[32 * 1024];
            long pos = from;
            int n;
            while ((n = in.read(buf)) > 0) {
                synchronized (raf) {
                    raf.seek(pos);
                    raf.write(buf, 0, n);
                }
                pos += n;
                cursor[seg] = pos;
                if (onProgress != null) onProgress.on(downloaded(cursor, segFrom), total);
            }
            cursor[seg] = pos;
        } finally {
            if (in != null) { try { in.close(); } catch (Exception ignored) {} }
            if (c != null) c.disconnect();
        }
    }

    /** 各段游标相对各自起点的增量之和（幂等，可以在任意时刻调用） */
    private static long downloaded(long[] cursor, long[] segFrom) {
        long sum = 0;
        for (int i = 0; i < cursor.length; i++) {
            long d = cursor[i] - segFrom[i];
            if (d > 0) sum += d;
        }
        return sum;
    }

    /** 单流下载（原实现，保留作为 Range 不可用时的退路） */
    private static long downloadSingle(String url, java.io.File dst,
                                       Progress onProgress) throws Exception {
        HttpURLConnection c = null;
        InputStream in = null;
        java.io.FileOutputStream out = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(20000);
            c.setReadTimeout(120000);
            c.setRequestProperty("User-Agent", UA);
            c.setRequestProperty("Accept", "*/*");
            c.setRequestProperty("Accept-Encoding", "identity");   // 不要 gzip，直接落盘
            c.setInstanceFollowRedirects(true);
            int code = c.getResponseCode();
            if (code >= 400) {
                throw new Exception("HTTP " + code);
            }
            long total = c.getContentLength();
            in = c.getInputStream();
            out = new java.io.FileOutputStream(dst);
            byte[] buf = new byte[64 * 1024];
            long acc = 0;
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                acc += n;
                if (onProgress != null) onProgress.on(acc, total);
            }
            out.flush();
            return acc;
        } finally {
            if (out != null) { try { out.close(); } catch (Exception ignored) {} }
            if (in != null) { try { in.close(); } catch (Exception ignored) {} }
            if (c != null) c.disconnect();
        }
    }

    private static String readResponse(HttpURLConnection c) throws Exception {
        int code = c.getResponseCode();
        InputStream in;
        try {
            in = c.getInputStream();
        } catch (Exception e) {
            in = c.getErrorStream();
        }
        if (in == null) return code + "|";
        /* 关流必须放 finally。
         *
         * 原来 `in.close()` 排在读循环之后：读循环里抛异常（连接被 reset、
         * SocketTimeout、OOM）就跳过了 close，底层 socket 与 fd 留在进程里。
         * 而这个方法是**每一次** HTTP 请求的收尾，泄漏随请求数线性累积，
         * 最后 openInputStream 抛 "Too many open files"，整个 App 的网络
         * 功能一起失效 —— 而且症状是「用一会儿就连不上」，极难归因。
         * gzip 那层包在外层，关外层即可连带关掉内层。 */
        try {
            String enc = c.getContentEncoding();
            if (enc != null && enc.toLowerCase().contains("gzip")) {
                in = new GZIPInputStream(in);
            }
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            byte[] raw = bo.toByteArray();

            // 原样保留字节位：每个 char 对应一个 byte。真正的解码交给前端
            //（青果是 GBK，前端用 TextDecoder('gbk') 解），避免 Java 侧猜错编码。
            return code + "|" + new String(raw, "ISO-8859-1");
        } finally {
            try { in.close(); } catch (Throwable ignored) {}
        }
    }

    /** 直接返回 UTF-8 文本（不需要字节位保留的场景） */
    static String text(String resp) {
        if (resp == null) return "";
        int i = resp.indexOf('|');
        if (i < 0) return resp;
        String body = resp.substring(i + 1);
        try {
            return new String(body.getBytes("ISO-8859-1"), "UTF-8");
        } catch (Exception e) {
            return body;
        }
    }

    /* ==================== 整包校验 ====================
     *
     * 为什么必须有这个（v1.1.8）：
     * 分段下载的正确性依赖「每段都完整、且拼起来是原文件」。上面的 fetchRange
     * 只校验了每段的字节数（cursor 走满 segTo），但那只保证长度对 ——
     * 如果中间某段因为续传写错位置、或者服务端在发版瞬间换了包里的一截，
     * 长度照样能对上，字节却是错的。安装器不会替你验，它只认签名：
     * 一个字节错位的包 apksigner 当场拒绝，可要是错在 zip 的未签名区域
     * （比如 assets 里的 JS），签名照样过，学生装上一个半坏的 App。
     *
     * 原来调用方只判 `out.length() > 1024`，等于「有 1 KB 就算下载成功」。
     * 现在服务端在 /v1/config 的 latest.sha256 里给了整包哈希，
     * 下载完算一遍比对，不一致就删文件报错，绝不交给安装器。
     *
     * 用流式 DigestInputStream 而不是 readAllBytes：包可能几十 MB，
     * 一次性读进内存会在低端机上直接 OOM，而这个方法恰恰要在低端机上可靠。
     */
    static String sha256(java.io.File f) {
        if (f == null || !f.exists() || f.length() <= 0) return "";
        java.io.InputStream in = null;
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
            in = new java.io.FileInputStream(f);
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
            byte[] d = md.digest();
            StringBuilder sb = new StringBuilder(d.length * 2);
            for (byte b : d) {
                int v = b & 0xff;
                if (v < 16) sb.append('0');
                sb.append(Integer.toHexString(v));
            }
            return sb.toString();
        } catch (Throwable e) {
            return "";
        } finally {
            try { if (in != null) in.close(); } catch (Throwable ignored) {}
        }
    }
}
