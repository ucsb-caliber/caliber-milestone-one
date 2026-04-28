CODE_PATTERNS = [
    # Function & Class Definition
    r'\bdef\s+\w+\s*\(.*\)\s*:',
    r'\bdef\s+\w+\s*\(.*\)\s*->\s*\w+\s*:',
    r'\bclass\s+\w+\s*(\(.*\))?\s*:',
    r'\basync\s+def\s+\w+\s*\(.*\)\s*:',

    # Control Flow
    r'\bfor\s+\w+\s+in\s+.+\s*:',
    r'\belif\s+.+\s*:',
    r'\bwhile\s+.+\s*:',
    r'\belse\s*:',

    # Exception Handling
    r'\bexcept\s*:',
    r'\bexcept\s+\w+\s*:',
    r'\bexcept\s+\w+\s+as\s+\w+\s*:',
    r'\bfinally\s*:',
    r'\btry\s*:',
    r'\braise\s+\w+(\(.*\))?\s*$',

    # Context Managers
    r'\bwith\s+.+\s+as\s+\w+\s*:',
    r'\basync\s+with\s+.+\s*:',

    # Imports
    r'\bimport\s+\w+',
    r'\bfrom\s+\w+\s+import\s+(\w+|\*)',

    # Augmented Assignment
    r'\w+\s*(\+=|-=|\*=|/=|//=|\*\*=|%=)\s*.+',

    # Decorators
    r'^\s*@\w+(\(.*\))?$',

    # Yield
    r'^\s*\byield\s+(\w+|\(|\[|[0-9])',
    r'^\s*\byield\s+from\s+\w+'
]

