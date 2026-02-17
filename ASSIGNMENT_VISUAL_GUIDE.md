# Assignment Feature - Visual Guide

## User Flow Diagrams

### Flow 1: Creating a New Assignment

```
┌─────────────────────────────────────────────────────┐
│            Course Dashboard                         │
│  ┌──────────────────────────────────────────────┐  │
│  │ 📚 Course Information                        │  │
│  │ Instructor: John Doe                         │  │
│  │ Students: 25 enrolled                        │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ 📝 Assignments (0)     [+ Create Assignment] │  │
│  │                                              │  │
│  │  ┌────────────────────────────────────────┐ │  │
│  │  │ No Assignments Yet                     │ │  │
│  │  │ Create your first assignment to        │ │  │
│  │  │ get started.                           │ │  │
│  │  └────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                        │
                        │ Click [+ Create Assignment]
                        ▼
┌─────────────────────────────────────────────────────┐
│          Create Assignment                          │
│  ┌──────────────────────────────────────────────┐  │
│  │ Title *                                      │  │
│  │ ┌──────────────────────────────────────────┐│  │
│  │ │ Homework 1: Linked Lists                 ││  │
│  │ └──────────────────────────────────────────┘│  │
│  │                                              │  │
│  │ Type                                         │  │
│  │ ┌──────────────────────────────────────────┐│  │
│  │ │ [Homework ▼]                             ││  │
│  │ └──────────────────────────────────────────┘│  │
│  │                                              │  │
│  │ Description                                  │  │
│  │ ┌──────────────────────────────────────────┐│  │
│  │ │ Practice problems on linked lists and    ││  │
│  │ │ their traversal algorithms              ││  │
│  │ └──────────────────────────────────────────┘│  │
│  │                                              │  │
│  │ Release Date                                 │  │
│  │ ┌──────────────────────────────────────────┐│  │
│  │ │ 02/10/2026 12:00 AM                      ││  │
│  │ └──────────────────────────────────────────┘│  │
│  │                                              │  │
│  │ Due Date (Target)                            │  │
│  │ ┌──────────────────────────────────────────┐│  │
│  │ │ 02/17/2026 11:59 PM                      ││  │
│  │ └──────────────────────────────────────────┘│  │
│  │                                              │  │
│  │ Due Date (Final)                             │  │
│  │ ┌──────────────────────────────────────────┐│  │
│  │ │ 02/20/2026 11:59 PM                      ││  │
│  │ └──────────────────────────────────────────┘│  │
│  │                                              │  │
│  │ Questions (2 selected)                       │  │
│  │ ┌──────────────────────────────────────────┐│  │
│  │ │☑ Question 1: Reverse a Linked List      ││  │
│  │ │☑ Question 2: Detect Cycle in List       ││  │
│  │ │☐ Question 3: Merge Two Sorted Lists     ││  │
│  │ └──────────────────────────────────────────┘│  │
│  │                                              │  │
│  │  [Create Assignment]  [Cancel]               │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                        │
                        │ Click [Create Assignment]
                        ▼
┌─────────────────────────────────────────────────────┐
│            Course Dashboard                         │
│  ┌──────────────────────────────────────────────┐  │
│  │ 📝 Assignments (1)     [+ Create Assignment] │  │
│  │                                              │  │
│  │  ┌────────────────────────────────────────┐ │  │
│  │  │ Homework 1: Linked Lists    [Homework] │ │  │
│  │  │ Practice problems on linked lists and  │ │  │
│  │  │ their traversal algorithms             │ │  │
│  │  │ Due: Feb 17, 2026, 11:59 PM           │ │  │
│  │  │ Questions: 2                           │ │  │
│  │  │                                    ›   │ │  │
│  │  └────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Flow 2: Editing an Existing Assignment

```
┌─────────────────────────────────────────────────────┐
│            Course Dashboard                         │
│  ┌──────────────────────────────────────────────┐  │
│  │ 📝 Assignments (1)     [+ Create Assignment] │  │
│  │                                              │  │
│  │  ┌────────────────────────────────────────┐ │  │
│  │  │ Homework 1: Linked Lists    [Homework] │ │  │
│  │  │ Practice problems...                   │ │  │
│  │  │                                    ›   │ │  │ ← Click here
│  │  └────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│          Edit Assignment                            │
│  ┌──────────────────────────────────────────────┐  │
│  │ Title *                                      │  │
│  │ ┌──────────────────────────────────────────┐│  │
│  │ │ Homework 1: Linked Lists & Trees         ││  │
│  │ └──────────────────────────────────────────┘│  │
│  │                     ↑                        │  │
│  │           (title updated)                    │  │
│  │                                              │  │
│  │ Questions (3 selected)                       │  │
│  │ ┌──────────────────────────────────────────┐│  │
│  │ │☑ Question 1: Reverse a Linked List      ││  │
│  │ │☑ Question 2: Detect Cycle in List       ││  │
│  │ │☑ Question 3: Merge Two Sorted Lists     ││  │
│  │ └──────────────────────────────────────────┘│  │
│  │                     ↑                        │  │
│  │           (added one more question)          │  │
│  │                                              │  │
│  │  [Save Changes]  [Cancel]                    │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Component Structure

### CreateEditAssignment Component

```
CreateEditAssignment
├── Header
│   ├── Back Link (← Back to Course)
│   └── Title (Create/Edit Assignment)
│
├── Error Display (if any)
│
└── Form
    ├── Title Field (required)
    ├── Type Dropdown
    │   ├── Homework
    │   ├── Quiz
    │   ├── Lab
    │   ├── Exam
    │   ├── Reading
    │   └── Other
    │
    ├── Description Textarea
    │
    ├── Date Fields
    │   ├── Release Date (datetime-local)
    │   ├── Due Date (Target) (datetime-local)
    │   └── Due Date (Final) (datetime-local)
    │
    ├── Late Policy Field
    │
    ├── Question Selection
    │   └── Scrollable List
    │       ├── ☐ Question 1
    │       ├── ☑ Question 2 (selected)
    │       └── ☐ Question 3
    │
    └── Action Buttons
        ├── Save/Create Button
        └── Cancel Button
```

