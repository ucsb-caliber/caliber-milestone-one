# Assignment CRUD Feature Testing Guide

## Overview
This document provides instructions for testing the assignment creation, editing, and deletion features that have been implemented.

## Backend Changes

### Database Schema
The `assignment` table has been updated with the following fields:
- `id` (INTEGER) - Primary key
- `node_id` (VARCHAR, nullable) - Foreign key to Course Tree Node
- `instructor_email` (VARCHAR) - Email of instructor who created assignment
- `instructor_id` (VARCHAR) - ID of instructor user who created assignment
- `course` (VARCHAR) - Course name
- `course_id` (INTEGER) - Foreign key to course table
- `title` (VARCHAR) - Assignment title
- `type` (VARCHAR) - Assignment type (Homework, Quiz, Lab, Exam, Reading, Other)
- `description` (VARCHAR) - Assignment description
- `release_date` (DATETIME, nullable) - Visibility trigger for student portal
- `due_date` (DATETIME, nullable) - Legacy field
- `due_date_soft` (DATETIME, nullable) - Target due date; no points deducted
- `due_date_hard` (DATETIME, nullable) - Final cut-off for Autograder
- `late_policy_id` (VARCHAR, nullable) - Reference to policy template
- `assignment_questions` (TEXT) - JSON array of question IDs
- `created_at` (DATETIME) - Creation timestamp
- `updated_at` (DATETIME) - Last update timestamp

### API Endpoints

#### Create Assignment
- **Endpoint**: `POST /api/assignments`
- **Authentication**: Required (must be course instructor)
- **Request Body**:
```json
{
  "course_id": 1,
  "title": "Homework 1: Data Structures",
  "type": "Homework",
  "description": "Practice problems on linked lists and trees",
  "release_date": "2026-02-10T00:00:00",
  "due_date_soft": "2026-02-17T23:59:00",
  "due_date_hard": "2026-02-20T23:59:00",
  "late_policy_id": "Linear_Decay_10_Percent",
  "assignment_questions": [1, 2, 3]
}
```

#### Get Assignment
- **Endpoint**: `GET /api/assignments/{assignment_id}`
- **Authentication**: Required (instructor or enrolled student)
- **Response**: Assignment object with all fields

#### Update Assignment
- **Endpoint**: `PUT /api/assignments/{assignment_id}`
- **Authentication**: Required (must be course instructor)
- **Request Body**: Same as create, all fields optional

#### Delete Assignment
- **Endpoint**: `DELETE /api/assignments/{assignment_id}`
- **Authentication**: Required (must be course instructor)
- **Response**: 204 No Content on success

## Frontend Changes

### New Component: CreateEditAssignment
- **Location**: `frontend/src/pages/CreateEditAssignment.jsx`
- **Route**: `#course/{courseId}/assignment/new` (create) or `#course/{courseId}/assignment/{assignmentId}` (edit)
- **Features**:
  - Form with all assignment fields
  - Question selection from question bank
  - Date/time pickers for release and due dates
  - Type dropdown (Homework, Quiz, Lab, Exam, Reading, Other)
  - Validation for required fields

### Updated Component: CourseDashboard
- **Location**: `frontend/src/pages/CourseDashboard.jsx`
- **Changes**:
  - Displays list of assignments for the course
  - "Create Assignment" button for instructors
  - Clickable assignment cards that navigate to edit page
  - Shows assignment type, due date, and question count

## Testing Procedures

### 1. Backend API Testing

#### Using the API Documentation (Swagger UI)
1. Start the backend server:
   ```bash
   cd backend
   python -m uvicorn app.main:app --reload
   ```
2. Navigate to `http://localhost:8000/docs`
3. Test each endpoint:
   - Create a course first (POST /api/courses)
   - Create an assignment (POST /api/assignments)
   - Get the assignment (GET /api/assignments/{id})
   - Update the assignment (PUT /api/assignments/{id})
   - Delete the assignment (DELETE /api/assignments/{id})

