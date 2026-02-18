import React, { useEffect, useState } from 'react';
import { getCourse, getAllUsers, getAssignmentProgress } from '../api';
import AssignmentCard from '../components/AssignmentCard';

export default function StudentCourseDashboard() {
  const [course, setCourse] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [submissionByAssignmentId, setSubmissionByAssignmentId] = useState({});
  const [resubmitModalAssignment, setResubmitModalAssignment] = useState(null);
  const [resubmitModalTimestamp, setResubmitModalTimestamp] = useState(null);
  const [submissionNotice, setSubmissionNotice] = useState(null);
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

  useEffect(() => {
    const hash = window.location.hash;
    const queryIndex = hash.indexOf('?');
    if (queryIndex === -1) return;

    const params = new URLSearchParams(hash.slice(queryIndex + 1));
    const submissionType = params.get('submission');
    const submittedAt = params.get('submitted_at');
    const assignmentTitle = params.get('assignment_title');
    if (!submissionType || !submittedAt) return;

    const normalizedType = submissionType === 'resubmitted' ? 'resubmitted' : 'submitted';
    setSubmissionNotice({
      type: normalizedType,
      submittedAt,
      assignmentTitle: assignmentTitle || 'Assignment'
    });

    window.location.hash = `#student-course/${courseId}`;
  }, [courseId]);

  const parseAssignmentDate = (dateStr) => {
    if (!dateStr) return null;
    const hasTimezone = /[zZ]|[+-]\d{2}:\d{2}$/.test(dateStr);
    return new Date(hasTimezone ? dateStr : `${dateStr}Z`);
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

  const now = new Date();
  const allAssignments = course?.assignments || [];
  const releasedAssignments = allAssignments.filter((assignment) => {
    if (!assignment.release_date) return true;
    const releaseDate = parseAssignmentDate(assignment.release_date);
    return releaseDate ? releaseDate <= now : true;
  });

  const currentAssignments = releasedAssignments.filter((assignment) => {
    const dueDate = assignment.due_date_soft ? parseAssignmentDate(assignment.due_date_soft) : null;
    return !dueDate || dueDate >= now;
  });

  const completedAssignments = releasedAssignments.filter((assignment) => {
    const dueDate = assignment.due_date_soft ? parseAssignmentDate(assignment.due_date_soft) : null;
    return Boolean(dueDate && dueDate < now);
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

  const sortByMostRecentlyDue = (assignments) => (
    [...assignments].sort((a, b) => getSortDueTime(b) - getSortDueTime(a))
  );

  useEffect(() => {
    async function loadSubmissionStatus() {
      if (!releasedAssignments.length) {
        setSubmissionByAssignmentId({});
        return;
      }

      const statusEntries = await Promise.all(
        releasedAssignments.map(async (assignment) => {
          try {
            const progress = await getAssignmentProgress(assignment.id);
            const isSubmitted = Boolean(progress?.submitted || progress?.submitted_at);
            return [
              assignment.id,
              {
                submitted: isSubmitted,
                submitted_at: progress?.submitted_at || (isSubmitted ? progress?.updated_at : null) || null
              }
            ];
          } catch (err) {
            return [assignment.id, { submitted: false, submitted_at: null }];
          }
        })
      );

      setSubmissionByAssignmentId(Object.fromEntries(statusEntries));
    }

    loadSubmissionStatus();
  }, [course]);

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

  const getSubmissionMeta = (assignmentId) => (
    submissionByAssignmentId[assignmentId] || { submitted: false, submitted_at: null }
  );

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const parsed = parseAssignmentDate(timestamp);
    if (!parsed) return 'Unknown';
    return parsed.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const openAssignment = (assignmentId, resubmit = false) => {
    window.location.hash = resubmit
      ? `#student-course/${courseId}/assignment/${assignmentId}?resubmit=1`
      : `#student-course/${courseId}/assignment/${assignmentId}`;
  };

  const handleAssignmentClick = (assignment, progress) => {
    if (progress?.submitted) {
      setResubmitModalAssignment(assignment);
      setResubmitModalTimestamp(progress?.submitted_at || null);
      return;
    }
    openAssignment(assignment.id, false);
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
        <a href="#student-courses" style={styles.backLink}>← Back to Course Dashboard</a>
        <div style={styles.error}>{error}</div>
      </div>
    );
  }

  if (!course) {
    return (
      <div style={styles.container}>
        <a href="#student-courses" style={styles.backLink}>← Back to Course Dashboard</a>
        <p>Course not found</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <a href="#student-courses" style={styles.backLink}>← Back to Course Dashboard</a>

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
          <span style={styles.infoValue}>{releasedAssignments.length} released</span>
        </div>
        <div style={{ ...styles.infoRow, borderBottom: 'none' }}>
          <span style={styles.infoLabel}>Course Code</span>
          <span style={styles.infoValue}>{course.course_code || 'Not set'}</span>
        </div>
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Assignments ({releasedAssignments.length})</h2>
        {releasedAssignments.length === 0 ? (
          <div style={styles.emptyState}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#374151' }}>No Released Assignments</h3>
            <p style={{ margin: 0, color: '#6b7280' }}>
              There are no assignments released for this course yet.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#111827' }}>
                Current ({currentAssignments.length})
              </h3>
              {currentAssignments.length > 0 ? (
                <div style={styles.assignmentList}>
                  {sortByUpcomingDue(currentAssignments).map((assignment) => {
                    const progress = getSubmissionMeta(assignment.id);
                    return (
                    <AssignmentCard
                      key={assignment.id}
                      assignment={assignment}
                      onClick={() => handleAssignmentClick(assignment, progress)}
                      showSubmitted={true}
                      submitted={Boolean(progress.submitted)}
                      submissionTimestamp={progress.submitted_at}
                    />
                    );
                  })}
                </div>
              ) : (
                <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>No current assignments.</p>
              )}
            </div>

            <div>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: '#111827' }}>
                Completed ({completedAssignments.length})
              </h3>
              {completedAssignments.length > 0 ? (
                <div style={styles.assignmentList}>
                  {sortByMostRecentlyDue(completedAssignments).map((assignment) => {
                    const progress = getSubmissionMeta(assignment.id);
                    return (
                    <AssignmentCard
                      key={assignment.id}
                      assignment={assignment}
                      onClick={() => handleAssignmentClick(assignment, progress)}
                      showSubmitted={true}
                      submitted={Boolean(progress.submitted)}
                      submissionTimestamp={progress.submitted_at}
                    />
                    );
                  })}
                </div>
              ) : (
                <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>No completed assignments.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {resubmitModalAssignment && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            width: 'min(520px, 92vw)',
            borderRadius: '12px',
            padding: '1.25rem',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 0.75rem 0', color: '#111827' }}>
              Re-submit this assignment?
            </h3>
            <p style={{ margin: '0 0 0.5rem 0', color: '#374151', lineHeight: 1.45 }}>
              You already submitted <strong>{resubmitModalAssignment.title}</strong> on{' '}
              <strong>{formatTimestamp(resubmitModalTimestamp)}</strong>.
            </p>
            <p style={{ margin: '0 0 1rem 0', color: '#6b7280', fontSize: '0.9rem' }}>
              Choose <strong>Resubmit</strong> to edit answers. When you leave the assignment page, your latest answers
              will be auto-saved and the submitted time will be updated.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                onClick={() => setResubmitModalAssignment(null)}
                style={{
                  border: 'none',
                  borderRadius: '8px',
                  background: '#f3f4f6',
                  color: '#374151',
                  padding: '0.5rem 0.85rem',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const id = resubmitModalAssignment.id;
                  setResubmitModalAssignment(null);
                  openAssignment(id, false);
                }}
                style={{
                  border: 'none',
                  borderRadius: '8px',
                  background: '#1f2937',
                  color: 'white',
                  padding: '0.5rem 0.85rem',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                View Submitted
              </button>
              <button
                onClick={() => {
                  const id = resubmitModalAssignment.id;
                  setResubmitModalAssignment(null);
                  openAssignment(id, true);
                }}
                style={{
                  border: 'none',
                  borderRadius: '8px',
                  background: '#2563eb',
                  color: 'white',
                  padding: '0.5rem 0.85rem',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Resubmit
              </button>
            </div>
          </div>
        </div>
      )}

      {submissionNotice && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100
        }}>
          <div style={{
            background: 'white',
            width: 'min(460px, 92vw)',
            borderRadius: '12px',
            padding: '1.1rem 1.2rem',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 0.6rem 0', color: '#111827' }}>
              {submissionNotice.assignmentTitle} {submissionNotice.type}
            </h3>
            <p style={{ margin: '0 0 0.95rem 0', color: '#374151', lineHeight: 1.45 }}>
              {submissionNotice.assignmentTitle} {submissionNotice.type} at{' '}
              <strong>{formatTimestamp(submissionNotice.submittedAt)}</strong>.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSubmissionNotice(null)}
                style={{
                  border: 'none',
                  borderRadius: '8px',
                  background: '#2563eb',
                  color: 'white',
                  padding: '0.5rem 0.9rem',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
