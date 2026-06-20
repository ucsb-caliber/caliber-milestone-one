import pathlib
import shutil
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.coding_autograder import grade_coding_part, sanitize_autograder_result
from app.question_content import QuestionPart


def coding_part():
    return QuestionPart.model_validate(
        {
            "part_id": "a",
            "label": "Program",
            "type": "coding",
            "points": 4,
            "coding": {
                "allowed_languages": ["python", "cpp"],
                "tests": [
                    {"name": "sample", "visibility": "visible", "input": "2\n", "expected_output": "4", "points": 1},
                    {"name": "hidden", "visibility": "hidden", "input": "3\n", "expected_output": "6", "points": 3},
                ],
                "timeout_ms": 1500,
                "memory_mb": 128,
                "max_output_bytes": 10000,
            },
        }
    )


def harness_part():
    return QuestionPart.model_validate(
        {
            "part_id": "a",
            "label": "Functions",
            "type": "coding",
            "points": 3,
            "coding": {
                "allowed_languages": ["python"],
                "tests": [
                    {
                        "name": "double function",
                        "visibility": "visible",
                        "mode": "python_harness",
                        "harness": "import submission\nprint(submission.double(4))\n",
                        "expected_output": "8",
                        "points": 1,
                    },
                    {
                        "name": "Greeter class",
                        "visibility": "hidden",
                        "mode": "python_harness",
                        "harness": "import submission\ng = submission.Greeter('Ada')\nprint(g.message())\n",
                        "expected_output": "Hello, Ada",
                        "points": 2,
                    },
                ],
                "timeout_ms": 1500,
                "memory_mb": 128,
                "max_output_bytes": 10000,
            },
        }
    )


class CodingAutograderTests(unittest.TestCase):
    def test_python_submission_passes_visible_and_hidden_tests(self):
        result = grade_coding_part(
            coding_part(),
            {"language": "python", "code": "n = int(input())\nprint(n * 2)\n"},
        )

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["score"], 4.0)
        self.assertTrue(all(test["passed"] for test in result["tests"]))

    def test_python_wrong_answer_scores_partial(self):
        result = grade_coding_part(
            coding_part(),
            {"language": "python", "code": "n = int(input())\nprint(4)\n"},
        )

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["score"], 1.0)
        self.assertEqual(result["tests"][1]["status"], "wrong_answer")

    def test_timeout_is_normalized(self):
        result = grade_coding_part(
            coding_part(),
            {"language": "python", "code": "while True:\n    pass\n"},
        )

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["score"], 0.0)
        self.assertEqual(result["tests"][0]["status"], "timeout")

    def test_cpp_submission_passes_when_compiler_available(self):
        if not shutil.which("g++"):
            self.skipTest("g++ is not installed")

        result = grade_coding_part(
            coding_part(),
            {
                "language": "cpp",
                "code": "#include <iostream>\nint main(){ int n; std::cin >> n; std::cout << n * 2 << '\\n'; }\n",
            },
        )

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["score"], 4.0)

    def test_python_harness_can_call_submitted_functions_and_classes(self):
        result = grade_coding_part(
            harness_part(),
            {
                "language": "python",
                "code": (
                    "def double(n):\n"
                    "    return n * 2\n\n"
                    "class Greeter:\n"
                    "    def __init__(self, name):\n"
                    "        self.name = name\n"
                    "    def message(self):\n"
                    "        return f'Hello, {self.name}'\n"
                ),
            },
        )

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["score"], 3.0)
        self.assertEqual([test["mode"] for test in result["tests"]], ["python_harness", "python_harness"])

    def test_python_harness_failure_is_a_wrong_answer(self):
        result = grade_coding_part(
            harness_part(),
            {
                "language": "python",
                "code": (
                    "def double(n):\n"
                    "    return n\n\n"
                    "class Greeter:\n"
                    "    def __init__(self, name):\n"
                    "        self.name = name\n"
                    "    def message(self):\n"
                    "        return 'nope'\n"
                ),
            },
        )

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["score"], 0.0)
        self.assertTrue(all(test["status"] == "wrong_answer" for test in result["tests"]))

    def test_hidden_details_are_sanitized(self):
        result = grade_coding_part(
            harness_part(),
            {
                "language": "python",
                "code": (
                    "def double(n):\n"
                    "    return n * 2\n\n"
                    "class Greeter:\n"
                    "    def __init__(self, name):\n"
                    "        self.name = name\n"
                    "    def message(self):\n"
                    "        return f'Hello, {self.name}'\n"
                ),
            },
        )
        sanitized = sanitize_autograder_result(result, include_hidden=False)
        hidden = sanitized["tests"][1]

        self.assertEqual(hidden["visibility"], "hidden")
        self.assertNotIn("input", hidden)
        self.assertNotIn("expected_output", hidden)
        self.assertNotIn("actual_output", hidden)


if __name__ == "__main__":
    unittest.main()
