from __future__ import annotations

"""
Shared utilities for Botchestra Claude Code hooks.

Contains: path normalization, file classification, git helpers,
test↔impl mapping, and test command scope analysis.

Imported by tdd_gate.py and test_quality_gate.py.
"""

import os
import re
import subprocess
from pathlib import Path, PurePosixPath

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SRC_EXTENSIONS = {".ts", ".tsx", ".py", ".mts", ".cts"}

TEST_PATTERNS = [
    r"\.test\.[tj]sx?$",
    r"\.spec\.[tj]sx?$",
    r"test_[^/]+\.py$",
    r"[^/]+_test\.py$",
]
# NOTE: Intentionally filename-only. Files under tests/ or __tests__/ without
# a test suffix (e.g. tests/helpers/factories.ts) are helpers, not test files.
# They match via .test./.spec./test_/_test in the filename if they ARE tests.

GLUE_INDICATORS = {
    "config", "convex", "types", "routes", "pages", "components",
    "app", "layouts", "middleware",
}
GLUE_SUFFIXES = {".config.ts", ".config.js", ".config.mts", ".d.ts"}
GLUE_FILENAMES = {
    "index.ts", "index.tsx", "index.js", "index.jsx",
    "middleware.ts", "middleware.js",
}
GLUE_PATH_SEGMENTS = {
    "page.tsx", "page.ts", "layout.tsx", "layout.ts",
    "loading.tsx", "loading.ts", "error.tsx", "error.ts",
}

_TEST_ROOT_PREFIXES = [
    "tests/unit/", "tests/integration/", "tests/e2e/", "tests/",
    "test/unit/", "test/integration/", "test/e2e/", "test/",
]
_SRC_ROOT_PREFIXES = ["src/", "lib/", ""]

# Three-way result for command scope analysis
SCOPE_FULL_SUITE = "full_suite"
SCOPE_TARGETED = "targeted"
SCOPE_UNKNOWN = "unknown"

_PYTEST_VALUE_FLAGS = {"-k", "-m", "-p", "--rootdir", "--co", "-c", "--override-ini", "-o"}
_VITEST_VALUE_FLAGS = {"-t", "--testNamePattern", "--config", "--dir", "--root"}

# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------


def get_repo_root() -> Path | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            return Path(result.stdout.strip())
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


def to_repo_relative(path: str) -> str:
    """Normalize any path (absolute or relative) to repo-relative with forward slashes."""
    root = get_repo_root()
    resolved = Path(path).resolve()

    if root:
        try:
            return str(PurePosixPath(resolved.relative_to(root.resolve())))
        except ValueError:
            pass

    normed = os.path.normpath(path)
    result = str(PurePosixPath(normed))
    while result.startswith("./"):
        result = result[2:]
    return result


def get_staged_files() -> list[str]:
    """Get staged files including renames (ACMR filter)."""
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            return [to_repo_relative(f) for f in result.stdout.strip().split("\n") if f.strip()]
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return []


# ---------------------------------------------------------------------------
# File classifiers
# ---------------------------------------------------------------------------


def is_test_file(path: str) -> bool:
    return any(re.search(p, path) for p in TEST_PATTERNS)


def is_src_file(path: str) -> bool:
    if not any(path.endswith(ext) for ext in SRC_EXTENSIONS):
        return False
    return not is_test_file(path)


def is_glue_file(path: str) -> bool:
    """Classify using Path.parts and filename."""
    p = PurePosixPath(path)

    if p.name in GLUE_FILENAMES or p.name in GLUE_PATH_SEGMENTS:
        return True
    if any(str(p).endswith(s) for s in GLUE_SUFFIXES):
        return True

    for part in p.parts[:-1]:
        if part.lower() in GLUE_INDICATORS:
            return True

    return False


# ---------------------------------------------------------------------------
# Test file → implementation file mapping
# ---------------------------------------------------------------------------


