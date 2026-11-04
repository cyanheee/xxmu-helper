package com.xxmu.helper;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.Camera;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.google.zxing.Result;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 相机扫二维码（独立 Activity）。
 *
 * 为什么是独立 Activity 而不是在主页里开预览：相机要独占 Surface，还要处理
 * 权限、生命周期、旋转，塞进现有 WebView 壳里会把 MainActivity 搅乱。独立页面
 * 还顺便解决了返回键——关页面就是取消。
 *
 * 为什么用已废弃的 android.hardware.Camera 而不是 CameraX：CameraX 要拉一堆
 * AndroidX 依赖，本工程是 javac + d8 手搓构建、没有 gradle，加依赖成本远超收益。
 * Camera 的 API 从 minSdk 24 到 33 都在，够用。
 *
 * 关键设计：预览帧的 Y 平面直接当灰度图交给 ZXing。QR 的定位图形让 ZXing 对
 * 90°/180° 旋转不敏感，所以不必为方向做图像旋转，省掉最容易出错的一段。
 */
public class ScanActivity extends Activity implements SurfaceHolder.Callback {

    public static final String EXTRA_TEXT = "qr_text";

    private static final int REQ_PERM = 3001;
    /** 单帧解码区域占画面的比例，取中心正方形：二维码基本都在取景框中间 */
    private static final float CROP = 0.72f;

    private SurfaceView sv;
    private TextView tip;
    private Button torch;
    private Camera cam;
    private boolean flashOn;
    private boolean surfaceReady;