### CourseDashboard - Assignments Section

```
Assignments Section
├── Header Row
│   ├── Section Title (📝 Assignments)
│   ├── Count Badge ((2))
│   └── Create Button (+ Create Assignment) [instructor only]
│
└── Assignment List
    ├── Assignment Card 1
    │   ├── Title Row
    │   │   ├── Title Text
    │   │   ├── Type Badge [Homework]
    │   │   └── Arrow Icon (›)
    │   │
    │   ├── Description
    │   └── Metadata
    │       ├── Due: Feb 17, 2026
    │       └── Questions: 2
    │
    └── Assignment Card 2
        └── (similar structure)
```

## API Request/Response Examples

### Creating an Assignment

**Request:**
```http
POST /api/assignments
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "course_id": 1,
  "title": "Homework 1: Linked Lists",
  "type": "Homework",
  "description": "Practice problems on linked lists",
  "release_date": "2026-02-10T00:00:00",
  "due_date_soft": "2026-02-17T23:59:00",
  "due_date_hard": "2026-02-20T23:59:00",
  "late_policy_id": "Linear_Decay_10_Percent",
  "assignment_questions": [1, 2]
}
```

**Response (201 Created):**
```json
{
  "id": 1,
  "node_id": null,
  "instructor_email": "instructor@example.com",
  "instructor_id": "abc-123",
  "course": "CS 101",
  "course_id": 1,
  "title": "Homework 1: Linked Lists",
  "type": "Homework",
  "description": "Practice problems on linked lists",
  "release_date": "2026-02-10T00:00:00",
  "due_date": null,
  "due_date_soft": "2026-02-17T23:59:00",
  "due_date_hard": "2026-02-20T23:59:00",
  "late_policy_id": "Linear_Decay_10_Percent",
  "assignment_questions": [1, 2],
  "created_at": "2026-02-05T09:00:00",
  "updated_at": "2026-02-05T09:00:00"
}
```

## State Management

### Component State Flow

```
Initial Load (Edit Mode)
    │
    ├── Fetch Assignment Data
    │   └── GET /api/assignments/{id}
    │
    ├── Fetch All Questions
    │   └── GET /api/questions/all
    │
    └── Populate Form
        └── formData state updated

User Edits Form
    │
    └── Update formData state
        (controlled components)

Submit Form
    │
    ├── Validate Data
    │
    ├── Format Dates (ISO strings)
    │
    ├── Create Mode?
    │   ├── Yes → POST /api/assignments
    │   └── No → PUT /api/assignments/{id}
    │
    ├── Success?
    │   ├── Yes → Navigate to Course Dashboard
    │   └── No → Show Error Message
    │
    └── Update assignments list in Course Dashboard
        (automatic via course data reload)
```

## Data Flow

```
Backend Database
    ↕
FastAPI Endpoints
    ↕
Frontend API Functions (api.js)
    ↕
React Components
    ↕
User Interface
```

### Create Flow
```
User clicks [+ Create Assignment]
    ↓
Navigate to #course/1/assignment/new
    ↓
CreateEditAssignment component loads
    ↓
User fills form and selects questions
    ↓
User clicks [Create Assignment]
    ↓
createAssignment() API call
    ↓
POST /api/assignments
    ↓
Backend creates assignment in DB
    ↓
Returns AssignmentResponse
    ↓
Frontend navigates to #course/1
    ↓
CourseDashboard reloads course data
    ↓
New assignment appears in list
```

### Edit Flow
```
User clicks assignment card
    ↓
Navigate to #course/1/assignment/123
    ↓
CreateEditAssignment component loads
    ↓
getAssignment(123) API call
    ↓
GET /api/assignments/123
    ↓
Form populated with assignment data
    ↓
User modifies fields
    ↓
User clicks [Save Changes]
    ↓
updateAssignment(123, data) API call
    ↓
PUT /api/assignments/123
    ↓
Backend updates assignment in DB
    ↓
Returns updated AssignmentResponse
    ↓
Frontend navigates to #course/1
    ↓
CourseDashboard shows updated assignment
```

## Permission Matrix

| Action | Instructor (Course Owner) | Instructor (Other) | Student (Enrolled) | Student (Not Enrolled) |
|--------|---------------------------|--------------------|--------------------|------------------------|
| View Assignment | ✅ Yes | ❌ No | ✅ Yes | ❌ No |
| Create Assignment | ✅ Yes | ❌ No | ❌ No | ❌ No |
| Edit Assignment | ✅ Yes | ❌ No | ❌ No | ❌ No |
| Delete Assignment | ✅ Yes | ❌ No | ❌ No | ❌ No |

## Edge Cases Handled

1. **No Questions in Database**
   - Shows message: "No questions available. Create questions first from the Question Bank."
   - Allows creating assignment with empty questions array

2. **Missing Optional Fields**
   - All date fields are optional
   - Late policy is optional
   - Description defaults to empty string

3. **Navigation from Edit Page**
   - Cancel button returns to course dashboard
   - Back link in header returns to course dashboard
   - After save, automatically redirects

4. **Invalid Course ID**
   - Shows error message
   - Provides back link to courses page

5. **Permission Denied**
   - Backend returns 403 Forbidden
   - Frontend shows error message
   - User cannot access create/edit pages

This visual guide demonstrates the complete user experience and technical implementation of the assignment CRUD feature.
