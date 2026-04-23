import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.models import Question
from app.variant_gen.milestone_one_adapter import (
    question_to_variant_gen_db,
    question_to_variant_gen_question,
    source_text_for_variant_generation,
)


class VariantGenAdapterTests(unittest.TestCase):
    def test_mcq_choices_are_appended_when_stored_separately(self):
        question = Question(
            id=42,
            qid="Q00000042",
            title="List method",
            text="Which Python list method adds one item to the end of a list?",
            question_type="mcq",
            answer_choices=json.dumps(["append", "extend", "pop", "sort"]),
            correct_answer="append",
            user_id="teacher-1",
            course="CS 8",
            blooms_taxonomy="Apply",
        )

        adapted = question_to_variant_gen_question(question)

        self.assertEqual(adapted["question_id"], "caliber_Q00000042")
        self.assertIn("Options:", adapted["text"])
        self.assertIn("A. append", adapted["text"])
        self.assertIn("D. sort", adapted["text"])
        self.assertEqual(adapted["image_crops"], [])
        self.assertEqual(adapted["metadata"]["caliber_id"], 42)
        self.assertEqual(adapted["metadata"]["course"], "CS 8")
        self.assertEqual(adapted["metadata"]["blooms_taxonomy"], "Apply")

    def test_existing_labeled_options_are_not_duplicated(self):
        question = Question(
            qid="Q00000002",
            text="Which is correct?\nA. One\nB. Two\nC. Three\nD. Four",
            question_type="mcq",
            answer_choices=json.dumps(["One", "Two", "Three", "Four"]),
            correct_answer="A",
            user_id="teacher-1",
        )

        text = source_text_for_variant_generation(question)

        self.assertEqual(text.count("A. One"), 1)
        self.assertNotIn("Options:", text)

    def test_true_false_text_gets_format_hint(self):
        question = Question(
            qid="Q00000003",
            text="Python lists are mutable.",
            question_type="true_false",
            answer_choices="[]",
            correct_answer="True",
            user_id="teacher-1",
        )

        text = source_text_for_variant_generation(question)

        self.assertIn("Answer True or False.", text)

    def test_free_response_keeps_rubric_choices_out_of_stem(self):
        rubric = [{"part_label": "A", "points": 2, "rubric_text": "Mentions base case"}]
        question = Question(
            qid="Q00000004",
            text="Explain why recursion needs a base case.",
            question_type="fr",
            answer_choices=json.dumps(rubric),
            correct_answer="",
            user_id="teacher-1",
        )

        text = source_text_for_variant_generation(question)

        self.assertEqual(text, "Explain why recursion needs a base case.")
        self.assertNotIn("Mentions base case", text)

    def test_question_wraps_in_one_ingestion_db_shape(self):
        question = Question(
            id=7,
            qid="Q00000007",
            text="Write a function named double that returns x * 2.",
            question_type="fr",
            answer_choices="[]",
            user_id="teacher-1",
            source_pdf="practice.pdf",
        )

        db = question_to_variant_gen_db(question)

        self.assertEqual(db["schema_version"], "1.0")
        self.assertEqual(len(db["ingestions"]), 1)
        self.assertEqual(db["ingestions"][0]["ingestion_id"], "ing_caliber_Q00000007")
        self.assertEqual(db["ingestions"][0]["source_pdf"], "practice.pdf")
        self.assertEqual(len(db["ingestions"][0]["questions"]), 1)


if __name__ == "__main__":
    unittest.main()
