from __future__ import annotations

import os
import resource
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

from .question_content import QuestionPart, part_max_points


SUPPORTED_LANGUAGES = {"python", "cpp"}


def _normalize_output(value: str) -> str:
    return "\n".join(line.rstrip() for line in str(value or "").strip().splitlines()).strip()


def _truncate(value: str, max_bytes: int) -> str:
    encoded = str(value or "").encode("utf-8", errors="replace")
    if len(encoded) <= max_bytes:
        return str(value or "")
    return encoded[:max_bytes].decode("utf-8", errors="replace") + "\n[output truncated]"


def _limit_process(memory_mb: int) -> None:
    memory_bytes = max(32, int(memory_mb or 128)) * 1024 * 1024
    try:
        resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
        resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
    except Exception:
        pass


def _run_command(
    command: list[str],
    *,
    cwd: Path,
    stdin: str = "",
    timeout_ms: int,
    memory_mb: int,
    max_output_bytes: int,
) -> dict[str, Any]:
    started = time.monotonic()
    try:
        completed = subprocess.run(
            command,
            input=stdin,
            text=True,
            cwd=str(cwd),
            capture_output=True,
            timeout=max(0.1, timeout_ms / 1000),
            preexec_fn=(lambda: _limit_process(memory_mb)) if os.name == "posix" else None,
        )
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return {
            "status": "completed",
            "returncode": completed.returncode,
            "stdout": _truncate(completed.stdout, max_output_bytes),
            "stderr": _truncate(completed.stderr, max_output_bytes),
            "elapsed_ms": elapsed_ms,
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "status": "timeout",
            "returncode": None,
            "stdout": _truncate(exc.stdout or "", max_output_bytes),
            "stderr": _truncate(exc.stderr or "", max_output_bytes),
            "elapsed_ms": timeout_ms,
        }


def _python_command_for_test(test: Any, workdir: Path, source: Path) -> list[str]:
    if getattr(test, "mode", "stdin") != "python_harness":
        return [sys.executable, str(source)]
    harness = workdir / "harness.py"
    harness.write_text(str(getattr(test, "harness", "") or ""), encoding="utf-8")
    return [sys.executable, str(harness)]


def _test_points(part: QuestionPart) -> list[float]:
    tests = part.coding.tests if part.coding else []
    explicit = [test.points for test in tests]
    if any(points is not None for points in explicit):
        return [float(points or 0) for points in explicit]
    total = part_max_points(part)
    if not tests:
        return []
    each = total / len(tests) if total else 0.0
    return [each for _ in tests]


