from __future__ import annotations

import ast
import hashlib
import json
import random
import re
from copy import deepcopy
from typing import Any

from .models import Question
from .question_content import QuestionContent, question_content_hash


PLACEHOLDER_RE = re.compile(r"{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}")
SAFE_FUNCTIONS = {
    "sum": sum,
    "len": len,
    "min": min,
    "max": max,
    "round": round,
    "abs": abs,
    "str": str,
    "int": int,
    "float": float,
}


class RandomizationError(ValueError):
    """Raised when a randomized question cannot be rendered safely."""


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def randomization_enabled(content: QuestionContent) -> bool:
    return bool(content.randomization and content.randomization.enabled)


def variant_key(question: Question) -> str:
    return str(question.qid or question.id)


def _seed_for(*, assignment_id: int, student_id: str, question: Question, content: QuestionContent) -> int:
    randomization_hash = hashlib.sha256(
        _stable_json(content.randomization.model_dump(mode="json", exclude_none=True) if content.randomization else {}).encode("utf-8")
    ).hexdigest()
    raw = f"{assignment_id}:{student_id}:{question.qid or question.id}:{question.version}:{randomization_hash}"
    return int(hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16], 16)


def _random_scalar(rng: random.Random, spec: Any, *, kind: str):
    if kind == "int":
        return rng.randint(int(spec.min), int(spec.max))
    if kind == "float":
        value = rng.uniform(float(spec.min), float(spec.max))
        return round(value, int(spec.precision)) if spec.precision is not None else value
    if kind == "choice":
        if not spec.values:
            raise RandomizationError(f"{spec.name} choice variable has no values")
        return deepcopy(rng.choice(spec.values))
    if kind == "bool":
        return bool(rng.getrandbits(1))
    raise RandomizationError(f"Unsupported randomization kind: {kind}")


def _generate_variable(rng: random.Random, spec: Any):
    if spec.kind != "list":
        return _random_scalar(rng, spec, kind=spec.kind)
    return [_random_scalar(rng, spec, kind=str(spec.item_kind)) for _ in range(int(spec.length or 0))]


def _safe_eval_node(node: ast.AST, names: dict[str, Any]):
    if isinstance(node, ast.Expression):
        return _safe_eval_node(node.body, names)
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        if node.id in names:
            return names[node.id]
        if node.id in SAFE_FUNCTIONS:
            return SAFE_FUNCTIONS[node.id]
        raise RandomizationError(f"Unknown randomization name: {node.id}")
    if isinstance(node, ast.List):
        return [_safe_eval_node(item, names) for item in node.elts]
    if isinstance(node, ast.Tuple):
        return tuple(_safe_eval_node(item, names) for item in node.elts)
    if isinstance(node, ast.Dict):
        return {_safe_eval_node(k, names): _safe_eval_node(v, names) for k, v in zip(node.keys, node.values)}
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub, ast.Not)):
        value = _safe_eval_node(node.operand, names)
        if isinstance(node.op, ast.UAdd):
            return +value
        if isinstance(node.op, ast.USub):
            return -value
        return not value
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow)):
        left = _safe_eval_node(node.left, names)
        right = _safe_eval_node(node.right, names)
        if isinstance(node.op, ast.Add):
            return left + right
        if isinstance(node.op, ast.Sub):
            return left - right
        if isinstance(node.op, ast.Mult):
            return left * right
        if isinstance(node.op, ast.Div):
            return left / right
        if isinstance(node.op, ast.FloorDiv):
            return left // right
        if isinstance(node.op, ast.Mod):
            return left % right
        return left**right
    if isinstance(node, ast.BoolOp) and isinstance(node.op, (ast.And, ast.Or)):
        values = [_safe_eval_node(value, names) for value in node.values]
        return all(values) if isinstance(node.op, ast.And) else any(values)
    if isinstance(node, ast.Compare):
        left = _safe_eval_node(node.left, names)
        for op, comparator in zip(node.ops, node.comparators):
            right = _safe_eval_node(comparator, names)
            ok = (
                isinstance(op, ast.Eq) and left == right
                or isinstance(op, ast.NotEq) and left != right
                or isinstance(op, ast.Lt) and left < right
                or isinstance(op, ast.LtE) and left <= right
                or isinstance(op, ast.Gt) and left > right
                or isinstance(op, ast.GtE) and left >= right
                or isinstance(op, ast.In) and left in right
                or isinstance(op, ast.NotIn) and left not in right
            )
            if not ok:
                return False
            left = right
        return True
    if isinstance(node, ast.Subscript):
        value = _safe_eval_node(node.value, names)
        index = _safe_eval_node(node.slice, names)
        return value[index]
    if isinstance(node, ast.Slice):
        return slice(
            _safe_eval_node(node.lower, names) if node.lower else None,
            _safe_eval_node(node.upper, names) if node.upper else None,
            _safe_eval_node(node.step, names) if node.step else None,
        )
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in SAFE_FUNCTIONS:
        args = [_safe_eval_node(arg, names) for arg in node.args]
        kwargs = {kw.arg: _safe_eval_node(kw.value, names) for kw in node.keywords if kw.arg}
        return SAFE_FUNCTIONS[node.func.id](*args, **kwargs)
    raise RandomizationError(f"Unsafe or unsupported expression syntax: {ast.dump(node, include_attributes=False)}")


