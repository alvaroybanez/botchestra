from __future__ import annotations

"""
Hook: tdd_gate
Purpose: Enforce verification discipline based on changed file type.

Design: repo-scoped, diff-aware, file-specific verification tracking.
  - State lives at .git/tdd_gate_state.json
  - Tracks pending_logic, pending_glue, and verified file paths
  - Full test suites verify all pending files
  - Explicit test-file runs verify only mapped implementation files
  - Partial-scope runs verify nothing
"""

import json
import re
import sys
from pathlib import Path

from hook_test_utils import (
    SCOPE_FULL_SUITE,
    SCOPE_TARGETED,
    classify_test_command,
    get_repo_root,
    get_staged_files,
    is_glue_file,
    is_src_file,
    test_file_to_impl,
    to_repo_relative,
)


def state_path() -> Path | None:
    root = get_repo_root()
    if root:
        return root / ".git" / "tdd_gate_state.json"
    return None


def load_state() -> dict:
    path = state_path()
    if path and path.exists():
        try:
            return json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {"pending_logic": [], "pending_glue": [], "verified": []}


def save_state(state: dict) -> None:
    path = state_path()
    if path:
        path.write_text(json.dumps(state, indent=2))


def track_write() -> None:
    """PostToolUse on Write/Edit: add a changed source file to the pending set."""
    try:
        event = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        return

    tool_input = event.get("tool_input", {})
    file_path = tool_input.get("path", "") or tool_input.get("file_path", "")
    file_path = to_repo_relative(file_path)

    if not is_src_file(file_path):
        return

    state = load_state()
    verified = set(state.get("verified", []))
    verified.discard(file_path)

    key = "pending_glue" if is_glue_file(file_path) else "pending_logic"
    pending = set(state.get(key, []))
    pending.add(file_path)
    state[key] = sorted(pending)
    state["verified"] = sorted(verified)
    save_state(state)


def track_test() -> None:
    """PostToolUse on Bash: mark appropriately verified pending files."""
    try:
        event = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        return

    tool_input = event.get("tool_input", {})
    tool_output = event.get("tool_output", {})
    command = tool_input.get("command", "")
    exit_code = tool_output.get("exit_code", tool_output.get("returncode", -1))

    if exit_code != 0:
        return

    is_test = bool(re.search(r"\bvitest\b", command) or re.search(r"\bpytest\b", command))
    is_typecheck = bool(
        re.search(r"\btsc\b", command)
        or re.search(r"\beslint\b", command)
        or re.search(r"\bruff\b", command)
        or re.search(r"\bmypy\b", command)
    )
    if not is_test and not is_typecheck:
        return

    state = load_state()
    verified = set(state.get("verified", []))

    if is_test:
        scope, targeted_files = classify_test_command(command)
        if scope == SCOPE_FULL_SUITE:
            verified.update(state.get("pending_logic", []))
            verified.update(state.get("pending_glue", []))
            state["pending_logic"] = []
            state["pending_glue"] = []
        elif scope == SCOPE_TARGETED:
            covered_impls = {
                impl for impl in (test_file_to_impl(path) for path in targeted_files) if impl
            }
            state["pending_logic"] = [
                path for path in state.get("pending_logic", []) if not _promote(path, covered_impls, verified)
            ]
            state["pending_glue"] = [
                path for path in state.get("pending_glue", []) if not _promote(path, covered_impls, verified)
            ]
    else:
        verified.update(state.get("pending_glue", []))
        state["pending_glue"] = []

    state["verified"] = sorted(verified)
    save_state(state)


def _promote(path: str, covered_impls: set[str], verified: set[str]) -> bool:
    if path in covered_impls:
        verified.add(path)
        return True
    return False


def check_commit() -> None:
    """PreToolUse on Bash: block commits with unverified staged source files."""
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

    staged_src = [path for path in get_staged_files() if is_src_file(path)]
    if not staged_src:
        print(json.dumps({"decision": "approve"}))
        return

    state = load_state()
    verified = set(state.get("verified", []))
    pending_logic = set(state.get("pending_logic", []))
    pending_glue = set(state.get("pending_glue", []))

    unverified_logic = []
    unverified_glue = []
    for path in staged_src:
        if path in verified:
            continue
        if path in pending_logic or (not is_glue_file(path) and path not in pending_glue):
            unverified_logic.append(path)
        elif path in pending_glue or is_glue_file(path):
            unverified_glue.append(path)

    problems = []
    if unverified_logic:
        problems.append(
            "LOGIC files not test-verified since last change:\n"
            + "\n".join(f"    {path}" for path in unverified_logic)
            + "\n  Run vitest/pytest covering these files before committing."
        )
    if unverified_glue:
        problems.append(
            "GLUE files not typecheck-verified since last change:\n"
            + "\n".join(f"    {path}" for path in unverified_glue)
            + "\n  Run tsc/eslint before committing."
        )

    if problems:
        reason = "BLOCKED: Unverified staged files.\n\n" + "\n".join(
            f"  • {problem}" for problem in problems
        )
        print(json.dumps({"decision": "block", "reason": reason}))
    else:
        print(json.dumps({"decision": "approve"}))


MODES = {
    "track-write": track_write,
    "track-test": track_test,
    "check-commit": check_commit,
}


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    handler = MODES.get(mode)
    if handler:
        handler()
    else:
        print(json.dumps({"decision": "approve"}), file=sys.stdout)
