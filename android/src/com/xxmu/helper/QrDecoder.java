package com.xxmu.helper;

import android.graphics.Bitmap;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.Binarizer;
import com.google.zxing.DecodeHintType;
import com.google.zxing.common.GlobalHistogramBinarizer;
import com.google.zxing.InvertedLuminanceSource;
import com.google.zxing.LuminanceSource;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * 二维码解码（Java 侧，ZXing）。
 *
 * ============ 为什么这个类被重写过两次 ============
 *
 * v0.9.5 之前：Java 把相册图压到长边 1000px / JPEG 88，再交前端 jsQR。
 *   二维码靠黑白模块边界的锐利度识别，缩图 + JPEG 量化把模块糊成灰过渡带，
 *   结果用户对着饮水机屏幕拍得很清楚也认不出来。
 *
 * v0.9.6 第一版：改成 Java 拿原图解，但策略是「原图 + 3×3 切块 + 几个缩放尺度，
 *   每次只试 HybridBinarizer」。用户实测仍然认不出——这不是"多试几次"就能救的。
 *
 * v0.9.7（本版）：换成「箱式平均降采样 + 多宽度扫描 + 三种二值化」。
 *   关键不是试得多，而是**怎么缩**：
 *     - Bitmap.createScaledBitmap(…, true) 是双线性，遇到 LCD 屏幕的像素栅格
 *       会保留摩尔纹；箱式平均（每个目标像素取源矩形均值）天然低通，把栅格抹平。
 *     - 对拍摄屏幕的二维码，能解出来的宽度窗口很窄（实测 260px 左右），
 *       必须扫一串宽度而不是赌一个。
 *     - 现场光线偏蓝/偏暗时 HybridBinarizer 会失败，GlobalHistogramBinarizer
 *       反而是解出来的那一个。两种都试，加反色再各试一次。
 *   加上「先按亮度裁出屏幕区域」这一步：照片里二维码只占一小块，直接对整图
 *   降采样会让二维码只剩几十像素，必死。
 *
 * 实测（1773×2364 的手机照片，二维码在亮着的机器屏幕上）：154ms 出结果。
 */
public final class QrDecoder {

    private QrDecoder() {
    }

    /**
     * 候选宽度序列。为什么是这个跨度：
     * 下限 160 保证最小 QR（21 模块）每模块还有 7px；上限 1050 足够细节；
     * 中间排得密是因为命中窗口窄（实测同一张图只有 240~280 这几档能出）。
     */
    private static final int[] WIDTHS = {
            160, 190, 220, 240, 260, 280, 310, 350, 410, 480, 560, 650, 760, 900, 1050
    };

    /** 给静态图片用：传原始 Bitmap，返回二维码文本；解不出返回 null */
    public static String decodeBitmap(Bitmap bmp) {
        if (bmp == null || bmp.isRecycled()) return null;
        try {
            int w = bmp.getWidth(), h = bmp.getHeight();
            if (w <= 0 || h <= 0) return null;
            int[] px = new int[w * h];
            bmp.getPixels(px, 0, w, 0, 0, w, h);
            return decodePixels(px, w, h);
        } catch (Throwable e) {
            return null;
        }
    }

    /** 纯像素版（不依赖 Bitmap，方便单测） */
    public static String decodePixels(int[] px, int w, int h) {
        // 1) 原尺寸先试：拍得很近、二维码很大时这一步就出结果，且不损失任何信息
        String s = sweep(px, w, h, true);
        if (s != null) return s;

        // 2) 按亮度裁出「屏幕 / 白纸」那块，再扫一遍
        int[] bb = brightBox(px, w, h);
        if (bb != null && (bb[2] < w || bb[3] < h)) {
            int[] sub = crop(px, w, h, bb[0], bb[1], bb[2], bb[3]);
            s = sweep(sub, bb[2], bb[3], false);
            if (s != null) return s;
        }
        return null;
    }

    /** 给相机预览帧用：NV21 的 Y 分量就是灰度，直接当亮度源 */
    public static Result decodeYuv(byte[] data, int width, int height) {
        try {
            Map<DecodeHintType, Object> hints = hints();
            LuminanceSource src = new com.google.zxing.PlanarYUVLuminanceSource(
                    data, width, height, 0, 0, width, height, false);
            // 预览帧是灰度，只有全局直方图有意义（Hybrid 对纯灰度也能用，但没必要）
            Result r = read(new GlobalHistogramBinarizer(src), hints);
            if (r == null) r = read(new GlobalHistogramBinarizer(new InvertedLuminanceSource(src)), hints);
            return r;
        } catch (Throwable e) {
            return null;
        }
    }

    // ---------------------------------------------------------------- 主流程

    private static String sweep(int[] p, int w, int h, boolean useNative) {
        if (useNative) {
            String r0 = tryAll(p, w, h);
            if (r0 != null) return r0;
        }
        for (int tw : WIDTHS) {
            if (tw >= w) break;
            int th = Math.max(1, (int) ((long) tw * h / w));
            int[] sc = boxResize(p, w, h, tw, th);
            String r = tryAll(sc, tw, th);
            if (r != null) return r;
        }
        return null;
    }