def safe_eval_expression(expression: str, names: dict[str, Any]):
    try:
        parsed = ast.parse(str(expression or ""), mode="eval")
    except SyntaxError as exc:
        raise RandomizationError(f"Invalid randomization expression: {expression}") from exc
    return _safe_eval_node(parsed, names)


def generate_variant_values(*, assignment_id: int, student_id: str, question: Question, content: QuestionContent) -> dict[str, Any]:
    if not content.randomization:
        return {}
    rng = random.Random(_seed_for(assignment_id=assignment_id, student_id=student_id, question=question, content=content))
    values: dict[str, Any] = {}
    for variable in content.randomization.variables:
        values[variable.name] = _generate_variable(rng, variable)
    for computed in content.randomization.computed:
        values[computed.name] = safe_eval_expression(computed.expression, values)
    return values


def _stringify(value: Any) -> str:
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def render_template(value: str, values: dict[str, Any]) -> str:
    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in values:
            raise RandomizationError(f"Unresolved randomization placeholder: {name}")
        return _stringify(values[name])

    rendered = PLACEHOLDER_RE.sub(replace, str(value or ""))
    if "{{" in rendered or "}}" in rendered:
        raise RandomizationError("Unresolved randomization placeholder")
    return rendered


def _render_any(value: Any, values: dict[str, Any], *, path: str = ""):
    if isinstance(value, str):
        return render_template(value, values)
    if isinstance(value, list):
        return [_render_any(item, values, path=path) for item in value]
    if isinstance(value, dict):
        return {key: _render_any(item, values, path=f"{path}.{key}" if path else str(key)) for key, item in value.items()}
    return value


def render_content_with_values(content: QuestionContent, values: dict[str, Any]) -> QuestionContent:
    payload = content.model_dump(mode="json", exclude_none=True)
    payload = _render_any(payload, values)
    payload["randomization"] = content.randomization.model_dump(mode="json", exclude_none=True) if content.randomization else None
    return QuestionContent.model_validate(payload)


def build_variant_record(*, assignment_id: int, student_id: str, question: Question, content: QuestionContent) -> dict[str, Any]:
    values = generate_variant_values(assignment_id=assignment_id, student_id=student_id, question=question, content=content)
    return {"values": values, "content_hash": question_content_hash(content)}


def render_question_with_variant(question: Question, content: QuestionContent, variant_record: dict[str, Any]) -> Question:
    values = dict((variant_record or {}).get("values") or {})
    rendered_content = render_content_with_values(content, values) if values else content
    rendered = question.model_copy()
    rendered.content = rendered_content.model_dump_json(exclude_none=True)
    rendered.text = rendered_content.stem or question.text or ""
    return rendered
