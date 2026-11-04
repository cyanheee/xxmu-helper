package com.xxmu.helper;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * 把 App 私有目录里的一个文件暴露成 content:// URI，给系统安装器读。
 *
 * 为什么不直接用 FileProvider：
 *   FileProvider 在 androidx（或老的 support-v4）里。本工程是 javac + d8 手搓
 *   构建、零依赖，为了一个「把 apk 交给安装器」的动作引一整个 androidx 不划算。
 *   系统真正需要的能力只有两个：openFile() 返回可读的文件描述符，
 *   以及 query() 能报出文件名和大小。这里各写十几行就够。
 *
 * 安全边界：
 *   - Manifest 里 exported="false"，别的 App 不能主动来读；
 *   - 只有我们自己 startActivity 时带 FLAG_GRANT_READ_URI_PERMISSION，
 *     被授权的那个安装器才临时读得到；
 *   - openFile 只认白名单目录（cacheDir 下），路径里出现 .. 直接拒。
 */
public class ApkProvider extends ContentProvider {

    public static final String AUTHORITY = "com.xxmu.helper.apkfile";
    /** 允许被读出去的目录名（相对 cacheDir） */
    static final String DIR = "upd";

    /** 由 MainActivity 在下载完成后调用，返回可以直接塞进 Intent 的 URI */
    static Uri uriFor(Context ctx, File f) {
        return new Uri.Builder()
                .scheme("content")
                .authority(AUTHORITY)
                .appendPath(f.getName())
                .build();
    }

    /** 由 uri 反解出真实文件；不在白名单目录里就返回 null */
    static File fileFor(Context ctx, Uri uri) {
        if (uri == null) return null;
        String name = uri.getLastPathSegment();
        if (name == null || name.length() == 0) return null;
        if (name.contains("..") || name.contains("/") || name.contains("\\")) return null;
        File dir = new File(ctx.getCacheDir(), DIR);
        File f = new File(dir, name);
        try {
            if (!f.getCanonicalPath().startsWith(dir.getCanonicalPath() + File.separator)) {
                return null;
            }
        } catch (Exception e) {
            return null;
        }
        return f.isFile() ? f : null;
    }

    @Override
    public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileFor(getContext(), uri);
        if (f == null) throw new FileNotFoundException(String.valueOf(uri));
        // 只允许读。安装器不需要写，多给一个写权限只是扩大风险面。
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String sel, String[] selArgs, String sort) {
        File f = fileFor(getContext(), uri);
        if (f == null) return null;
        String[] cols = projection != null ? projection
                : new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE };
        MatrixCursor c = new MatrixCursor(cols, 1);
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = f.getName();
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = f.length();
            else row[i] = null;
        }
        c.addRow(row);
        return c;
    }

    @Override
    public String getType(Uri uri) {
        return "application/vnd.android.package-archive";
    }

    @Override
    public Uri insert(Uri uri, ContentValues v) { return null; }

    @Override
    public int delete(Uri uri, String s, String[] a) { return 0; }

    @Override
    public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
