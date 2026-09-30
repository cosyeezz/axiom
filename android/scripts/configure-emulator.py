#!/usr/bin/env python3
"""Require software navigation in the disposable CI AVD before it starts."""
import os
from pathlib import Path
import re


def software_keys(config):
    # Preserve unrelated device settings; remove duplicate entries instead of
    # relying on the emulator's first/last-key precedence.
    lines = [line for line in config.splitlines()
             if not re.match(r"^\s*hw\.mainKeys\s*=", line)]
    return "\n".join(lines + ["hw.mainKeys=no"]) + "\n"


if __name__ == "__main__":
    avd_home = Path(os.environ.get("ANDROID_AVD_HOME", str(Path.home() / ".android" / "avd")))
    config = avd_home / "test.avd" / "config.ini"
    # Missing AVD is an error, not an excuse to generate a partial device config.
    config.write_text(software_keys(config.read_text(encoding="utf-8")), encoding="utf-8")
    print("Configured CI AVD software navigation: " + str(config))
