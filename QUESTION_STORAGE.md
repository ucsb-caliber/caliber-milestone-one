# Enhanced Question Storage Documentation

This document describes the enhanced question storage features implemented in Caliber, including all required fields and markdown support.

## Overview

The question storage system now supports comprehensive metadata for educational questions, following the requirements specified in the problem statement. Questions can be created with rich metadata and displayed with markdown formatting.

## Question Fields

### Required Fields
- **Question Text** (`text`): The question content, supports **Markdown formatting**
- **Question Type** (`question_type`): Type of question
  - Options: `mcq` (Multiple Choice), `fr` (Free Response), `short_answer`, `true_false`

### UCSB-Specific Fields
- **UCSB Class Tag** (`course`): Course identifier (e.g., CS16, CS24, MATH 3A)
- **Course Type** (`course_type`): Category of course (e.g., "intro CS", "intermediate CS", "linear algebra")

### Educational Taxonomy
- **Bloom's Taxonomy Level** (`blooms_taxonomy`): Cognitive level of the question
  - Options: `Remembering`, `Understanding`, `Applying`, `Analyzing`, `Evaluating`, `Creating`

### Metadata Fields
- **Question Keywords** (`keywords`): Comma-separated keywords for filtering (e.g., "recursion, factorial, algorithm")
- **Question Tags** (`tags`): Comma-separated tags (e.g., "recursion, sorting, runtime analysis")

### Answer Fields
- **Answer Choices** (`answer_choices`): JSON array of answer options
- **Correct Answer** (`correct_answer`): The correct answer (must match one of the choices)

### Optional Fields
- **Image URL** (`image_url`): URL to an image to display with the question
- **Source PDF** (`source_pdf`): Original PDF filename (auto-filled when uploading PDFs)

## Markdown Support

### Question Text
Questions support full markdown formatting in the text field:

```markdown
## What is recursion?

Recursion is when a **function calls itself**.

Example code:
```python
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n-1)
```

Key points:
- Base case prevents infinite recursion
- Recursive case breaks problem into smaller parts
```

### Markdown Features Supported
- **Headers**: `# H1`, `## H2`, `### H3`
- **Bold**: `**bold text**`
- **Italic**: `*italic text*`
- **Code**: `` `inline code` ``
- **Code blocks**: ` ```language\ncode\n``` `
- **Lists**: Unordered (`- item`) and ordered (`1. item`)
- **Links**: `[text](url)`
- **Images**: `![alt](url)` (or use the image_url field)

## Using the Create Question Page

### Step 1: Enter Question Text
1. Type your question in the **Question Text** field
2. Use markdown formatting for better readability
3. Click **Preview** to see how it will render
4. Click **Edit** to return to editing mode

### Step 2: Fill in Metadata
- **UCSB Class Tag**: Enter the course code (e.g., CS16)
- **Course Type**: Describe the course category (e.g., "intro CS")
- **Question Type**: Select from dropdown (MCQ, Short Answer, Free Response, True/False)
- **Bloom's Taxonomy Level**: Select the cognitive level

### Step 3: Add Keywords and Tags
- **Keywords**: Comma-separated technical terms for AI filtering
- **Tags**: Comma-separated organizational tags

### Step 4: Optional Image
- Enter a URL to an image that illustrates the question
- Images are displayed above the answer choices

### Step 5: Add Answer Choices
- Enter at least 2 answer choices
- Click **+ Add Answer Choice** to add more options
- Select the **Correct Answer** from the dropdown

### Step 6: Submit
Click **Create Question** to save the question to the database.

## Viewing Questions in Question Bank

Questions are displayed with:
- **Badges** showing course, course type, question type, and Bloom's taxonomy level
- **Keyword bubbles** in different colors
- **Tag bubbles** in different colors
- **Rendered markdown** for the question text
- **Image display** if an image URL is provided
- **Answer choices** with the correct answer highlighted in green

## API Usage

### Create Question (POST /api/questions)
```bash
curl -X POST http://localhost:8000/api/questions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "text=## What is Big O notation?\n\nBig O describes **worst-case** time complexity." \
  -F "course=CS16" \
  -F "course_type=intro CS" \
  -F "question_type=mcq" \
  -F "blooms_taxonomy=Understanding" \
  -F "keywords=big-o,complexity,analysis" \
  -F "tags=algorithms,theory" \
  -F "answer_choices=[\"O(1)\",\"O(n)\",\"O(log n)\",\"O(n^2)\"]" \
  -F "correct_answer=O(n)" \
  -F "image_url=https://example.com/big-o-chart.png"
```

### Update Question (PUT /api/questions/{id})
```bash
curl -X PUT http://localhost:8000/api/questions/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "blooms_taxonomy": "Applying",
    "question_type": "fr",
    "course_type": "intermediate CS"
  }'
```

## Database Schema

The Question table includes these fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Primary key |
| `text` | TEXT | Question text (supports markdown) |
| `course` | String | UCSB class tag (e.g., CS16) |
| `course_type` | String | Course category |
| `question_type` | String | Type of question (mcq, fr, etc.) |
| `blooms_taxonomy` | String | Bloom's taxonomy level |
| `keywords` | String | Comma-separated keywords |
| `tags` | String | Comma-separated tags |
| `image_url` | String (nullable) | Optional image URL |
| `answer_choices` | TEXT | JSON array of choices |
| `correct_answer` | String | The correct answer |
| `source_pdf` | String (nullable) | Source PDF filename |
| `user_id` | String | Owner's user ID |
| `created_at` | DateTime | Creation timestamp |
| `is_verified` | Boolean | Verification status |

## Migration

To apply the database migration for enhanced fields:

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
```

This will add the new columns:
- `course_type`
- `question_type`
- `blooms_taxonomy`
- `image_url`
- Convert `text` field to TEXT type for longer markdown content

## Benefits

1. **Comprehensive Metadata**: All required fields from the problem statement are supported
2. **Educational Taxonomy**: Bloom's taxonomy helps categorize cognitive levels
3. **Flexible Formatting**: Markdown support makes questions more readable
4. **Visual Support**: Optional images enhance understanding
5. **Filtering Ready**: Keywords and tags enable AI-powered filtering
6. **UCSB-Specific**: Course tags map to actual UCSB courses
7. **Type Safety**: Question types are predefined and validated

## Example Questions

### Multiple Choice Question
```
Course: CS24
Course Type: intro CS
Question Type: mcq
Bloom's Taxonomy: Understanding
Keywords: linked-list, data-structure, pointer
Tags: midterm, important

Text:
## What is a linked list?

A linked list is a **linear data structure** where elements are stored in nodes.

Properties:
- Dynamic size
- Easy insertion/deletion
- Sequential access

Choices:
- A contiguous block of memory
- A sequence of nodes with pointers ✓
- An array of integers
- A hash table
```

### Free Response Question
```
Course: MATH 3A
Course Type: linear algebra
Question Type: fr
Bloom's Taxonomy: Applying
Keywords: matrix, multiplication, linear-algebra
Tags: homework, chapter-2

Text:
## Matrix Multiplication

Given matrices:
- A is 2×3
- B is 3×4

What are the dimensions of AB?

Explain your reasoning.
```

## Future Enhancements

Potential additions:
- AI-powered keyword extraction from question text
- Automatic Bloom's taxonomy level suggestion
- Image upload (not just URLs)
- LaTeX/MathJax support for mathematical notation
- Question difficulty rating
- Time estimates for answering
- Related questions linking