    /** 一次尝试里做三种二值化。顺序按实测命中率排 */
    private static String tryAll(int[] p, int w, int h) {
        Map<DecodeHintType, Object> hints = hints();
        RGBLuminanceSource ls = new RGBLuminanceSource(w, h, p);
        Result r = read(new GlobalHistogramBinarizer(ls), hints);
        if (r != null) return r.getText();
        r = read(new HybridBinarizer(ls), hints);
        if (r != null) return r.getText();
        r = read(new GlobalHistogramBinarizer(new InvertedLuminanceSource(ls)), hints);
        if (r != null) return r.getText();
        return null;
    }

    private static Map<DecodeHintType, Object> hints() {
        Map<DecodeHintType, Object> m = new EnumMap<DecodeHintType, Object>(DecodeHintType.class);
        // TRY_HARDER：多花点时间换识别率——正是用户要的
        m.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
        List<BarcodeFormat> fs = new ArrayList<BarcodeFormat>();
        fs.add(BarcodeFormat.QR_CODE);
        m.put(DecodeHintType.POSSIBLE_FORMATS, fs);
        return m;
    }

    private static Result read(Binarizer bz, Map<DecodeHintType, Object> hints) {
        try {
            return new MultiFormatReader().decode(new BinaryBitmap(bz), hints);
        } catch (Throwable e) {
            return null;
        }
    }

    // ---------------------------------------------------------------- 像素工具

    /**
     * 找「画面里最亮那一片」的包围盒 —— 手机拍屏幕时，屏幕就是最亮的区域。
     * 取亮度直方图从高往低累计到 8% 的位置当阈值，再求这批像素的外接矩形。
     * 返回 {x, y, w, h}；找不到（整张都暗、或者本来就是一张纯二维码图）返回 null。
     */
    private static int[] brightBox(int[] p, int w, int h) {
        int[] hist = new int[256];
        int[] lum = new int[p.length];
        for (int i = 0; i < p.length; i++) {
            int v = p[i];
            int y = (((v >> 16) & 255) * 77 + ((v >> 8) & 255) * 151 + (v & 255) * 28) >> 8;
            lum[i] = y;
            hist[y]++;
        }
        int total = p.length, acc = 0, thr = 200;
        for (int i = 255; i >= 0; i--) {
            acc += hist[i];
            if (acc > total * 0.08) { thr = i; break; }
        }
        int minX = w, minY = h, maxX = -1, maxY = -1;
        for (int y = 0; y < h; y++) {
            int row = y * w;
            for (int x = 0; x < w; x++) {
                if (lum[row + x] >= thr) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < 0) return null;
        int bw = maxX - minX + 1, bh = maxY - minY + 1;
        if (bw < 40 || bh < 40) return null;      // 太小了，裁了也没意义
        return new int[]{minX, minY, bw, bh};
    }

    private static int[] crop(int[] p, int W, int H, int x0, int y0, int w, int h) {
        int[] d = new int[w * h];
        for (int r = 0; r < h; r++) {
            int sy = Math.min(H - 1, y0 + r);
            int base = sy * W;
            int out = r * w;
            for (int c = 0; c < w; c++) {
                int xx = x0 + c;
                if (xx >= W) xx = W - 1;
                d[out + c] = p[base + xx];
            }
        }
        return d;
    }

    /**
     * 箱式平均降采样。
     *
     * 与 Bitmap.createScaledBitmap 的区别（这是本类能认出码的关键）：
     * 双线性只采样 4 个邻点，遇到 LCD 屏幕的像素栅格会把摩尔纹留下；
     * 箱式平均把源矩形内所有像素都算进去，等于一个低通滤波，栅格被抹平，
     * 二维码的黑白模块反而更干净。
     */
    private static int[] boxResize(int[] s, int sw, int sh, int tw, int th) {
        int[] d = new int[tw * th];
        for (int y = 0; y < th; y++) {
            int y0 = (int) ((long) y * sh / th);
            int y1 = (int) ((long) (y + 1) * sh / th);
            if (y1 <= y0) y1 = y0 + 1;
            if (y1 > sh) y1 = sh;
            for (int x = 0; x < tw; x++) {
                int x0 = (int) ((long) x * sw / tw);
                int x1 = (int) ((long) (x + 1) * sw / tw);
                if (x1 <= x0) x1 = x0 + 1;
                if (x1 > sw) x1 = sw;
                long r = 0, g = 0, b = 0;
                int n = 0;
                for (int yy = y0; yy < y1; yy++) {
                    int row = yy * sw;
                    for (int xx = x0; xx < x1; xx++) {
                        int v = s[row + xx];
                        r += (v >> 16) & 255;
                        g += (v >> 8) & 255;
                        b += v & 255;
                        n++;
                    }
                }
                if (n == 0) n = 1;
                d[y * tw + x] = 0xFF000000 | ((int) (r / n) << 16) | ((int) (g / n) << 8) | (int) (b / n);
            }
        }
        return d;
    }
}
