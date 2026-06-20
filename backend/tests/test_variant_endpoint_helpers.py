import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.main import _save_variant_draft_question
from app.models import Question


class VariantEndpointHelperTests(unittest.TestCase):
    def test_saved_variant_draft_copies_source_blooms_taxonomy(self):
        source = Question(
            id=9,
            qid="Q00000009",
            title="Trace recursion",
            text="Write a recursive function.",
            tags="recursion",
            keywords="python",
            school="UCSB",
            user_school="UCSB",
            course="CS 8",
            course_type="Intro CS",
            question_type="fr",
            blooms_taxonomy="Apply",
            answer_choices="[]",
            user_id="teacher-1",
        )
        variant = {
            "type": "FREE_RESPONSE",
            "question": "Write a recursive function named largest_score.",
            "answer": "def largest_score(scores): return max(scores)",
            "language": "python",
            "algorithm": "recursion",
            "scenario_domain": "Sports",
        }

        with patch("app.main.create_question") as create_question:
            _save_variant_draft_question(
                session=object(),
                source_question=source,
                variant=variant,
                user_id="teacher-1",
                run_source="variant:Q00000009:test",
                run_tag="variant-source:Q00000009",
                number=1,
            )

        kwargs = create_question.call_args.kwargs
        self.assertEqual(kwargs["blooms_taxonomy"], "Apply")
        self.assertFalse(kwargs["is_verified"])
        self.assertEqual(kwargs["question_type"], "fr")
        self.assertIsNone(kwargs["source_pdf"])


if __name__ == "__main__":
    unittest.main()