    private final ExecutorService pool = Executors.newSingleThreadExecutor();
    private final AtomicBoolean decoding = new AtomicBoolean(false);
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        buildUi();
        if (checkSelfPermission(android.Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.CAMERA}, REQ_PERM);
        } else {
            start();
        }
    }

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF000000);

        sv = new SurfaceView(this);
        root.addView(sv, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        sv.getHolder().addCallback(this);

        // 顶部：返回 + 提示
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(10), dp(14), dp(10), dp(8));

        Button back = new Button(this);
        back.setText("‹ 返回");
        back.setBackgroundColor(0x00000000);
        back.setTextColor(0xFFFFFFFF);
        back.setTextSize(15);
        // 不用 lambda：本工程 -bootclasspath 指向 android.jar，编译期看不到
        // java.lang.invoke.LambdaMetafactory，lambda 会直接报「找不到符号」。
        back.setOnClickListener(new android.view.View.OnClickListener() {
            public void onClick(android.view.View v) {
                finish();
            }
        });
        bar.addView(back);

        tip = new TextView(this);
        tip.setText("把机器上的二维码放进框里");
        tip.setTextColor(0xFFFFFFFF);
        tip.setTextSize(14);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        bar.addView(tip, tp);
        root.addView(bar);

        // 底部：手电筒
        LinearLayout foot = new LinearLayout(this);
        foot.setOrientation(LinearLayout.HORIZONTAL);
        foot.setGravity(Gravity.CENTER);
        foot.setPadding(dp(10), dp(8), dp(10), dp(28));

        torch = new Button(this);
        torch.setText("打开手电筒");
        torch.setTextSize(14);
        torch.setOnClickListener(new android.view.View.OnClickListener() {
            public void onClick(android.view.View v) {
                toggleFlash();
            }
        });
        foot.addView(torch);

        FrameLayout.LayoutParams fp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        fp.gravity = Gravity.BOTTOM;
        root.addView(foot, fp);

        setContentView(root);
    }

    private int dp(int v) {
        return Math.round(getResources().getDisplayMetrics().density * v);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] p, int[] r) {
        super.onRequestPermissionsResult(code, p, r);
        if (code == REQ_PERM) {
            if (checkSelfPermission(android.Manifest.permission.CAMERA)
                    == PackageManager.PERMISSION_GRANTED) {
                start();
            } else {
                tip.setText("没有相机权限。可以在「设置 → 应用 → 河医大助手 → 权限」里打开，"
                        + "或者先用相册选图。");
            }
        }
    }

    private void start() {
        if (surfaceReady) openCamera();
    }

    // ---------------------------------------------------------------- 相机

    @Override
    public void surfaceCreated(SurfaceHolder h) {
        surfaceReady = true;
        start();
    }

    @Override
    public void surfaceChanged(SurfaceHolder h, int fmt, int w, int hh) {
        if (cam != null) {
            try {
                cam.stopPreview();
                cam.startPreview();
            } catch (Throwable ignored) {
            }
        }
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder h) {
        surfaceReady = false;
        release();
    }

    private void openCamera() {
        if (cam != null) return;
        try {
            cam = Camera.open(0);
        } catch (Throwable e) {
            tip.setText("打不开相机：" + e.getClass().getSimpleName() + "，可以改用相册选图");
            return;
        }
        try {
            Camera.Parameters p = cam.getParameters();
            Camera.Size best = pickSize(p.getSupportedPreviewSizes());
            if (best != null) {
                p.setPreviewSize(best.width, best.height);
                p.setPictureSize(best.width, best.height);
            }
            List<String> modes = p.getSupportedFocusModes();
            if (modes != null
                    && modes.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE)) {
                p.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);
            }
            cam.setParameters(p);
        } catch (Throwable ignored) {
        }
        try {
            cam.setPreviewDisplay(sv.getHolder());
            cam.setDisplayOrientation(90);
        } catch (Throwable ignored) {
        }
        cam.setPreviewCallback(new Camera.PreviewCallback() {
            public void onPreviewFrame(byte[] data, Camera c) {
                if (data == null) return;
                if (!decoding.compareAndSet(false, true)) return;  // 上一帧还在解
                Camera.Size sz = c.getParameters().getPreviewSize();
                final byte[] crop = cropY(data, sz.width, sz.height);
                final int cw = cropW(sz.width), ch = cropH(sz.height);
                pool.execute(new Runnable() {
                    public void run() {
                        try {
                            Result r = QrDecoder.decodeYuv(crop, cw, ch);
                            if (r != null && r.getText() != null) done(r.getText());
                        } catch (Throwable ignored) {
                        } finally {
                            decoding.set(false);
                        }
                    }
                });
            }
        });
        try {
            cam.startPreview();
        } catch (Throwable e) {
            tip.setText("启动预览失败，可以改用相册选图");
        }
    }

    /** 选一个不太大的预览尺寸：1280 左右足够解二维码，太大每帧都会卡 */
    private Camera.Size pickSize(List<Camera.Size> list) {
        if (list == null || list.isEmpty()) return null;
        Camera.Size best = null;
        int bestScore = Integer.MAX_VALUE;
        for (Camera.Size s : list) {
            int big = Math.max(s.width, s.height);
            // 目标长边 1280；太大了浪费算力，太小了解不出来
            int score = Math.abs(big - 1280);
            if (score < bestScore) {
                bestScore = score;
                best = s;
            }
        }
        return best;
    }

    private void toggleFlash() {
        if (cam == null) return;
        try {
            Camera.Parameters p = cam.getParameters();
            if (!flashOn && p.getFlashMode() != null) {
                p.setFlashMode(Camera.Parameters.FLASH_MODE_TORCH);
                cam.setParameters(p);
                flashOn = true;
                torch.setText("关闭手电筒");
            } else {
                p.setFlashMode(Camera.Parameters.FLASH_MODE_OFF);
                cam.setParameters(p);
                flashOn = false;
                torch.setText("打开手电筒");
            }
        } catch (Throwable e) {
            tip.setText("这台机器的相机不支持手电筒");
        }
    }

    private void release() {
        if (cam == null) return;
        try {
            cam.setPreviewCallback(null);
            cam.stopPreview();
        } catch (Throwable ignored) {
        }
        try {
            cam.release();
        } catch (Throwable ignored) {
        }
        cam = null;
        flashOn = false;
    }

    private void done(final String text) {
        ui.post(new Runnable() {
            public void run() {
                release();
                Intent it = new Intent();
                it.putExtra(EXTRA_TEXT, text);
                setResult(RESULT_OK, it);
                finish();
            }
        });
    }

    // ---------------------------------------------------------------- Y 平面裁剪

    private int cropW(int w) {
        return Math.max(1, Math.round(w * CROP));
    }

    private int cropH(int h) {
        return Math.max(1, Math.round(h * CROP));
    }

    /** NV21：前 w*h 字节是 Y（灰度），按行取中心块 */
    private byte[] cropY(byte[] data, int w, int h) {
        int cw = cropW(w), ch = cropH(h);
        int left = (w - cw) / 2, top = (h - ch) / 2;
        byte[] out = new byte[cw * ch];
        for (int y = 0; y < ch; y++) {
            int src = (top + y) * w + left;
            if (src + cw > data.length) break;
            System.arraycopy(data, src, out, y * cw, cw);
        }
        return out;
    }

    @Override
    protected void onPause() {
        super.onPause();
        release();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (surfaceReady) openCamera();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        release();
        pool.shutdownNow();
        ui.removeCallbacksAndMessages(null);
    }
}
