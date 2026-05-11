"""
Unit tests for `app.odl_pipeline` question segmentation and the shared
`_stable_title` helper. Covers the regressions documented in
`docs/ODL_QUESTION_SEGMENTATION_FIX.md`:

- A question whose body contains a bulleted sub-list must NOT be split
  into one question per bullet.
- A real top-level list of questions (no "Problem N" / "Question N"
  markers) still gets unrolled correctly via the fallback pass.
- The two-pass segmenter prefers strong markers when they are present.
- `_stable_title` skips bare-numeral marker lines.
"""

from __future__ import annotations

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.m2_pipeline import _stable_title
from app.odl_pipeline import (
    _is_question_start,
    _segment_questions,
    _segment_questions_two_pass,
)


def _paragraph(text: str, page: int = 1) -> dict:
    return {"type": "paragraph", "content": text, "page number": page}


def _list_item(content: str = "", kids: list | None = None, page: int = 1) -> dict:
    return {
        "type": "list item",
        "content": content,
        "kids": kids or [],
        "page number": page,
    }


def _ordered_list(items: list[dict], page: int = 1) -> dict:
    return {
        "type": "list",
        "numbering style": "Ordered_Decimal",
        "list items": items,
        "page number": page,
    }


class QuestionStartRegexTests(unittest.TestCase):
    def test_problem_marker_is_strong(self):
        self.assertTrue(_is_question_start("Problem 1\nFoo bar"))
        self.assertTrue(_is_question_start("Problem 1\nFoo bar", strong_only=True))

    def test_question_marker_is_strong(self):
        self.assertTrue(_is_question_start("Question 4: Find the value"))
        self.assertTrue(
            _is_question_start("Question 4: Find the value", strong_only=True)
        )

    def test_bare_numeric_marker_alone_does_not_match(self):
        # Synthetic "2." line that previously misfired the segmenter.
        self.assertFalse(_is_question_start("2."))
        self.assertFalse(_is_question_start("2. "))

    def test_bare_numeric_with_short_tail_does_not_match(self):
        # "2. foo" - too short to be a real question start.
        self.assertFalse(_is_question_start("2. foo"))

    def test_bare_numeric_with_lowercase_does_not_match(self):
        self.assertFalse(
            _is_question_start("2. the airport accommodates aircraft daily")
        )

    def test_bare_numeric_with_real_body_matches_in_fallback(self):
        # Capital letter + 12+ chars of body -> looks like a real question.
        self.assertTrue(
            _is_question_start("1. Design a schema for an airport database.")
        )
        # ...but not under strong-only mode.
        self.assertFalse(
            _is_question_start(
                "1. Design a schema for an airport database.", strong_only=True
            )
        )


class StableTitleTests(unittest.TestCase):
    def test_skips_bare_numeral_marker_line(self):
        text = "2.\nThe airport accommodates 200 aircraft per day."
        self.assertEqual(
            _stable_title(text),
            "The airport accommodates 200 aircraft per day.",
        )

    def test_skips_problem_marker_line(self):
        text = "Problem 3\nCompute the optimal join order for the query."
        self.assertEqual(
            _stable_title(text),
            "Compute the optimal join order for the query.",
        )

    def test_skips_question_marker_line(self):
        text = "Question 12:\nDescribe the ACID properties."
        self.assertEqual(
            _stable_title(text),
            "Describe the ACID properties.",
        )

    def test_strips_markdown_heading(self):
        text = "## Compute pi to ten digits"
        self.assertEqual(_stable_title(text), "Compute pi to ten digits")

    def test_truncates_to_80_chars(self):
        body = "A" * 200
        self.assertEqual(len(_stable_title(body)), 80)

    def test_falls_back_when_only_markers(self):
        # All lines are markers - degrade gracefully to first line, not fallback,
        # because we still want SOMETHING displayed.
        title = _stable_title("Problem 1\nQuestion 1\n2.", fallback="X")
        self.assertNotEqual(title, "X")
        self.assertTrue(title)


