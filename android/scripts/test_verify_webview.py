import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("verify_webview", Path(__file__).with_name("verify-webview.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def dump(current="com.android.webview", listed=None, state="installed/enabled", kind="Valid"):
    return (
        f"Current WebView package (name, version): ({current}, 124.0)\n"
        f"  {kind} package {listed or current} (versionName: 124.0, versionCode: 1, targetSdkVersion: 34) "
        f"is  {state} for all users\n"
    )


class WebViewProviderTest(unittest.TestCase):
    def test_supported_provider_names_and_crlf(self):
        for name in ("com.android.chrome", "com.google.android.webview", "com.android.webview"):
            with self.subTest(name=name):
                self.assertEqual(name, module.verify_current_provider(dump(name).replace("\n", "\r\n")))

    def test_missing_disabled_invalid_mismatched_or_ambiguous_fail_closed(self):
        for text in (
            "Current WebView package is null\nAny WebView package installed: false\n",
            dump(state="NOT installed/enabled"),
            dump(kind="Invalid"),
            dump(listed="com.google.android.webview"),
            dump() + dump(),
            "unrecognized dump format",
        ):
            with self.subTest(text=text):
                with self.assertRaises(ValueError):
                    module.verify_current_provider(text)


if __name__ == "__main__":
    unittest.main()
