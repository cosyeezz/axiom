#!/usr/bin/env bash
# Disposable emulator only. Reuses the exact candidate APKs, no rebuild or tailnet.
set -euo pipefail
mkdir -p dist/immersive
cutout=""
cleanup() {
  rc=$?
  trap - EXIT
  adb pull /sdcard/Download/axiom-immersive dist/immersive/failures || true
  adb logcat -d -s ImmersiveEvidence:I > dist/immersive/geometry.txt || true
  adb shell dumpsys input_method > dist/immersive/input-method.txt || true
  adb shell dumpsys window > dist/immersive/window.txt || true
  adb shell dumpsys webviewupdate > dist/immersive/webview.txt || true
  adb exec-out screencap -p > dist/immersive/screen.png || true
  if [ -n "$cutout" ]; then adb shell cmd overlay disable "$cutout" || true; fi
  exit "$rc"
}
trap cleanup EXIT
adb shell settings put secure show_ime_with_hard_keyboard 1
adb shell settings put secure immersive_mode_confirmations confirmed
adb shell settings get secure immersive_mode_confirmations > dist/immersive/immersive-confirmation.txt
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 0
adb install artifact/android/app/build/outputs/apk/debug/app-debug.apk
adb install artifact/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
run_tests() {
  local name="$1" required="$2"
  adb shell am instrument -w -r -e class com.axiom.android.ImmersiveUiTest -e requireCutout "$required" \
    com.axiom.android.test/androidx.test.runner.AndroidJUnitRunner | tee "dist/immersive/$name.txt"
  grep -Eq '^OK \(5 tests\)' "dist/immersive/$name.txt"
  ! grep -Eq 'FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=' "dist/immersive/$name.txt"
}
run_tests portrait false
api=$(adb shell getprop ro.build.version.sdk | tr -d '\r')
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
