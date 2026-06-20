import json
import posixpath
import re
import ast
from hashlib import sha256
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


QuestionPartType = Literal["mcq", "true_false", "free_response", "short_answer", "coding"]
QIDISH_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")


def validate_canonical_qidish(value: str, field_name: str = "qid") -> str:
    if value != value.strip():
        raise ValueError(f"{field_name} must not have leading or trailing whitespace")
    if not value:
        raise ValueError(f"{field_name} cannot be blank")
    if not QIDISH_PATTERN.fullmatch(value):
        raise ValueError(f"{field_name} must use only letters, numbers, '.', '_', '-', and ':'")
    return value


def _canonical_asset_path(value: str) -> str:
    path = value.strip()
    if not path:
        raise ValueError("asset path cannot be blank")
    if "\\" in path:
        raise ValueError("asset path must use '/' separators")
    normalized = posixpath.normpath(path)
    if normalized != path or normalized in {"", "."}:
        raise ValueError("asset path must be canonical")
    if normalized.startswith("/") or normalized == ".." or normalized.startswith("../") or "/../" in normalized:
        raise ValueError("asset path must stay within the question folder")
    return normalized


class QuestionAsset(BaseModel):
    kind: str = Field(..., min_length=1)
    path: str = Field(..., min_length=1)
    alt: str = ""
    media_type: str = ""
    data_base64: Optional[str] = None

    @field_validator("path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        return _canonical_asset_path(value)


class QuestionChoice(BaseModel):
    id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1)


class RubricLevel(BaseModel):
    points: float
    criteria: str = ""


class RandomizationVariable(BaseModel):
    name: str = Field(..., min_length=1)
    kind: Literal["int", "float", "choice", "bool", "list"]
    min: Optional[float] = None
    max: Optional[float] = None
    precision: Optional[int] = None
    values: list[Any] = []
    length: Optional[int] = None
    item_kind: Optional[Literal["int", "float", "choice", "bool"]] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        name = value.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            raise ValueError("randomization variable names must be valid identifiers")
        return name

    @model_validator(mode="after")
    def validate_shape(self):
        if self.kind in {"int", "float"} and (self.min is None or self.max is None):
            raise ValueError(f"{self.kind} variables require min and max")
        if self.kind == "choice" and not self.values:
            raise ValueError("choice variables require values")
        if self.kind == "list":
            if not self.item_kind:
                raise ValueError("list variables require item_kind")
            if self.length is None or int(self.length) < 0:
                raise ValueError("list variables require non-negative length")
            if self.item_kind in {"int", "float"} and (self.min is None or self.max is None):
                raise ValueError("numeric list variables require min and max")
            if self.item_kind == "choice" and not self.values:
                raise ValueError("choice list variables require values")
        if self.min is not None and self.max is not None and float(self.min) > float(self.max):
            raise ValueError("randomization min cannot exceed max")
        if self.precision is not None and int(self.precision) < 0:
            raise ValueError("randomization precision cannot be negative")
        return self


class RandomizationComputed(BaseModel):
    name: str = Field(..., min_length=1)
    expression: str = Field(..., min_length=1)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        name = value.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            raise ValueError("computed names must be valid identifiers")
        return name

    @field_validator("expression")
    @classmethod
    def validate_expression(cls, value: str) -> str:
        allowed_nodes = (
            ast.Expression,
            ast.Constant,
            ast.Name,
            ast.Load,
            ast.List,
            ast.Tuple,
            ast.Dict,
            ast.UnaryOp,
            ast.UAdd,
            ast.USub,
            ast.Not,
            ast.BinOp,
            ast.Add,
            ast.Sub,
            ast.Mult,
            ast.Div,
            ast.FloorDiv,
            ast.Mod,
            ast.Pow,
            ast.BoolOp,
            ast.And,
            ast.Or,
            ast.Compare,
            ast.Eq,
            ast.NotEq,
            ast.Lt,
            ast.LtE,
            ast.Gt,
            ast.GtE,
            ast.In,
            ast.NotIn,
            ast.Subscript,
            ast.Slice,
            ast.Call,
            ast.keyword,
        )
        allowed_functions = {"sum", "len", "min", "max", "round", "abs", "str", "int", "float"}
        try:
            parsed = ast.parse(value, mode="eval")
        except SyntaxError as exc:
            raise ValueError("computed expression must be valid safe expression syntax") from exc
        for node in ast.walk(parsed):
            if not isinstance(node, allowed_nodes):
                raise ValueError("computed expression contains unsupported syntax")
            if isinstance(node, ast.Call) and (not isinstance(node.func, ast.Name) or node.func.id not in allowed_functions):
                raise ValueError("computed expression calls unsupported function")
        return value


