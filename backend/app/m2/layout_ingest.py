import os
import shutil
import re
import json
import hashlib
import uuid
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Tuple, Optional, Dict, Any, Callable

import layoutparser as lp
from pdf2image import convert_from_path
from PIL import Image
import pytesseract
import matplotlib.pyplot as plt
import torch
import requests
from pytesseract import Output
from coderegex import *
import subprocess
import ollama
from mdutils.mdutils import MdUtils
from clang_format import clang_format
import opendataloader_pdf


_TORCH_LOAD_ORIG = torch.load

def torch_load_compat(*args, **kwargs):
    kwargs.setdefault("weights_only", False)
    return _TORCH_LOAD_ORIG(*args, **kwargs)

torch.load = torch_load_compat


# ===================== CONFIG =====================

PDF_PATH = "exam_tests/practicefinal2.pdf"
OUTPUT_DIR = "layout_debug"

START_PAGE = 1
END_PAGE = 10

Y_TOL = 25            # reading-order tolerance

SAVE_CROPS = True
SHOW_CROPS = True     # set False if running headless (no GUI)
CROP_PADDING = 10     # pixels of padding around bbox

QUESTIONS_DB_FILENAME = "questions.json"  # stored inside OUTPUT_DIR

DEBUG = True
DEBUG_DRAW_LAYOUT = False   # <-- IMPORTANT: avoids Pillow10 layoutparser crash
M2_TESSERACT_TIMEOUT_SEC = max(5, int(os.getenv("M2_TESSERACT_TIMEOUT_SEC", "45")))

OLLAMA_PROMPT = """Restore proper Python indentation to this code. 
Output only the corrected code, nothing else."""

# ===================== QUESTION DETECTION =====================

QUESTION_START_PATTERNS = [
    r"^\s*Problem\s+\d+\b",
    r"^\s*Question\s+\d+\b",
    r"^\s*Q\s*\d+\b",
    r"^\s*\d+\.\s+.+[. ?:].*"
]

QUESTION_START_RE = re.compile("|".join(QUESTION_START_PATTERNS), re.IGNORECASE)
NUMBERED_ITEM_SPLIT_RE = re.compile(r"(?=\n?\s*\d+\s*[\.\)])")

PYTHON_PATTERNS = [re.compile(p, re.MULTILINE) for p in CODE_PATTERNS_PYTHON]
BRACE_PATTERNS = [re.compile(p, re.MULTILINE) for p in CODE_PATTERNS_BRACE_LANG]


# ===================== DATA STRUCTURES =====================

@dataclass
class Block:
    page: int
    bbox: Tuple[int, int, int, int]
    text: str
    btype: str


@dataclass
class Question:
    start_page: int
    blocks: List[Block] = field(default_factory=list)
    text_units: List[str] = field(default_factory=list)

    question_id: str = ""
    qtype: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    image_crops: List[str] = field(default_factory=list)

    def add_block(self, block: Block):
        self.blocks.append(block)
        if block.text and block.text.strip():
            self.text_units.append(block.text)

    @property
    def text(self) -> str:
        return "\n".join(self.text_units).strip()

    def bboxes_by_page(self) -> Dict[int, Tuple[int, int, int, int]]:
        by_page: Dict[int, List[Tuple[int, int, int, int]]] = {}
        for b in self.blocks:
            by_page.setdefault(b.page, []).append(b.bbox)

        out: Dict[int, Tuple[int, int, int, int]] = {}
        for p, bboxes in by_page.items():
            xs1 = [bb[0] for bb in bboxes]
            ys1 = [bb[1] for bb in bboxes]
            xs2 = [bb[2] for bb in bboxes]
            ys2 = [bb[3] for bb in bboxes]
            out[p] = (min(xs1), min(ys1), max(xs2), max(ys2))
        return out

    def page_nums(self) -> List[int]:
        return sorted({b.page for b in self.blocks})


# ===================== HELPERS =====================

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_exam_id(s: str) -> str:
    s = (s or "").strip()
    if not s:
        return "exam_unknown"
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"[^A-Za-z0-9_\-]+", "", s)
    return s or "exam_unknown"


def stable_hash16(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def make_ingestion_id(created_at: str, source_pdf: str, exam_id: str) -> str:
    seed = f"{created_at}::{source_pdf}::{exam_id}"
    return "ing_" + stable_hash16(seed)


def make_question_id(exam_id: str, ingestion_id: str, question_index: int) -> str:
    seed = f"{exam_id}::{ingestion_id}::q{question_index}"
    return "q_" + stable_hash16(seed)


def atomic_write_json(path: Path, data: Dict[str, Any]):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + f".tmp.{uuid.uuid4().hex}")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def load_questions_db(db_path: Path) -> Dict[str, Any]:
    if not db_path.exists():
        return {"schema_version": "1.0", "ingestions": []}

    try:
        raw = db_path.read_text(encoding="utf-8")
        data = json.loads(raw)
        if not isinstance(data, dict):
            return {"schema_version": "1.0", "ingestions": []}
        if "ingestions" not in data or not isinstance(data["ingestions"], list):
            data["ingestions"] = []
        if "schema_version" not in data:
            data["schema_version"] = "1.0"
        return data
    except Exception:
        backup = db_path.with_suffix(db_path.suffix + f".bak.{uuid.uuid4().hex}")
        try:
            db_path.replace(backup)
        except Exception:
            pass
        return {"schema_version": "1.0", "ingestions": []}
    