class SegmentationTests(unittest.TestCase):
    def test_sub_bulleted_question_is_not_split(self):
        """
        Mirrors the bug from the database-design exam: "Question 2"
        contains a bulleted sub-list. The sub-list should be content of
        Question 2, NOT six separate questions.
        """
        root = {
            "type": "root",
            "kids": [
                _paragraph("Problem 1\nWhat is normalization?"),
                _paragraph(
                    "Question 2\nDesign tables for the following airport scenario:"
                ),
                {
                    "type": "text block",
                    "kids": [
                        _ordered_list(
                            [
                                _list_item(content="The airport has 5 terminals."),
                                _list_item(content="Each terminal has 20 gates."),
                                _list_item(content="Each gate has a unique number."),
                                _list_item(content="Aircraft are owned by airlines."),
                                _list_item(content="Each flight has a schedule."),
                                _list_item(content="Passengers buy tickets."),
                            ]
                        )
                    ],
                },
                _paragraph("Problem 3\nWrite the SQL query."),
            ],
        }

        questions, mode = _segment_questions_two_pass(root)
        self.assertEqual(mode, "strong")
        self.assertEqual(len(questions), 3)

    def test_top_level_numeric_list_is_unrolled_in_fallback(self):
        """
        A document with no "Problem N" / "Question N" markers but a
        top-level ordered list still gets unrolled in the fallback pass.
        """
        root = {
            "type": "root",
            "kids": [
                _ordered_list(
                    [
                        _list_item(
                            content="Design a schema for an airport database."
                        ),
                        _list_item(
                            content="Write a SQL query to list every flight."
                        ),
                        _list_item(
                            content="Explain why third normal form matters."
                        ),
                    ]
                )
            ],
        }

        questions, mode = _segment_questions_two_pass(root)
        self.assertEqual(mode, "fallback")
        self.assertEqual(len(questions), 3)
        # First question's chunk must NOT start with "1." (Step 2: no
        # synthesized numeral leaks into the rendered text).
        first_chunk = questions[0]["chunks"][0]
        self.assertFalse(first_chunk.lstrip().startswith("1."))
        self.assertIn("Design a schema", first_chunk)

    def test_strong_pass_skipped_when_only_one_strong_match(self):
        """
        Pass 1 needs at least 2 strong matches to be trusted; with only
        one strong marker the segmenter falls back to Pass 2 so it can
        still find the bare-numeric questions.
        """
        root = {
            "type": "root",
            "kids": [
                _paragraph("Problem 1\nWhat is normalization?"),
                _paragraph(
                    "2. Design the schema for the airport database described above."
                ),
                _paragraph(
                    "3. Write the SQL query that lists each terminal once."
                ),
            ],
        }
        questions, mode = _segment_questions_two_pass(root)
        self.assertEqual(mode, "fallback")
        self.assertEqual(len(questions), 3)

    def test_nested_list_inside_text_block_not_unrolled(self):
        """Direct check of Step 3 - sub-lists are rendered, not unrolled."""
        root = {
            "type": "root",
            "kids": [
                _paragraph("Question 1\nAnswer the following."),
                {
                    "type": "text block",
                    "kids": [
                        _ordered_list(
                            [
                                _list_item(content="First sub-point."),
                                _list_item(content="Second sub-point."),
                            ]
                        )
                    ],
                },
            ],
        }
        # Strong-only pass - single question, list contributes content.
        questions = _segment_questions(root, strong_only=True)
        self.assertEqual(len(questions), 1)
        self.assertEqual(len(questions[0]["chunks"]), 2)
        rendered_list_chunk = questions[0]["chunks"][1]
        self.assertIn("First sub-point.", rendered_list_chunk)
        self.assertIn("Second sub-point.", rendered_list_chunk)


if __name__ == "__main__":
    unittest.main()
