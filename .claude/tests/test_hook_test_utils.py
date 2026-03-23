from pathlib import Path

import hook_test_utils


def test_is_test_file_ignores_helpers_under_test_directories() -> None:
    assert hook_test_utils.is_test_file("tests/helpers/factories.ts") is False
    assert hook_test_utils.is_test_file("src/parser.test.ts") is True


def test_test_file_to_impl_maps_typescript_layouts(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(hook_test_utils, "get_repo_root", lambda: tmp_path)
    (tmp_path / "src/foo").mkdir(parents=True)
    (tmp_path / "src/foo/bar.ts").write_text("export const bar = 1;\n")
    (tmp_path / "src/persona").mkdir(parents=True)
    (tmp_path / "src/persona/gen.ts").write_text("export const gen = 1;\n")

    assert hook_test_utils.test_file_to_impl("src/foo/bar.test.ts") == "src/foo/bar.ts"
    assert hook_test_utils.test_file_to_impl("src/foo/__tests__/bar.test.ts") == "src/foo/bar.ts"
    assert hook_test_utils.test_file_to_impl("tests/unit/persona/gen.test.ts") == "src/persona/gen.ts"


def test_test_file_to_impl_maps_python_naming_conventions(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(hook_test_utils, "get_repo_root", lambda: tmp_path)
    (tmp_path / "src").mkdir()
    (tmp_path / "src/parser.py").write_text("def parse():\n    return True\n")
    (tmp_path / "src/tokenizer.py").write_text("def tokenize():\n    return []\n")

    assert hook_test_utils.test_file_to_impl("tests/test_parser.py") == "src/parser.py"
    assert hook_test_utils.test_file_to_impl("tests/tokenizer_test.py") == "src/tokenizer.py"


def test_classify_test_command_detects_full_suite_and_targeted_files() -> None:
    assert hook_test_utils.classify_test_command("bunx vitest run") == (
        hook_test_utils.SCOPE_FULL_SUITE,
        [],
    )
    assert hook_test_utils.classify_test_command("pytest tests/test_parser.py") == (
        hook_test_utils.SCOPE_TARGETED,
        ["tests/test_parser.py"],
    )


def test_classify_test_command_treats_partial_or_unknown_scope_conservatively() -> None:
    cases = [
        "pytest tests/test_parser.py::test_invalid",
        "pytest -k parser",
        "bunx vitest run src/parser.test.ts -t invalid",
        "bunx vitest run tests/unit/",
        "pytest parser",
    ]

    for command in cases:
        assert hook_test_utils.classify_test_command(command) == (
            hook_test_utils.SCOPE_UNKNOWN,
            [],
        )
