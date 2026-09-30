#!/usr/bin/env python3
"""Fail closed unless dumpsys reports a valid, enabled current WebView provider."""
import re
import sys


def verify_current_provider(text):
    current = re.findall(
        r"^\s*Current WebView package \(name, version\): \(([\w.]+),[^\r\n]*\)\s*$",
        text,
        re.MULTILINE,
    )
    if len(current) != 1:
        raise ValueError("No unambiguous current WebView provider")
    provider = current[0]
    valid = re.compile(
        r"^\s*Valid package " + re.escape(provider)
        + r" \([^\r\n]*\) is\s+installed/enabled for all users\s*$",
        re.MULTILINE,
    )
    if not valid.search(text):
        raise ValueError("Current WebView provider is not valid and installed/enabled for all users")
    return provider


if __name__ == "__main__":
    try:
        print("Verified current WebView provider: " + verify_current_provider(sys.stdin.read()))
    except ValueError as error:
        print("::error::" + str(error), file=sys.stderr)
        sys.exit(1)
