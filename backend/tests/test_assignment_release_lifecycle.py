import json
import pathlib
import sys
import types
import unittest
from datetime import datetime

from sqlmodel import Session, SQLModel, create_engine, select

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

from app.main import _get_assignment_phase, _sync_assignment_post_due_grading
from app.models import Assignment, AssignmentProgress, Question


class AssignmentReleaseLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)

    def test_assignment_phase_uses_in_progress_ungraded_and_graded(self):
        assignment = Assignment(
            instructor_id="instructor-1",
            course="CS 101",
            course_id=7,
            title="Homework 1",
            release_date=datetime(2026, 3, 1, 9, 0, 0),
            due_date_soft=datetime(2026, 3, 10, 9, 0, 0),
            due_date_hard=datetime(2026, 3, 20, 9, 0, 0),
        )
        self.assertEqual(
            _get_assignment_phase(assignment, now=datetime(2026, 3, 11, 9, 0, 0)),
            "in_progress",
        )
        self.assertEqual(
            _get_assignment_phase(assignment, now=datetime(2026, 3, 21, 9, 0, 0)),
            "ungraded",
        )

        assignment.grade_released = True
        self.assertEqual(
            _get_assignment_phase(assignment, now=datetime(2026, 3, 21, 9, 0, 0)),
            "graded",
        )

    def test_post_due_sync_auto_finalizes_non_submission_and_auto_graded_submission(self):
        with Session(self.engine) as session:
            auto_question = Question(
                qid="Q00000001",
                title="MCQ",
                text="Pick one",
                question_type="mcq",
                answer_choices=json.dumps(["A", "B"]),
                correct_answer="A",
                user_id="instructor-1",
            )
            session.add(auto_question)
            session.commit()
            session.refresh(auto_question)

            assignment = Assignment(
                instructor_id="instructor-1",
                course="CS 101",
                course_id=7,
                title="Homework 1",
                assignment_questions=json.dumps([auto_question.id]),
                due_date_soft=datetime(2000, 1, 2, 12, 0, 0),
                due_date_hard=datetime(2000, 1, 3, 12, 0, 0),
            )
            session.add(assignment)
            session.commit()
            session.refresh(assignment)

            auto_progress = AssignmentProgress(
                assignment_id=assignment.id,
                student_id="student-auto",
                answers=json.dumps({str(auto_question.id): "A"}),
                grading_data="{}",
                current_question_index=0,
                submitted=True,
                submitted_at=datetime(2000, 1, 2, 10, 0, 0),
                grade_submitted=False,
            )
            session.add(auto_progress)
            session.commit()

            _sync_assignment_post_due_grading(
                session,
                assignment=assignment,
                student_ids=["student-auto", "student-missing"],
            )

            session.refresh(auto_progress)
            missing_progress = session.exec(
                select(AssignmentProgress).where(
                    AssignmentProgress.assignment_id == assignment.id,
                    AssignmentProgress.student_id == "student-missing",
                )
            ).one()

            self.assertTrue(auto_progress.grade_submitted)
            self.assertIsNotNone(auto_progress.grade_submitted_at)
            self.assertEqual(auto_progress.score_earned, 1.0)
            self.assertEqual(auto_progress.score_total, 1.0)

            self.assertTrue(missing_progress.grade_submitted)
            self.assertIsNotNone(missing_progress.grade_submitted_at)
            self.assertEqual(missing_progress.score_earned, 0.0)
            self.assertEqual(missing_progress.score_total, 1.0)

    def test_post_due_sync_leaves_manually_ungraded_submission_unfinalized(self):
        with Session(self.engine) as session:
            fr_question = Question(
                qid="Q00000002",
                title="Explain",
                text="Why?",
                question_type="fr",
                answer_choices="[]",
                correct_answer="",
                user_id="instructor-1",
            )
            session.add(fr_question)
            session.commit()
            session.refresh(fr_question)

            assignment = Assignment(
                instructor_id="instructor-1",
                course="CS 101",
                course_id=7,
                title="Homework 2",
                assignment_questions=json.dumps([fr_question.id]),
                due_date_soft=datetime(2000, 1, 2, 12, 0, 0),
                due_date_hard=datetime(2000, 1, 3, 12, 0, 0),
            )
            session.add(assignment)
            session.commit()
            session.refresh(assignment)

            progress = AssignmentProgress(
                assignment_id=assignment.id,
                student_id="student-fr",
                answers=json.dumps({str(fr_question.id): "My explanation"}),
                grading_data="{}",
                current_question_index=0,
                submitted=True,
                submitted_at=datetime(2000, 1, 2, 10, 0, 0),
                grade_submitted=False,
            )
            session.add(progress)
            session.commit()

            _sync_assignment_post_due_grading(
                session,
                assignment=assignment,
                student_ids=["student-fr"],
            )

            session.refresh(progress)

            self.assertFalse(progress.grade_submitted)
            self.assertIsNone(progress.grade_submitted_at)
            self.assertIsNone(progress.score_earned)
            self.assertIsNone(progress.score_total)


if __name__ == "__main__":
    unittest.main()
