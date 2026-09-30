import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("configure_emulator", Path(__file__).with_name("configure-emulator.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class EmulatorConfigTest(unittest.TestCase):
    def test_replaces_duplicates_preserves_other_options(self):
        before = "hw.mainKeys = yes\nhw.lcd.width=320\n hw.mainKeys=no\nhw.keyboard=yes\n"
        self.assertEqual("hw.lcd.width=320\nhw.keyboard=yes\nhw.mainKeys=no\n", module.software_keys(before))

    def test_missing_key_and_idempotence(self):
        result = module.software_keys("hw.lcd.height=640\n")
        self.assertEqual("hw.lcd.height=640\nhw.mainKeys=no\n", result)
        self.assertEqual(result, module.software_keys(result))


if __name__ == "__main__":
    unittest.main()
