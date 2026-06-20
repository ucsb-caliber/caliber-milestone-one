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
from app.crud import create_assignment_integrity_events, summarize_integrity_events
from app.models import Assignment, AssignmentIntegrityEvent
from app.schemas import AssignmentIntegrityEventBatch


class AssignmentIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)
        self.current_user = "student-1"
        self.roster_payload = {
            "id": 7,
            "instructor_id": "instructor-1",
            "student_ids": ["student-1"],
        }
        self.original_roster_call = main_module._roster_call_for_user

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
            self.assignment_id = assignment.id

        def fake_roster_call(session, user_id, method, path, **kwargs):
            return dict(self.roster_payload)

        main_module._roster_call_for_user = fake_roster_call

    def tearDown(self):
        main_module._roster_call_for_user = self.original_roster_call

    @staticmethod
    def request():
        return type("RequestStub", (), {"headers": {}})()

    def test_student_event_batch_sanitizes_raw_clipboard_metadata_and_logs(self):
        with self.assertLogs("caliber.integrity", level="INFO") as logs:
            with Session(self.engine) as session:
                response = main_module.record_assignment_integrity_events(
                    self.assignment_id,
                    AssignmentIntegrityEventBatch(
                        events=[
                            {
                                "event_type": "paste",
                                "question_key": "Q00000001",
                                "part_id": "part-a",
                                "metadata": {
                                    "paste_length": 900,
                                    "paste_hash": "abc123",
                                    "clipboard_text": "do not store me",
                                    "answerText": "do not store me either",
                                    "nested": {"clipboard_text": "nope"},
                                },
                                "client_created_at": datetime.utcnow(),
                            },
                            {"event_type": "submit", "metadata": {}},
                        ]
                    ),
                    self.request(),
                    session,
                    self.current_user,
                )

        self.assertEqual(response["accepted"], 2)
        self.assertTrue(any("integrity_batch_accepted" in line for line in logs.output))

        with Session(self.engine) as session:
            event = session.exec(select(AssignmentIntegrityEvent)).first()
            self.assertIsNotNone(event)
            self.assertEqual(event.event_metadata["paste_length"], 900)
            self.assertNotIn("paste_hash", event.event_metadata)
            self.assertNotIn("clipboard_text", event.event_metadata)
            self.assertNotIn("answerText", event.event_metadata)
            self.assertNotIn("nested", event.event_metadata)

    def test_delete_assignment_refuses_to_drop_integrity_events(self):
        from app.crud import delete_assignment

        with Session(self.engine) as session:
            create_assignment_integrity_events(
                session,
                assignment_id=self.assignment_id,
                student_id="student-1",
                events=[{"event_type": "paste", "metadata": {"paste_length": 120}}],
            )

            deleted = delete_assignment(session, self.assignment_id, "instructor-1")

            self.assertFalse(deleted)
            self.assertIsNotNone(session.get(Assignment, self.assignment_id))
            event = session.exec(select(AssignmentIntegrityEvent)).first()
            self.assertIsNotNone(event)

    def test_instructor_summary_includes_review_score_and_logs_read(self):
        with Session(self.engine) as session:
            create_assignment_integrity_events(
                session,
                assignment_id=self.assignment_id,
                student_id="student-1",
                events=[
                    {"event_type": "paste", "metadata": {"paste_length": 900}},
                    {"event_type": "submit", "metadata": {}},
                ],
            )

        self.current_user = "instructor-1"
        with self.assertLogs("caliber.integrity", level="INFO") as logs:
            with Session(self.engine) as session:
                response = main_module.get_assignment_integrity_summary(
                    self.assignment_id,
                    self.request(),
                    session,
                    self.current_user,
                )

        row = response.students[0]
        self.assertEqual(row.student_id, "student-1")
        self.assertEqual(row.risk_level, "review")
        self.assertEqual(row.risk_score, 7)
        self.assertEqual(row.largest_paste_chars, 900)
        self.assertTrue(any("integrity_summary_read" in line for line in logs.output))

    def test_summary_rejects_non_instructor(self):
        self.current_user = "student-1"
        with self.assertLogs("caliber.integrity", level="WARNING") as logs:
            with Session(self.engine) as session:
                with self.assertRaises(main_module.HTTPException) as raised:
                    main_module.get_assignment_integrity_summary(
                        self.assignment_id,
                        self.request(),
                        session,
                        self.current_user,
                    )

        self.assertEqual(raised.exception.status_code, 403)
        self.assertTrue(any("integrity_summary_rejected" in line for line in logs.output))

    def test_scoring_high_risk_for_combined_suspicious_events(self):
        with Session(self.engine) as session:
            events = create_assignment_integrity_events(
                session,
                assignment_id=self.assignment_id,
                student_id="student-1",
                events=[
                    {"event_type": "paste", "metadata": {"paste_length": 900}},
                    {"event_type": "rapid_input", "metadata": {"delta_chars": 120}},
                    {"event_type": "large_delta", "metadata": {"delta_chars": 500}},
                    {"event_type": "blur", "metadata": {}},
                ],
            )
            summary = summarize_integrity_events(events)["student-1"]

        self.assertEqual(summary["risk_level"], "high")
        self.assertEqual(summary["risk_score"], 9)


if __name__ == "__main__":
    unittest.main()
