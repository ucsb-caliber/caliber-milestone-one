import json
import pathlib
import sys
import types
import unittest

from sqlmodel import Session, SQLModel, create_engine

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

from app.main import _assignment_refs_for_questions, _ensure_progress_variants, _render_questions_for_progress
from app.models import Assignment, AssignmentProgress, Question
from app.question_content import QuestionContent, question_content_to_json
from app.question_randomization import RandomizationError, render_content_with_values


def randomized_content():
    return QuestionContent.model_validate(
        {
            "schema_version": 1,
            "stem": "What is {{ a }} * {{ b }}?",
            "randomization": {
                "enabled": True,
                "seed_policy": "student_assignment_question",
                "variables": [
                    {"name": "a", "kind": "int", "min": 2, "max": 12},
                    {"name": "b", "kind": "choice", "values": [3, 5, 7]},
                    {"name": "nums", "kind": "list", "item_kind": "int", "length": 3, "min": 1, "max": 4},
                ],
                "computed": [
                    {"name": "answer", "expression": "a * b"},
                    {"name": "total", "expression": "sum(nums)"},
                ],
            },
            "parts": [
                {
                    "part_id": "a",
                    "type": "mcq",
                    "choices": [
                        {"id": "A", "text": "{{ answer }}"},
                        {"id": "B", "text": "{{ total }}"},
                    ],
                    "correct_answer": "A",
                    "points": 1,
                },
                {
                    "part_id": "code",
                    "type": "coding",
                    "points": 1,
                    "coding": {
                        "allowed_languages": ["python"],
                        "starter_code_by_language": {"python": "def f():\n    return {{ answer }}\n"},
                        "tests": [
                            {
                                "name": "harness",
                                "mode": "python_harness",
                                "harness": "import submission\nprint(submission.f())\n",
                                "expected_output": "{{ answer }}",
                                "points": 1,
                            }
                        ],
                    },
                },
            ],
        }
    )


class QuestionRandomizationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)

    def test_schema_rejects_duplicate_names_and_unsafe_expressions(self):
        with self.assertRaisesRegex(ValueError, "unique"):
            QuestionContent.model_validate(
                {
                    "schema_version": 1,
                    "stem": "x",
                    "randomization": {
                        "enabled": True,
                        "variables": [{"name": "a", "kind": "int", "min": 1, "max": 2}],
                        "computed": [{"name": "a", "expression": "1 + 1"}],
                    },
                }
            )
        with self.assertRaisesRegex(ValueError, "unsupported"):
            QuestionContent.model_validate(
                {
                    "schema_version": 1,
                    "stem": "x",
                    "randomization": {
                        "enabled": True,
                        "variables": [{"name": "a", "kind": "int", "min": 1, "max": 2}],
                        "computed": [{"name": "bad", "expression": "__import__('os').system('true')"}],
                    },
                }
            )

    def test_render_content_replaces_prompt_choices_starter_and_tests(self):
        rendered = render_content_with_values(
            randomized_content(),
            {"a": 4, "b": 5, "answer": 20, "nums": [1, 2, 3], "total": 6},
        )
        self.assertEqual(rendered.stem, "What is 4 * 5?")
        self.assertEqual(rendered.parts[0].choices[0].text, "20")
        self.assertEqual(rendered.parts[1].coding.starter_code_by_language["python"], "def f():\n    return 20\n")
        self.assertEqual(rendered.parts[1].coding.tests[0].expected_output, "20")

    def test_render_rejects_unresolved_placeholders(self):
        with self.assertRaises(RandomizationError):
            render_content_with_values(randomized_content(), {"a": 1})

    def test_progress_variants_are_stable_and_student_specific(self):
        with Session(self.engine) as session:
            content = randomized_content()
            question = Question(
                qid="rand:multiply",
                version=1,
                title="Multiply",
                text=content.stem,
                content=question_content_to_json(content),
                question_type="multipart",
                answer_choices="[]",
                correct_answer="",
                user_id="instructor",
            )
            assignment = Assignment(
                instructor_id="instructor",
                course_id=1,
                title="HW",
                assignment_questions="[]",
                assignment_question_refs=json.dumps([
                    {
                        "id": 1,
                        "qid": "rand:multiply",
                        "version": 1,
                        "question_snapshot": {
                            "qid": "rand:multiply",
                            "version": 1,
                            "title": "Multiply",
                            "text": content.stem,
                            "content": content.model_dump(mode="json", exclude_none=True),
                            "question_type": "multipart",
                            "answer_choices": "[]",
                            "correct_answer": "",
                        },
                    }
                ]),
            )
            progress_a = AssignmentProgress(assignment_id=1, student_id="student-a", answers="{}", variant_data="{}")
            progress_b = AssignmentProgress(assignment_id=1, student_id="student-b", answers="{}", variant_data="{}")
            session.add(question)
            session.add(assignment)
            session.add(progress_a)
            session.add(progress_b)
            session.commit()
            session.refresh(assignment)
            session.refresh(progress_a)
            session.refresh(progress_b)

            progress_a = _ensure_progress_variants(session, assignment=assignment, progress=progress_a, questions=[question])
            first = json.loads(progress_a.variant_data)
            progress_a = _ensure_progress_variants(session, assignment=assignment, progress=progress_a, questions=[question])
            self.assertEqual(first, json.loads(progress_a.variant_data))

            progress_b = _ensure_progress_variants(session, assignment=assignment, progress=progress_b, questions=[question])
            self.assertNotEqual(first["rand:multiply"]["values"], json.loads(progress_b.variant_data)["rand:multiply"]["values"])

            rendered = _render_questions_for_progress(session, assignment=assignment, progress=progress_a, questions=[question])[0]
            rendered_content = json.loads(rendered.content)
            self.assertNotIn("{{", rendered_content["stem"])
            refs = _assignment_refs_for_questions([rendered])
            payload = refs[0]["question_snapshot"]["content"]
            self.assertNotIn("correct_answer", payload["parts"][0])
            hidden_test = payload["parts"][1]["coding"]["tests"][0]
            self.assertNotIn("expected_output", hidden_test)
            self.assertNotIn("harness", hidden_test)


if __name__ == "__main__":
    unittest.main()