def format_brace_code(code: str) -> str:
    result = subprocess.run(
        ["clang-format", "--style=Google"],
        input=code.encode("utf-8"),        
        capture_output=True,              
    )
    return result.stdout.decode("utf-8")


def part_to_block(part: dict) -> Block:
    return Block(
        page=part.get('page number', 0),
        bbox=tuple(part.get('bounding box', (0, 0, 0, 0))),
        text=part.get('content', ''),
        btype=part.get('type', ''),
    )


def code_type(part: dict) -> str:
    text = part.get('content', "")
    if is_python(text):
        return 'python'
    elif is_brace(text):
        return 'brace'
    else:
        return part['type']


# ===================== REGEX =====================

def is_python(text: str) -> bool:
    return any(pattern.search(text) for pattern in PYTHON_PATTERNS)


def is_brace(text: str) -> bool:
    return any(pattern.search(text) for pattern in BRACE_PATTERNS)


def is_question_start(text) -> bool:
    return bool(QUESTION_START_RE.match(text.strip()))


def is_numbered_start(text, number) -> bool:
    return bool(re.match(rf'^{number}\. ', text.strip()))


# ===================== MAIN PARSER =====================

def parse_pdf_to_questions(
    data_dict: Dict,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
    should_cancel: Optional[Callable[[], bool]] = None,
) -> List[Question]:
    items = []
    for kid in data_dict['kids']:
        kid['type'] = code_type(kid)
        if kid['type'] == 'header' or kid['type'] == 'footer':
            items.extend(kid['kids'])
        elif kid['type'] == 'list':
            items.extend(kid['list items'])
        else:
            items.append(kid)

    qstarts: List[Question] = []
    nstarts: List[Question] = []

    for part in items:
        text = part.get('content', "")
        block = part_to_block(part)

        if is_question_start(text):
            q = Question(start_page=block.page)
            q.add_block(block)
            qstarts.append(q)
        elif qstarts:
            qstarts[-1].add_block(block)

        if is_numbered_start(text, len(nstarts)+1):
            q = Question(start_page=block.page)
            q.add_block(block)
            nstarts.append(q)
        elif nstarts:
            nstarts[-1].add_block(block)

    return max(qstarts, nstarts, key=len)


# ===================== CROPPING / DISPLAY =====================

def clamp_bbox(bbox: Tuple[int, int, int, int], w: int, h: int, pad: int = 0) -> Tuple[int, int, int, int]:
    x1, y1, x2, y2 = bbox
    x1 = max(0, x1 - pad)
    y1 = max(0, y1 - pad)
    x2 = min(w, x2 + pad)
    y2 = min(h, y2 + pad)
    if x2 <= x1 or y2 <= y1:
        return (0, 0, 0, 0)
    return (x1, y1, x2, y2)


def crop_and_output_questions(pages: List[Image.Image], questions: List[Question], crops_dir: Path):
    crops_dir.mkdir(parents=True, exist_ok=True)

    for q in questions:
        per_page = q.bboxes_by_page()

        for page_num, bbox in sorted(per_page.items()):
            page_img = pages[page_num - 1]
            w, h = page_img.size

            x1, y1, x2, y2 = clamp_bbox(bbox, w, h, pad=CROP_PADDING)
            if (x1, y1, x2, y2) == (0, 0, 0, 0):
                continue

            crop = page_img.crop((x1, y1, x2, y2))

            if SAVE_CROPS:
                out_path = crops_dir / f"{q.question_id}_p{page_num:03d}.png"
                crop.save(out_path)
                q.image_crops.append(str(out_path))

            if SHOW_CROPS:
                plt.figure()
                plt.imshow(crop)
                plt.axis("off")
                plt.title(f"{q.question_id} (page {page_num})")
                plt.show()


