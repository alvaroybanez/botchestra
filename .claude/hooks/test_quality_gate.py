"""
Hook: test_quality_gate
Event: PreToolUse on Bash (git commit)
Purpose: Block commits when staged test files show signs of fake or shallow tests.

Commit-time checks:
  1. Assertions exist
  2. Assertions are non-trivial
  3. No deep internal imports
"""

import json
import re
import sys
from pathlib import Path

from hook_test_utils import get_staged_files, is_test_file

TS_ASSERTION = re.compile(r"\bexpect\s*\(")
TS_REAL_ASSERTION = re.compile(
    r"\.\s*(toBe|toEqual|toStrictEqual|toContain|toMatchObject|toThrow|rejects"
    r"|toHaveBeenCalledWith|toHaveProperty|toMatch|toBeGreaterThan|toBeLessThan)\s*\("
)

PY_ASSERTION = re.compile(r"\bassert\b")
PY_REAL_ASSERTION = re.compile(
    r"assert.*==|assert.*!=|assert.*\bin\b|assert.*not\s+in\b"
    r"|pytest\.raises|assertRaises|assert.*>\s|assert.*<\s"
)

INTERNAL_IMPORT_TS = re.compile(
    r"""(?:import|from)\s+['"](?:\.\./){2,}[^'"]*['"]"""
)


def check_test_file(path: str) -> list[str]:
    """Return list of failure reasons. Empty = pass."""
    try:
        content = Path(path).read_text()
    except (FileNotFoundError, OSError):
        return []

    failures = []
    lines = content.splitlines()
    is_python = path.endswith(".py")

    assertion_pat = PY_ASSERTION if is_python else TS_ASSERTION
    if not any(assertion_pat.search(line) for line in lines):
        failures.append(
            f"NO_ASSERTIONS: {path} has no expect()/assert calls — this is not a real test."
        )
        return failures

    real_pat = PY_REAL_ASSERTION if is_python else TS_REAL_ASSERTION
    if not any(real_pat.search(line) for line in lines):
        failures.append(
            f"TRIVIAL_ONLY: {path} — all assertions are shallow "
            f"(toBeDefined/toBeTruthy/is not None). Add assertions that verify actual values."
        )

    if not is_python:
        internal_imports = INTERNAL_IMPORT_TS.findall(content)
        if internal_imports:
            failures.append(
                f"INTERNAL_IMPORTS: {path} imports from deep internal paths: "
                f"{', '.join(internal_imports[:3])}. Tests should use the public interface."
            )

    return failures


def main() -> None:
    try:
        event = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        print(json.dumps({"decision": "approve"}))
        return

    tool_input = event.get("tool_input", {})
    command = tool_input.get("command", "")
    if not re.search(r"\bgit\s+commit\b", command):
        print(json.dumps({"decision": "approve"}))
        return

    test_files = [path for path in get_staged_files() if is_test_file(path)]
    if not test_files:
        print(json.dumps({"decision": "approve"}))
        return

    failures = []
    for path in test_files:
        failures.extend(check_test_file(path))

    if failures:
        reason = "BLOCKED: Test quality check failed.\n\n" + "\n".join(
            f"  • {failure}" for failure in failures
        )
        print(json.dumps({"decision": "block", "reason": reason}))
    else:
        print(json.dumps({"decision": "approve"}))


if __name__ == "__main__":
    main()
