import json
import math
import os
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any, Optional

import requests


DEFAULT_CPP_STARTER_CODE = """class Solution {
public:
    int solve(int n) {
        return n;
    }
};
"""


def _safe_json_loads(raw: Any, default: Any) -> Any:
    if raw in (None, ""):
        return default
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return default


def normalize_coding_test(test: Any, index: int) -> dict[str, str]:
    if isinstance(test, str):
        return {
            "name": f"Test {index + 1}",
            "description": "",
            "input": "",
            "output": "",
            "code": test,
        }
    if not isinstance(test, dict):
        return {
            "name": f"Test {index + 1}",
            "description": "",
            "input": "",
            "output": "",
            "code": "",
        }
    return {
        "name": str(test.get("name") or f"Test {index + 1}").strip(),
        "description": str(test.get("description") or "").strip(),
        "input": str(test.get("input") or "").strip(),
        "output": str(test.get("output") or "").strip(),
        "code": str(test.get("code") or "").strip(),
    }


def normalize_coding_tests(raw: Any) -> list[dict[str, str]]:
    parsed = _safe_json_loads(raw, [])
    if not isinstance(parsed, list):
        return []
    normalized = [normalize_coding_test(item, idx) for idx, item in enumerate(parsed)]
    return [item for item in normalized if item["code"]]


def normalize_coding_public_config(raw: Any) -> dict[str, Any]:
    parsed = _safe_json_loads(raw, {})
    if not isinstance(parsed, dict):
        parsed = {}
    points_raw = parsed.get("points", 1.0)
    try:
        points = max(0.0, float(points_raw))
    except (TypeError, ValueError):
        points = 1.0
    return {
        "language": "cpp",
        "function_signature": str(parsed.get("function_signature") or "").strip(),
        "starter_code": str(parsed.get("starter_code") or DEFAULT_CPP_STARTER_CODE),
        "visible_tests": normalize_coding_tests(parsed.get("visible_tests")),
        "time_limit_ms": max(250, int(parsed.get("time_limit_ms") or 2000)),
        "memory_limit_mb": max(64, int(parsed.get("memory_limit_mb") or 256)),
        "points": points or 1.0,
    }


def serialize_coding_public_config(config: dict[str, Any]) -> str:
    normalized = normalize_coding_public_config(config)
    return json.dumps(normalized)


def serialize_coding_hidden_tests(raw: Any) -> str:
    return json.dumps(normalize_coding_tests(raw))


def build_cpp_harness(source_code: str, tests: list[dict[str, str]]) -> str:
    parts = [
        "#include <algorithm>",
        "#include <exception>",
        "#include <iomanip>",
        "#include <iostream>",
        "#include <sstream>",
        "#include <string>",
        "#include <utility>",
        "#include <vector>",
        "using namespace std;",
        "",
        "static string caliber_sanitize(string value) {",
        "    for (char &ch : value) {",
        "        if (ch == '\\n' || ch == '\\r' || ch == '|') ch = ' ';",
        "    }",
        "    return value;",
        "}",
        "",
        "static string caliber_to_string(const string &value) {",
        "    return value;",
        "}",
        "",
        "static string caliber_to_string(const char *value) {",
        "    return value ? string(value) : string(\"\");",
        "}",
        "",
        "static string caliber_to_string(char value) {",
        "    return string(1, value);",
        "}",
        "",
        "static string caliber_to_string(bool value) {",
        "    return value ? \"true\" : \"false\";",
        "}",
        "",
        "template <typename A, typename B>",
        "static string caliber_to_string(const pair<A, B> &value) {",
        "    return string(\"(\") + caliber_to_string(value.first) + \", \" + caliber_to_string(value.second) + \")\";",
        "}",
        "",
        "template <typename T>",
        "static string caliber_to_string(const vector<T> &values) {",
        "    ostringstream oss;",
        "    oss << \"[\";",
        "    for (size_t i = 0; i < values.size(); ++i) {",
        "        if (i > 0) oss << \", \";",
        "        oss << caliber_to_string(values[i]);",
        "    }",
        "    oss << \"]\";",
        "    return oss.str();",
        "}",
        "",
        "template <typename T>",
        "static string caliber_to_string(const T &value) {",
        "    ostringstream oss;",
        "    oss << boolalpha << value;",
        "    return oss.str();",
        "}",
        "",
        "template <typename Actual, typename Expected>",
        "static bool caliber_expect_eq(",
        "    const Actual &actual,",
        "    const Expected &expected,",
        "    string &message,",
        "    string &expected_output,",
        "    string &received_output",
        ") {",
        "    expected_output = caliber_to_string(expected);",
        "    received_output = caliber_to_string(actual);",
        "    if (actual == expected) {",
        "        return true;",
        "    }",
        "    if (message.empty()) {",
        "        message = string(\"Expected: \") + expected_output + \". Received: \" + received_output + \".\";",
        "    }",
        "    return false;",
        "}",
        "",
        source_code.strip(),
        "",
    ]

    for idx, test in enumerate(tests):
        parts.extend(
            [
                f"static bool caliber_test_{idx}(string &message) {{",
                "    try {",
                f"        string configured_expected_output = {json.dumps(test.get('output') or '')};",
                "        string expected_output;",
                "        string received_output;",
                "        bool passed = [&]() -> bool {",
                test["code"],
                "        }();",
                "        if (!passed && message.empty()) {",
                "            if (expected_output.empty() && !configured_expected_output.empty()) {",
                "                expected_output = configured_expected_output;",
                "            }",
                "            if (!expected_output.empty() || !received_output.empty()) {",
                '                string fallback_received = received_output.empty() ? "different output" : received_output;',
                '                message = string("Expected: ") + expected_output + ". Received: " + fallback_received + ".";',
                "            } else {",
                '                message = "Test condition returned false.";',
                "            }",
                "        }",
                f'        cout << "__CALIBER_META__|{idx}|" << caliber_sanitize(expected_output.empty() ? configured_expected_output : expected_output) << "|" << caliber_sanitize(received_output) << "\\n";',
                "        return passed;",
                "    } catch (const exception &ex) {",
                '        message = string("Exception: ") + ex.what();',
                f'        cout << "__CALIBER_META__|{idx}|" << caliber_sanitize({json.dumps(test.get("output") or "")}) << "|" << "\\n";',
                "        return false;",
                "    } catch (...) {",
                '        message = "Unknown exception";',
                f'        cout << "__CALIBER_META__|{idx}|" << caliber_sanitize({json.dumps(test.get("output") or "")}) << "|" << "\\n";',
                "        return false;",
                "    }",
                "}",
                "",
            ]
        )

    parts.extend(
        [
            "int main() {",
            "    ios::sync_with_stdio(false);",
            "    cin.tie(nullptr);",
            "    int failures = 0;",
        ]
    )

    for idx, test in enumerate(tests):
        parts.extend(
            [
                "    {",
                "        string message;",
                f"        bool passed = caliber_test_{idx}(message);",
                "        if (!passed) failures++;",
                f'        cout << "__CALIBER__|{idx}|" << (passed ? "PASS" : "FAIL") << "|" << caliber_sanitize(message) << "\\n";',
                "    }",
            ]
        )

    parts.extend(
        [
            "    return failures == 0 ? 0 : 1;",
            "}",
            "",
        ]
    )

    return "\n".join(parts)