def grade_coding_part(part: QuestionPart, answer: Any) -> dict[str, Any]:
    coding = part.coding
    if not coding:
        return {"status": "error", "error": "Coding metadata is missing", "score": 0.0, "max_score": 0.0, "tests": []}

    payload = answer if isinstance(answer, dict) else {}
    language = str(payload.get("language") or coding.allowed_languages[0] or "").strip().lower()
    code = str(payload.get("code") or "")
    max_score = part_max_points(part)

    if language not in SUPPORTED_LANGUAGES or language not in coding.allowed_languages:
        return {
            "status": "error",
            "error": f"Unsupported language: {language or 'blank'}",
            "score": 0.0,
            "max_score": max_score,
            "tests": [],
        }
    if not code.strip():
        return {
            "status": "completed",
            "score": 0.0,
            "max_score": max_score,
            "tests": [
                {
                    "name": test.name,
                    "visibility": test.visibility,
                    "status": "missing_code",
                    "passed": False,
                    "points": points,
                    "earned": 0.0,
                }
                for test, points in zip(coding.tests, _test_points(part))
            ],
        }

    with tempfile.TemporaryDirectory(prefix="caliber-code-") as temp_dir:
        workdir = Path(temp_dir)
        executable: Path | None = None

        if language == "python":
            source = workdir / "submission.py"
            source.write_text(code, encoding="utf-8")
            command_base = [sys.executable, str(source)]
        else:
            unsupported_harness = next((test for test in coding.tests if getattr(test, "mode", "stdin") == "python_harness"), None)
            if unsupported_harness:
                return {
                    "status": "error",
                    "error": "python_harness tests can only run Python submissions",
                    "score": 0.0,
                    "max_score": max_score,
                    "tests": [],
                }
            source = workdir / "submission.cpp"
            executable = workdir / "submission"
            source.write_text(code, encoding="utf-8")
            compiler = shutil.which("g++")
            if not compiler:
                return {"status": "error", "error": "g++ is not available", "score": 0.0, "max_score": max_score, "tests": []}
            compile_result = _run_command(
                [compiler, "-std=c++17", "-O2", "-pipe", str(source), "-o", str(executable)],
                cwd=workdir,
                timeout_ms=max(1000, int(coding.timeout_ms)),
                memory_mb=int(coding.memory_mb),
                max_output_bytes=int(coding.max_output_bytes),
            )
            if compile_result["status"] == "timeout":
                return {
                    "status": "compile_timeout",
                    "error": "Compilation timed out",
                    "score": 0.0,
                    "max_score": max_score,
                    "tests": [],
                    "stderr": compile_result.get("stderr", ""),
                }
            if compile_result.get("returncode") != 0:
                return {
                    "status": "compile_error",
                    "error": "Compilation failed",
                    "score": 0.0,
                    "max_score": max_score,
                    "tests": [],
                    "stderr": compile_result.get("stderr", ""),
                }
            command_base = [str(executable)]

        earned_total = 0.0
        test_results: list[dict[str, Any]] = []
        for test, points in zip(coding.tests, _test_points(part)):
            command = _python_command_for_test(test, workdir, source) if language == "python" else command_base
            result = _run_command(
                command,
                cwd=workdir,
                stdin=test.input,
                timeout_ms=int(coding.timeout_ms),
                memory_mb=int(coding.memory_mb),
                max_output_bytes=int(coding.max_output_bytes),
            )
            expected = _normalize_output(test.expected_output)
            actual = _normalize_output(result.get("stdout", ""))
            passed = result["status"] == "completed" and result.get("returncode") == 0 and actual == expected
            earned = float(points) if passed else 0.0
            earned_total += earned
            status = "passed" if passed else result["status"]
            if result["status"] == "completed" and result.get("returncode") != 0:
                status = "runtime_error"
            elif result["status"] == "completed" and not passed:
                status = "wrong_answer"
            test_results.append(
                {
                    "name": test.name,
                    "visibility": test.visibility,
                    "status": status,
                    "passed": passed,
                    "mode": getattr(test, "mode", "stdin"),
                    "points": float(points),
                    "earned": earned,
                    "input": test.input if test.visibility == "visible" else "",
                    "expected_output": test.expected_output if test.visibility == "visible" else "",
                    "actual_output": result.get("stdout", "") if test.visibility == "visible" else "",
                    "stderr": result.get("stderr", "") if test.visibility == "visible" else "",
                    "elapsed_ms": result.get("elapsed_ms", 0),
                }
            )

    return {
        "status": "completed",
        "score": round(earned_total, 4),
        "max_score": round(max_score, 4),
        "language": language,
        "tests": test_results,
    }


def sanitize_autograder_result(result: dict[str, Any], *, include_hidden: bool = False) -> dict[str, Any]:
    def sanitize_tests(raw_tests: Any) -> list[dict[str, Any]]:
        tests = []
        for test in raw_tests or []:
            item = dict(test)
            if item.get("visibility") == "hidden" and not include_hidden:
                item.pop("input", None)
                item.pop("expected_output", None)
                item.pop("actual_output", None)
                item.pop("stderr", None)
            tests.append(item)
        return tests

    sanitized = dict(result or {})
    sanitized["tests"] = sanitize_tests(sanitized.get("tests", []))
    if isinstance(sanitized.get("parts"), dict):
        sanitized["parts"] = {
            key: {**dict(value), "tests": sanitize_tests(dict(value).get("tests", []))}
            for key, value in sanitized["parts"].items()
            if isinstance(value, dict)
        }
    return sanitized
