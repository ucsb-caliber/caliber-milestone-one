import React, { useEffect, useState } from 'react';
import { getCourse, getAllUsers, getAssignmentProgress } from '../api';

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

export default function StudentCourseDashboard() {
  const [course, setCourse] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [currentTime, setCurrentTime] = useState(() => new Date());
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
    const timerId = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, []);

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

  const getInstructorName = () => {
    if (!course?.instructor_id) return 'Unknown';
    const instructor = allUsers.find((u) => u.user_id === course.instructor_id);
    if (!instructor) return 'Unknown';
    if (instructor.first_name && instructor.last_name) {
      return `${instructor.first_name} ${instructor.last_name}`;
    }
    return instructor.email || instructor.user_id;
  };

  const now = currentTime;
  const allAssignments = course?.assignments || [];
  const releasedAssignments = allAssignments.filter((assignment) => {
    if (!assignment.release_date) return true;
    const releaseDate = parseAssignmentDate(assignment.release_date);
    return releaseDate ? releaseDate <= now : true;
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
  const timelineAssignments = sortByUpcomingDue(releasedAssignments);

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

  const timelineWithMeta = timelineAssignments.map((assignment) => {
    const releaseDate = parseAssignmentDate(assignment.release_date);
    const softDueDate = parseAssignmentDate(assignment.due_date_soft);
    const hardDueDate = parseAssignmentDate(assignment.due_date_hard);
    const dueDate = softDueDate || hardDueDate || null;

    const nowMs = now.getTime();
    const releaseMs = releaseDate ? releaseDate.getTime() : null;
    const softDueMs = softDueDate ? softDueDate.getTime() : null;
    const hardDueMs = hardDueDate ? hardDueDate.getTime() : null;
    const dueMs = dueDate ? dueDate.getTime() : null;

    const isClosed = hardDueMs !== null && nowMs > hardDueMs;
    const isLate = softDueMs !== null && nowMs > softDueMs && !isClosed;
    const isInProgress = !isLate && !isClosed &&
      (releaseMs === null || nowMs >= releaseMs) &&
      (softDueMs === null || nowMs <= softDueMs);

    let status = { label: 'In Progress', tone: '#0f766e', bg: '#ccfbf1' };
    if (isLate || isClosed) {
      status = { label: 'Late', tone: '#b91c1c', bg: '#fef2f2' };
    }

    const timeRemainingPercent = releaseMs && softDueMs && softDueMs > releaseMs
      ? clamp(((nowMs - releaseMs) / (softDueMs - releaseMs)) * 100, 0, 100)
      : null;

    const formatRemainingTime = () => {
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
      releaseDate,
      softDueDate,
      hardDueDate,
      dueDate,
      isLate,
      isInProgress,
      isClosed,
      status,
      timeRemainingPercent,
      remainingTimeLabel: formatRemainingTime(),
      remainingTimePrefix: isLate ? 'Time Remaining (LATE):' : 'Time Remaining:'
    };
  });

  const timelineInProgressOrLate = timelineWithMeta.filter((item) => item.isInProgress || item.isLate);
  const timelineCompleted = timelineWithMeta.filter((item) => item.isClosed);

  const styles = {
    container: {
      maxWidth: '1180px',
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
      borderRadius: '14px',
      padding: '1.25rem',
      marginBottom: '1.1rem',
      boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)',
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
    timelineCard: {
      border: '1px solid #dbeafe',
      background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
      borderRadius: '12px',
      padding: '1.05rem 1.15rem',
      marginBottom: '0.95rem',
      cursor: 'pointer',
      transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s'
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
      minute: '2-digit',
      timeZone: PACIFIC_TIMEZONE,
      timeZoneName: 'short'
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
        <div style={{ marginBottom: '1.15rem' }}>
          <h2 style={{ ...styles.sectionTitle, fontSize: '1.3rem', fontWeight: 800 }}>Assignment Timeline</h2>
        </div>
        {releasedAssignments.length === 0 ? (
          <div style={styles.emptyState}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#374151' }}>No Released Assignments</h3>
            <p style={{ margin: 0, color: '#6b7280' }}>
              There are no assignments released for this course yet.
            </p>
          </div>
        ) : (
          <div>
            {[
              { key: 'in-progress', title: 'In Progress', emptyLabel: 'No In Progress assignments.', items: timelineInProgressOrLate },
              { key: 'completed', title: 'Completed', emptyLabel: 'No Completed assignments.', items: timelineCompleted }
            ].map((section, sectionIndex) => (
              <div key={section.key}>
                <h3 style={{ margin: '0 0 0.65rem 0', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{section.title}</h3>
                {section.items.length === 0 ? (
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>{section.emptyLabel}</p>
                ) : (
                  section.items.map((item) => {
                    const progress = getSubmissionMeta(item.assignment.id);
                    return (
                      <div
                        key={item.assignment.id}
                        style={styles.timelineCard}
                        onClick={() => handleAssignmentClick(item.assignment, progress)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 8px 16px rgba(15, 23, 42, 0.12)';
                          e.currentTarget.style.borderColor = '#bfdbfe';
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
                              {Boolean(progress.submitted) && (
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#065f46', background: '#d1fae5', borderRadius: '999px', padding: '0.15rem 0.45rem' }}>
                                  Submitted
                                </span>
                              )}
                            </div>
                            <div style={{ marginTop: '0.7rem', fontSize: '0.82rem', color: '#475569', display: 'flex', gap: '1.15rem', rowGap: '0.45rem', flexWrap: 'wrap' }}>
                              <span><strong>Release:</strong> {formatAssignmentDate(item.assignment.release_date)}</span>
                              <span><strong>Due Date:</strong> {formatDateObject(item.softDueDate || item.dueDate)}</span>
                              <span><strong>Late Due Date:</strong> {formatDateObject(item.hardDueDate)}</span>
                              <span><strong>Questions:</strong> {item.assignment.assignment_questions?.length || 0}</span>
                            </div>
                          </div>
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
                    );
                  })
                )}
                {sectionIndex < 1 && (
                  <hr style={{ border: 0, borderTop: '1px solid #e2e8f0', margin: '0.85rem 0 1rem 0' }} />
                )}
              </div>
            ))}
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
