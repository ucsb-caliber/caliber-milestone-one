import React, { useEffect, useState } from 'react';
import { getCourse, getAllUsers } from '../api';

export default function StudentCourseDashboard() {
  const [course, setCourse] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const getCourseIdFromHash = () => {
    const hash = window.location.hash;
    const match = hash.match(/#student-course\/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  };

  const courseId = getCourseIdFromHash();

  useEffect(() => {
    async function loadData() {
      if (!courseId) {
        setError('No course ID specified');
        setLoading(false);
        return;
      }

      try {
        const [courseData, usersData] = await Promise.all([
          getCourse(courseId),
          getAllUsers()
        ]);

        setCourse(courseData);
        setAllUsers(usersData.users || []);
      } catch (err) {
        setError(err.message || 'Failed to load course');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [courseId]);

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Not set';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getInstructorName = () => {
    if (!course?.instructor_id) return 'Unknown';
    const instructor = allUsers.find((u) => u.user_id === course.instructor_id);
    if (!instructor) return 'Unknown';
    if (instructor.first_name && instructor.last_name) {
      return `${instructor.first_name} ${instructor.last_name}`;
    }
    return instructor.email || instructor.user_id;
  };

  const getCurrentAssignments = () => {
    const now = new Date();
    const assignments = course?.assignments || [];
    return assignments.filter((assignment) => {
      const releaseDate = assignment.release_date ? new Date(assignment.release_date) : null;
      const hardDueDate = assignment.due_date_hard ? new Date(assignment.due_date_hard) : null;
      const isReleased = !releaseDate || releaseDate <= now;
      const isNotExpired = !hardDueDate || hardDueDate >= now;
      return isReleased && isNotExpired;
    });
  };

  const currentAssignments = getCurrentAssignments();

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
      color: '#111827'
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
      color: '#6b7280'
    },
    assignmentList: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem'
    },
    assignmentCard: {
      padding: '1rem',
      background: '#f9fafb',
      borderRadius: '8px',
      border: '1px solid #e5e7eb',
      cursor: 'pointer',
      transition: 'all 0.15s'
    },
    assignmentTitle: {
      margin: 0,
      fontSize: '1rem',
      fontWeight: '600',
      color: '#111827'
    },
    assignmentType: {
      padding: '0.25rem 0.5rem',
      background: '#eef2ff',
      color: '#4f46e5',
      borderRadius: '4px',
      fontSize: '0.75rem',
      fontWeight: '600'
    },
    emptyState: {
      background: '#f9fafb',
      borderRadius: '12px',
      padding: '3rem',
      textAlign: 'center',
      border: '2px dashed #d1d5db'
    },
    error: {
      padding: '1rem',
      borderRadius: '8px',
      background: '#fee2e2',
      color: '#dc2626'
    }
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
        <a href="#student-courses" style={styles.backLink}>← Back to Student View</a>
        <div style={styles.error}>{error}</div>
      </div>
    );
  }

  if (!course) {
    return (
      <div style={styles.container}>
        <a href="#student-courses" style={styles.backLink}>← Back to Student View</a>
        <p>Course not found</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <a href="#student-courses" style={styles.backLink}>← Back to Student View</a>

      <div style={styles.header}>
        <h1 style={styles.title}>{course.course_name}</h1>
        <p style={styles.subtitle}>{course.school_name || 'No school specified'}</p>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Course Information</h2>
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>Instructor</span>
          <span style={styles.infoValue}>{getInstructorName()}</span>
        </div>
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>Assignments</span>
          <span style={styles.infoValue}>{currentAssignments.length} current</span>
        </div>
        <div style={{ ...styles.infoRow, borderBottom: 'none' }}>
          <span style={styles.infoLabel}>Course Code</span>
          <span style={styles.infoValue}>{course.course_code || 'Not set'}</span>
        </div>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Current Assignments ({currentAssignments.length})</h2>
        {currentAssignments.length > 0 ? (
          <div style={styles.assignmentList}>
            {currentAssignments.map((assignment) => (
              <div
                key={assignment.id}
                style={styles.assignmentCard}
                onClick={() => {
                  window.location.hash = `#student-course/${courseId}/assignment/${assignment.id}`;
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f3f4f6';
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f9fafb';
                  e.currentTarget.style.borderColor = '#e5e7eb';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                  <h3 style={styles.assignmentTitle}>{assignment.title}</h3>
                  <span style={styles.assignmentType}>{assignment.type}</span>
                </div>
                {assignment.description && (
                  <p style={{ margin: '0.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>
                    {assignment.description}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                  {assignment.release_date && (
                    <div><strong>Released:</strong> {formatDate(assignment.release_date)}</div>
                  )}
                  {assignment.due_date_soft && (
                    <div><strong>Due:</strong> {formatDate(assignment.due_date_soft)}</div>
                  )}
                  {assignment.assignment_questions?.length > 0 && (
                    <div><strong>Questions:</strong> {assignment.assignment_questions.length}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.emptyState}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#374151' }}>No Current Assignments</h3>
            <p style={{ margin: 0, color: '#6b7280' }}>
              There are no assignments currently released for this course.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
