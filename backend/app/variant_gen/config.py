"""Environment, paths, and model constants for variant_gen."""

import os
from pathlib import Path

from dotenv import load_dotenv

from .exam_tests_questions import EXAM_TESTS_DIR

_APP_DIR = Path(__file__).resolve().parent.parent
_BACKEND_DIR = _APP_DIR.parent
load_dotenv(_BACKEND_DIR / ".env")
load_dotenv(_APP_DIR / ".env")
load_dotenv()

BASE_DIR = _BACKEND_DIR
DB_PATH = EXAM_TESTS_DIR

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
GEMINI_URL_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# Default when OPENROUTER_MODEL is unset (OpenRouter slug).
DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini"
DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite-preview"


def variant_llm_provider() -> str:
    """Provider used for variant generation calls: openrouter or gemini."""
    raw = os.getenv("VARIANT_LLM_PROVIDER", os.getenv("LLM_PROVIDER", "openrouter"))
    name = raw.strip().lower()
    aliases = {"google": "gemini", "google-gemini": "gemini", "open_router": "openrouter"}
    return aliases.get(name, name)


def resolved_openrouter_model() -> str:
    return os.getenv("OPENROUTER_MODEL", "").strip() or DEFAULT_OPENROUTER_MODEL


def resolved_gemini_model() -> str:
    return os.getenv("GEMINI_MODEL", "").strip() or DEFAULT_GEMINI_MODEL


def resolved_llm_model(provider: str | None = None) -> str:
    name = provider or variant_llm_provider()
    if name == "gemini":
        return resolved_gemini_model()
    return resolved_openrouter_model()


def resolved_question_router_model() -> str:
    """Model slug/name for ``QUESTION_ROUTER=llm`` (defaults to main generate model)."""
    return os.getenv("QUESTION_ROUTER_MODEL", "").strip() or resolved_llm_model()


def question_router_name() -> str:
    return os.getenv("QUESTION_ROUTER", "rules").strip().lower()


def question_router_timeout_sec() -> float:
    return float(os.getenv("QUESTION_ROUTER_TIMEOUT", "25"))


def telemetry_enabled() -> bool:
    """Emit one-line JSON routing / outcome events when ``VARIANT_GEN_TELEMETRY=1``."""
    return os.getenv("VARIANT_GEN_TELEMETRY", "").strip().lower() in ("1", "true", "yes", "on")


def variant_vision_enabled() -> bool:
    """Multimodal requests allowed (crop + text in one call)."""
    return os.getenv(
        "VARIANT_LLM_VISION",
        os.getenv("OPENROUTER_VISION", os.getenv("OPENROUTER_SEND_IMAGES", "1")),
    ).lower() not in (
        "0",
        "false",
        "no",
    )


def openrouter_vision_enabled() -> bool:
    """Backward-compatible name used by older variant_gen modules."""
    return variant_vision_enabled()


DEBUG = False
MAX_RETRIES = 3

# HTTP read timeouts (seconds) for OpenRouter. Verify is usually short; keep it lower so a
# hung or token-bloated call does not block the batch for minutes.
def openrouter_timeout_generate() -> float:
    return float(os.getenv("OPENROUTER_TIMEOUT", "90"))


def openrouter_timeout_verify() -> float:
    return float(os.getenv("OPENROUTER_TIMEOUT_VERIFY", "55"))


def verify_variant_text_max_chars() -> int:
    """Cap variant_text size embedded in verify prompts (avoids huge completions / slow calls)."""
    return max(4000, int(os.getenv("VERIFY_VARIANT_TEXT_MAX_CHARS", "14000")))


def generation_source_max_chars() -> int:
    """Cap raw question text sent to the generation prompt only."""
    return max(12000, int(os.getenv("GENERATION_SOURCE_MAX_CHARS", "26000")))


BASE_TEMPERATURE = 0.4
SIMILARITY_THRESHOLD = 0.6
SIMILARITY_THRESHOLD_EXPLANATION = 0.72

_ALGORITHM_PATTERNS = [
    ("hash map lookup", ["hash", "dictionary", "dict", "lookup", "two sum", "key", "mapping"]),
    ("graph traversal", ["graph", "bfs", "dfs", "breadth", "depth", "adjacen", "vertex", "edge", "shortest path", "dijkstra", "spanning tree", "kruskal"]),
    ("dynamic programming", ["dynamic programming", "memoiz", "tabulation", "subproblem", "overlapping", "optimal substructure", "longest common", "knapsack"]),
    ("sorting / ordering", ["sort", "order", "rank", "arrange", "ascending", "descending", "merge sort", "quicksort", "bubble"]),
    ("binary search", ["binary search", "bisect", "sorted array", "log n", "divide and conquer"]),
    ("recursion", ["recurs", "base case", "recursive"]),
    ("tree traversal", ["tree", "preorder", "inorder", "postorder", "binary tree", "bst", "traversal"]),
    ("linked list", ["linked list", "singly linked", "head", "node", "next pointer", "reverse"]),
    ("stack / queue", ["stack", "queue", "push", "pop", "peek", "fifo", "lifo"]),
    ("set operations", ["set", "intersection", "union", "difference", "common elements"]),
    ("string manipulation", ["string", "substring", "reverse", "palindrome", "anagram", "character"]),
    ("array search", ["array", "list", "find", "search", "index", "element"]),
    ("greedy", ["greedy", "optimal", "locally optimal"]),
    ("class design / OOP", ["class", "inherit", "object", "method", "__init__", "__str__", "attribute"]),
]
