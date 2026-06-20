import json
import pathlib
import sys
import types
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

pdfplumber_stub = types.ModuleType("pdfplumber")


class _PdfPlumberStubContext:
    pages = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


pdfplumber_stub.open = lambda *args, **kwargs: _PdfPlumberStubContext()
sys.modules.setdefault("pdfplumber", pdfplumber_stub)

from app.main import _build_grading_response, _question_max_points
from app.models import Assignment, Question
from app.question_content import (
    QuestionContent,
    part_max_points,
    legacy_question_to_content,
    question_quality_checks,
    question_content_from_question,
    question_content_to_json,
    validate_canonical_qidish,
    validate_ready_question_content,
)


class QuestionContentTests(unittest.TestCase):
    def test_legacy_mcq_normalizes_to_single_auto_part(self):
        question = Question(
            qid="Q00000001",
            title="Pick",
            text="Pick one",
            question_type="mcq",
            answer_choices=json.dumps(["Alpha", "Beta"]),
            correct_answer="Beta",
            user_id="instructor-1",
        )

        content = legacy_question_to_content(question)

        self.assertEqual(content.stem, "Pick one")
        self.assertEqual(len(content.parts), 1)
        self.assertEqual(content.parts[0].type, "mcq")
        self.assertEqual(content.parts[0].correct_answer, "B")
        self.assertEqual(_question_max_points(question), 1.0)

    def test_structured_multipart_points_sum_parts(self):
        content = QuestionContent.model_validate(
            {
                "schema_version": 1,
                "stem": "Answer both parts.",
                "parts": [
                    {
                        "part_id": "a",
                        "label": "Part A",
                        "type": "mcq",
                        "choices": [{"id": "A", "text": "Yes"}, {"id": "B", "text": "No"}],
                        "correct_answer": "A",
                        "points": 2,
                    },
                    {
                        "part_id": "b",
                        "label": "Part B",
                        "type": "free_response",
                        "rubric": [{"points": 4, "criteria": "Complete"}, {"points": 0, "criteria": ""}],
                    },
                ],
            }
        )
        question = Question(
            qid="ucsb-cs16:multipart",
            title="Multipart",
            text="Legacy fallback",
            content=question_content_to_json(content),
            question_type="multipart",
            answer_choices="[]",
            correct_answer="",
            user_id="instructor-1",
        )

        self.assertEqual(_question_max_points(question), 6.0)

    def test_grading_response_handles_mixed_multipart_qid_keyed_answers(self):
        content = QuestionContent.model_validate(
            {
                "schema_version": 1,
                "stem": "Answer both parts.",
                "parts": [
                    {
                        "part_id": "a",
                        "label": "Part A",
                        "type": "mcq",
                        "choices": [{"id": "A", "text": "Yes"}, {"id": "B", "text": "No"}],
                        "correct_answer": "A",
                        "points": 2,
                    },
                    {
                        "part_id": "b",
                        "label": "Part B",
                        "type": "free_response",
                        "rubric": [{"points": 4, "criteria": "Complete"}, {"points": 2, "criteria": "Partial"}, {"points": 0, "criteria": ""}],
                    },
                ],
            }
        )
        question = Question(
            id=42,
            qid="ucsb-cs16:multipart",
            title="Multipart",
            text="Legacy fallback",
            content=question_content_to_json(content),
            question_type="multipart",
            answer_choices="[]",
            correct_answer="",
            user_id="instructor-1",
        )
        assignment = Assignment(
            id=7,
            instructor_id="instructor-1",
            course="CS 16",
            course_id=1,
            title="Lab",
        )

        response = _build_grading_response(
            assignment=assignment,
            student_id="student-1",
            questions=[question],
            answers_by_question_id={"ucsb-cs16:multipart": {"a": "A", "b": "Because."}},
            grading_data={"ucsb-cs16:multipart": {"parts": {"b": {"score": 4, "comment": "Good"}}}},
            grade_submitted=False,
            stored_score_earned=None,
            stored_score_total=None,
        )

        self.assertEqual(response.score_earned, 6.0)
        self.assertEqual(response.score_total, 6.0)
        self.assertTrue(response.all_questions_fully_graded)
        self.assertEqual(response.questions[0].earned_points, 6.0)
        self.assertTrue(response.questions[0].requires_manual_grading)
        self.assertFalse(response.questions[0].is_auto_graded)

    def test_content_rejects_duplicate_asset_paths(self):
        with self.assertRaisesRegex(ValueError, "asset path values must be unique"):
            QuestionContent.model_validate(
                {
                    "schema_version": 1,
                    "stem": "Use the diagram.",
                    "assets": [
                        {"kind": "image", "path": "assets/diagram.png"},
                        {"kind": "image", "path": "assets/diagram.png"},
                    ],
                    "parts": [
                        {
                            "part_id": "a",
                            "type": "free_response",
                            "rubric": [{"points": 1, "criteria": "Complete"}],
                        }
                    ],
                }
            )

    def test_content_rejects_unsafe_asset_paths(self):
        for path in ["../diagram.png", "/tmp/diagram.png", "assets/../diagram.png", "assets\\diagram.png"]:
            with self.subTest(path=path):
                with self.assertRaisesRegex(ValueError, "asset path"):
                    QuestionContent.model_validate(
                        {
                            "schema_version": 1,
                            "stem": "Use the diagram.",
                            "assets": [{"kind": "image", "path": path}],
                            "parts": [
                                {
                                    "part_id": "a",
                                    "type": "free_response",
                                    "rubric": [{"points": 1, "criteria": "Complete"}],
                                }
                            ],
                        }
                    )

    def test_ready_content_requires_prompt_and_positive_points_by_default(self):
        empty_prompt = QuestionContent.model_validate(
            {
                "schema_version": 1,
                "parts": [
                    {
                        "part_id": "a",
                        "type": "free_response",
                        "rubric": [{"points": 1, "criteria": "Complete"}],
                    }
                ],
            }
        )
        with self.assertRaisesRegex(ValueError, "non-empty prompt"):
            validate_ready_question_content(empty_prompt)

        zero_points = QuestionContent.model_validate(
            {
                "schema_version": 1,
                "stem": "Optional reflection.",
                "parts": [
                    {
                        "part_id": "a",
                        "type": "free_response",
                        "rubric": [{"points": 0, "criteria": "Completion only"}],
                    }
                ],
            }
        )
        with self.assertRaisesRegex(ValueError, "positive points"):
            validate_ready_question_content(zero_points)
        validate_ready_question_content(zero_points, allow_zero_points=True)

    def test_qidish_validation_rejects_noncanonical_values(self):
        self.assertEqual(validate_canonical_qidish("ucsb-cs16:loops.01"), "ucsb-cs16:loops.01")
        for qid in [" ucsb-cs16:loops", "ucsb cs16:loops", "ucsb/cs16:loops", ""]:
            with self.subTest(qid=qid):
                with self.assertRaises(ValueError):
                    validate_canonical_qidish(qid)

    def test_quality_checks_report_authoring_risks(self):
        content = QuestionContent.model_validate(
            {
                "schema_version": 1,
                "stem": "Compute {{ answer }} from {{ missing }}.",
                "randomization": {
                    "enabled": True,
                    "variables": [{"name": "a", "kind": "int", "min": 1, "max": 3}],
                    "computed": [{"name": "answer", "expression": "a + 1"}],
                },
                "parts": [
                    {
                        "part_id": "a",
                        "label": "Part A",
                        "type": "mcq",
                        "choices": [{"id": "A", "text": "Same"}, {"id": "B", "text": "Same"}],
                        "correct_answer": "A",
                        "points": 1,
                    },
                    {
                        "part_id": "b",
                        "label": "Code",
                        "type": "coding",
                        "points": 5,
                        "coding": {
                            "allowed_languages": ["python"],
                            "tests": [
                                {"name": "sample", "visibility": "visible", "mode": "stdin", "input": "1", "expected_output": "2", "points": 1},
                                {"name": "hidden", "visibility": "hidden", "mode": "stdin", "input": "2", "expected_output": "3", "points": 1},
                            ],
                        },
                    },
                ],
            }
        )

        codes = {item["code"] for item in question_quality_checks(content)}

        self.assertIn("duplicate_choice", codes)
        self.assertIn("coding_points_mismatch", codes)
        self.assertIn("visible_test_answer", codes)
        self.assertIn("unresolved_randomization", codes)

    def test_invalid_stored_structured_content_keeps_legacy_fallback(self):
        question = Question(
            qid="Q00000002",
            title="Legacy",
            text="Legacy text",
            content=json.dumps({"schema_version": 1, "assets": [{"kind": "image", "path": "../x.png"}]}),
            question_type="free_response",
            answer_choices="[]",
            correct_answer="",
            user_id="instructor-1",
        )

        content = question_content_from_question(question)

        self.assertEqual(content.stem, "Legacy text")
        self.assertEqual(content.parts[0].type, "free_response")

    def test_coding_part_validates_and_scores_tests(self):
        content = QuestionContent.model_validate(
            {
                "schema_version": 1,
                "stem": "Write a program that echoes stdin.",
                "parts": [
                    {
                        "part_id": "a",
                        "label": "Program",
                        "type": "coding",
                        "points": 5,
                        "coding": {
                            "allowed_languages": ["python", "cpp"],
                            "starter_code_by_language": {"python": "print(input())"},
                            "tests": [
                                {"name": "sample", "visibility": "visible", "input": "hi\n", "expected_output": "hi", "points": 2},
                                {
                                    "name": "hidden",
                                    "visibility": "hidden",
                                    "mode": "python_harness",
                                    "harness": "import submission\nprint(submission.echo('bye'))\n",
                                    "expected_output": "bye",
                                    "points": 3,
                                },
                            ],
                            "timeout_ms": 1000,
                            "memory_mb": 64,
                            "max_output_bytes": 10000,
                        },
                    }
                ],
            }
        )

        self.assertEqual(content.parts[0].type, "coding")
        self.assertEqual(content.parts[0].coding.tests[1].mode, "python_harness")
        self.assertEqual(part_max_points(content.parts[0]), 5.0)

    def test_python_harness_test_requires_harness_code(self):
        with self.assertRaisesRegex(ValueError, "harness code"):
            QuestionContent.model_validate(
                {
                    "schema_version": 1,
                    "stem": "Write code.",
                    "parts": [
                        {
                            "part_id": "a",
                            "type": "coding",
                            "coding": {
                                "allowed_languages": ["python"],
                                "tests": [
                                    {
                                        "name": "function test",
                                        "mode": "python_harness",
                                        "expected_output": "ok",
                                    }
                                ],
                            },
                        }
                    ],
                }
            )

    def test_python_harness_requires_python_language(self):
        with self.assertRaisesRegex(ValueError, "require python"):
            QuestionContent.model_validate(
                {
                    "schema_version": 1,
                    "stem": "Write code.",
                    "parts": [
                        {
                            "part_id": "a",
                            "type": "coding",
                            "coding": {
                                "allowed_languages": ["cpp"],
                                "tests": [
                                    {
                                        "name": "function test",
                                        "mode": "python_harness",
                                        "harness": "import submission\nprint('ok')\n",
                                        "expected_output": "ok",
                                    }
                                ],
                            },
                        }
                    ],
                }
            )

    def test_coding_part_requires_tests(self):
        with self.assertRaisesRegex(ValueError, "at least one test"):
            QuestionContent.model_validate(
                {
                    "schema_version": 1,
                    "stem": "Write code.",
                    "parts": [
                        {
                            "part_id": "a",
                            "type": "coding",
                            "coding": {"allowed_languages": ["python"], "tests": []},
                        }
                    ],
                }
            )


if __name__ == "__main__":
    unittest.main()
