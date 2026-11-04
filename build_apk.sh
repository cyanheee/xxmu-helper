#!/system/bin/sh
# 河医大助手 APK 打包脚本（在 Termux 里执行）
# 用法: sh /sdcard/Download/DSH-Go/xxmu-build/build_apk.sh
set -e
export PATH=/data/data/com.termux/files/usr/bin:$PATH
cd /sdcard/Download/DSH-Go/xxmu-build

echo "[1/5] aapt2 compile"
aapt2 compile --dir res -o build/res.zip
echo "[2/5] aapt2 link"
aapt2 link -o build/app.unsigned.apk -I android.jar \
  --manifest AndroidManifest.xml -R build/res.zip --java build/gen \
  --min-sdk-version 24 --target-sdk-version 33 -A assets --auto-add-overlay
echo "[3/5] javac"
javac -source 8 -target 8 -encoding UTF-8 -bootclasspath android.jar \
  -d build/classes src/com/xxmu/helper/MainActivity.java build/gen/com/xxmu/helper/R.java
echo "[4/5] d8 merge zipalign"
d8 --min-api 24 --output build build/classes/com/xxmu/helper/*.class
cp build/app.unsigned.apk build/app.dexed.apk
cd build && zip -j app.dexed.apk classes.dex >/dev/null
zipalign -f 4 app.dexed.apk app.aligned.apk
echo "[5/5] apksigner"
apksigner sign --ks xxmu.jks --ks-pass pass:xxmu123 --key-pass pass:xxmu123 \
  --out app-signed.apk app.aligned.apk
ls -l app-signed.apk
echo "OK -> /sdcard/Download/DSH-Go/xxmu-build/build/app-signed.apk"
