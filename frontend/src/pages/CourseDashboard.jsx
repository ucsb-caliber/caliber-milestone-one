import React, { useState, useEffect } from 'react';
import { getCourse, updateCourse, getAllUsers, getUserInfo, deleteAssignment, releaseAssignmentNow } from '../api';
import { useAuth } from '../AuthContext';
import AssignmentCard from '../components/AssignmentCard';

export default function CourseDashboard() {
  const { user } = useAuth();
  const [course, setCourse] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
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

  // Delete assignment modal
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [releaseConfirmId, setReleaseConfirmId] = useState(null);
  const [releasingAssignmentId, setReleasingAssignmentId] = useState(null);

  // Get course ID from URL hash (e.g., #course/123)
  const getCourseIdFromHash = () => {
    const hash = window.location.hash;
    const match = hash.match(/#course\/(\d+)/);
    return match ? parseInt(match[1]) : null;
  };
  const courseId = getCourseIdFromHash();

  // ---  HELPERS START ---
  const calculateDaysLeft = (dueDate) => {
    if (!dueDate) return null;
    const now = new Date();
    const due = new Date(dueDate);
    const diffTime = due - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getAssignmentStatus = (assignment) => {
    const days = calculateDaysLeft(assignment.due_date_soft);
    if (days === null) return { label: 'No Date', color: '#9ca3af' };
    if (days < 0) return { label: 'Past Due', color: '#ef4444' };
    if (days <= 2) return { label: 'Due Soon', color: '#f59e0b' };
    return { label: 'Upcoming', color: '#10b981' };
  };

  const getInitials = (name) => {
    if (!name || name === 'Unknown') return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };
  // ---  HELPERS END ---

  const backToCoursesHash = isAdmin && !isInstructor ? '#admin/courses' : '#courses';
  const canViewAssignments = isInstructor || isAdmin;

  // Load course data
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

        // Initialize form data
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

  // Get user display name
  const getUserDisplayName = (u) => {
    if (u.first_name && u.last_name) {
      return `${u.first_name} ${u.last_name}`;
    }
    return u.email || u.user_id;
  };

  // Get instructor info
  const getInstructorName = () => {
    if (!course?.instructor_id) return 'Unknown';
    const instructor = allUsers.find(u => u.user_id === course.instructor_id);
    return instructor ? getUserDisplayName(instructor) : 'Unknown';
  };

  // Get student info
  const getStudentInfo = (studentId) => {
    const student = allUsers.find(u => u.user_id === studentId);
    return student ? getUserDisplayName(student) : studentId;
  };

  // Available students (non-teachers, excluding current user)
  const availableStudents = allUsers.filter(u => !u.teacher && u.user_id !== user?.id);

  // Filter students based on search query
  const filteredStudents = availableStudents.filter(u => {
    if (!studentSearchQuery.trim()) return true;

    const searchLower = studentSearchQuery.toLowerCase();
    const displayName = getUserDisplayName(u).toLowerCase();
    const email = (u.email || '').toLowerCase();

    return displayName.includes(searchLower) || email.includes(searchLower);
  });

  // Toggle student selection
  const toggleStudent = (studentId) => {
    setFormData(prev => ({
      ...prev,
      student_ids: prev.student_ids.includes(studentId)
        ? prev.student_ids.filter(id => id !== studentId)
        : [...prev.student_ids, studentId]
    }));
  };

  // Handle delete assignment
  const handleDeleteAssignment = async () => {
    if (!deleteConfirmId) return;

    setDeleting(true);
    try {
      await deleteAssignment(deleteConfirmId);
      // Update local state to remove the deleted assignment
      setCourse(prev => ({
        ...prev,
        assignments: prev.assignments.filter(a => a.id !== deleteConfirmId)
      }));
      setDeleteConfirmId(null);
    } catch (err) {
      alert('Failed to delete assignment: ' + (err.message || 'Unknown error'));
    } finally {
      setDeleting(false);
    }
  };

  // Handle release assignment now
  const handleReleaseNow = async (assignmentId) => {
    setReleasingAssignmentId(assignmentId);
    try {
      const updatedAssignment = await releaseAssignmentNow(assignmentId);
      setCourse(prev => ({
        ...prev,
        assignments: (prev.assignments || []).map(a =>
          a.id === assignmentId ? updatedAssignment : a
        )
      }));
    } catch (err) {
      alert('Failed to release assignment: ' + (err.message || 'Unknown error'));
    } finally {
      setReleasingAssignmentId(null);
      setReleaseConfirmId(null);
    }
  };

  // Save changes
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

  // Cancel editing
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

  // Select all students
  const handleSelectAll = () => {
    setFormData(prev => ({
      ...prev,
      student_ids: [...availableStudents.map(u => u.user_id)]
    }));
  };

  // Deselect all students
  const handleDeselectAll = () => {
    setFormData(prev => ({
      ...prev,
      student_ids: []
    }));
  };

  const styles = {
    container: {
      maxWidth: '1000px',
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
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '2rem'
    },
    title: {
      margin: 0,
      fontSize: '2rem',
      fontWeight: '700',
      color: '#111827'
    },
    subtitle: {
      margin: '0.5rem 0 0 0',
      fontSize: '1rem',
      color: '#6b7280'
    },
    editBtn: {
      padding: '0.75rem 1.5rem',
      background: '#4f46e5',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: '600'
    },
    section: {
      background: 'white',
      borderRadius: '12px',
      padding: '1.5rem',
      marginBottom: '1.5rem',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      border: '1px solid #e5e7eb'
    },
    sectionTitle: {
      margin: '0 0 1rem 0',
      fontSize: '1.125rem',
      fontWeight: '600',
      color: '#111827',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem'
    },
    infoRow: {
      display: 'flex',
      padding: '0.75rem 0',
      borderBottom: '1px solid #f3f4f6'
    },
    infoLabel: {
      width: '140px',
      fontWeight: '600',
      color: '#374151'
    },
    infoValue: {
      color: '#6b7280',
      flex: 1
    },
    studentGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: '0.75rem'
    },
    studentCard: {
      padding: '0.75rem 1rem',
      background: '#f9fafb',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem'
    },
    studentAvatar: {
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      background: '#4f46e5',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: '600',
      fontSize: '0.875rem'
    },
    formGroup: {
      marginBottom: '1rem'
    },
    label: {
      display: 'block',
      marginBottom: '0.2rem',
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
    studentsContainer: {
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      padding: '12px',
      backgroundColor: '#ffffff',
    },
    searchInput: {
      width: '100%',
      padding: '0.625rem 0.75rem',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      fontSize: '0.875rem',
      boxSizing: 'border-box',
      marginTop: '-0.5rem',
      marginBottom: '0.5rem',
      background: '#ffffff',
      transition: 'border-color 0.15s'
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
      color: '#4f46e5',
      cursor: 'pointer',
      fontSize: '0.875rem',
      fontWeight: 500,
      textDecoration: 'none',
      marginBottom: '0rem',
      marginRight: 'auto'
    },
    studentList: {
      maxHeight: '200px',
      minHeight: '200px',
      overflow: 'auto',
      border: '1px solid #e5e7eb',
      borderRadius: '8px'
    },
    studentItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.75rem',
      borderBottom: '1px solid #f3f4f6',
      cursor: 'pointer',
      transition: 'background 0.15s'
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
      fontWeight: '700'
    },
    noResults: {
      padding: '1rem',
      textAlign: 'center',
      color: '#6b7280',
      fontSize: '0.875rem',
      fontStyle: 'italic'
    }
  };

  // Render edit modal
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
                    onMouseEnter={(e) => {
                      if (!saving) e.currentTarget.style.background = '#ffffffff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#ffffffff';
                    }}
                  >
                    Select All
                  </button>
                  <span style={{ display: 'inline-block', marginBottom: '0.2rem' }}>|</span>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    disabled={saving}
                    style={styles.bulkActionBtn}
                    onMouseEnter={(e) => {
                      if (!saving) e.currentTarget.style.background = '#ffffffff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#ffffffff';
                    }}
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
                    {filteredStudents.map(u => (
                      <div
                        key={u.user_id}
                        style={{
                          ...styles.studentItem,
                          background: formData.student_ids.includes(u.user_id) ? '#eef2ff' : 'transparent'
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
                        <span style={{ fontSize: '0.875rem', color: '#374151' }}>
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

  if (loading) {
    return (
      <div style={styles.container}>
        <p style={{ textAlign: 'center', color: '#6b7280' }}>Loading course...</p>
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

  const allAssignments = course.assignments || [];
  const now = new Date();
  const parseAssignmentDate = (dateStr) => {
    if (!dateStr) return null;
    const hasTimezone = /[zZ]|[+-]\d{2}:\d{2}$/.test(dateStr);
    return new Date(hasTimezone ? dateStr : `${dateStr}Z`);
  };
  const completedAssignments = allAssignments.filter((assignment) => {
    if (!assignment.due_date_soft) return false;
    const dueDate = parseAssignmentDate(assignment.due_date_soft);
    return dueDate ? dueDate < now : false;
  });
  const releasedAssignments = allAssignments.filter((assignment) => {
    if (!assignment.release_date) return false;
    const releaseDate = parseAssignmentDate(assignment.release_date);
    const dueDate = assignment.due_date_soft ? parseAssignmentDate(assignment.due_date_soft) : null;
    const isReleased = releaseDate ? releaseDate <= now : false;
    const isCompleted = dueDate ? dueDate < now : false;
    return isReleased && !isCompleted;
  });
  const unreleasedAssignments = allAssignments.filter((assignment) => {
    const dueDate = assignment.due_date_soft ? parseAssignmentDate(assignment.due_date_soft) : null;
    if (dueDate && dueDate < now) return false;
    if (!assignment.release_date) return true;
    const releaseDate = parseAssignmentDate(assignment.release_date);
    return releaseDate ? releaseDate > now : true;
  });
  const getSortDueTime = (assignment) => {
    const dueSoft = parseAssignmentDate(assignment.due_date_soft);
    const dueHard = parseAssignmentDate(assignment.due_date_hard);
    if (dueSoft) return dueSoft.getTime();
    if (dueHard) return dueHard.getTime();
    return Number.POSITIVE_INFINITY;
  };

  const sortByUpcomingDue = (assignments) => (
    [...assignments].sort((a, b) => getSortDueTime(a) - getSortDueTime(b))
  );

  return (
    <div style={styles.container}>
      <a href={backToCoursesHash} style={styles.backLink}>← Back to Courses</a>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{course.course_name}</h1>
          <p style={styles.subtitle}>
            {course.school_name || 'No school specified'}
          </p>
        </div>
        {isInstructor && (
          <button
            style={styles.editBtn}
            onClick={() => setShowEditModal(true)}
          >
            Edit Course
          </button>
        )}
      </div>

      {/* STATS BAR  */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        {[
          { label: 'Assignments', val: course.assignments?.length || 0, icon: '📝' },
          { label: 'Students', val: course.student_ids?.length || 0, icon: '👥' },
          { label: 'Role', val: isInstructor ? 'Instructor' : 'Student', icon: '🔑' }
        ].map((stat, i) => (
          <div key={i} style={{ ...styles.section, margin: 0, padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.2rem' }}>{stat.icon}</div>
            <div style={{ fontWeight: '700', fontSize: '1.1rem', color: '#111827' }}>{stat.val}</div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Course Info Section */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>
          📚 Course Information
        </h2>
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>Instructor</span>
          <span style={styles.infoValue}>{getInstructorName()}</span>
        </div>
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>Students</span>
          <span style={styles.infoValue}>{course.student_ids?.length || 0} enrolled</span>
        </div>
        <div style={{ ...styles.infoRow, borderBottom: 'none' }}>
          <span style={styles.infoLabel}>Course Code</span>
          <span style={styles.infoValue}>{course.course_code || 'Not set'}</span>
        </div>
      </div>

      {/* Students Section */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>
          👥 Enrolled Students ({course.student_ids?.length || 0})
        </h2>

        {course.student_ids?.length > 0 ? (
          <div style={styles.studentGrid}>
            {course.student_ids.map(studentId => {
              const student = allUsers.find(u => u.user_id === studentId);
              const initials = student?.first_name && student?.last_name
                ? `${student.first_name[0]}${student.last_name[0]}`
                : '?';
              return (
                <div key={studentId} style={styles.studentCard}>
                  <div style={styles.studentAvatar}>
                    {initials.toUpperCase()}
                  </div>
                  <span style={{ fontSize: '0.875rem', color: '#374151' }}>
                    {getStudentInfo(studentId)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: '#6b7280', margin: 0 }}>No students enrolled yet.</p>
        )}
      </div>

      {/* Assignments Section */}
      <div style={styles.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={styles.sectionTitle}>
            📝 Assignments ({allAssignments.length})
          </h2>
          {isInstructor && (
            <button
              onClick={() => window.location.hash = `#course/${courseId}/assignment/new`}
              style={{
                padding: '0.5rem 1rem',
                background: '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600'
              }}
            >
              + Create Assignment
            </button>
          )}
        </div>

        {allAssignments.length === 0 ? (
          <div style={{
            background: '#f9fafb',
            borderRadius: '12px',
            padding: '3rem',
            textAlign: 'center',
            border: '2px dashed #d1d5db'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: '600', color: '#374151' }}>
              No Assignments Yet
            </h3>
            <p style={{ margin: 0, color: '#6b7280' }}>
              {isInstructor 
                ? 'Create your first assignment to get started.'
                : 'Your instructor hasn\'t created any assignments yet.'
              }
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#111827' }}>
                Unreleased ({unreleasedAssignments.length})
              </h3>
              {unreleasedAssignments.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {sortByUpcomingDue(unreleasedAssignments).map((assignment) => (
                    <AssignmentCard
                      key={assignment.id}
                      assignment={assignment}
                      onClick={canViewAssignments ? () => {
                        window.location.hash = `#course/${courseId}/assignment/${assignment.id}/view`;
                      } : undefined}
                      showReleaseNow={isInstructor}
                      onReleaseNow={() => setReleaseConfirmId(assignment.id)}
                      releasing={releasingAssignmentId === assignment.id}
                      onDelete={isInstructor ? () => setDeleteConfirmId(assignment.id) : undefined}
                    />
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>No unreleased assignments.</p>
              )}
            </div>

            <div>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#111827' }}>
                Released ({releasedAssignments.length})
              </h3>
              {releasedAssignments.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {sortByUpcomingDue(releasedAssignments).map((assignment) => (
                    <AssignmentCard
                      key={assignment.id}
                      assignment={assignment}
                      onClick={canViewAssignments ? () => {
                        window.location.hash = `#course/${courseId}/assignment/${assignment.id}/view`;
                      } : undefined}
                      onDelete={isInstructor ? () => setDeleteConfirmId(assignment.id) : undefined}
                    />
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>No released assignments.</p>
              )}
            </div>

            <div>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#111827' }}>
                Completed ({completedAssignments.length})
              </h3>
              {completedAssignments.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {sortByUpcomingDue(completedAssignments).map((assignment) => (
                    <AssignmentCard
                      key={assignment.id}
                      assignment={assignment}
                      onClick={canViewAssignments ? () => {
                        window.location.hash = `#course/${courseId}/assignment/${assignment.id}/view`;
                      } : undefined}
                      onDelete={isInstructor ? () => setDeleteConfirmId(assignment.id) : undefined}
                    />
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>No completed assignments.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Release Assignment Confirmation Modal */}
      {releaseConfirmId && (
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
            maxWidth: '460px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.25rem', fontWeight: '600', color: '#111827' }}>
              Release Assignment Now?
            </h3>
            <p style={{ margin: '0 0 1.5rem 0', color: '#6b7280', fontSize: '0.875rem', lineHeight: 1.5 }}>
              This will release the assignment to all students enrolled in this course immediately. Do you want to continue?
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setReleaseConfirmId(null)}
                disabled={releasingAssignmentId === releaseConfirmId}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: releasingAssignmentId === releaseConfirmId ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleReleaseNow(releaseConfirmId)}
                disabled={releasingAssignmentId === releaseConfirmId}
                style={{
                  padding: '0.5rem 1rem',
                  background: releasingAssignmentId === releaseConfirmId ? '#93c5fd' : '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: releasingAssignmentId === releaseConfirmId ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                {releasingAssignmentId === releaseConfirmId ? 'Releasing...' : 'Release Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Assignment Confirmation Modal */}
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
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.25rem', fontWeight: '600', color: '#111827' }}>
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
                  fontWeight: '500'
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
                  fontWeight: '500'
                }}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Course Modal */}
      {showEditModal && renderEditModal()}
    </div>
  );
}