#### Using curl
```bash
# Set auth token (replace with actual token)
TOKEN="your-jwt-token-here"

# Create assignment
curl -X POST http://localhost:8000/api/assignments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "course_id": 1,
    "title": "Test Assignment",
    "type": "Homework",
    "description": "Test description",
    "assignment_questions": [1, 2]
  }'

# Get assignment
curl -X GET http://localhost:8000/api/assignments/1 \
  -H "Authorization: Bearer $TOKEN"

# Update assignment
curl -X PUT http://localhost:8000/api/assignments/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Assignment Title"
  }'

# Delete assignment
curl -X DELETE http://localhost:8000/api/assignments/1 \
  -H "Authorization: Bearer $TOKEN"
```

### 2. Frontend Integration Testing

#### Prerequisites
1. Start the backend server:
   ```bash
   cd backend
   python -m uvicorn app.main:app --reload
   ```
2. Start the frontend dev server:
   ```bash
   cd frontend
   npm run dev
   ```
3. Navigate to `http://localhost:5173`

#### Test Flow
1. **Login as Instructor**
   - Sign up or log in with a user account
   - Complete onboarding and select "I am a teacher/instructor"

2. **Create a Course**
   - Navigate to "Courses" from the navigation bar
   - Click "Create New Course"
   - Fill in course details and add students
   - Click "Create Course"

3. **Navigate to Course Dashboard**
   - Click on the course you just created
   - Verify you see the course details and an empty assignments section

4. **Create an Assignment**
   - Click "+ Create Assignment" button in the Assignments section
   - Fill in the assignment form:
     - Title: "Homework 1: Linked Lists"
     - Type: Select "Homework"
     - Description: "Practice problems on linked lists"
     - Set release date, soft due date, and hard due date
     - Select questions from the question bank (if available)
   - Click "Create Assignment"
   - Verify you're redirected back to the course dashboard
   - Verify the assignment appears in the assignments list

5. **Edit an Assignment**
   - Click on an assignment card in the course dashboard
   - Modify any fields (e.g., change title or due date)
   - Click "Save Changes"
   - Verify you're redirected back to the course dashboard
   - Verify the changes are reflected in the assignments list

6. **View Assignment Details**
   - Click on an assignment card
   - Verify all fields display correctly:
     - Title
     - Type badge
     - Description
     - Due dates
     - Selected questions

7. **Delete an Assignment** (if delete button is added in the future)
   - Navigate to assignment edit page
   - Click delete button
   - Confirm deletion
   - Verify assignment is removed from the list

### 3. Validation Testing

Test that the following validations work:

1. **Required Fields**
   - Try to create an assignment without a title → Should show error
   - Try to submit with empty required fields → Should prevent submission

2. **Permission Checks**
   - Login as a student
   - Try to access create assignment page → Should be restricted
   - Try to create assignment via API → Should return 403 Forbidden

3. **Data Integrity**
   - Create assignment with questions
   - Verify question IDs are stored correctly
   - Verify dates are stored and displayed in correct format
   - Verify assignment type is stored correctly

### 4. Edge Cases

Test the following edge cases:

1. **Empty Question List**
   - Create assignment without selecting any questions
   - Should save successfully with empty array

2. **Optional Fields**
   - Create assignment with only required fields (title, course_id)
   - All optional fields should be null/empty

3. **Date Ordering**
   - Set due_date_hard before due_date_soft
   - Application should handle this (no validation currently enforced)

4. **Large Number of Questions**
   - Select many questions (10+)
   - Should save and display correctly

## Known Issues and Limitations

1. **No Delete Button on Edit Page**: Currently, deletion must be done via API directly
2. **No Validation for Date Order**: System doesn't enforce that hard deadline comes after soft deadline
3. **No Assignment Preview for Students**: Student view not yet implemented
4. **No Reordering of Questions**: Questions are stored as simple list, no ordering UI

## Success Criteria

✅ Backend endpoints created and working
✅ Database schema updated with all required fields
✅ Frontend component created for create/edit
✅ Course dashboard displays assignments
✅ Assignment creation flow works end-to-end
✅ Assignment editing flow works end-to-end
✅ Question selection from question bank works
✅ Permission checks in place (instructor only)
✅ Code builds successfully without errors

## Next Steps

1. Add delete button to the edit assignment page
2. Implement student view of assignments
3. Add validation for date ordering
4. Add ability to reorder questions in assignment
5. Add assignment preview/view mode
6. Add assignment submission functionality (future milestone)
7. Implement late policy calculation (future milestone)
