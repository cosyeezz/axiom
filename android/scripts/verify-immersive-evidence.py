#!/usr/bin/env python3
"""Fail closed on missing/corrupt optical-cycle artifacts, not just adb exit 0.

The instrumentation assertions remain the optical oracle. This script checks
that the exact measured frames survived package uninstall and artifact export.
"""
from pathlib import Path
import sys
from PIL import Image

EXPECTED = tuple(f"{cycle}-{phase}.png"
                 for cycle in ("activity-top", "activity-navigation", "dialog-navigation")
                 for phase in ("hidden", "revealed", "restored"))


def verify(directory):
    dimensions = set()
    for name in EXPECTED:
        path = Path(directory) / name
        with Image.open(path) as image:
            if image.format != "PNG":
                raise ValueError(f"Not PNG: {path}")
            image.verify()
        with Image.open(path) as image:
            image.load()
            if min(image.size) < 100:
                raise ValueError(f"Invalid screen dimensions: {path}: {image.size}")
            dimensions.add(image.size)
    if len(dimensions) != 1:
        raise ValueError(f"Screen dimensions changed within cycle: {dimensions}")
    return len(EXPECTED)


if __name__ == "__main__":
    print(f"Verified {verify(sys.argv[1])} decoded optical-cycle frames in {sys.argv[1]}")
