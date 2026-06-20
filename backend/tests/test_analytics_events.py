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

from app import main as main_module
from app.models import AnalyticsEvent, Assignment, Question
from app.schemas import AnalyticsEventBatch


class AnalyticsEventTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.original_roster_call = main_module._roster_call_for_user
        self.original_fetch_research_id = main_module.fetch_research_id
        self.roster_payload = {
            "id": 7,
            "course_name": "CS 101",
            "instructor_id": "instructor-1",
            "student_ids": ["student-1"],
        }

        with Session(self.engine) as session:
            question = Question(
                qid="Q00000001",
                version=1,
                title="Question 1",
                text="Pick one",
                question_type="mcq",
                answer_choices='["alpha@example.com", "Beta"]',
                correct_answer="Beta",
                user_id="instructor-1",
                is_verified=True,
            )
            session.add(question)
            session.commit()
            session.refresh(question)
            self.question_id = int(question.id)

            assignment = Assignment(
                instructor_id="instructor-1",
                course="CS 101",
                course_id=7,
                title="Homework 1",
                assignment_questions=f"[{self.question_id}]",
            )
            session.add(assignment)
            session.commit()
            session.refresh(assignment)
            self.assignment_id = int(assignment.id)

        def fake_roster_call(session, user_id, method, path, **kwargs):
            if path == "/api/user":
                return {"id": user_id, "admin": False, "teacher": user_id == "instructor-1"}
            return dict(self.roster_payload)

        main_module._roster_call_for_user = fake_roster_call
        main_module.fetch_research_id = lambda user_id: None

    def tearDown(self):
        main_module._roster_call_for_user = self.original_roster_call
        main_module.fetch_research_id = self.original_fetch_research_id

    def test_ingest_redacts_content_like_metadata(self):
        with Session(self.engine) as session:
            response = main_module.ingest_analytics_events(
                AnalyticsEventBatch(events=[
                    {
                        "client_event_id": "event-redact-1",
                        "session_id": "session-redact-1",
                        "event_name": "question_choice_selected",
                        "course_id": 7,
                        "assignment_id": self.assignment_id,
                        "question_id": self.question_id,
                        "question_qid": "Q00000001",
                        "metadata": {
                            "choice_index": 0,
                            "choice_value": "alpha@example.com",
                            "tap_target": "Student alice@example.com",
                            "answer_length": 17,
                        },
                        "occurred_at": datetime.utcnow(),
                    }
                ]),
                session,
                "student-1",
            )

            self.assertEqual(response.accepted, 1)
            event = session.exec(select(AnalyticsEvent)).first()
            self.assertEqual(event.event_metadata["choice_index"], 0)
            self.assertEqual(event.event_metadata["answer_length"], 17)
            self.assertNotIn("choice_value", event.event_metadata)
            self.assertNotIn("tap_target", event.event_metadata)

    def test_ingest_rejects_question_not_on_assignment(self):
        with Session(self.engine) as session:
            response = main_module.ingest_analytics_events(
                AnalyticsEventBatch(events=[
                    {
                        "client_event_id": "event-poison-1",
                        "session_id": "session-poison-1",
                        "event_name": "question_viewed",
                        "course_id": 7,
                        "assignment_id": self.assignment_id,
                        "question_id": self.question_id + 999,
                        "metadata": {},
                    }
                ]),
                session,
                "student-1",
            )

            self.assertEqual(response.accepted, 0)
            self.assertEqual(response.rejected, 1)
            self.assertIsNone(session.exec(select(AnalyticsEvent)).first())

    def test_assignment_analytics_counts_only_enrolled_student_events(self):
        with Session(self.engine) as session:
            session.add(AnalyticsEvent(
                client_event_id="event-student-open",
                session_id="session-student",
                event_name="assignment_opened",
                actor_user_id="student-1",
                actor_role="student",
                course_id=7,
                assignment_id=self.assignment_id,
                occurred_at=datetime.utcnow(),
                received_at=datetime.utcnow(),
            ))
            session.add(AnalyticsEvent(
                client_event_id="event-instructor-open",
                session_id="session-instructor",
                event_name="assignment_opened",
                actor_user_id="instructor-1",
                actor_role="instructor",
                course_id=7,
                assignment_id=self.assignment_id,
                occurred_at=datetime.utcnow(),
                received_at=datetime.utcnow(),
            ))
            session.add(AnalyticsEvent(
                client_event_id="event-outsider-open",
                session_id="session-outsider",
                event_name="assignment_opened",
                actor_user_id="student-2",
                actor_role="student",
                course_id=7,
                assignment_id=self.assignment_id,
                occurred_at=datetime.utcnow(),
                received_at=datetime.utcnow(),
            ))
            session.commit()

            response = main_module.get_assignment_analytics(self.assignment_id, session, "instructor-1")

            self.assertEqual(response.assignment.enrolled_count, 1)
            self.assertEqual(response.assignment.opened_count, 1)
            self.assertEqual(response.funnel[1].count, 1)
            self.assertEqual(response.students[0].student_id, "Student 1")


if __name__ == "__main__":
    unittest.main()
