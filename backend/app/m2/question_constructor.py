import json
import regex as re
from mdutils.mdutils import MdUtils
from coderegex import *
import ollama
import math
import subprocess
from clang_format import clang_format
from typing import List, Tuple, Optional, Dict, Any, Callable
from dataclasses import dataclass, field
import opendataloader_pdf


OLLAMA_PROMPT = """Restore proper Python indentation to this code. 
Output only the corrected code, nothing else."""

QUESTION_START_PATTERNS = [
    r"^\s*Problem\s+\d+\b",
    r"^\s*Question\s+\d+\b",
    r"^\s*Q\s*\d+\b"
]


QUESTION_START_RE = re.compile("|".join(QUESTION_START_PATTERNS), re.IGNORECASE)

PYTHON_PATTERNS = [re.compile(p, re.MULTILINE) for p in CODE_PATTERNS_PYTHON]
BRACE_PATTERNS = [re.compile(p, re.MULTILINE) for p in CODE_PATTERNS_BRACE_LANG]

GENERATE_MD = True

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

def code_type(part: dict) -> str:
    text = part.get('content', "")
    if is_python(text):
        return 'python'
    elif is_brace(text):
        return 'brace'
    else:
        return part['type']

def is_python(text: str) -> bool:
    return any(pattern.search(text) for pattern in PYTHON_PATTERNS)
def is_brace(text: str) -> bool:
    return any(pattern.search(text) for pattern in BRACE_PATTERNS)

def is_question_start(text) -> bool:
    return bool(QUESTION_START_RE.match(text.strip()))

def is_numbered_start(text, number) -> bool:
    return bool(re.match(rf'^{number}\. ', text.strip()))

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
opendataloader_pdf.convert(
    input_path=['exams/'],
    output_dir="output/",
    format="json",    
    keep_line_breaks = True,
    include_header_footer = False,
    image_dir = "crops"
)
with open('output/hw3.json', 'r', encoding='utf-8') as file:
    data_dict = json.load(file)
def parse_pdf_to_questions(data_dict):
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


    questions: List[Question] = max(qstarts, nstarts, key=len)


    if GENERATE_MD:
        for i, question in enumerate(questions):
            title_block = question.blocks[0]
            body_blocks = question.blocks[1:]

            mdFile = MdUtils(file_name=f'questionsmd/Q{i+1}')
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