class QuestionRandomization(BaseModel):
    enabled: bool = False
    seed_policy: Literal["student_assignment_question"] = "student_assignment_question"
    variables: list[RandomizationVariable] = []
    computed: list[RandomizationComputed] = []

    @model_validator(mode="after")
    def validate_unique_names(self):
        names = [item.name for item in self.variables] + [item.name for item in self.computed]
        if len(names) != len(set(names)):
            raise ValueError("randomization variable and computed names must be unique")
        if self.enabled and not names:
            raise ValueError("enabled randomization requires at least one variable or computed value")
        return self


class CodingTestCase(BaseModel):
    name: str = ""
    visibility: Literal["visible", "hidden"] = "hidden"
    mode: Literal["stdin", "python_harness"] = "stdin"
    input: str = ""
    expected_output: str = ""
    harness: str = ""
    points: Optional[float] = None

    @model_validator(mode="after")
    def validate_test(self):
        self.name = self.name.strip() or "Test"
        if self.expected_output is None:
            self.expected_output = ""
        if self.mode == "python_harness" and not self.harness.strip():
            raise ValueError("python_harness tests require harness code")
        return self


class CodingMetadata(BaseModel):
    allowed_languages: list[Literal["python", "cpp"]] = ["python"]
    starter_code_by_language: dict[str, str] = {}
    tests: list[CodingTestCase] = []
    timeout_ms: int = 2000
    memory_mb: int = 128
    max_output_bytes: int = 20000

    @model_validator(mode="after")
    def validate_coding(self):
        if not self.allowed_languages:
            raise ValueError("coding questions require at least one allowed language")
        self.allowed_languages = list(dict.fromkeys(self.allowed_languages))
        if any(test.mode == "python_harness" for test in self.tests) and "python" not in self.allowed_languages:
            raise ValueError("python_harness tests require python to be an allowed language")
        if self.timeout_ms < 100 or self.timeout_ms > 10000:
            raise ValueError("coding timeout_ms must be between 100 and 10000")
        if self.memory_mb < 32 or self.memory_mb > 1024:
            raise ValueError("coding memory_mb must be between 32 and 1024")
        if self.max_output_bytes < 1000 or self.max_output_bytes > 200000:
            raise ValueError("coding max_output_bytes must be between 1000 and 200000")
        if not self.tests:
            raise ValueError("coding questions require at least one test")
        return self


