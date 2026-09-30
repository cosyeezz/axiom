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
  adb shell dumpsys input_method > dist/diagnostics/input-method.txt || true
  adb shell dumpsys window > dist/diagnostics/window.txt || true
  adb exec-out screencap -p > dist/diagnostics/screen.png || true
  exit "$rc"
}
trap capture_logs EXIT
adb logcat -b all -c
# Disposable CI emulator: real software IME even with the host hardware keyboard.
adb shell settings put secure show_ime_with_hard_keyboard 1
adb shell ime list -s > dist/diagnostics/ime-list.txt
adb shell dumpsys webviewupdate > dist/diagnostics/webview.txt
gradle -p android --no-daemon :app:connectedDebugAndroidTest
if [ -f dist/Axiom-Android.apk ]; then
  # AGP can remove the debug app during instrumentation cleanup.
  installed=$(adb shell pm list packages com.axiom.android | tr -d '\r')
  if grep -qx 'package:com.axiom.android' <<< "$installed"; then
    adb uninstall com.axiom.android
  fi
  adb install dist/Axiom-Android.apk
fi
