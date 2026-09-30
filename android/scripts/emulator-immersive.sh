#!/usr/bin/env bash
# Disposable emulator only. Reuses the exact candidate APKs, no rebuild or tailnet.
set -Eeuo pipefail
trap 'rc=$?; printf "Failure at line %s (exit %s): %s\n" "$LINENO" "$rc" "$BASH_COMMAND" >&2' ERR
mkdir -p dist/immersive
cutout=""
cleanup() {
  rc=$?
  trap - EXIT
  adb pull /sdcard/Download/axiom-immersive dist/immersive/failures || true
  adb logcat -d -s ImmersiveEvidence:I > dist/immersive/geometry.txt || true
  adb shell settings get secure navigation_mode > dist/immersive/navigation-mode.txt || true
  adb shell wm size > dist/immersive/display-size.txt || true
  adb shell dumpsys input_method > dist/immersive/input-method.txt || true
  adb shell dumpsys window > dist/immersive/window.txt || true
  adb shell dumpsys webviewupdate > dist/immersive/webview.txt || true
  adb exec-out screencap -p > dist/immersive/screen.png || true
  if [ -n "$cutout" ]; then adb shell cmd overlay disable "$cutout" || true; fi
  exit "$rc"
}
trap cleanup EXIT
adb shell dumpsys webviewupdate | tr -d '\r' | tee dist/immersive/webview-before.txt
python3 android/scripts/verify-webview.py < dist/immersive/webview-before.txt
# SDK package names do not pin revisions; retain actual image/emulator identity.
api=$(adb shell getprop ro.build.version.sdk | tr -d '\r')
cp "$ANDROID_HOME/system-images/android-$api/google_apis/x86_64/source.properties" dist/immersive/image-source.properties
# Read SDK package metadata instead of launching a second emulator binary.
cp "$ANDROID_HOME/emulator/source.properties" dist/immersive/emulator-source.properties
grep '^Pkg.Revision[[:space:]]*=' dist/immersive/emulator-source.properties > dist/immersive/emulator-version.txt
cp "${ANDROID_AVD_HOME:-$HOME/.android/avd}/test.avd/config.ini" dist/immersive/avd-config.ini
adb shell getprop qemu.hw.mainkeys | tr -d '\r' > dist/immersive/mainkeys.txt
# API35 may omit the legacy property despite having real navigation bars.
# Require the AVD configuration; functional acceptance uses actual Insets and
# screen pixels in SystemBarProbe, never the property value or a fake size.
grep -Eq '^hw\.mainKeys[[:space:]]*=[[:space:]]*no[[:space:]]*$' dist/immersive/avd-config.ini
adb shell dumpsys window > dist/immersive/window-before.txt
adb exec-out screencap -p > dist/immersive/screen-before.png
# The instrumentation probe still requires nonzero navigation geometry and
# actual optical hide/reveal; a requested emulator property alone cannot pass.
adb shell settings put secure show_ime_with_hard_keyboard 1
adb shell settings put secure immersive_mode_confirmations confirmed
adb shell settings get secure immersive_mode_confirmations > dist/immersive/immersive-confirmation.txt
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 0
adb install artifact/android/app/build/outputs/apk/debug/app-debug.apk
adb install artifact/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
run_tests() {
  local name="$1" required="$2"
  adb shell rm -rf /sdcard/Download/axiom-immersive
  adb logcat -c
  adb shell am instrument -w -r -e class com.axiom.android.ImmersiveUiTest -e requireCutout "$required" \
    com.axiom.android.test/androidx.test.runner.AndroidJUnitRunner | tee "dist/immersive/$name.txt"
  adb pull /sdcard/Download/axiom-immersive "dist/immersive/$name-screens" || true
  adb logcat -d -s ImmersiveEvidence:I > "dist/immersive/$name-geometry.txt" || true
  grep -Eq '^OK \(5 tests\)' "dist/immersive/$name.txt"
  ! grep -Eq 'FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=' "dist/immersive/$name.txt"
  python3 android/scripts/verify-immersive-evidence.py "dist/immersive/$name-screens"
}
run_tests portrait false
if [ "$api" -ge 28 ]; then
  adb shell cmd overlay list > dist/immersive/overlays.txt
  cutout=$(grep 'com.android.internal.display.cutout.emulation.tall' dist/immersive/overlays.txt | awk '{print $NF}' | tr -d '\r')
  test -n "$cutout"
  adb shell cmd overlay enable "$cutout"
  # Configuration changes complete before launching a fresh test Activity.
  sleep 2
  run_tests cutout-portrait true
  adb shell settings put system user_rotation 1
  sleep 2
  run_tests cutout-landscape true
fi
