import React, { useState, useEffect } from 'react';
import { getCourse, updateCourse, getAllUsers, getUserInfo, deleteAssignment } from '../api';
import { useAuth } from '../AuthContext';

const DAY_MS = 1000 * 60 * 60 * 24;
const PACIFIC_TIMEZONE = 'America/Los_Angeles';

function parseAssignmentDate(dateStr) {
  if (!dateStr) return null;
  const hasTimezone = /[zZ]|[+-]\d{2}:\d{2}$/.test(dateStr);
  return new Date(hasTimezone ? dateStr : `${dateStr}Z`);
}

function formatAssignmentDate(dateStr) {
  const parsed = parseAssignmentDate(dateStr);
  if (!parsed) return 'Not set';
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PACIFIC_TIMEZONE,
    timeZoneName: 'short'
  });
}

function formatDateObject(dateObj) {
  if (!dateObj) return 'Not set';
  return dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PACIFIC_TIMEZONE,
    timeZoneName: 'short'
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function CourseDashboard() {
  const { user } = useAuth();
  const [course, setCourse] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isInstructor, setIsInstructor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [formData, setFormData] = useState({
    course_name: '',
    school_name: '',
    student_ids: []
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [showAddStudentsModal, setShowAddStudentsModal] = useState(false);
  const [addStudentsSelection, setAddStudentsSelection] = useState([]);
  const [addStudentSearchQuery, setAddStudentSearchQuery] = useState('');
  const [addStudentsSaving, setAddStudentsSaving] = useState(false);
  const [addStudentsError, setAddStudentsError] = useState('');

  // Delete assignment modal
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Get course ID from URL hash (e.g., #course/123)
  const getCourseIdFromHash = () => {
    const hash = window.location.hash;
    const match = hash.match(/#course\/(\d+)/);
    return match ? parseInt(match[1]) : null;
  };

  const courseId = getCourseIdFromHash();
  const backToCoursesHash = isAdmin && !isInstructor ? '#admin/courses' : '#courses';
  const canViewAssignments = isInstructor || isAdmin;

  useEffect(() => {
    async function loadData() {
      if (!courseId) {
        setError('No course ID specified');
        setLoading(false);
        return;
      }

      try {
        const [courseData, usersData, userInfo] = await Promise.all([
          getCourse(courseId),
          getAllUsers(),
          getUserInfo()
        ]);

        setCourse(courseData);
        setAllUsers(usersData.users || []);
        setIsInstructor(courseData.instructor_id === user?.id);
        setIsAdmin(Boolean(userInfo?.admin));

        setFormData({
          course_name: courseData.course_name || '',
          school_name: courseData.school_name || '',
          student_ids: courseData.student_ids || []
        });
      } catch (err) {
        setError(err.message || 'Failed to load course');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [courseId, user]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, []);

  const getUserDisplayName = (u) => {
    if (u.first_name && u.last_name) {
      return `${u.first_name} ${u.last_name}`;
    }
    return u.email || u.user_id;
  };

  const getInstructorName = () => {
    if (!course?.instructor_id) return 'Unknown';
    const instructor = allUsers.find((u) => u.user_id === course.instructor_id);
    return instructor ? getUserDisplayName(instructor) : 'Unknown';
  };

  const getStudentInfo = (studentId) => {
    const student = allUsers.find((u) => u.user_id === studentId);
    return student ? getUserDisplayName(student) : studentId;
  };

  const getInitials = (name) => {
    if (!name || name === 'Unknown') return '?';
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const availableStudents = allUsers.filter((u) => !u.teacher && u.user_id !== user?.id);

  const filteredStudents = availableStudents.filter((u) => {
    if (!studentSearchQuery.trim()) return true;

    const searchLower = studentSearchQuery.toLowerCase();
    const displayName = getUserDisplayName(u).toLowerCase();
    const email = (u.email || '').toLowerCase();

    return displayName.includes(searchLower) || email.includes(searchLower);
  });

  const addableStudents = availableStudents.filter(
    (u) => !course?.student_ids?.includes(u.user_id)
  );

  const filteredAddableStudents = addableStudents.filter((u) => {
    if (!addStudentSearchQuery.trim()) return true;

    const searchLower = addStudentSearchQuery.toLowerCase();
    const displayName = getUserDisplayName(u).toLowerCase();
    const email = (u.email || '').toLowerCase();

    return displayName.includes(searchLower) || email.includes(searchLower);
  });

  const toggleStudent = (studentId) => {
    setFormData((prev) => ({
      ...prev,
      student_ids: prev.student_ids.includes(studentId)
        ? prev.student_ids.filter((id) => id !== studentId)
        : [...prev.student_ids, studentId]
    }));
  };

  const handleDeleteAssignment = async () => {
    if (!deleteConfirmId) return;

    setDeleting(true);
    try {
      await deleteAssignment(deleteConfirmId);
      setCourse((prev) => ({
        ...prev,
        assignments: prev.assignments.filter((a) => a.id !== deleteConfirmId)
      }));
      setDeleteConfirmId(null);
    } catch (err) {
      alert(`Failed to delete assignment: ${err.message || 'Unknown error'}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    if (!formData.course_name.trim()) {
      setSaveError('Course name is required');
      return;
    }

    setSaving(true);
    setSaveError('');

    try {
      const updated = await updateCourse(courseId, formData);
      setCourse(updated);
      setShowEditModal(false);
      setStudentSearchQuery('');
    } catch (err) {
      setSaveError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      course_name: course.course_name || '',
      school_name: course.school_name || '',
      student_ids: course.student_ids || []
    });
    setShowEditModal(false);
    setStudentSearchQuery('');
    setSaveError('');
  };

  const handleSelectAll = () => {
    setFormData((prev) => ({
      ...prev,
      student_ids: [...availableStudents.map((u) => u.user_id)]
    }));
  };

  const handleDeselectAll = () => {
    setFormData((prev) => ({
      ...prev,
      student_ids: []
    }));
  };

  const openAddStudentsModal = () => {
    setAddStudentsSelection([]);
    setAddStudentSearchQuery('');
    setAddStudentsError('');
    setShowAddStudentsModal(true);
  };

  const closeAddStudentsModal = () => {
    setShowAddStudentsModal(false);
    setAddStudentsSelection([]);
    setAddStudentSearchQuery('');
    setAddStudentsError('');
  };

  const toggleAddStudent = (studentId) => {
    setAddStudentsSelection((prev) => (
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    ));
  };

  const handleAddSelectedStudents = async () => {
    if (!course) return;
    if (addStudentsSelection.length === 0) {
      setAddStudentsError('Select at least one student.');
      return;
    }

    setAddStudentsSaving(true);
    setAddStudentsError('');
    try {
      const mergedStudentIds = Array.from(
        new Set([...(course.student_ids || []), ...addStudentsSelection])
      );
      const updated = await updateCourse(courseId, {
        course_name: course.course_name,
        school_name: course.school_name,
        student_ids: mergedStudentIds
      });
      setCourse(updated);
      setFormData((prev) => ({ ...prev, student_ids: updated.student_ids || [] }));
      closeAddStudentsModal();
    } catch (err) {
      setAddStudentsError(err.message || 'Failed to add students');
    } finally {
      setAddStudentsSaving(false);
    }
  };

  const styles = {
    container: {
      maxWidth: '1180px',
      margin: '0 auto',
      padding: '2rem',
      color: '#111827'
    },
    backLink: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.5rem',
      color: '#2563eb',
      textDecoration: 'none',
      fontSize: '0.875rem',
      fontWeight: '600',
      marginBottom: '1rem',
      cursor: 'pointer'
    },
    section: {
      background: '#ffffff',
      borderRadius: '14px',
      padding: '1.25rem',
      marginBottom: '1.1rem',
      border: '1px solid #e5e7eb',
      boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)'
    },
    sectionTitle: {
      margin: 0,
      fontSize: '1.05rem',
      fontWeight: 700,
      color: '#0f172a'
    },
    mutedText: {
      margin: 0,
      color: '#64748b',
      fontSize: '0.9rem'
    },
    infoRow: {
      display: 'flex',
      padding: '0.7rem 0',
      borderBottom: '1px solid #f1f5f9',
      gap: '1rem'
    },
    infoLabel: {
      minWidth: '150px',
      fontWeight: 600,
      color: '#334155'
    },
    infoValue: {
      color: '#475569',
      flex: 1
    },
    studentGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
      gap: '0.65rem'
    },
    studentCard: {
      padding: '0.75rem 0.9rem',
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '10px',
      display: 'flex',
      alignItems: 'center',
      gap: '0.65rem'
    },
    studentAvatar: {
      width: '36px',
      height: '36px',
      borderRadius: '999px',
      background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      fontSize: '0.78rem',
      letterSpacing: '0.02em'
    },
    formGroup: {
      marginBottom: '1rem'
    },
    label: {
      display: 'block',
      marginBottom: '0.2rem',
      fontWeight: 600,
      color: '#334155',
      fontSize: '0.875rem'
    },
    input: {
      width: '100%',
      padding: '0.75rem',
      border: '1px solid #cbd5e1',
      borderRadius: '8px',
      fontSize: '1rem',
      boxSizing: 'border-box'
    },
    searchInput: {
      width: '100%',
      padding: '0.625rem 0.75rem',
      border: '1px solid #cbd5e1',
      borderRadius: '6px',
      fontSize: '0.875rem',
      boxSizing: 'border-box',
      marginTop: '-0.4rem',
      marginBottom: '0.5rem',
      background: '#ffffff'
    },
    bulkActionButtons: {
      display: 'flex',
      alignItems: 'center',
      marginBottom: '0.5rem'
    },
    bulkActionBtn: {
      background: 'none',
      border: 'none',
      padding: 0,
      color: '#2563eb',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: 600,
      textDecoration: 'none',
      marginRight: 'auto'
    },
    studentList: {
      maxHeight: '200px',
      minHeight: '200px',
      overflow: 'auto',
      border: '1px solid #e2e8f0',
      borderRadius: '8px'
    },
    studentItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.75rem',
      borderBottom: '1px solid #f1f5f9',
      cursor: 'pointer'
    },
    checkbox: {
      width: '18px',
      height: '18px',
      cursor: 'pointer'
    },
    buttonGroup: {
      display: 'flex',
      gap: '0.75rem',
      justifyContent: 'flex-end',
      marginTop: '1.5rem'
    },
    saveBtn: {
      padding: '0.75rem 1.5rem',
      background: '#2563eb',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: 600
    },
    cancelBtn: {
      padding: '0.75rem 1.5rem',
      background: '#f1f5f9',
      color: '#334155',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: 600
    },
    addStudentsBtn: {
      padding: '0.55rem 0.9rem',
      borderRadius: '8px',
      border: '1px solid #93c5fd',
      background: '#eff6ff',
      color: '#1d4ed8',
      fontWeight: 600,
      cursor: 'pointer',
      fontSize: '0.82rem'
    },
    error: {
      background: '#fef2f2',
      color: '#dc2626',
      padding: '0.75rem 1rem',
      borderRadius: '8px',
      marginBottom: '1rem'
    },
    modal: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    },
    modalContent: {
      background: 'white',
      padding: '2rem',
      borderRadius: '12px',
      maxWidth: '500px',
      width: '90%',
      maxHeight: '80vh',
      overflow: 'auto'
    },
    modalTitle: {
      margin: '0 0 1.5rem 0',
      fontSize: '1.25rem',
      fontWeight: 700
    },
    timelineCard: {
      border: '1px solid #dbeafe',
      background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
      borderRadius: '12px',
      padding: '1.05rem 1.15rem',
      marginBottom: '0.95rem'
    }
  };

  const renderEditModal = () => {
    const handleBackdropClick = (e) => {
      if (e.target === e.currentTarget) {
        handleCancel();
      }
    };

    return (
      <div style={styles.modal} onClick={handleBackdropClick}>
        <div style={styles.modalContent}>
          <h2 style={styles.modalTitle}>Edit Course</h2>

          {saveError && (
            <div style={styles.error}>{saveError}</div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Course Name *</label>
              <input
                type="text"
                value={formData.course_name}
                onChange={(e) => setFormData({ ...formData, course_name: e.target.value })}
                style={styles.input}
                placeholder="e.g., Introduction to Computer Science"
                disabled={saving}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>School Name</label>
              <input
                type="text"
                value={formData.school_name}
                onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
                style={styles.input}
                placeholder="e.g., UCSB"
                disabled={saving}
              />
            </div>

            <div style={styles.formGroup}>
              <div style={styles.bulkActionButtons}>
                <label style={styles.label}>
                  Students ({formData.student_ids.length} selected)
                </label>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    disabled={saving}
                    style={styles.bulkActionBtn}
                  >
                    Select All
                  </button>
                  <span style={{ display: 'inline-block', marginBottom: '0.2rem' }}>|</span>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    disabled={saving}
                    style={styles.bulkActionBtn}
                  >
                    Clear Selection
                  </button>
                </div>
              </div>

              {availableStudents.length === 0 ? (
                <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
                  No students available to add.
                </p>
              ) : (
                <>
                  <input
                    type="text"
                    value={studentSearchQuery}
                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                    style={styles.searchInput}
                    placeholder="Search for students..."
                    disabled={saving}
                  />
                  <div style={styles.studentList}>
                    {filteredStudents.map((u) => (
                      <div
                        key={u.user_id}
                        style={{
                          ...styles.studentItem,
                          background: formData.student_ids.includes(u.user_id) ? '#eff6ff' : 'transparent'
                        }}
                        onClick={() => !saving && toggleStudent(u.user_id)}
                      >
                        <input
                          type="checkbox"
                          checked={formData.student_ids.includes(u.user_id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleStudent(u.user_id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={styles.checkbox}
                          disabled={saving}
                        />
                        <span style={{ fontSize: '0.875rem', color: '#334155' }}>
                          {getUserDisplayName(u)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={styles.buttonGroup}>
              <button
                type="button"
                onClick={handleCancel}
                style={styles.cancelBtn}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  ...styles.saveBtn,
                  opacity: saving ? 0.6 : 1,
                  cursor: saving ? 'not-allowed' : 'pointer'
                }}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderAddStudentsModal = () => {
    const handleBackdropClick = (e) => {
      if (e.target === e.currentTarget) {
        closeAddStudentsModal();
      }
    };

    return (
      <div style={styles.modal} onClick={handleBackdropClick}>
        <div style={styles.modalContent}>
          <h2 style={styles.modalTitle}>Add Students</h2>

          {addStudentsError && (
            <div style={styles.error}>{addStudentsError}</div>
          )}

          {addableStudents.length === 0 ? (
            <p style={styles.mutedText}>No additional students are available to add.</p>
          ) : (
            <>
              <input
                type="text"
                value={addStudentSearchQuery}
                onChange={(e) => setAddStudentSearchQuery(e.target.value)}
                style={styles.searchInput}
                placeholder="Search for students..."
                disabled={addStudentsSaving}
              />
              <div style={styles.studentList}>
                {filteredAddableStudents.map((u) => (
                  <div
                    key={u.user_id}
                    style={{
                      ...styles.studentItem,
                      background: addStudentsSelection.includes(u.user_id) ? '#eff6ff' : 'transparent'
                    }}
                    onClick={() => !addStudentsSaving && toggleAddStudent(u.user_id)}
                  >
                    <input
                      type="checkbox"
                      checked={addStudentsSelection.includes(u.user_id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleAddStudent(u.user_id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={styles.checkbox}
                      disabled={addStudentsSaving}
                    />
                    <span style={{ fontSize: '0.875rem', color: '#334155' }}>
                      {getUserDisplayName(u)}
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ ...styles.mutedText, marginTop: '0.5rem' }}>
                {addStudentsSelection.length} selected
              </p>
            </>
          )}

          <div style={styles.buttonGroup}>
            <button
              type="button"
              onClick={closeAddStudentsModal}
              style={styles.cancelBtn}
              disabled={addStudentsSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddSelectedStudents}
              style={{
                ...styles.saveBtn,
                opacity: addStudentsSaving ? 0.6 : 1,
                cursor: addStudentsSaving ? 'not-allowed' : 'pointer'
              }}
              disabled={addStudentsSaving || addableStudents.length === 0}
            >
              {addStudentsSaving ? 'Adding...' : 'Add Selected'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <p style={{ textAlign: 'center', color: '#64748b' }}>Loading course...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <a href={backToCoursesHash} style={styles.backLink}>← Back to Courses</a>
        <div style={styles.error}>{error}</div>
      </div>
    );
  }

  if (!course) {
    return (
      <div style={styles.container}>
        <a href={backToCoursesHash} style={styles.backLink}>← Back to Courses</a>
        <p>Course not found</p>
      </div>
    );
  }

  const now = currentTime;
  const allAssignments = course.assignments || [];

  const getRelevantDueDate = (assignment) => {
    const dueSoft = parseAssignmentDate(assignment.due_date_soft);
    const dueHard = parseAssignmentDate(assignment.due_date_hard);
    return dueSoft || dueHard || null;
  };

  const getSortDueTime = (assignment) => {
    const due = getRelevantDueDate(assignment);
    if (due) return due.getTime();
    return Number.POSITIVE_INFINITY;
  };

  const completedAssignments = allAssignments.filter((assignment) => {
    const dueDate = getRelevantDueDate(assignment);
    return dueDate ? dueDate < now : false;
  });

  const releasedAssignments = allAssignments.filter((assignment) => {
    if (!assignment.release_date) return false;
    const releaseDate = parseAssignmentDate(assignment.release_date);
    const dueDate = getRelevantDueDate(assignment);
    const isReleased = releaseDate ? releaseDate <= now : false;
    const isCompleted = dueDate ? dueDate < now : false;
    return isReleased && !isCompleted;
  });

  const unreleasedAssignments = allAssignments.filter((assignment) => {
    if (!assignment.release_date) return true;
    const releaseDate = parseAssignmentDate(assignment.release_date);
    return releaseDate ? releaseDate > now : true;
  });

  const sortByUpcomingDue = (assignments) => (
    [...assignments].sort((a, b) => getSortDueTime(a) - getSortDueTime(b))
  );

  const timelineAssignments = sortByUpcomingDue(allAssignments);

  const timelineWithMeta = timelineAssignments.map((assignment) => {
    const releaseDate = parseAssignmentDate(assignment.release_date);
    const softDueDate = parseAssignmentDate(assignment.due_date_soft);
    const hardDueDate = parseAssignmentDate(assignment.due_date_hard);
    const dueDate = softDueDate || hardDueDate || null;

    const dueMs = dueDate ? dueDate.getTime() : null;
    const releaseMs = releaseDate ? releaseDate.getTime() : null;
    const softDueMs = softDueDate ? softDueDate.getTime() : null;
    const hardDueMs = hardDueDate ? hardDueDate.getTime() : null;
    const nowMs = now.getTime();

    const daysUntilDue = dueMs === null ? null : Math.ceil((dueMs - nowMs) / DAY_MS);

    const isClosed = hardDueMs !== null && nowMs > hardDueMs;
    const isUnreleased = releaseMs === null || nowMs < releaseMs;
    const isLate = softDueMs !== null && nowMs > softDueMs && !isClosed;
    const isInProgress = !isUnreleased && !isLate && !isClosed &&
      (releaseMs === null || nowMs >= releaseMs) &&
      (softDueMs === null || nowMs <= softDueMs);

    let status = { label: 'No schedule', tone: '#64748b', bg: '#f1f5f9' };
    if (isUnreleased) {
      status = { label: 'Unreleased', tone: '#1e3a8a', bg: '#dbeafe' };
    } else if (isInProgress) {
      status = { label: 'In Progress', tone: '#0f766e', bg: '#ccfbf1' };
    } else if (isLate || isClosed) {
      status = { label: 'Late', tone: '#b91c1c', bg: '#fef2f2' };
    } else if (daysUntilDue !== null) {
      status = { label: 'Upcoming', tone: '#0f766e', bg: '#ecfeff' };
    }

    const timeRemainingPercent = releaseMs && softDueMs && softDueMs > releaseMs
      ? clamp(((nowMs - releaseMs) / (softDueMs - releaseMs)) * 100, 0, 100)
      : null;

    const formatRemainingTime = () => {
      if (isUnreleased) return 'Unreleased';
      const targetMs = isLate ? (hardDueMs ?? dueMs) : dueMs;
      if (targetMs === null) return 'N/A';
      const diffMs = targetMs - nowMs;
      if (diffMs < 0) {
        const daysLate = Math.ceil(Math.abs(diffMs) / DAY_MS);
        return `${daysLate}d late`;
      }
      if (isLate) {
        const totalSeconds = Math.floor(diffMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
      if (diffMs >= DAY_MS) {
        return `${Math.ceil(diffMs / DAY_MS)}d`;
      }
      const totalSeconds = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    return {
      assignment,
      dueDate,
      releaseDate,
      softDueDate,
      hardDueDate,
      daysUntilDue,
      status,
      isLate,
      isInProgress,
      isClosed,
      timeRemainingPercent,
      remainingTimeLabel: formatRemainingTime(),
      remainingTimePrefix: isLate ? 'Time Remaining (LATE):' : 'Time Remaining:'
    };
  });
  const inProgressCount = timelineWithMeta.filter((item) => item.isInProgress || item.isLate).length;
  const completedCount = timelineWithMeta.filter((item) => item.isClosed).length;
  const unreleasedIdSet = new Set(unreleasedAssignments.map((assignment) => assignment.id));
  const timelineInProgressOrLate = timelineWithMeta.filter((item) => (item.isInProgress || item.isLate) && !unreleasedIdSet.has(item.assignment.id));
  const timelineCompleted = timelineWithMeta.filter((item) => item.isClosed);
  const timelineUnreleased = timelineWithMeta.filter((item) => unreleasedIdSet.has(item.assignment.id));

  return (
    <div style={styles.container}>
      <a href={backToCoursesHash} style={styles.backLink}>← Back to Courses</a>

      <div style={{
        ...styles.section,
        background: 'radial-gradient(circle at 8% 0%, #dbeafe 0%, #eff6ff 35%, #ffffff 100%)',
        border: '1px solid #bfdbfe'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', lineHeight: 1.1, color: '#0f172a' }}>{course.course_name}</h1>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem' }}>
            {isInstructor && (
              <button
                style={{
                  padding: '0.6rem 0.95rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#2563eb',
                  color: 'white',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                onClick={() => window.location.hash = `#course/${courseId}/assignment/new`}
              >
                + New Assignment
              </button>
            )}
            {isInstructor && (
              <button
                style={{
                  padding: '0.6rem 0.95rem',
                  borderRadius: '8px',
                  border: '1px solid #93c5fd',
                  background: 'white',
                  color: '#1d4ed8',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                onClick={() => setShowEditModal(true)}
              >
                Edit Course
              </button>
            )}
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '0.7rem',
          marginTop: '1rem'
        }}>
          {[
            { label: 'Total Assignments', value: allAssignments.length },
            { label: 'In Progress', value: inProgressCount },
            { label: 'Completed', value: completedCount }
          ].map((metric) => (
            <div key={metric.label} style={{
              background: '#ffffff',
              border: '1px solid #dbeafe',
              borderRadius: '10px',
              padding: '0.7rem 0.8rem'
            }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{metric.value}</div>
              <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#475569', letterSpacing: '0.03em' }}>{metric.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={styles.section}>
        <div style={{ marginBottom: '1.15rem' }}>
          <h2 style={{ ...styles.sectionTitle, fontSize: '1.3rem', fontWeight: 800 }}>Assignment Timeline</h2>
        </div>

        {timelineWithMeta.length === 0 ? (
          <div style={{
            border: '2px dashed #cbd5e1',
            borderRadius: '12px',
            padding: '2.2rem 1rem',
            textAlign: 'center',
            background: '#f8fafc'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>No assignments yet</h3>
            <p style={{ margin: 0, color: '#64748b' }}>
              {isInstructor ? 'Create your first assignment to initialize the timeline.' : 'Assignments will appear here once your instructor adds them.'}
            </p>
          </div>
        ) : (
          <div>
            {[
              { key: 'in-progress', title: 'In Progress', emptyLabel: 'No In Progress assignments.', items: timelineInProgressOrLate },
              { key: 'completed', title: 'Completed', emptyLabel: 'No Completed assignments.', items: timelineCompleted },
              { key: 'unreleased', title: 'Unreleased', emptyLabel: 'No Unreleased assignments.', items: timelineUnreleased }
            ].map((section, sectionIndex) => (
              <div key={section.key}>
                <h3 style={{ margin: '0 0 0.65rem 0', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{section.title}</h3>
                {section.items.length === 0 ? (
                  <p style={styles.mutedText}>{section.emptyLabel}</p>
                ) : (
                  section.items.map((item) => (
                    <div
                      key={item.assignment.id}
                      style={{
                        ...styles.timelineCard,
                        cursor: canViewAssignments ? 'pointer' : 'default',
                        transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s'
                      }}
                      onClick={() => {
                        if (canViewAssignments) {
                          window.location.hash = `#course/${courseId}/assignment/${item.assignment.id}/view`;
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (canViewAssignments) {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 8px 16px rgba(15, 23, 42, 0.12)';
                          e.currentTarget.style.borderColor = '#bfdbfe';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.borderColor = '#dbeafe';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>{item.assignment.title}</h3>
                            {!(item.isClosed && item.status.label === 'Late') && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: item.status.tone, background: item.status.bg, borderRadius: '999px', padding: '0.15rem 0.45rem' }}>
                                {item.status.label}
                              </span>
                            )}
                            {item.isClosed && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7f1d1d', background: '#fee2e2', borderRadius: '999px', padding: '0.15rem 0.45rem' }}>
                                Completed
                              </span>
                            )}
                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#1d4ed8', background: '#dbeafe', borderRadius: '6px', padding: '0.15rem 0.4rem' }}>
                              {item.assignment.type}
                            </span>
                          </div>
                          <div style={{ marginTop: '0.7rem', fontSize: '0.82rem', color: '#475569', display: 'flex', gap: '1.15rem', rowGap: '0.45rem', flexWrap: 'wrap' }}>
                            <span><strong>Release:</strong> {formatAssignmentDate(item.assignment.release_date)}</span>
                            <span><strong>Due Date:</strong> {formatDateObject(item.softDueDate || item.dueDate)}</span>
                            <span><strong>Late Due Date:</strong> {formatDateObject(item.hardDueDate)}</span>
                            <span><strong>Questions:</strong> {item.assignment.assignment_questions?.length || 0}</span>
                          </div>
                        </div>
                        {isInstructor && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(item.assignment.id);
                            }}
                            style={{
                              width: '24px',
                              height: '24px',
                              padding: 0,
                              background: '#fee2e2',
                              color: '#dc2626',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.875rem',
                              fontWeight: 'bold',
                              flexShrink: 0
                            }}
                            title="Delete assignment"
                          >
                            x
                          </button>
                        )}
                      </div>

                      <div style={{ marginTop: '0.95rem' }}>
                        <div>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            alignItems: 'center',
                            fontSize: '0.74rem',
                            color: '#475569',
                            marginBottom: '0.35rem',
                            columnGap: '0.6rem'
                          }}>
                            <span style={{ textAlign: 'left' }}>{formatDateObject(item.releaseDate)}</span>
                            <span style={{ textAlign: 'right' }}>{formatDateObject(item.softDueDate || item.dueDate)}</span>
                          </div>
                          <div style={{ height: '8px', borderRadius: '999px', background: '#dbeafe', overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${item.timeRemainingPercent ?? 0}%`,
                              background: '#2563eb'
                            }} />
                          </div>
                          {section.key === 'in-progress' && (
                            <div style={{ marginTop: '0.4rem', fontSize: '0.76rem', color: '#334155', fontWeight: 700 }}>
                              {item.remainingTimePrefix} {item.remainingTimeLabel}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {sectionIndex < 2 && (
                  <hr style={{ border: 0, borderTop: '1px solid #e2e8f0', margin: '0.85rem 0 1rem 0' }} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Course Information</h2>
        <div style={{ marginTop: '0.5rem' }}>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Instructor</span>
            <span style={styles.infoValue}>{getInstructorName()}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>School</span>
            <span style={styles.infoValue}>{course.school_name || 'Not set'}</span>
          </div>
          <div style={{ ...styles.infoRow, borderBottom: 'none' }}>
            <span style={styles.infoLabel}>Course Code</span>
            <span style={styles.infoValue}>{course.course_code || 'Not set'}</span>
          </div>
        </div>
      </div>

      <div style={styles.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.7rem', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h2 style={styles.sectionTitle}>Students ({course.student_ids?.length || 0})</h2>
          {isInstructor && (
            <button style={styles.addStudentsBtn} onClick={openAddStudentsModal}>
              + Add Students
            </button>
          )}
        </div>

        {course.student_ids?.length > 0 ? (
          <div style={styles.studentGrid}>
            {course.student_ids.map((studentId) => {
              const name = getStudentInfo(studentId);
              return (
                <div key={studentId} style={styles.studentCard}>
                  <div style={styles.studentAvatar}>{getInitials(name)}</div>
                  <span style={{ fontSize: '0.875rem', color: '#334155' }}>{name}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={styles.mutedText}>No students enrolled yet.</p>
        )}
      </div>


      {deleteConfirmId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.5rem',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>
              Delete Assignment?
            </h3>
            <p style={{ margin: '0 0 1.5rem 0', color: '#6b7280', fontSize: '0.875rem', lineHeight: 1.5 }}>
              Are you sure you want to delete this assignment? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleting}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAssignment}
                disabled={deleting}
                style={{
                  padding: '0.5rem 1rem',
                  background: deleting ? '#f87171' : '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500
                }}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && renderEditModal()}
      {showAddStudentsModal && renderAddStudentsModal()}
    </div>
  );
}
