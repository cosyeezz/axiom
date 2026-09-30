#!/usr/bin/env bash
set -euo pipefail
mkdir -p dist/diagnostics
capture_logs() {
  rc=$?
  trap - EXIT
  # Collect before emulator-runner shuts the device down. Never retain login URLs.
  adb logcat -b all -d -v threadtime 2>&1 | python3 -c '
import re,sys
text=sys.stdin.read()
text=re.sub(r"https://(?:login|controlplane)\.tailscale\.com[^\s\"<>]*", "[redacted-tailscale-auth-url]", text)
open("dist/diagnostics/instrumentation-logcat.txt", "w").write(text)
lines=text.splitlines()
for i,line in enumerate(lines):
    if re.search(r"FATAL EXCEPTION|Fatal signal|panic:|runtime error:|AssertionError",line):
        print("\n".join(lines[max(0,i-2):i+36]))
' || true
  adb pull /sdcard/Download/axiom-immersive dist/diagnostics/failures || true
  adb shell dumpsys input_method > dist/diagnostics/input-method.txt || true
  adb shell dumpsys window > dist/diagnostics/window.txt || true
  adb exec-out screencap -p > dist/diagnostics/screen.png || true
  exit "$rc"
}
trap capture_logs EXIT
adb logcat -b all -c
cp "${ANDROID_AVD_HOME:-$HOME/.android/avd}/test.avd/config.ini" dist/diagnostics/avd-config.ini
cp "$ANDROID_HOME/emulator/source.properties" dist/diagnostics/emulator-source.properties
adb shell getprop qemu.hw.mainkeys | tr -d '\r' > dist/diagnostics/mainkeys.txt
grep -qx '0' dist/diagnostics/mainkeys.txt
adb shell dumpsys window > dist/diagnostics/window-before.txt
adb exec-out screencap -p > dist/diagnostics/screen-before.png
# API30 must expose a real software navigation window before opening the app.
grep -q 'ITYPE_NAVIGATION_BAR frame=' dist/diagnostics/window-before.txt
# Disposable CI emulator: real software IME even with the host hardware keyboard.
adb shell settings put secure show_ime_with_hard_keyboard 1
# Pre-confirm OS education only; never force hide bars with policy_control.
adb shell settings put secure immersive_mode_confirmations confirmed
adb shell settings get secure immersive_mode_confirmations > dist/diagnostics/immersive-confirmation.txt
adb shell ime list -s > dist/diagnostics/ime-list.txt
adb shell settings get secure navigation_mode > dist/diagnostics/navigation-mode.txt
adb shell wm size > dist/diagnostics/display-size.txt
adb shell dumpsys webviewupdate > dist/diagnostics/webview.txt
python3 android/scripts/verify-webview.py < dist/diagnostics/webview.txt
gradle -p android --no-daemon :app:connectedDebugAndroidTest
if [ -f dist/Axiom-Android.apk ]; then
  # AGP can remove the debug app during instrumentation cleanup.
  installed=$(adb shell pm list packages com.axiom.android | tr -d '\r')
  if grep -qx 'package:com.axiom.android' <<< "$installed"; then
    adb uninstall com.axiom.android
  fi
  adb install dist/Axiom-Android.apk
fi
