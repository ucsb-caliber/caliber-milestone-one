import json
import regex as re
from mdutils.mdutils import MdUtils
from pythonregex import CODE_PATTERNS
import ollama
import math


OLLAMA_PROMPT = """Restore proper Python indentation to this code. 
Output only the corrected code, nothing else."""

QUESTION_START_PATTERNS = [
    r"^\s*Problem\s+\d+\b",
    r"^\s*Question\s+\d+\b",
    r"^\s*Q\s*\d+\b"
]

codestyle = ["", 0]

QUESTION_START_RE = re.compile("|".join(QUESTION_START_PATTERNS), re.IGNORECASE)

COMPILED_PATTERNS = [re.compile(p, re.MULTILINE) for p in CODE_PATTERNS]

def is_python_code(part: dict) -> bool:
    if part['type'] == 'list':
        return False
    if codestyle[1] == 0:
        if any(pattern.search(part['content']) for pattern in COMPILED_PATTERNS):
            codestyle[0] = part['font']
            codestyle[1] = part['font size']

    return part['font'] == codestyle[0] and part['font size'] == codestyle[1]

def is_question_start(text) -> bool:
    return bool(QUESTION_START_RE.match(text.strip()))

def is_numbered_start(text) -> bool:
    return bool(re.match(r'\d+\. ', text.strip()))



def pythonformatter(segments):
    out = []
    lmargin = math.ceil(segments[0]['bounding box'][0]/17)
    indent = 0
    for line in segments[0]['content'].split('\n'):
        if line.startswith('def'):
            out.append([line, lmargin, 0])
        else:
            out.append([line, lmargin, indent])

        if line[-1] == ":":
            indent+=1
        elif line.startswith("return"):
            indent = 0
        elif indent > 0:
            indent = 1
        
    for seg in segments:
        lmargin = math.ceil(seg['bounding box'][0]/17)
        for line in seg['content'].split('\n'):
            if line.startswith('def'):
                out.append([line, lmargin, 0])
            else:
                out.append([line, lmargin, indent])



with open('output/practicefinal3.json', 'r', encoding='utf-8') as file:
    data_dict = json.load(file)


items = []
for kid in data_dict['kids']:
    if kid['type'] == 'header' or kid['type'] == 'footer':
        items.extend(kid['kids'])
    else:
        items.append(kid)

qstarts = []
nstarts = []

for part in items:
    text = part.get('content', "")
    if is_question_start(text):
        qstarts.append({'title': part, 'body': []})
    elif qstarts:
        if is_python_code(part) and len(qstarts[-1]['body']) > 0:
            if qstarts[-1]['body'][-1]['type'] == 'code':
                qstarts[-1]['body'][-1]['segments'].append(part)
            else:
                codeblock = {'type': 'code', 'segments': [part]}
                qstarts[-1]['body'].append(codeblock)
        else:
            qstarts[-1]['body'].append(part)

    if is_numbered_start(text):
        nstarts.append({'title': part, 'body': []})
    elif nstarts:
        nstarts[-1]['body'].append(part)


for i, question in enumerate(qstarts):
    mdFile = MdUtils(file_name=f'Q{i+1}')
    mdFile.new_header(level=1, title=question['title']['content'])
    for part in question['body']:
        if part['type'] == 'list':
            items = []
            for item in part['list items']:
                items.append(item['content'])
            mdFile.new_list(items)
        elif part['type'] == 'code':
            code = "\n".join([seg['content'] for seg in part['segments']])
            print('Formatting with Ollama...')
            response = ollama.chat(
                model="llama3.1",
                messages=[{"role": "user", "content": OLLAMA_PROMPT + f"\n{code}"}]
            )
            print('Done.')
            formatted = response['message']['content']
            
            mdFile.new_paragraph(formatted)
        else:
            mdFile.new_paragraph(part['content'])
    mdFile.create_md_file()

    

