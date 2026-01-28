# UI Screenshots & Examples

This document shows visual examples of the enhanced question storage features.

## Create Question Page

### New Fields Added
The Create Question page now includes all the enhanced fields:

```
┌─────────────────────────────────────────────────────┐
│ Create New Question                                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Question Text (Markdown Supported) *               │
│ [ Edit ] [ Preview ]                               │
│ ┌─────────────────────────────────────────────┐   │
│ │ ## What is recursion?                       │   │
│ │                                             │   │
│ │ Recursion is when a **function calls        │   │
│ │ itself**.                                   │   │
│ │                                             │   │
│ │ Example:                                    │   │
│ │     def factorial(n):                       │   │
│ │         if n <= 1:                          │   │
│ │             return 1                        │   │
│ │         return n * factorial(n-1)           │   │
│ └─────────────────────────────────────────────┘   │
│ Supports markdown: **bold**, *italic*, `code`      │
│                                                     │
│ UCSB Class Tag        Course Type                  │
│ ┌──────────────┐     ┌──────────────────────┐     │
│ │ CS16         │     │ intro CS             │     │
│ └──────────────┘     └──────────────────────┘     │
│                                                     │
│ Question Type *      Bloom's Taxonomy Level *      │
│ ┌──────────────┐     ┌──────────────────────┐     │
│ │ mcq ▼        │     │ Understanding ▼      │     │
│ └──────────────┘     └──────────────────────┘     │
│                                                     │
│ Image URL (optional)                               │
│ ┌─────────────────────────────────────────────┐   │
│ │ https://example.com/recursion-diagram.png   │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ Keywords (comma-separated)                         │
│ ┌─────────────────────────────────────────────┐   │
│ │ recursion,factorial,algorithm               │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ Tags (comma-separated)                             │
│ ┌─────────────────────────────────────────────┐   │
│ │ midterm,important,functions                 │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ Answer Choices *                                   │
│ ┌─────────────────────────────────────────────┐   │
│ │ A function that calls itself                │   │
│ └─────────────────────────────────────────────┘   │
│ ┌─────────────────────────────────────────────┐   │
│ │ A loop                                      │   │
│ └─────────────────────────────────────────────┘   │
│ ┌─────────────────────────────────────────────┐   │
│ │ An array                                    │   │
│ └─────────────────────────────────────────────┘   │
│ [ + Add Answer Choice ]                           │
│                                                     │
│ Correct Answer *                                   │
│ ┌─────────────────────────────────────────────┐   │
│ │ A function that calls itself ▼              │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ [ Create Question ] [ Cancel ]                    │
└─────────────────────────────────────────────────────┘
```

### Markdown Preview Mode
When the user clicks "Preview", they see the rendered markdown:

```
┌─────────────────────────────────────────────────────┐
│ Question Text (Markdown Supported) *               │
│ [ Edit ] [ Preview ]                               │
│ ┌─────────────────────────────────────────────┐   │
│ │                                             │   │
│ │   What is recursion?                        │   │
│ │   ═══════════════════                       │   │
│ │                                             │   │
│ │   Recursion is when a function calls        │   │
│ │   itself.                                   │   │
│ │                                             │   │
│ │   Example:                                  │   │
│ │       def factorial(n):                     │   │
│ │           if n <= 1:                        │   │
│ │               return 1                      │   │
│ │           return n * factorial(n-1)         │   │
│ │                                             │   │
│ └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Question Bank Display

### Enhanced Question Cards
Questions now display with rich metadata:

```
┌──────────────────────────────────────────────────────┐
│ ┌ Question Card ────────────────────────────────┐   │
│ │ ┌────┐ ┌──────────┐ ┌─────┐ ┌──────────────┐ │   │
│ │ │CS16│ │intro CS  │ │ MCQ │ │📚 Understanding│ │   │
│ │ └────┘ └──────────┘ └─────┘ └──────────────┘ │   │
│ │ Keywords: ⬜recursion ⬜factorial ⬜algorithm  │   │
│ │ Tags: ⬜midterm ⬜important ⬜functions         │   │
│ │ ──────────────────────────────────────────────│   │
│ │                                               │   │
│ │ What is recursion?                            │   │
│ │ ═══════════════════                           │   │
│ │                                               │   │
│ │ Recursion is when a function calls itself.    │   │
│ │                                               │   │
│ │ Example:                                      │   │
│ │     def factorial(n):                         │   │
│ │         if n <= 1:                            │   │
│ │             return 1                          │   │
│ │         return n * factorial(n-1)             │   │
│ │                                               │   │
│ │ [Image displayed here if URL provided]        │   │
│ │                                               │   │
│ │ Answer Choices:                               │   │
│ │ ┌───────────────────────────────────────┐     │   │
│ │ │ A function that calls itself  ✓ Correct│    │   │
│ │ └───────────────────────────────────────┘     │   │
│ │ ┌───────────────────────────────────────┐     │   │
│ │ │ A loop                                │     │   │
│ │ └───────────────────────────────────────┘     │   │
│ │ ┌───────────────────────────────────────┐     │   │
│ │ │ An array                              │     │   │
│ │ └───────────────────────────────────────┘     │   │
│ │                                               │   │
│ │                             [ Delete ]        │   │
│ └───────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### Badge Color Coding
- **Course Tag** (CS16): Blue background, white text
- **Course Type** (intro CS): Gray background, white text
- **Question Type** (MCQ): Teal background, white text, uppercase
- **Bloom's Taxonomy** (📚 Understanding): Yellow background, black text
- **Keywords**: Pastel blue, purple, green, orange, pink backgrounds
- **Tags**: Light red, purple, green, yellow, orange backgrounds

