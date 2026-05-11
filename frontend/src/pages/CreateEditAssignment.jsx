import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import QuestionTable from '../components/QuestionTable';
import QuestionSearchBar from '../components/QuestionSearchBar';
import { getUserById } from '../api';
import { createAssignment, getAssignment, updateAssignment, getAllQuestions } from '../api';
import { filterQuestionsBySearch } from '../utils/questionSearch';
import { parseScheduleDate } from '../utils/datetime';
import { CourseDashboardBackButton, CourseDashboardSpinnerState, dashboardPalette } from '../components/CourseDashboardUI';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { buildHashWithFrom, navigateBackWithFallback } from '../utils/navigation';

function formatDateForDateTimeLocal(dateStr) {
  const date = parseScheduleDate(dateStr);
  if (!date) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function CreateEditAssignment() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [allQuestions, setAllQuestions] = useState([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [userInfoCache, setUserInfoCache] = useState({});
  const [showQuestionPicker, setShowQuestionPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState('all');

  useBodyScrollLock(showQuestionPicker);



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
    const params = new URLSearchParams(hash.split('?')[1] || '');

    return {
      courseId: courseMatch ? parseInt(courseMatch[1]) : null,
      assignmentId: assignmentMatch ? parseInt(assignmentMatch[1]) : null,
      isNew,
      isEdit,
      fromHash: params.get('from') || '',
    };
  };

  const { courseId, assignmentId, isNew, isEdit, fromHash } = parseHash();
  const currentHash = window.location.hash;
  const fallbackBackHash = (isEdit || isEditMode) && assignmentId
    ? `#course/${courseId}/assignment/${assignmentId}/view`
    : `#course/${courseId}`;
  const handleBack = () => {
    navigateBackWithFallback(fallbackBackHash, fromHash);
  };

  const fetchAllQuestionsForPicker = async () => {
    const pageSize = 200;
    let skip = 0;
    let total = null;
    const collected = [];

    while (total === null || collected.length < total) {
      const page = await getAllQuestions({ skip, limit: pageSize });
      const pageQuestions = page?.questions || [];
      total = Number(page?.total ?? pageQuestions.length);
      if (!pageQuestions.length) break;
      collected.push(...pageQuestions);
      skip += pageSize;
      if (pageQuestions.length < pageSize) break;
    }

    return collected;
  };

  const prioritizeQuestionsForPicker = (questions) => {
    const currentUserId = user?.id;
    const toEpoch = (value) => {
      const date = value ? new Date(value) : null;
      const time = date?.getTime?.();
      return Number.isFinite(time) ? time : 0;
    };

    return [...questions].sort((a, b) => {
      const aMine = currentUserId && a.user_id === currentUserId ? 0 : 1;
      const bMine = currentUserId && b.user_id === currentUserId ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
      return toEpoch(b.created_at) - toEpoch(a.created_at);
    });
  };

  // Load data on mount
  useEffect(() => {
    async function loadData() {
      if (!courseId) {
        setError('No course ID specified');
        setLoading(false);
        return;
      }

      try {
        // Load all questions for selection (paginated fetch, not just first page)
        const qs = await fetchAllQuestionsForPicker();
        setAllQuestions(prioritizeQuestionsForPicker(qs));

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

          setFormData({
            title: assignmentData.title || '',
            type: assignmentData.type || 'Homework',
            description: assignmentData.description || '',
            release_date: formatDateForDateTimeLocal(assignmentData.release_date),
            due_date_soft: formatDateForDateTimeLocal(assignmentData.due_date_soft),
            due_date_hard: formatDateForDateTimeLocal(assignmentData.due_date_hard),
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
  }, [courseId, assignmentId, isNew, user?.id]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }
    if (!formData.release_date) {
      setError('Release date is required');
      return;
    }
    if (!formData.due_date_soft) {
      setError('Due date is required');
      return;
    }
    if (!formData.due_date_hard) {
      setError('Due date (late) is required');
      return;
    }
    if (!formData.late_policy_id) {
      setError('Late policy percentage is required');
      return;
    }
    if (!formData.assignment_questions || formData.assignment_questions.length < 1) {
      setError('At least one question is required');
      return;
    }
    if (new Date(formData.due_date_hard) < new Date(formData.due_date_soft)) {
      setError('Due date (late) must be on or after due date');
      return;
    }

    setSaving(true);
    setError('');

    try {
      // Format dates to ISO strings or null
      const formatDateForSubmit = (dateStr) => {
        if (!dateStr) return null;
        return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateStr)
          ? `${dateStr}:00`
          : dateStr;
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
        window.location.hash = buildHashWithFrom(`#course/${courseId}/assignment/${savedAssignmentId}/view`, currentHash);
        if (isEditMode) {
          window.location.reload();
        }
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

  const filteredQuestions = filterQuestionsBySearch(allQuestions, searchQuery, searchFilter);

  const styles = {
    container: {
      maxWidth: '960px',
      margin: '0 auto',
      padding: '24px'
    },
    backLink: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      color: dashboardPalette.navy,
      textDecoration: 'none',
      fontSize: '0.875rem',
      fontWeight: '600',
      marginBottom: '16px',
      cursor: 'pointer'
    },
    title: {
      margin: '0 0 24px 0',
      fontSize: '1.75rem',
      fontWeight: '700',
      color: dashboardPalette.navy
    },
    form: {
      background: dashboardPalette.white,
      borderRadius: '8px',
      padding: '24px',
      border: `1px solid ${dashboardPalette.border}`
    },
    formGroup: {
      marginBottom: '16px'
    },
    label: {
      display: 'block',
      marginBottom: '8px',
      fontWeight: '600',
      color: dashboardPalette.text,
      fontSize: '0.875rem'
    },
    input: {
      width: '100%',
      padding: '0 12px',
      height: '40px',
      border: `1px solid ${dashboardPalette.border}`,
      borderRadius: '8px',
      fontSize: '0.95rem',
      color: dashboardPalette.text,
      background: dashboardPalette.white,
      boxSizing: 'border-box'
    },
    textarea: {
      width: '100%',
      padding: '12px',
      border: `1px solid ${dashboardPalette.border}`,
      borderRadius: '8px',
      fontSize: '0.95rem',
      minHeight: '100px',
      boxSizing: 'border-box',
      fontFamily: 'inherit',
      color: dashboardPalette.text,
      background: dashboardPalette.white
    },
    select: {
      width: '100%',
      padding: '0 12px',
      height: '40px',
      border: `1px solid ${dashboardPalette.border}`,
      borderRadius: '8px',
      fontSize: '0.95rem',
      color: dashboardPalette.text,
      background: dashboardPalette.white,
      boxSizing: 'border-box'
    },
    buttonGroup: {
      display: 'flex',
      gap: '12px',
      marginTop: '24px'
    },
    submitBtn: {
      height: '40px',
      padding: '0 14px',
      background: dashboardPalette.navy,
      color: dashboardPalette.white,
      border: `1px solid ${dashboardPalette.navy}`,
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '600'
    },
    cancelBtn: {
      height: '40px',
      padding: '0 14px',
      background: dashboardPalette.white,
      color: dashboardPalette.text,
      border: `1px solid ${dashboardPalette.border}`,
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '600'
    },
    error: {
      background: dashboardPalette.dangerBg,
      color: dashboardPalette.dangerText,
      padding: '12px 14px',
      borderRadius: '8px',
      marginBottom: '16px',
      border: `1px solid ${dashboardPalette.dangerBorder}`
    },
    helpText: {
      fontSize: '0.75rem',
      color: dashboardPalette.muted,
      marginTop: '6px'
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <CourseDashboardBackButton onClick={handleBack} style={{ marginBottom: '16px' }}>
          Back
        </CourseDashboardBackButton>
        <CourseDashboardSpinnerState style={{ padding: '24px 0' }} />
      </div>
    );
  }

  if (!courseId) {
    return (
      <div style={styles.container}>
        <CourseDashboardBackButton onClick={() => navigateBackWithFallback('#courses', fromHash)} style={{ marginBottom: '16px' }}>
          Back
        </CourseDashboardBackButton>
        <div style={styles.error}>No course ID specified</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <CourseDashboardBackButton onClick={handleBack} style={{ marginBottom: '16px' }}>
        Back
      </CourseDashboardBackButton>

      <h1 style={styles.title}>{isEditMode ? 'Edit Assignment' : 'Create Assignment'}</h1>

      {error && <div style={styles.error}>{error}</div>}

      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Title */}
        <div style={styles.formGroup}>
          <label style={styles.label}>
            Title <span style={{ color: dashboardPalette.dangerText }}>*</span>
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
          <label style={styles.label}>
            Release Date <span style={{ color: dashboardPalette.dangerText }}>*</span>
          </label>
          <input
            type="datetime-local"
            value={formData.release_date}
            onChange={(e) => setFormData({ ...formData, release_date: e.target.value })}
            style={styles.input}
            required
          />
          <div style={styles.helpText}>When students can see this assignment</div>
        </div>

        {/* Due Date */}
        <div style={styles.formGroup}>
          <label style={styles.label}>
            Due Date <span style={{ color: dashboardPalette.dangerText }}>*</span>
          </label>
          <input
            type="datetime-local"
            value={formData.due_date_soft}
            onChange={(e) => setFormData({ ...formData, due_date_soft: e.target.value })}
            style={styles.input}
            required
          />
          <div style={styles.helpText}>Target due date; no points deducted</div>
        </div>

        {/* Late Due Date */}
        <div style={styles.formGroup}>
          <label style={styles.label}>
            Late Due Date <span style={{ color: dashboardPalette.dangerText }}>*</span>
          </label>
          <input
            type="datetime-local"
            value={formData.due_date_hard}
            onChange={(e) => setFormData({ ...formData, due_date_hard: e.target.value })}
            style={styles.input}
            required
          />
          <div style={styles.helpText}>Final cut-off for submission</div>
        </div>

        {/* Late Policy */}
        <div style={styles.formGroup}>
          <label style={styles.label}>
            Late Policy (%) <span style={{ color: dashboardPalette.dangerText }}>*</span>
          </label>
          <select
            value={formData.late_policy_id}
            onChange={(e) => setFormData({ ...formData, late_policy_id: e.target.value })}
            style={styles.select}
            required
          >
            <option value="">Select late penalty</option>
            <option value="0">0%</option>
            <option value="5">5%</option>
            <option value="10">10%</option>
            <option value="15">15%</option>
            <option value="20">20%</option>
            <option value="25">25%</option>
            <option value="30">30%</option>
            <option value="40">40%</option>
            <option value="50">50%</option>
            <option value="75">75%</option>
            <option value="100">100%</option>
          </select>
          <div style={styles.helpText}>Percent deducted for late submissions</div>
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
                height: '40px',
                padding: '0 14px',
                background: dashboardPalette.navy,
                color: dashboardPalette.white,
                border: `1px solid ${dashboardPalette.navy}`,
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.875rem'
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
            onClick={handleBack}
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
            background: 'rgba(10, 31, 53, 0.2)',
            zIndex: 1000,
            display: 'flex',
            overflow: 'hidden',
            overscrollBehavior: 'contain'
          }}
        >
          <div
            style={{
              background: dashboardPalette.surface,
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative'
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '20px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 1001,
                background: dashboardPalette.white,
                borderBottom: `1px solid ${dashboardPalette.border}`
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
                      color: dashboardPalette.muted,
                    }}
                  >
                    ({formData.assignment_questions.length} selected)
                  </span>
                )}
              </h2>

              <button
                onClick={() => setShowQuestionPicker(false)}
                style={{
                  height: '40px',
                  padding: '0 14px',
                  background: dashboardPalette.navy,
                  color: dashboardPalette.white,
                  border: `1px solid ${dashboardPalette.navy}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Save Selection & Return
              </button>
            </div>

            {/* Table area */}
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y',
                padding: '88px 24px 32px'
              }}
            >
              <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gap: '20px' }}>
                <QuestionSearchBar
                  searchQuery={searchQuery}
                  searchFilter={searchFilter}
                  onSearchQueryChange={setSearchQuery}
                  onSearchFilterChange={setSearchFilter}
                  onClearSearch={() => setSearchQuery('')}
                  compact
                />

                <QuestionTable
                  questions={filteredQuestions}
                  userInfoCache={userInfoCache}
                  user={user}
                  selectable
                  selectedQuestionIds={formData.assignment_questions}
                  onToggleQuestion={toggleQuestion}
                  showBloomsTaxonomy={false}
                  showTags={false}
                  showActions={false}
                />
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
