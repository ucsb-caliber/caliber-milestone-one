import json
import pathlib
import sys
import types
import unittest
from datetime import datetime, timezone

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

from app.main import _all_students_graded_for_assignment, _build_grading_response, _get_assignment_phase, _has_late_due_passed, _sync_assignment_post_due_grading
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

    def test_late_due_boundary_uses_pacific_timezone_not_container_utc(self):
        assignment = Assignment(
            instructor_id="instructor-1",
            course="CS 101",
            course_id=7,
            title="Homework Pacific",
            due_date_hard=datetime(2026, 3, 11, 23, 0, 0),
        )

        self.assertFalse(
            _has_late_due_passed(
                assignment,
                now=datetime(2026, 3, 12, 5, 59, 0, tzinfo=timezone.utc),
            )
        )
        self.assertEqual(
            _get_assignment_phase(
                assignment,
                now=datetime(2026, 3, 12, 5, 59, 0, tzinfo=timezone.utc),
            ),
            "in_progress",
        )
        self.assertTrue(
            _has_late_due_passed(
                assignment,
                now=datetime(2026, 3, 12, 6, 1, 0, tzinfo=timezone.utc),
            )
        )
        self.assertEqual(
            _get_assignment_phase(
                assignment,
                now=datetime(2026, 3, 12, 6, 1, 0, tzinfo=timezone.utc),
            ),
            "ungraded",
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
            fr_question = Question(
                qid="Q00000003",
                title="Explain",
                text="Why?",
                question_type="fr",
                answer_choices="[]",
                correct_answer="",
                user_id="instructor-1",
            )
            session.add(auto_question)
            session.add(fr_question)
            session.commit()
            session.refresh(auto_question)
            session.refresh(fr_question)

            auto_only_assignment = Assignment(
                instructor_id="instructor-1",
                course="CS 101",
                course_id=7,
                title="Homework 1",
                assignment_questions=json.dumps([auto_question.id]),
                due_date_soft=datetime(2000, 1, 2, 12, 0, 0),
                due_date_hard=datetime(2000, 1, 3, 12, 0, 0),
            )
            missing_assignment = Assignment(
                instructor_id="instructor-1",
                course="CS 101",
                course_id=7,
                title="Homework 1 Missing",
                assignment_questions=json.dumps([auto_question.id, fr_question.id]),
                due_date_soft=datetime(2000, 1, 2, 12, 0, 0),
                due_date_hard=datetime(2000, 1, 3, 12, 0, 0),
            )
            session.add(auto_only_assignment)
            session.add(missing_assignment)
            session.commit()
            session.refresh(auto_only_assignment)
            session.refresh(missing_assignment)

            auto_progress = AssignmentProgress(
                assignment_id=auto_only_assignment.id,
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
                assignment=auto_only_assignment,
                student_ids=["student-auto"],
            )
            _sync_assignment_post_due_grading(
                session,
                assignment=missing_assignment,
                student_ids=["student-missing"],
            )

            session.refresh(auto_progress)
            missing_progress = session.exec(
                select(AssignmentProgress).where(
                    AssignmentProgress.assignment_id == missing_assignment.id,
                    AssignmentProgress.student_id == "student-missing",
                )
            ).one()

            self.assertTrue(auto_progress.grade_submitted)
            self.assertIsNotNone(auto_progress.grade_submitted_at)
            self.assertEqual(auto_progress.score_earned, 1.0)
            self.assertEqual(auto_progress.score_total, 1.0)

            self.assertTrue(missing_progress.grade_submitted)
            self.assertEqual(missing_progress.grade_submitted_at, missing_assignment.due_date_hard)
            self.assertFalse(missing_progress.submitted)
            self.assertIsNone(missing_progress.submitted_at)
            self.assertEqual(missing_progress.score_earned, 0.0)
            self.assertEqual(missing_progress.score_total, 2.0)

            missing_response = _build_grading_response(
                assignment=missing_assignment,
                student_id="student-missing",
                questions=[auto_question, fr_question],
                answers_by_question_id={},
                grading_data=json.loads(missing_progress.grading_data),
                grade_submitted=True,
                stored_score_earned=missing_progress.score_earned,
                stored_score_total=missing_progress.score_total,
            )
            fr_card = next(card for card in missing_response.questions if card.question_id == fr_question.id)
            self.assertTrue(fr_card.is_fully_graded)
            self.assertTrue(all(part.graded for part in fr_card.rubric_parts))
            self.assertTrue(missing_response.all_questions_fully_graded)

    def test_post_due_sync_preserves_manual_points_for_non_submission(self):
        with Session(self.engine) as session:
            fr_question = Question(
                qid="Q00000004",
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
                title="Homework Missing Override",
                assignment_questions=json.dumps([fr_question.id]),
                due_date_soft=datetime(2000, 1, 2, 12, 0, 0),
                due_date_hard=datetime(2000, 1, 3, 12, 0, 0),
            )
            session.add(assignment)
            session.commit()
            session.refresh(assignment)

            progress = AssignmentProgress(
                assignment_id=assignment.id,
                student_id="student-missing-manual",
                answers="{}",
                grading_data=json.dumps(
                    {
                        str(fr_question.id): {
                            "question_comment": "Courtesy points",
                            "parts": {
                                "0": {
                                    "score": 1.0,
                                    "comment": "Given full credit",
                                }
                            },
                        }
                    }
                ),
                current_question_index=0,
                submitted=False,
                submitted_at=None,
                grade_submitted=True,
                grade_submitted_at=assignment.due_date_hard,
                score_earned=1.0,
                score_total=1.0,
            )
            session.add(progress)
            session.commit()

            _sync_assignment_post_due_grading(
                session,
                assignment=assignment,
                student_ids=["student-missing-manual"],
            )

            session.refresh(progress)
            grading_data = json.loads(progress.grading_data)

            self.assertEqual(
                grading_data[str(fr_question.id)]["parts"]["0"]["score"],
                1.0,
            )
            self.assertEqual(progress.score_earned, 1.0)
            self.assertEqual(progress.score_total, 1.0)
            self.assertEqual(progress.grade_submitted_at, assignment.due_date_hard)

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

    def test_all_students_graded_accepts_graded_at_for_ungraded_phase(self):
        with Session(self.engine) as session:
            assignment = Assignment(
                instructor_id="instructor-1",
                course="CS 101",
                course_id=7,
                title="Homework 3",
                assignment_questions="[]",
                due_date_soft=datetime(2000, 1, 2, 12, 0, 0),
                due_date_hard=datetime(2000, 1, 3, 12, 0, 0),
            )
            session.add(assignment)
            session.commit()
            session.refresh(assignment)

            session.add(
                AssignmentProgress(
                    assignment_id=assignment.id,
                    student_id="student-1",
                    submitted=False,
                    grade_submitted=True,
                    grade_submitted_at=assignment.due_date_hard,
                    score_earned=0.0,
                    score_total=0.0,
                )
            )
            session.add(
                AssignmentProgress(
                    assignment_id=assignment.id,
                    student_id="student-2",
                    submitted=True,
                    submitted_at=datetime(2000, 1, 2, 10, 0, 0),
                    grade_submitted=True,
                    grade_submitted_at=datetime(2000, 1, 3, 11, 0, 0),
                    score_earned=1.0,
                    score_total=1.0,
                )
            )
            session.commit()

            self.assertTrue(
                _all_students_graded_for_assignment(
                    session,
                    assignment=assignment,
                    student_ids=["student-1", "student-2"],
                )
            )


if __name__ == "__main__":
    unittest.main()