## Field Mappings to Problem Statement

All requested fields from the problem statement are now supported:

| Problem Statement Requirement | Implementation |
|------------------------------|----------------|
| UCSB class tag (i.e. CS16, CS24) | ✅ `course` field |
| Course type (i.e. intro CS, intermediate CS, linear algebra) | ✅ `course_type` field |
| Question keywords (can AI filter for these?) | ✅ `keywords` field |
| Question type (i.e. mcq, fr, short answer) | ✅ `question_type` field |
| Question tags (i.e. recursion, sorting, runtime analysis) | ✅ `tags` field |
| Bloom's taxonomy level (i.e. Remembering, Understanding) | ✅ `blooms_taxonomy` field |
| Question text | ✅ `text` field with markdown support |
| Image storage (optional) | ✅ `image_url` field |
| Answer choices/input (vary based on question type) | ✅ `answer_choices` JSON array |
| Correct answer (varied based on question type) | ✅ `correct_answer` field |

## Markdown Display Features

### Supported Markdown Elements

1. **Headers**
   - Input: `## What is recursion?`
   - Output: Large, bold heading

2. **Bold Text**
   - Input: `**function calls itself**`
   - Output: function calls itself (in bold)

3. **Italic Text**
   - Input: `*important*`
   - Output: important (in italics)

4. **Code Inline**
   - Input: `` `factorial(n)` ``
   - Output: factorial(n) (with gray background)

5. **Code Blocks**
   - Input:
     ```
         def factorial(n):
             return 1 if n <= 1 else n * factorial(n-1)
     ```
   - Output: Formatted code block with monospace font

6. **Lists**
   - Unordered: `- Base case prevents infinite recursion`
   - Ordered: `1. First step`

7. **Links**
   - Input: `[Learn more](https://example.com)`
   - Output: Clickable link

## Database Schema

```sql
-- Question table with all enhanced fields
CREATE TABLE question (
    id INTEGER PRIMARY KEY,
    text TEXT,                    -- Supports long markdown content
    course VARCHAR,               -- UCSB class tag (e.g., CS16)
    course_type VARCHAR,          -- Course category
    question_type VARCHAR,        -- mcq, fr, short_answer, true_false
    blooms_taxonomy VARCHAR,      -- Bloom's taxonomy level
    keywords VARCHAR,             -- Comma-separated
    tags VARCHAR,                 -- Comma-separated
    image_url VARCHAR NULL,       -- Optional image URL
    answer_choices TEXT,          -- JSON array
    correct_answer VARCHAR,       -- Correct answer text
    source_pdf VARCHAR NULL,      -- Source PDF filename
    user_id VARCHAR,              -- User who created it
    created_at TIMESTAMP,
    is_verified BOOLEAN
);
```

## API Response Example

```json
{
  "id": 1,
  "text": "## What is recursion?\n\nRecursion is when a **function calls itself**.",
  "course": "CS16",
  "course_type": "intro CS",
  "question_type": "mcq",
  "blooms_taxonomy": "Understanding",
  "keywords": "recursion,factorial,algorithm",
  "tags": "midterm,important,functions",
  "image_url": "https://example.com/recursion.png",
  "answer_choices": "[\"A function that calls itself\",\"A loop\",\"An array\"]",
  "correct_answer": "A function that calls itself",
  "source_pdf": null,
  "user_id": "auth-user-123",
  "created_at": "2026-01-28T06:00:00Z",
  "is_verified": false
}
```

## Future PrairieLearn-like Features

The foundation is now in place for:
- Question filtering by course, type, difficulty (Bloom's level)
- AI-powered keyword extraction and tagging
- Question pools organized by metadata
- Automatic quiz generation based on filters
- Analytics on question difficulty and usage
- Export to various quiz formats
- Integration with learning management systems
