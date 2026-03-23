import io
import json
import sys
from pathlib import Path

import hook_test_utils
import pytest
import tdd_gate
import test_quality_gate


@pytest.fixture
def tmp_repo(tmp_path, monkeypatch):
    (tmp_path / ".git").mkdir()
    monkeypatch.setattr(hook_test_utils, "get_repo_root", lambda: tmp_path)
    monkeypatch.setattr(tdd_gate, "get_repo_root", lambda: tmp_path)
    return tmp_path


def _set_stdin(monkeypatch, payload: dict) -> None:
    monkeypatch.setattr(sys, "stdin", io.StringIO(json.dumps(payload)))


def _read_state(repo_root: Path) -> dict:
    return json.loads((repo_root / ".git" / "tdd_gate_state.json").read_text())


def test_track_write_records_logic_and_glue_files(tmp_repo, monkeypatch) -> None:
    logic_file = tmp_repo / "src/parser.py"
    glue_file = tmp_repo / "src/components/button.tsx"
    logic_file.parent.mkdir(parents=True)
    glue_file.parent.mkdir(parents=True)
    logic_file.write_text("def parse():\n    return True\n")
    glue_file.write_text("export function Button() { return null; }\n")

    _set_stdin(monkeypatch, {"tool_input": {"path": str(logic_file)}})
    tdd_gate.track_write()
    _set_stdin(monkeypatch, {"tool_input": {"path": str(glue_file)}})
    tdd_gate.track_write()

    assert _read_state(tmp_repo) == {
        "pending_logic": ["src/parser.py"],
        "pending_glue": ["src/components/button.tsx"],
        "verified": [],
    }


def test_track_test_verifies_only_targeted_impl_files(tmp_repo, monkeypatch) -> None:
    impl_file = tmp_repo / "src/parser.py"
    impl_file.parent.mkdir(parents=True)
    impl_file.write_text("def parse():\n    return True\n")
    state = {
        "pending_logic": ["src/parser.py", "src/other.py"],
        "pending_glue": [],
        "verified": [],
    }
    (tmp_repo / ".git" / "tdd_gate_state.json").write_text(json.dumps(state))

    _set_stdin(
        monkeypatch,
        {
            "tool_input": {"command": "pytest tests/test_parser.py"},
            "tool_output": {"exit_code": 0},
        },
    )
    tdd_gate.track_test()

    assert _read_state(tmp_repo) == {
        "pending_logic": ["src/other.py"],
        "pending_glue": [],
        "verified": ["src/parser.py"],
    }


def test_track_test_unknown_scope_verifies_nothing(tmp_repo, monkeypatch) -> None:
    state = {"pending_logic": ["src/parser.py"], "pending_glue": [], "verified": []}
    (tmp_repo / ".git" / "tdd_gate_state.json").write_text(json.dumps(state))

    _set_stdin(
        monkeypatch,
        {
            "tool_input": {"command": "pytest tests/test_parser.py::test_invalid"},
            "tool_output": {"exit_code": 0},
        },
    )
    tdd_gate.track_test()

    assert _read_state(tmp_repo) == state


def test_track_test_typecheck_verifies_only_glue(tmp_repo, monkeypatch) -> None:
    state = {
        "pending_logic": ["src/parser.py"],
        "pending_glue": ["src/components/button.tsx"],
        "verified": [],
    }
    (tmp_repo / ".git" / "tdd_gate_state.json").write_text(json.dumps(state))

    _set_stdin(
        monkeypatch,
        {"tool_input": {"command": "bunx eslint ."}, "tool_output": {"exit_code": 0}},
    )
    tdd_gate.track_test()

    assert _read_state(tmp_repo) == {
        "pending_logic": ["src/parser.py"],
        "pending_glue": [],
        "verified": ["src/components/button.tsx"],
    }


def test_check_commit_blocks_unverified_logic_and_glue(tmp_repo, monkeypatch, capsys) -> None:
    state = {"pending_logic": ["src/parser.py"], "pending_glue": [], "verified": []}
    (tmp_repo / ".git" / "tdd_gate_state.json").write_text(json.dumps(state))
    monkeypatch.setattr(
        tdd_gate,
        "get_staged_files",
        lambda: ["src/parser.py", "src/components/button.tsx"],
    )
    _set_stdin(monkeypatch, {"tool_input": {"command": "git commit -m test"}})

    tdd_gate.check_commit()

    result = json.loads(capsys.readouterr().out)
    assert result["decision"] == "block"
    assert "src/parser.py" in result["reason"]
    assert "src/components/button.tsx" in result["reason"]


def test_check_commit_approves_when_all_staged_sources_are_verified(
    tmp_repo, monkeypatch, capsys
) -> None:
    state = {
        "pending_logic": [],
        "pending_glue": [],
        "verified": ["src/parser.py", "src/components/button.tsx"],
    }
    (tmp_repo / ".git" / "tdd_gate_state.json").write_text(json.dumps(state))
    monkeypatch.setattr(
        tdd_gate,
        "get_staged_files",
        lambda: ["src/parser.py", "src/components/button.tsx"],
    )
    _set_stdin(monkeypatch, {"tool_input": {"command": "git commit -m test"}})

    tdd_gate.check_commit()

    result = json.loads(capsys.readouterr().out)
    assert result["decision"] == "approve"


def test_test_quality_gate_reports_missing_assertions(tmp_path) -> None:
    test_file = tmp_path / "parser.test.ts"
    test_file.write_text("it('works', () => {\n  const value = 1;\n});\n")

    failures = test_quality_gate.check_test_file(str(test_file))
    assert failures == [
        f"NO_ASSERTIONS: {test_file} has no expect()/assert calls — this is not a real test."
    ]


def test_test_quality_gate_reports_trivial_assertions(tmp_path) -> None:
    test_file = tmp_path / "parser.test.ts"
    test_file.write_text("it('works', () => {\n  expect(value).toBeDefined();\n});\n")

    failures = test_quality_gate.check_test_file(str(test_file))
    assert failures == [
        f"TRIVIAL_ONLY: {test_file} — all assertions are shallow "
        "(toBeDefined/toBeTruthy/is not None). Add assertions that verify actual values."
    ]


def test_test_quality_gate_reports_deep_internal_imports(tmp_path) -> None:
    test_file = tmp_path / "parser.test.ts"
    test_file.write_text(
        "import thing from '../../src/internal';\n"
        "it('works', () => {\n  expect(thing).toBe(1);\n});\n"
    )

    failures = test_quality_gate.check_test_file(str(test_file))
    assert failures == [
        f"INTERNAL_IMPORTS: {test_file} imports from deep internal paths: from '../../src/internal'. "
        "Tests should use the public interface."
    ]


def test_test_quality_gate_passes_through_when_no_staged_test_files(
    monkeypatch, capsys
) -> None:
    monkeypatch.setattr(test_quality_gate, "get_staged_files", lambda: [])
    _set_stdin(monkeypatch, {"tool_input": {"command": "git commit -m test"}})

    test_quality_gate.main()

    result = json.loads(capsys.readouterr().out)
    assert result["decision"] == "approve"
