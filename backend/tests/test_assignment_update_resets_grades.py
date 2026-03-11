import json
import pathlib
import sys
import unittest
from datetime import datetime

from sqlmodel import Session, SQLModel, create_engine

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.crud import update_assignment
from app.models import Assignment, AssignmentProgress


class UpdateAssignmentResetGradesTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)

    def test_assignment_question_edit_clears_finalized_grade_state_but_keeps_grading_data(self):
        grading_data = {
            "12": {
                "question_comment": "Strong explanation",
                "parts": {
                    "0": {"score": 1.0, "comment": "Good setup"},
                    "1": {"score": 0.5, "comment": "Missing edge case"},
                },
            }
        }

        with Session(self.engine) as session:
            assignment = Assignment(
                instructor_id="instructor-1",
                course="CS 101",
                course_id=7,
                title="Homework 1",
                type="Homework",
                description="Original description",
                assignment_questions=json.dumps([12, 13]),
                grade_released=True,
                grade_released_at=datetime(2026, 3, 1, 12, 0, 0),
            )
            session.add(assignment)
            session.commit()
            session.refresh(assignment)

            progress = AssignmentProgress(
                assignment_id=assignment.id,
                student_id="student-1",
                answers=json.dumps({"12": "answer"}),
                grading_data=json.dumps(grading_data),
                current_question_index=1,
                submitted=True,
                submitted_at=datetime(2026, 3, 1, 10, 0, 0),
                grade_submitted=True,
                grade_submitted_at=datetime(2026, 3, 2, 9, 0, 0),
                score_earned=1.5,
                score_total=2.0,
            )
            session.add(progress)
            session.commit()

            updated = update_assignment(
                session,
                assignment.id,
                "instructor-1",
                assignment_questions=[12, 14],
            )

            session.refresh(progress)

            self.assertIsNotNone(updated)
            self.assertEqual(json.loads(updated.assignment_questions), [12, 14])
            self.assertFalse(updated.grade_released)
            self.assertIsNone(updated.grade_released_at)
            self.assertFalse(progress.grade_submitted)
            self.assertIsNone(progress.grade_submitted_at)
            self.assertIsNone(progress.score_earned)
            self.assertIsNone(progress.score_total)
            self.assertEqual(json.loads(progress.grading_data), grading_data)
            self.assertEqual(json.loads(progress.answers), {"12": "answer"})

    def test_due_date_edit_leaves_grade_state_intact(self):
        with Session(self.engine) as session:
            assignment = Assignment(
                instructor_id="instructor-1",
                course="CS 101",
                course_id=7,
                title="Homework 1",
                type="Homework",
                description="Original description",
                assignment_questions=json.dumps([12, 13]),
                grade_released=True,
                grade_released_at=datetime(2026, 3, 1, 12, 0, 0),
            )
            session.add(assignment)
            session.commit()
            session.refresh(assignment)

            progress = AssignmentProgress(
                assignment_id=assignment.id,
                student_id="student-1",
                answers="{}",
                grading_data=json.dumps({"12": {"question_comment": "Saved"}}),
                current_question_index=0,
                submitted=True,
                submitted_at=datetime(2026, 3, 1, 10, 0, 0),
                grade_submitted=True,
                grade_submitted_at=datetime(2026, 3, 2, 9, 0, 0),
                score_earned=1.0,
                score_total=1.0,
            )
            session.add(progress)
            session.commit()

            updated = update_assignment(
                session,
                assignment.id,
                "instructor-1",
                due_date_hard=datetime(2026, 3, 5, 12, 0, 0),
            )

            session.refresh(progress)

            self.assertIsNotNone(updated)
            self.assertTrue(updated.grade_released)
            self.assertIsNotNone(updated.grade_released_at)
            self.assertEqual(updated.due_date_hard, datetime(2026, 3, 5, 12, 0, 0))
            self.assertTrue(progress.grade_submitted)
            self.assertIsNotNone(progress.grade_submitted_at)
            self.assertEqual(progress.score_earned, 1.0)
            self.assertEqual(progress.score_total, 1.0)


if __name__ == "__main__":
    unittest.main()