def _parse_cpp_test_output(stdout: str, tests: list[dict[str, str]]) -> tuple[list[dict[str, str]], str]:
    parsed_by_index: dict[int, dict[str, str]] = {}
    metadata_by_index: dict[int, dict[str, str]] = {}
    extra_lines: list[str] = []

    for raw_line in (stdout or "").splitlines():
        if raw_line.startswith("__CALIBER__|"):
            _, idx_raw, status, message = (raw_line.split("|", 3) + [""])[:4]
            try:
                idx = int(idx_raw)
            except ValueError:
                continue
            parsed_by_index[idx] = {
                "status": "passed" if status == "PASS" else "failed",
                "message": message.strip(),
            }
            continue
        if raw_line.startswith("__CALIBER_META__|"):
            _, idx_raw, expected_output, received_output = (raw_line.split("|", 3) + ["", ""])[:4]
            try:
                idx = int(idx_raw)
            except ValueError:
                continue
            metadata_by_index[idx] = {
                "expected_output": expected_output.strip(),
                "received_output": received_output.strip(),
            }
            continue
        if raw_line.strip():
            extra_lines.append(raw_line)

    results: list[dict[str, str]] = []
    overall = "accepted"
    for idx, test in enumerate(tests):
        parsed = parsed_by_index.get(idx, {"status": "failed", "message": "No result returned."})
        metadata = metadata_by_index.get(idx, {})
        if parsed["status"] != "passed":
            overall = "wrong_answer"
        expected_output = metadata.get("expected_output") or test.get("output") or ""
        received_output = metadata.get("received_output") or ""
        results.append(
            {
                "name": test["name"],
                "description": test["description"],
                "input": test.get("input", ""),
                "status": parsed["status"],
                "message": parsed["message"],
                "expected_output": expected_output,
                "received_output": received_output,
            }
        )
    return results, "\n".join(extra_lines).strip()


def _run_subprocess(command: list[str], *, cwd: Path, timeout_sec: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        timeout=timeout_sec,
        check=False,
    )


