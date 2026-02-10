import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import QuestionTable from '../components/QuestionTable';
import { getUserById } from '../api';
import { createAssignment, getAssignment, updateAssignment, getAllQuestions } from '../api';


export default function CreateEditAssignment() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [allQuestions, setAllQuestions] = useState([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [userInfoCache, setUserInfoCache] = useState({});
  const [showQuestionPicker, setShowQuestionPicker] = useState(false);



  const [formData, setFormData] = useState({
    title: '',
    type: 'Homework',
    description: '',
    release_date: '',
    due_date_soft: '',
    due_date_hard: '',
    late_policy_id: '',
    assignment_questions: []
  });

  // Get course ID and optional assignment ID from URL hash (e.g., #course/123/assignment/new or #course/123/assignment/456/edit)
  const parseHash = () => {
    const hash = window.location.hash;
    const courseMatch = hash.match(/#course\/(\d+)/);
    const assignmentMatch = hash.match(/\/assignment\/(\d+)/);
    const isNew = hash.includes('/assignment/new');
    const isEdit = hash.includes('/edit');

    return {
      courseId: courseMatch ? parseInt(courseMatch[1]) : null,
      assignmentId: assignmentMatch ? parseInt(assignmentMatch[1]) : null,
      isNew,
      isEdit
    };
  };

  const { courseId, assignmentId, isNew, isEdit } = parseHash();

  // Load data on mount
  useEffect(() => {
    async function loadData() {
      if (!courseId) {
        setError('No course ID specified');
        setLoading(false);
        return;
      }

      try {
        // Load all questions for selection
        const questionsData = await getAllQuestions();
        setAllQuestions(questionsData.questions || []);

        const qs = questionsData.questions || [];
        const uniqueUserIds = [...new Set(qs.map(q => q.user_id).filter(Boolean))];

        const userPromises = uniqueUserIds.map(async (uid) => {
          try {
            const info = await getUserById(uid);
            return [uid, info];
          } catch {
            return [uid, null];
          }
        });

        const entries = await Promise.all(userPromises);
        const map = {};
        for (const [uid, info] of entries) {
          if (info) map[uid] = info;
        }
        setUserInfoCache(map);


        // If editing, load assignment data
        if (assignmentId && !isNew) {
          setIsEditMode(true);
          const assignmentData = await getAssignment(assignmentId);

          // Format dates for datetime-local input
          const formatDateForInput = (dateStr) => {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            return date.toISOString().slice(0, 16);
          };

          setFormData({
            title: assignmentData.title || '',
            type: assignmentData.type || 'Homework',
            description: assignmentData.description || '',
            release_date: formatDateForInput(assignmentData.release_date),
            due_date_soft: formatDateForInput(assignmentData.due_date_soft),
            due_date_hard: formatDateForInput(assignmentData.due_date_hard),
            late_policy_id: assignmentData.late_policy_id || '',
            assignment_questions: assignmentData.assignment_questions || []
          });
        }
      } catch (err) {
        setError(err.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [courseId, assignmentId, isNew]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      // Format dates to ISO strings or null
      const formatDateForSubmit = (dateStr) => {
        if (!dateStr) return null;
        return new Date(dateStr).toISOString();
      };

      const submitData = {
        course_id: courseId,
        title: formData.title.trim(),
        type: formData.type,
        description: formData.description,
        release_date: formatDateForSubmit(formData.release_date),
        due_date_soft: formatDateForSubmit(formData.due_date_soft),
        due_date_hard: formatDateForSubmit(formData.due_date_hard),
        late_policy_id: formData.late_policy_id || null,
        assignment_questions: formData.assignment_questions
      };

      let savedAssignmentId = assignmentId;
      if (isEditMode) {
        const result = await updateAssignment(assignmentId, submitData);
        savedAssignmentId = result?.id || assignmentId;
      } else {
        const result = await createAssignment(submitData);
        savedAssignmentId = result?.id;
      }

      setSaving(false);

      // Navigate to assignment view page
      if (savedAssignmentId) {
        window.location.hash = `#course/${courseId}/assignment/${savedAssignmentId}/view`;
      } else {
        window.location.hash = `#course/${courseId}`;
      }
    } catch (err) {
      setError(err.message || 'Failed to save assignment');
      setSaving(false);
    }
  };

  // Toggle question selection
  const toggleQuestion = (questionId) => {
    setFormData(prev => ({
      ...prev,
      assignment_questions: prev.assignment_questions.includes(questionId)
        ? prev.assignment_questions.filter(id => id !== questionId)
        : [...prev.assignment_questions, questionId]
    }));
  };

  const styles = {
    container: {
      maxWidth: '900px',
      margin: '0 auto',
      padding: '2rem'
    },
    backLink: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.5rem',
      color: '#4f46e5',
      textDecoration: 'none',
      fontSize: '0.875rem',
      fontWeight: '500',
      marginBottom: '1.5rem',
      cursor: 'pointer'
    },
    title: {
      margin: '0 0 2rem 0',
      fontSize: '2rem',
      fontWeight: '700',
      color: '#111827'
    },
    form: {
      background: 'white',
      borderRadius: '12px',
      padding: '2rem',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      border: '1px solid #e5e7eb'
    },
    formGroup: {
      marginBottom: '1.5rem'
    },
    label: {
      display: 'block',
      marginBottom: '0.5rem',
      fontWeight: '600',
      color: '#374151',
      fontSize: '0.875rem'
    },
    input: {
      width: '100%',
      padding: '0.75rem',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      fontSize: '1rem',
      boxSizing: 'border-box'
    },
    textarea: {
      width: '100%',
      padding: '0.75rem',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      fontSize: '1rem',
      minHeight: '100px',
      boxSizing: 'border-box',
      fontFamily: 'inherit'
    },
    select: {
      width: '100%',
      padding: '0.75rem',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      fontSize: '1rem',
      boxSizing: 'border-box'
    },
    buttonGroup: {
      display: 'flex',
      gap: '0.75rem',
      marginTop: '2rem'
    },
    submitBtn: {
      padding: '0.75rem 1.5rem',
      background: '#4f46e5',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '600'
    },
    cancelBtn: {
      padding: '0.75rem 1.5rem',
      background: '#f3f4f6',
      color: '#374151',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '600'
    },
    error: {
      background: '#fef2f2',
      color: '#dc2626',
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      marginBottom: '1rem'
    },
    helpText: {
      fontSize: '0.75rem',
      color: '#6b7280',
      marginTop: '0.25rem'
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <p style={{ textAlign: 'center', color: '#6b7280' }}>Loading...</p>
      </div>
    );
  }

  if (!courseId) {
    return (
      <div style={styles.container}>
        <a href="#courses" style={styles.backLink}>← Back to Courses</a>
        <div style={styles.error}>No course ID specified</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <a href={`#course/${courseId}`} style={styles.backLink}>← Back to Course</a>

      <h1 style={styles.title}>{isEditMode ? 'Edit Assignment' : 'Create Assignment'}</h1>

      {error && <div style={styles.error}>{error}</div>}

      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Title */}
        <div style={styles.formGroup}>
          <label style={styles.label}>
            Title <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            style={styles.input}
            placeholder="e.g., Homework 1: Linked Lists"
            required
          />
        </div>

        {/* Type */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Type</label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            style={styles.select}
          >
            <option value="Homework">Homework</option>
            <option value="Quiz">Quiz</option>
            <option value="Lab">Lab</option>
            <option value="Exam">Exam</option>
            <option value="Reading">Reading</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {/* Description */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            style={styles.textarea}
            placeholder="Describe the assignment..."
          />
        </div>

        {/* Release Date */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Release Date</label>
          <input
            type="datetime-local"
            value={formData.release_date}
            onChange={(e) => setFormData({ ...formData, release_date: e.target.value })}
            style={styles.input}
          />
          <div style={styles.helpText}>When students can see this assignment</div>
        </div>

        {/* Due Date (Soft) */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Due Date (Target)</label>
          <input
            type="datetime-local"
            value={formData.due_date_soft}
            onChange={(e) => setFormData({ ...formData, due_date_soft: e.target.value })}
            style={styles.input}
          />
          <div style={styles.helpText}>Target due date; no points deducted</div>
        </div>

        {/* Due Date (Hard) */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Due Date (Final)</label>
          <input
            type="datetime-local"
            value={formData.due_date_hard}
            onChange={(e) => setFormData({ ...formData, due_date_hard: e.target.value })}
            style={styles.input}
          />
          <div style={styles.helpText}>Final cut-off for submission</div>
        </div>

        {/* Late Policy */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Late Policy</label>
          <input
            type="text"
            value={formData.late_policy_id}
            onChange={(e) => setFormData({ ...formData, late_policy_id: e.target.value })}
            style={styles.input}
            placeholder="e.g., Linear_Decay_10_Percent"
          />
          <div style={styles.helpText}>Reference to a policy template (optional)</div>
        </div>

        {/* Questions */}
        <div style={styles.formGroup}>
          <label style={styles.label}>
            Questions ({formData.assignment_questions.length} selected)
          </label>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

            {/* Select Questions Button */}
            <button
              type="button"
              onClick={() => setShowQuestionPicker(true)}
              style={{
                padding: '0.5rem 1rem',
                background: '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Add / Edit Questions
            </button>
          </div>

        </div>

        {/* Buttons */}
        <div style={styles.buttonGroup}>
          <button
            type="submit"
            style={styles.submitBtn}
            disabled={saving}
          >
            {saving ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Create Assignment')}
          </button>
          <button
            type="button"
            style={styles.cancelBtn}
            onClick={() => window.location.hash = `#course/${courseId}`}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </form>

      {showQuestionPicker && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 1000,
            display: 'flex'
          }}
        >
          <div
            style={{
              background: 'white',
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '1rem 1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              
              {/*Select Questions title and show # selected*/}
              <h2
                style={{
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                Select Questions
                {formData.assignment_questions.length > 0 && (
                  <span
                    style={{
                      fontSize: '0.9rem',
                      fontWeight: 500,
                      color: '#6b7280',
                    }}
                  >
                    ({formData.assignment_questions.length} selected)
                  </span>
                )}
              </h2>

              <button
                onClick={() => setShowQuestionPicker(false)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Done
              </button>
            </div>

            {/* Table area */}
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                padding: '1rem'
              }}
            >
              <QuestionTable
                questions={allQuestions}
                userInfoCache={userInfoCache}
                user={user}

                selectable
                selectedQuestionIds={formData.assignment_questions}
                onToggleQuestion={toggleQuestion}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