class QuestionPart(BaseModel):
    part_id: str = Field(..., min_length=1)
    label: str = ""
    type: QuestionPartType
    prompt: str = ""
    choices: list[QuestionChoice] = []
    correct_answer: Optional[str] = None
    points: Optional[float] = None
    rubric: list[RubricLevel] = []
    coding: Optional[CodingMetadata] = None

    @field_validator("part_id")
    @classmethod
    def normalize_part_id(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("part_id cannot be blank")
        return normalized

    @model_validator(mode="after")
    def validate_shape(self):
        if self.type in {"mcq", "true_false"}:
            if len(self.choices) < 2:
                raise ValueError("auto-graded parts require at least two choices")
            if not self.correct_answer:
                raise ValueError("auto-graded parts require a correct_answer")
            choice_ids = {choice.id for choice in self.choices}
            choice_texts = {choice.text for choice in self.choices}
            if self.correct_answer not in choice_ids and self.correct_answer not in choice_texts:
                raise ValueError("correct_answer must match a choice id or choice text")
        if self.type in {"free_response", "short_answer"} and self.rubric:
            if max(float(level.points or 0) for level in self.rubric) < 0:
                raise ValueError("rubric points cannot all be negative")
        if self.type == "coding":
            if not self.coding:
                raise ValueError("coding parts require coding metadata")
            if self.points is not None and float(self.points) < 0:
                raise ValueError("coding points cannot be negative")
        return self


class QuestionContent(BaseModel):
    schema_version: int = 1
    stem: str = ""
    randomization: Optional[QuestionRandomization] = None
    assets: list[QuestionAsset] = []
    parts: list[QuestionPart] = []

    @model_validator(mode="after")
    def validate_parts(self):
        part_ids = [part.part_id for part in self.parts]
        if len(part_ids) != len(set(part_ids)):
            raise ValueError("part_id values must be unique")
        asset_paths = [asset.path for asset in self.assets]
        if len(asset_paths) != len(set(asset_paths)):
            raise ValueError("asset path values must be unique")
        return self


def safe_json_loads(raw: Any, default: Any):
    if raw is None:
        return default
    if isinstance(raw, (dict, list)):
        return raw
    if not isinstance(raw, str) or not raw.strip():
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


def _choice_id(index: int) -> str:
    if 0 <= index < 26:
        return chr(ord("A") + index)
    return str(index + 1)


def _rubric_levels_from_legacy_part(part: dict[str, Any]) -> list[RubricLevel]:
    levels = part.get("rubric_levels")
    if isinstance(levels, list) and levels:
        return [
            RubricLevel(
                points=float(level.get("points") or 0),
                criteria=str(level.get("criteria") or ""),
            )
            for level in levels
            if isinstance(level, dict)
        ]
    return [
        RubricLevel(
            points=float(part.get("points") or 1),
            criteria=str(part.get("rubric_text") or part.get("criteria") or ""),
        ),
        RubricLevel(points=0, criteria=""),
    ]


def legacy_question_to_content(question: Any) -> QuestionContent:
    """Translate a legacy Question row into structured, part-based content."""
    qtype = (getattr(question, "question_type", "") or "").strip().lower()
    text = getattr(question, "text", "") or ""
    raw_answer_choices = safe_json_loads(getattr(question, "answer_choices", "[]"), [])
    correct_answer = getattr(question, "correct_answer", "") or ""

    if qtype == "multipart":
        # The old experimental multipart shape stored child DB ids in answer_choices.
        # Keep the parent as a zero-part shell so callers do not infer unsupported scoring.
        return QuestionContent(schema_version=1, stem=text, parts=[])

    if qtype in {"mcq", "true_false"}:
        choices_raw = raw_answer_choices if isinstance(raw_answer_choices, list) else []
        if qtype == "true_false" and not choices_raw:
            choices_raw = ["True", "False"]
        choices = [
            QuestionChoice(id=_choice_id(index), text=str(choice))
            for index, choice in enumerate(choices_raw)
            if str(choice).strip()
        ]
        if not choices:
            choices = [QuestionChoice(id="A", text="True"), QuestionChoice(id="B", text="False")]
        normalized_correct = correct_answer
        for choice in choices:
            if correct_answer == choice.text:
                normalized_correct = choice.id
                break
        return QuestionContent(
            schema_version=1,
            stem=text,
            parts=[
                QuestionPart(
                    part_id="a",
                    label="Part A",
                    type="true_false" if qtype == "true_false" else "mcq",
                    prompt="",
                    choices=choices,
                    correct_answer=normalized_correct or choices[0].id,
                    points=1,
                )
            ],
        )

    if isinstance(raw_answer_choices, list) and raw_answer_choices and isinstance(raw_answer_choices[0], dict):
        parts: list[QuestionPart] = []
        for index, part in enumerate(raw_answer_choices):
            part_id = str(part.get("part_id") or _choice_id(index)).lower()
            label = str(part.get("part_label") or f"Part {_choice_id(index)}")
            parts.append(
                QuestionPart(
                    part_id=part_id,
                    label=label,
                    type="short_answer" if qtype == "short_answer" else "free_response",
                    prompt=str(part.get("prompt") or ""),
                    rubric=_rubric_levels_from_legacy_part(part),
                )
            )
        return QuestionContent(schema_version=1, stem=text, parts=parts)

    return QuestionContent(
        schema_version=1,
        stem=text,
        parts=[
            QuestionPart(
                part_id="a",
                label="Part A",
                type="short_answer" if qtype == "short_answer" else "free_response",
                rubric=[RubricLevel(points=1, criteria=""), RubricLevel(points=0, criteria="")],
            )
        ],
    )


def question_content_from_question(question: Any) -> QuestionContent:
    raw_content = getattr(question, "content", "") or ""
    parsed = safe_json_loads(raw_content, None)
    if isinstance(parsed, dict):
        try:
            return QuestionContent.model_validate(parsed)
        except Exception:
            pass
    return legacy_question_to_content(question)


def question_content_to_json(content: QuestionContent) -> str:
    return content.model_dump_json(exclude_none=True)


def question_content_hash(content: QuestionContent) -> str:
    normalized = json.dumps(content.model_dump(mode="json", exclude_none=True), sort_keys=True, separators=(",", ":"))
    return sha256(normalized.encode("utf-8")).hexdigest()


def part_max_points(part: QuestionPart) -> float:
    if part.points is not None:
        return max(0.0, float(part.points))
    if part.type == "coding" and part.coding:
        explicit = [float(test.points or 0) for test in part.coding.tests if test.points is not None]
        if explicit:
            return max(0.0, sum(explicit))
        return float(len(part.coding.tests))
    if part.rubric:
        return max(0.0, max(float(level.points or 0) for level in part.rubric))
    if part.type in {"mcq", "true_false"}:
        return 1.0
    return 1.0


def content_max_points(content: QuestionContent) -> float:
    return sum(part_max_points(part) for part in content.parts)


def _placeholder_names(value: Any) -> set[str]:
    if value is None:
        return set()
    if not isinstance(value, str):
        value = json.dumps(value, sort_keys=True, default=str)
    return {match.strip() for match in re.findall(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}", value)}


def _expr_names(expression: str) -> set[str]:
    try:
        parsed = ast.parse(expression or "", mode="eval")
    except SyntaxError:
        return set()
    return {node.id for node in ast.walk(parsed) if isinstance(node, ast.Name)}


def question_quality_checks(content: QuestionContent, *, text: str = "") -> list[dict[str, str]]:
    """Return non-blocking authoring warnings for question content."""
    checks: list[dict[str, str]] = []

    def add(code: str, message: str, severity: str = "warning") -> None:
        checks.append({"code": code, "message": message, "severity": severity})

    if not content_has_prompt(content, text=text):
        add("empty_prompt", "Question has no prompt text.", "error")
    if not content.parts:
        add("no_parts", "Question has no answerable parts.", "error")

    for part in content.parts:
        label = part.label or part.part_id
        if not part.prompt.strip() and not content.stem.strip() and not str(text or "").strip():
            add("empty_part_prompt", f"{label} has no prompt text.", "error")
        if part.type in {"mcq", "true_false"}:
            choice_texts = [choice.text.strip().lower() for choice in part.choices if choice.text.strip()]
            if len(choice_texts) != len(set(choice_texts)):
                add("duplicate_choice", f"{label} has duplicate answer choices.")
            if not part.correct_answer:
                add("missing_correct_answer", f"{label} has no correct answer.", "error")
            elif part.correct_answer not in {choice.id for choice in part.choices} and part.correct_answer not in {choice.text for choice in part.choices}:
                add("invalid_correct_answer", f"{label} correct answer does not match a choice.", "error")
        if part.type in {"free_response", "short_answer"}:
            if not part.rubric:
                add("missing_rubric", f"{label} has no rubric.")
            elif max(float(level.points or 0) for level in part.rubric) <= 0:
                add("zero_rubric", f"{label} rubric has no positive point level.")
        if part.type == "coding" and part.coding:
            total_test_points = sum(float(test.points or 0) for test in part.coding.tests)
            if part.points is not None and total_test_points > 0 and abs(float(part.points) - total_test_points) > 0.001:
                add("coding_points_mismatch", f"{label} points do not match the sum of test points.")
            for test in part.coding.tests:
                if test.visibility == "visible" and (test.harness.strip() or test.expected_output.strip()):
                    add("visible_test_answer", f"{label} has visible test expected output.")

    randomization = content.randomization
    if randomization and randomization.enabled:
        declared = {item.name for item in randomization.variables} | {item.name for item in randomization.computed}
        rendered_names = _placeholder_names(content.model_dump(mode="json", exclude_none=True))
        expression_names = set().union(*(_expr_names(item.expression) for item in randomization.computed)) if randomization.computed else set()
        unused = sorted(name for name in declared if name not in rendered_names and name not in expression_names)
        unresolved = sorted(name for name in rendered_names if name not in declared)
        if unused:
            add("unused_randomization", f"Randomization value is unused: {', '.join(unused)}.")
        if unresolved:
            add("unresolved_randomization", f"Prompt references unknown randomization value: {', '.join(unresolved)}.", "error")

    return checks


def content_has_prompt(content: QuestionContent, text: str = "") -> bool:
    if str(text or "").strip() or content.stem.strip():
        return True
    return any(part.prompt.strip() for part in content.parts)


def validate_ready_question_content(
    content: QuestionContent,
    *,
    text: str = "",
    allow_zero_points: bool = False,
) -> None:
    if not content_has_prompt(content, text=text):
        raise ValueError("ready questions require non-empty prompt content")
    if not content.parts:
        raise ValueError("ready questions require at least one part")
    if content_max_points(content) <= 0 and not allow_zero_points:
        raise ValueError("ready questions require positive points unless explicitly marked unscored")


def is_auto_part(part: QuestionPart) -> bool:
    return part.type in {"mcq", "true_false"}


def is_manual_part(part: QuestionPart) -> bool:
    return part.type in {"free_response", "short_answer"}


def is_coding_part(part: QuestionPart) -> bool:
    return part.type == "coding"