def _execute_cpp_locally(
    *,
    source_code: str,
    tests: list[dict[str, str]],
    time_limit_ms: int,
    memory_limit_mb: int,
) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="caliber-cpp-") as tempdir_raw:
        tempdir = Path(tempdir_raw)
        os.chmod(tempdir, 0o777)
        harness_path = tempdir / "main.cpp"
        binary_path = tempdir / "student_exec"
        harness_path.write_text(build_cpp_harness(source_code, tests), encoding="utf-8")
        os.chmod(harness_path, 0o666)

        compile_timeout_sec = 30
        run_timeout_sec = max(1, math.ceil(max(time_limit_ms, 250) / 1000.0) + 1)

        use_docker = str(os.getenv("CODING_RUNNER_USE_DOCKER", "")).strip().lower() in {"1", "true", "yes"}
        if use_docker:
            image = os.getenv("CODING_RUNNER_CPP_IMAGE", "gcc:14")
            compile_cmd = [
                "docker", "run", "--rm",
                "--network", "none",
                "--memory", f"{max(64, memory_limit_mb)}m",
                "--cpus", "1.0",
                "--pids-limit", "128",
                "--security-opt", "no-new-privileges",
                "--cap-drop", "ALL",
                "-v", f"{tempdir}:/workspace",
                "-w", "/workspace",
                image,
                "sh", "-lc",
                "g++ -std=c++17 -O2 -pipe -o student_exec main.cpp",
            ]
            run_cmd = [
                "docker", "run", "--rm",
                "--network", "none",
                "--memory", f"{max(64, memory_limit_mb)}m",
                "--cpus", "1.0",
                "--pids-limit", "128",
                "--security-opt", "no-new-privileges",
                "--cap-drop", "ALL",
                "-v", f"{tempdir}:/workspace",
                "-w", "/workspace",
                image,
                "sh", "-lc",
                "./student_exec",
            ]
        else:
            compile_cmd = ["g++", "-std=c++17", "-O2", "-pipe", "-o", str(binary_path), str(harness_path)]
            run_cmd = [str(binary_path)]

        started_at = time.time()
        compile_proc = _run_subprocess(compile_cmd, cwd=tempdir, timeout_sec=compile_timeout_sec)
        if compile_proc.returncode != 0:
            return {
                "status": "compile_error",
                "verdict": "compile_error",
                "compile_output": (compile_proc.stderr or compile_proc.stdout or "").strip(),
                "runtime_output": "",
                "elapsed_ms": int((time.time() - started_at) * 1000),
                "tests": [],
            }

        try:
            run_proc = _run_subprocess(run_cmd, cwd=tempdir, timeout_sec=run_timeout_sec)
        except subprocess.TimeoutExpired:
            return {
                "status": "timeout",
                "verdict": "time_limit_exceeded",
                "compile_output": "",
                "runtime_output": "Execution exceeded the time limit.",
                "elapsed_ms": int((time.time() - started_at) * 1000),
                "tests": [
                    {
                        "name": test["name"],
                        "description": test["description"],
                        "input": test.get("input", ""),
                        "status": "failed",
                        "message": "Execution exceeded the time limit.",
                        "expected_output": test.get("output", ""),
                        "received_output": "",
                    }
                    for test in tests
                ],
            }

        parsed_tests, extra_stdout = _parse_cpp_test_output(run_proc.stdout, tests)
        verdict = "accepted"
        status = "ok"
        runtime_output = "\n".join(filter(None, [extra_stdout, (run_proc.stderr or "").strip()])).strip()
        if any(test["status"] != "passed" for test in parsed_tests):
            verdict = "wrong_answer"
        if run_proc.returncode != 0 and verdict == "accepted":
            verdict = "runtime_error"
            status = "runtime_error"
            parsed_tests = [
                {
                    **test,
                    "status": "failed",
                    "message": test["message"] or "Program exited with a runtime error.",
                }
                for test in parsed_tests
            ]

        return {
            "status": status,
            "verdict": verdict,
            "compile_output": "",
            "runtime_output": runtime_output,
            "elapsed_ms": int((time.time() - started_at) * 1000),
            "tests": parsed_tests,
        }


def execute_coding_request(payload: dict[str, Any]) -> dict[str, Any]:
    runner_url = str(os.getenv("CODING_RUNNER_URL", "")).strip()
    if runner_url:
        response = requests.post(
            f"{runner_url.rstrip('/')}/internal/execute",
            json=payload,
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        if isinstance(data, dict):
            return data

    language = str(payload.get("language") or "cpp").strip().lower()
    tests = normalize_coding_tests(payload.get("tests"))
    if not tests:
        return {
            "status": "invalid_request",
            "verdict": "no_tests",
            "compile_output": "",
            "runtime_output": "No tests were configured for this coding question.",
            "elapsed_ms": 0,
            "tests": [],
        }
    if language != "cpp":
        return {
            "status": "invalid_request",
            "verdict": "unsupported_language",
            "compile_output": "",
            "runtime_output": f"Unsupported language: {language}",
            "elapsed_ms": 0,
            "tests": [],
        }

    return _execute_cpp_locally(
        source_code=str(payload.get("source_code") or ""),
        tests=tests,
        time_limit_ms=max(250, int(payload.get("time_limit_ms") or 2000)),
        memory_limit_mb=max(64, int(payload.get("memory_limit_mb") or 256)),
    )
