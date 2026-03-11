import pathlib
import sys
import unittest

from sqlmodel import Session, SQLModel, create_engine, select

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.crud import delete_assignment
from app.models import Assignment, AssignmentProgress


class DeleteAssignmentTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)

    def test_delete_assignment_removes_progress_rows_first(self):
        with Session(self.engine) as session:
            assignment = Assignment(
                instructor_id="instructor-1",
                course="CS 101",
                course_id=7,
                title="Homework 1",
            )
            session.add(assignment)
            session.commit()
            session.refresh(assignment)

            session.add(
                AssignmentProgress(
                    assignment_id=assignment.id,
                    student_id="student-1",
                    answers="{}",
                    grading_data="{}",
                    current_question_index=0,
                )
            )
            session.commit()

            deleted = delete_assignment(session, assignment.id, "instructor-1")

            self.assertTrue(deleted)
            self.assertIsNone(session.get(Assignment, assignment.id))
            remaining_progress = session.exec(
                select(AssignmentProgress).where(AssignmentProgress.assignment_id == assignment.id)
            ).all()
            self.assertEqual(remaining_progress, [])


if __name__ == "__main__":
    unittest.main()