def _strip_test_suffix(path: str) -> str | None:
    """Strip .test/.spec suffix or test_ prefix from a filename."""
    p = PurePosixPath(path)

    stripped = re.sub(r"\.(test|spec)(\.[tj]sx?)$", r"\2", path)
    if stripped != path:
        return stripped

    if p.name.startswith("test_"):
        return str(p.parent / p.name[5:])

    if p.name.endswith("_test.py"):
        return str(p.parent / (p.stem[:-5] + ".py"))

    return None


def test_file_to_impl(test_path: str) -> str | None:
    """Map a test file path to its likely implementation file path.

    Strategy: generate candidates, check disk, return first match.
    Falls back to best guess if no candidate exists on disk.
    """
    candidates: list[str] = []
    p = PurePosixPath(test_path)

    # Strategy 1: __tests__ directory (strip it, collapse)
    if "__tests__" in p.parts:
        parts = list(p.parts)
        parts.remove("__tests__")
        collapsed = str(PurePosixPath(*parts)) if len(parts) > 1 else parts[0]
        stripped = _strip_test_suffix(collapsed)
        if stripped:
            candidates.append(stripped)
        candidates.append(collapsed)

    # Strategy 2: Colocated (same directory, strip suffix)
    stripped = _strip_test_suffix(test_path)
    if stripped:
        candidates.append(stripped)

    # Strategy 3: Mirrored test root → src root
    for test_prefix in _TEST_ROOT_PREFIXES:
        if test_path.startswith(test_prefix):
            remainder = test_path[len(test_prefix):]
            stripped_remainder = _strip_test_suffix(remainder)
            rel = stripped_remainder or remainder
            for src_prefix in _SRC_ROOT_PREFIXES:
                candidates.append(src_prefix + rel)

    # Deduplicate preserving order
    seen: set[str] = set()
    unique: list[str] = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            unique.append(c)

    # Check disk
    root = get_repo_root()
    if root:
        for c in unique:
            if (root / c).exists():
                return c

    return unique[0] if unique else None


# ---------------------------------------------------------------------------
# Test command scope analysis
# ---------------------------------------------------------------------------


def classify_test_command(command: str) -> tuple[str, list[str]]:
    """Classify a test command's scope and extract targeted files if possible.

    Returns:
      (SCOPE_FULL_SUITE, [])       — no args, full suite
      (SCOPE_TARGETED, [files...]) — specific test files identified
      (SCOPE_UNKNOWN, [])          — has args we can't map to specific files
    """
    parts = command.split()
    runner_tokens = {"vitest", "run", "pytest", "npx", "bunx"}

    targeted_files: list[str] = []
    has_unknown_args = False
    skip_next = False

    for i, part in enumerate(parts):
        if skip_next:
            skip_next = False
            continue

        part = part.strip()

        if part in runner_tokens:
            continue

        if part in _PYTEST_VALUE_FLAGS or part in _VITEST_VALUE_FLAGS:
            skip_next = True
            has_unknown_args = True
            continue

        if part.startswith("-"):
            if "=" in part:
                flag_name = part.split("=")[0]
                if flag_name in _PYTEST_VALUE_FLAGS or flag_name in _VITEST_VALUE_FLAGS:
                    has_unknown_args = True
            continue

        file_part = part.split("::")[0] if "::" in part else part

        # pytest node IDs (file::test_name) mean partial scope within a file
        if "::" in part:
            has_unknown_args = True

        # Directory args → unknown scope
        if file_part.endswith("/") or "." not in PurePosixPath(file_part).name:
            has_unknown_args = True
            continue

        if is_test_file(file_part):
            targeted_files.append(to_repo_relative(file_part))
        elif os.path.sep in part or "/" in part:
            has_unknown_args = True
        else:
            has_unknown_args = True

    # Scope-narrowing flags/node IDs override file targeting — we can't
    # guarantee full coverage of the impl file, so treat as unknown.
    if targeted_files and not has_unknown_args:
        return (SCOPE_TARGETED, targeted_files)
    elif has_unknown_args:
        return (SCOPE_UNKNOWN, [])
    else:
        return (SCOPE_FULL_SUITE, [])
