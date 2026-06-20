import io
import json
import pathlib
import sys
import types
import unittest
import zipfile
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

from app.models import Assignment, Question
from app.question_folder import (
    apply_question_import,
    build_question_export_zip,
    dry_run_question_import,
    prepare_question_zip,
)


def _question_zip(
    qid="ucsb-cs16:zip-question",
    version=1,
    title="Zip Question",
    include_asset=False,
    content_override=None,
    question_extra=None,
) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "manifest.json",
            json.dumps(
                {
                    "schema_version": 1,
                    "namespace": "ucsb-cs16",
                    "default_visibility": "private",
                    "default_school_scope": "UCSB",
                }
            ),
        )
        zf.writestr("questions/zip-question/prompt.md", "Pick one.")
        content = {
            "schema_version": 1,
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
        if content_override is not None:
            content = content_override
        if include_asset:
            content["assets"] = [{"kind": "image", "path": "assets/diagram.txt", "alt": "diagram"}]
            zf.writestr("questions/zip-question/assets/diagram.txt", b"asset-bytes")

        question_payload = {
            "schema_version": 1,
            "qid": qid,
            "version": version,
            "title": title,
            "question_type": "mcq",
            "tags": ["arrays"],
            "keywords": ["loop"],
            "prompt_file": "prompt.md",
            "content": content,
        }
        question_payload.update(question_extra or {})
        zf.writestr(
            "questions/zip-question/question.json",
            json.dumps(question_payload),
        )
    return buffer.getvalue()


class QuestionFolderImportExportTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        SQLModel.metadata.create_all(self.engine)

    def test_zip_import_dry_run_apply_and_export_round_trip(self):
        manifest, prepared, errors = prepare_question_zip(_question_zip())
        self.assertEqual(manifest["namespace"], "ucsb-cs16")
        self.assertEqual(len(prepared), 1)
        self.assertEqual(errors, [])

        with Session(self.engine) as session:
            dry_items = dry_run_question_import(session, prepared, errors, "create_only", "instructor-1")
            self.assertEqual(dry_items[0].action, "create")

            applied = apply_question_import(
                session,
                prepared,
                user_id="instructor-1",
                source_repo="https://github.com/example/questions",
                source_commit="abc123",
                conflict_mode="create_only",
            )
            self.assertEqual(applied[0].action, "create")
            question = session.exec(select(Question).where(Question.qid == "ucsb-cs16:zip-question")).one()
            self.assertEqual(question.version, 1)
            self.assertEqual(question.source_commit, "abc123")

            export_bytes = build_question_export_zip([question])
            with zipfile.ZipFile(io.BytesIO(export_bytes)) as zf:
                names = set(zf.namelist())
                self.assertIn("manifest.json", names)
                exported_question_path = next(name for name in names if name.endswith("/question.json"))
                exported = json.loads(zf.read(exported_question_path).decode("utf-8"))
                self.assertEqual(exported["qid"], "ucsb-cs16:zip-question")
                self.assertEqual(exported["content"]["parts"][0]["part_id"], "a")

    def test_asset_files_round_trip_through_import_and_export(self):
        _, prepared, errors = prepare_question_zip(_question_zip(include_asset=True))
        self.assertEqual(errors, [])

        with Session(self.engine) as session:
            apply_question_import(session, prepared, user_id="instructor-1", source_repo=None, source_commit=None, conflict_mode="create_only")
            question = session.exec(select(Question).where(Question.qid == "ucsb-cs16:zip-question")).one()
            stored_content = json.loads(question.content)
            self.assertEqual(stored_content["assets"][0]["path"], "assets/diagram.txt")
            self.assertIn("data_base64", stored_content["assets"][0])

            export_bytes = build_question_export_zip([question])
            with zipfile.ZipFile(io.BytesIO(export_bytes)) as zf:
                names = set(zf.namelist())
                asset_path = next(name for name in names if name.endswith("/assets/diagram.txt"))
                self.assertEqual(zf.read(asset_path), b"asset-bytes")
                exported_question_path = next(name for name in names if name.endswith("/question.json"))
                exported = json.loads(zf.read(exported_question_path).decode("utf-8"))
                self.assertNotIn("data_base64", exported["content"]["assets"][0])

    def test_import_rejects_noncanonical_qid(self):
        _, prepared, errors = prepare_question_zip(_question_zip(qid="ucsb cs16:bad qid"))

        self.assertEqual(prepared, [])
        self.assertEqual(len(errors), 1)
        self.assertIn("qid must use only", errors[0].message)

    def test_import_rejects_duplicate_qids_in_archive(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("manifest.json", json.dumps({"schema_version": 1}))
            for folder in ["first", "second"]:
                zf.writestr(f"questions/{folder}/prompt.md", "Pick one.")
                zf.writestr(
                    f"questions/{folder}/question.json",
                    json.dumps(
                        {
                            "schema_version": 1,
                            "qid": "ucsb-cs16:duplicate",
                            "title": folder,
                            "prompt_file": "prompt.md",
                            "content": {
                                "schema_version": 1,
                                "parts": [
                                    {
                                        "part_id": "a",
                                        "type": "mcq",
                                        "choices": [{"id": "A", "text": "Yes"}, {"id": "B", "text": "No"}],
                                        "correct_answer": "A",
                                        "points": 1,
                                    }
                                ],
                            },
                        }
                    ),
                )

        _, prepared, errors = prepare_question_zip(buffer.getvalue())

        self.assertEqual(len(prepared), 1)
        self.assertEqual(len(errors), 1)
        self.assertIn("Duplicate qid in archive: ucsb-cs16:duplicate", errors[0].message)

    def test_import_rejects_missing_asset_file(self):
        content = {
            "schema_version": 1,
            "stem": "Use the diagram.",
            "assets": [{"kind": "image", "path": "assets/missing.png", "alt": "diagram"}],
            "parts": [
                {
                    "part_id": "a",
                    "type": "free_response",
                    "rubric": [{"points": 1, "criteria": "Complete"}],
                }
            ],
        }

        _, prepared, errors = prepare_question_zip(_question_zip(content_override=content, question_extra={"prompt_file": None}))

        self.assertEqual(prepared, [])
        self.assertEqual(len(errors), 1)
        self.assertIn("asset not found: assets/missing.png", errors[0].message)

    def test_ready_import_rejects_empty_prompt_content(self):
        content = {
            "schema_version": 1,
            "parts": [
                {
                    "part_id": "a",
                    "type": "free_response",
                    "rubric": [{"points": 1, "criteria": "Complete"}],
                }
            ],
        }

        _, prepared, errors = prepare_question_zip(_question_zip(content_override=content, question_extra={"prompt_file": None}))

        self.assertEqual(prepared, [])
        self.assertEqual(len(errors), 1)
        self.assertIn("ready questions require non-empty prompt content", errors[0].message)

    def test_ready_import_rejects_zero_points_unless_marked_unscored(self):
        content = {
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

        _, prepared, errors = prepare_question_zip(_question_zip(content_override=content, question_extra={"prompt_file": None}))
        self.assertEqual(prepared, [])
        self.assertEqual(len(errors), 1)
        self.assertIn("ready questions require positive points", errors[0].message)

        _, prepared, errors = prepare_question_zip(
            _question_zip(
                content_override=content,
                question_extra={"prompt_file": None, "grading_policy": "unscored"},
            )
        )
        self.assertEqual(errors, [])
        self.assertEqual(len(prepared), 1)

    def test_assignment_export_uses_qid_version_refs(self):
        _, prepared, errors = prepare_question_zip(_question_zip())
        with Session(self.engine) as session:
            apply_question_import(session, prepared, user_id="instructor-1", source_repo=None, source_commit=None, conflict_mode="create_only")
            question = session.exec(select(Question).where(Question.qid == "ucsb-cs16:zip-question")).one()
            assignment = Assignment(
                instructor_id="instructor-1",
                course="CS16",
                course_id=101,
                title="Lab 1",
                type="Lab",
                description="Intro lab",
                release_date=datetime(2026, 1, 1, 9, 0, 0),
                due_date_soft=datetime(2026, 1, 8, 9, 0, 0),
                due_date_hard=datetime(2026, 1, 10, 9, 0, 0),
                late_policy_id="0",
                assignment_questions=json.dumps([question.id]),
                assignment_question_refs=json.dumps([
                    {"qid": question.qid, "version": question.version, "position": 0, "points_override": None}
                ]),
            )
            session.add(assignment)
            session.commit()
            session.refresh(assignment)

            export_bytes = build_question_export_zip([question], assignments=[assignment])
            with zipfile.ZipFile(io.BytesIO(export_bytes)) as zf:
                assignment_path = next(name for name in zf.namelist() if name.startswith("assignments/"))
                exported = json.loads(zf.read(assignment_path).decode("utf-8"))
                self.assertEqual(exported["title"], "Lab 1")
                self.assertEqual(exported["questions"], [
                    {"qid": "ucsb-cs16:zip-question", "version": 1, "position": 0, "points_override": None}
                ])

    def test_new_version_import_creates_second_row(self):
        _, prepared, errors = prepare_question_zip(_question_zip())
        with Session(self.engine) as session:
            apply_question_import(session, prepared, user_id="instructor-1", source_repo=None, source_commit=None, conflict_mode="create_only")
            applied = apply_question_import(session, prepared, user_id="instructor-1", source_repo=None, source_commit=None, conflict_mode="new_version")
            self.assertEqual(applied[0].action, "create")
            questions = list(session.exec(select(Question).where(Question.qid == "ucsb-cs16:zip-question")).all())
            self.assertEqual(sorted(question.version for question in questions), [1, 2])

    def test_fork_import_creates_private_forked_qid(self):
        _, prepared, errors = prepare_question_zip(_question_zip())
        with Session(self.engine) as session:
            apply_question_import(session, prepared, user_id="instructor-1", source_repo=None, source_commit=None, conflict_mode="create_only")
            dry_items = dry_run_question_import(session, prepared, errors, "fork", "instructor-1")
            self.assertEqual(dry_items[0].action, "create")
            self.assertTrue(dry_items[0].qid.startswith("fork:instructor-1:ucsb-cs16:zip-question"))

            applied = apply_question_import(session, prepared, user_id="instructor-1", source_repo=None, source_commit=None, conflict_mode="fork")
            self.assertEqual(applied[0].action, "create")
            forked = session.exec(select(Question).where(Question.qid == applied[0].qid)).one()
            self.assertEqual(forked.visibility, "private")
            self.assertEqual(forked.version, 1)


if __name__ == "__main__":
    unittest.main()
