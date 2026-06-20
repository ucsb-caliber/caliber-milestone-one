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

from app.crud import build_assignment_question_refs, create_assignment, get_all_questions, get_all_questions_count
from app.models import Question
from app.question_content import QuestionContent, question_content_to_json


class QuestionRefsVisibilityTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)

    def test_assignment_question_refs_include_qid_version_and_snapshot(self):
        content = QuestionContent.model_validate(
            {
                "schema_version": 1,
                "stem": "Pick one.",
                "randomization": {
                    "enabled": True,
                    "variables": [{"name": "n", "kind": "int", "min": 1, "max": 3}],
                },
                "parts": [
                    {
                        "part_id": "a",
                        "label": "Part A",
                        "type": "mcq",
                        "choices": [{"id": "A", "text": "Yes"}, {"id": "B", "text": "No"}],
                        "correct_answer": "A",
                        "points": 1,
                    }
                ],
            }
        )
        with Session(self.engine) as session:
            question = Question(
                qid="ucsb-cs16:pick-one",
                version=3,
                title="Pick One",
                text="Legacy",
                content=question_content_to_json(content),
                question_type="mcq",
                answer_choices=json.dumps(["Yes", "No"]),
                correct_answer="Yes",
                user_id="instructor-1",
            )
            session.add(question)
            session.commit()
            session.refresh(question)

            refs = build_assignment_question_refs(session, [question.id])
            self.assertEqual(refs[0]["qid"], "ucsb-cs16:pick-one")
            self.assertEqual(refs[0]["version"], 3)
            self.assertEqual(refs[0]["position"], 0)
            self.assertEqual(refs[0]["question_snapshot"]["content"]["stem"], "Pick one.")
            self.assertEqual(refs[0]["question_snapshot"]["correct_answer"], "")
            self.assertNotIn("randomization", refs[0]["question_snapshot"]["content"])
            self.assertNotIn("correct_answer", refs[0]["question_snapshot"]["content"]["parts"][0])

            assignment = create_assignment(
                session=session,
                course_id=1,
                instructor_id="instructor-1",
                title="HW",
                assignment_questions=[question.id],
            )
            stored_refs = json.loads(assignment.assignment_question_refs)
            self.assertEqual(stored_refs[0]["qid"], "ucsb-cs16:pick-one")
            self.assertEqual(stored_refs[0]["question_snapshot"]["correct_answer"], "")
            self.assertNotIn("randomization", stored_refs[0]["question_snapshot"]["content"])
            self.assertNotIn("correct_answer", stored_refs[0]["question_snapshot"]["content"]["parts"][0])

    def test_visible_question_listing_hides_other_users_private_questions(self):
        with Session(self.engine) as session:
            session.add(
                Question(
                    qid="owner:private",
                    title="Private Owner",
                    text="",
                    question_type="mcq",
                    answer_choices="[]",
                    correct_answer="",
                    user_id="owner",
                    owner_user_id="owner",
                    visibility="private",
                    draft_state="ready",
                )
            )
            session.add(
                Question(
                    qid="other:private",
                    title="Private Other",
                    text="",
                    question_type="mcq",
                    answer_choices="[]",
                    correct_answer="",
                    user_id="other",
                    owner_user_id="other",
                    visibility="private",
                    draft_state="ready",
                )
            )
            session.add(
                Question(
                    qid="shared:global",
                    title="Global Shared",
                    text="",
                    question_type="mcq",
                    answer_choices="[]",
                    correct_answer="",
                    user_id="other",
                    owner_user_id="other",
                    visibility="global",
                    draft_state="ready",
                )
            )
            session.add(
                Question(
                    qid="shared:school-match",
                    title="School Match",
                    text="",
                    question_type="mcq",
                    answer_choices="[]",
                    correct_answer="",
                    user_id="other",
                    owner_user_id="other",
                    visibility="school",
                    school_scope="UCSB",
                    draft_state="ready",
                )
            )
            session.add(
                Question(
                    qid="shared:school-other",
                    title="School Other",
                    text="",
                    question_type="mcq",
                    answer_choices="[]",
                    correct_answer="",
                    user_id="other",
                    owner_user_id="other",
                    visibility="school",
                    school_scope="Other School",
                    draft_state="ready",
                )
            )
            session.add(
                Question(
                    qid="shared:course-match",
                    title="Course Match",
                    text="",
                    question_type="mcq",
                    answer_choices="[]",
                    correct_answer="",
                    user_id="other",
                    owner_user_id="other",
                    visibility="course",
                    course_scope="7",
                    draft_state="ready",
                )
            )
            session.add(
                Question(
                    qid="shared:course-other",
                    title="Course Other",
                    text="",
                    question_type="mcq",
                    answer_choices="[]",
                    correct_answer="",
                    user_id="other",
                    owner_user_id="other",
                    visibility="course",
                    course_scope="9",
                    draft_state="ready",
                )
            )
            session.commit()

            qids = {
                question.qid
                for question in get_all_questions(
                    session,
                    user_id="owner",
                    school_scope="UCSB",
                    course_scope_ids=["7"],
                )
            }
            self.assertIn("owner:private", qids)
            self.assertIn("shared:global", qids)
            self.assertIn("shared:school-match", qids)
            self.assertIn("shared:course-match", qids)
            self.assertNotIn("other:private", qids)
            self.assertNotIn("shared:school-other", qids)
            self.assertNotIn("shared:course-other", qids)
            self.assertEqual(
                get_all_questions_count(
                    session,
                    user_id="owner",
                    school_scope="UCSB",
                    course_scope_ids=["7"],
                ),
                4,
            )

    def test_visible_question_listing_returns_latest_version_per_qid(self):
        with Session(self.engine) as session:
            session.add(
                Question(
                    qid="shared:versioned",
                    version=1,
                    title="Old Version",
                    text="",
                    question_type="mcq",
                    answer_choices="[]",
                    correct_answer="",
                    user_id="owner",
                    owner_user_id="owner",
                    visibility="global",
                    draft_state="ready",
                )
            )
            session.add(
                Question(
                    qid="shared:versioned",
                    version=2,
                    title="New Version",
                    text="",
                    question_type="mcq",
                    answer_choices="[]",
                    correct_answer="",
                    user_id="owner",
                    owner_user_id="owner",
                    visibility="global",
                    draft_state="ready",
                )
            )
            session.commit()

            questions = get_all_questions(session, user_id="viewer")
            self.assertEqual(len(questions), 1)
            self.assertEqual(questions[0].version, 2)
            self.assertEqual(questions[0].title, "New Version")
            self.assertEqual(get_all_questions_count(session, user_id="viewer"), 1)


if __name__ == "__main__":
    unittest.main()
