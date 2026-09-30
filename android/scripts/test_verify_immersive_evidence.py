import importlib.util
from pathlib import Path
import tempfile
import unittest
from PIL import Image

spec = importlib.util.spec_from_file_location("evidence", Path(__file__).with_name("verify-immersive-evidence.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class EvidenceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        for name in module.EXPECTED:
            Image.new("RGB", (320, 640), "#5e6ad2").save(self.path / name)

    def test_complete(self):
        self.assertEqual(9, module.verify(self.path))

    def test_missing_frame_fails(self):
        (self.path / module.EXPECTED[-1]).unlink()
        with self.assertRaises(FileNotFoundError):
            module.verify(self.path)

    def test_corrupt_frame_fails(self):
        (self.path / module.EXPECTED[0]).write_bytes(b"not a PNG")
        with self.assertRaises(OSError):
            module.verify(self.path)

    def test_dimension_change_fails(self):
        Image.new("RGB", (640, 320)).save(self.path / module.EXPECTED[-1])
        with self.assertRaises(ValueError):
            module.verify(self.path)

    def test_small_image_fails(self):
        Image.new("RGB", (1, 1)).save(self.path / module.EXPECTED[-1])
        with self.assertRaises(ValueError):
            module.verify(self.path)


if __name__ == "__main__":
    unittest.main()
