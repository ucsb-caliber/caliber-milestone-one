# Matches Python — colon-terminated blocks, Python-only keywords
CODE_PATTERNS_PYTHON = [
    r'\bdef\s+\w+\s*\([^)]*\)\s*:',           # def foo():
    r'\bclass\s+\w+\s*(\([^)]*\))?\s*:',       # class Foo:
    r'\bfor\s+\w+\s+in\s+.+\s*:',             # for x in ...:   (no semicolons)
    r'\belif\s+.+\s*:',                         # elif — Python only
    r'\bexcept\s*(\w+(\s+as\s+\w+)?)?\s*:',   # except / except E as x:
    r'\bwith\s+.+\s+as\s+\w+\s*:',            # with X as y:
    r'\bwhile\s+[^(].+\s*:',                   # while cond:  (no parens)  
    r'\bself\s*\.',                             # self.x
    r'\belif\b|\bpass\b|\byield\b',            # Python-only keywords
    r'^\s*@\w+',                               # decorators
    r'\bprint\s*\(',                           # print() — common in exam code
    r'\blen\s*\(',                             # len() — common in exam code
    r'^\s*#',                                  # # comments (not //)
]

# Matches brace-delimited languages (C++, Java, C)
CODE_PATTERNS_BRACE_LANG = [
    r'\{',                                     # opening brace — the core signal
    r'\}\s*;?\s*$',                            # closing brace
    r';\s*$',                                  # semicolon line terminator
    r'\bfor\s*\([^;]+;[^;]+;[^)]*\)',         # for(;;) — C-style loop
    r'\bSystem\.out\.print',                   # Java giveaway
    r'^\s*#include\b',                         # C/C++ giveaway
    r'\b(public|private|protected)\b',         # Java/C++ access modifiers
    r'\bvoid\s+\w+\s*\(',                      # void method( — Java/C++
    r'//',                                     # // comments
]