def generate_md(questions: List[Question], output_folder: str):
    for i, question in enumerate(questions):
        title_block = question.blocks[0]
        body_blocks = question.blocks[1:]

        mdFile = MdUtils(file_name=f'{output_folder}/Q{i+1}')
        mdFile.new_header(level=1, title=title_block.text)

        body = []

        def last_btype(body):
            if not body:
                return None
            last = body[-1]
            return last['btype'] if isinstance(last, dict) else last.btype

        def append_to_codeblock(body, block):
            if "code" in (last_btype(body) or ""):
                body[-1]['segments'].append(block)
            else:
                body.append({'btype': f"{block.btype} code", 'segments': [block]})

        def append_to_list(body, block):
            if last_btype(body) == 'list':
                body[-1]['list items'].append(block)
            else:
                body.append({'btype': 'list', 'list items': [block]})

        def append_block(body, block):
            if block.btype in ('python', 'brace'):
                append_to_codeblock(body, block)
            elif block.btype == 'list item':
                append_to_list(body, block)
            else:
                body.append(block)

        for block in body_blocks:
            append_block(body, block)

        for part in body:
            if isinstance(part, Block):
                if part.btype in ('image', 'table'):
                    continue
                try:
                    mdFile.new_paragraph(part.text)
                except:
                    print(part)
            elif part['btype'] == 'list':
                list_items = [b.text for b in part['list items']]
                mdFile.new_list(list_items)
            elif part['btype'] == 'python code':
                code = "\n".join([seg.text for seg in part['segments']])
                response = ollama.chat(
                    model="llama3.1",
                    messages=[{"role": "user", "content": OLLAMA_PROMPT + f"\n{code}"}]
                )
                formatted = response['message']['content']
                mdFile.new_paragraph(formatted)
            elif part['btype'] == 'brace code':
                code = "\n".join([seg.text for seg in part['segments']])
                formatted = format_brace_code(code)
                formatted = re.sub(r'\b(public|private|protected)\s*\n(\s*)', r'\2\1 ', formatted)
                mdFile.new_paragraph('```\n' + formatted + '\n```')

        mdFile.create_md_file()


# ===================== DB APPEND =====================

def append_ingestion_to_db(
    db_path: Path,
    created_at: str,
    source_pdf: str,
    exam_id: str,
    ingestion_id: str,
    questions: List[Question],
):
    db = load_questions_db(db_path)

    ingestion_obj = {
        "ingestion_id": ingestion_id,
        "created_at": created_at,
        "source_pdf": source_pdf,
        "exam_id": exam_id,
        "questions": [
            {
                "question_id": q.question_id,
                "start_page": q.start_page,
                "page_nums": q.page_nums(),
                "text": q.text,
                "text_hash": stable_hash16(q.text.lower().strip()),
                "image_crops": q.image_crops,
                "type": q.qtype,
                "metadata": q.metadata,
            }
            for q in questions
        ],
    }

    db["ingestions"].append(ingestion_obj)
    atomic_write_json(db_path, db)


# ===================== ENTRY POINT =====================

def main():
    pdf_path = Path(PDF_PATH)
    assert pdf_path.exists(), f"PDF not found: {pdf_path.resolve()}"
    Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
    file_name = Path(PDF_PATH).stem

    user_exam_id = input("Enter exam id: ").strip()
    exam_id = normalize_exam_id(user_exam_id)

    created_at = utc_now_iso()
    source_pdf = str(pdf_path)
    ingestion_id = make_ingestion_id(created_at=created_at, source_pdf=source_pdf, exam_id=exam_id)

    if DEBUG:
        if os.path.exists('pages'):
            shutil.rmtree('pages')
        os.makedirs('pages', exist_ok=True)
        with open("Output.txt", "w") as _:
            pass
    
    os.makedirs('temp/', exist_ok=True)
    opendataloader_pdf.convert(
        input_path=pdf_path,
        output_dir="temp/",
        format="json",    
        keep_line_breaks = True,
        include_header_footer = False,
        image_dir = "crops",
        pages = "{START_PAGE}-{END_PAGE}"
    )
    with open(f'temp/{file_name}.json', 'r', encoding='utf-8') as file:
        data_dict = json.load(file)

    questions = parse_pdf_to_questions(data_dict)
    pages = convert_from_path(str(pdf_path))

    for i, q in enumerate(questions, 1):
        if DEBUG:
            with open("Output.txt", "a") as text_file:
                text_file.write(f"{q.text}\n")
                text_file.write("=====" * 20 + "\n")

        q.question_id = make_question_id(exam_id=exam_id, ingestion_id=ingestion_id, question_index=i)
        q.qtype = None
        q.metadata = {}

    print(f"\nDetected {len(questions)} questions")
    print(f"exam_id={exam_id}")
    print(f"ingestion_id={ingestion_id}\n")

    for i, q in enumerate(questions, 1):
        preview = q.text.replace("\n", " ")
        if len(preview) > 220:
            preview = preview[:220] + "..."
        print(f"[{i:02d}] {q.question_id} start_page={q.start_page} pages={q.page_nums()}")
        print(f"     {preview}\n")

    crops_dir = Path(OUTPUT_DIR) / "crops" / exam_id / ingestion_id
    crop_and_output_questions(pages, questions, crops_dir=crops_dir)

    db_path = Path(OUTPUT_DIR) / QUESTIONS_DB_FILENAME
    append_ingestion_to_db(
        db_path=db_path,
        created_at=created_at,
        source_pdf=source_pdf,
        exam_id=exam_id,
        ingestion_id=ingestion_id,
        questions=questions,
    )

    shutil.rmtree('temp/')

    print(f"Appended ingestion to: {db_path}")
    print(f"Crops saved under: {crops_dir}")
    print("Done.")


if __name__ == "__main__":
    main()
