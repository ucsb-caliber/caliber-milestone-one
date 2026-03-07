import React, { useEffect, useState } from 'react';
import { getCourse, getAllUsers, getAssignmentProgress } from '../api';

const DAY_MS = 1000 * 60 * 60 * 24;
const PACIFIC_TIMEZONE = 'America/Los_Angeles';

function parseAssignmentDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr);
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

export default function StudentCourseDashboard() {
  const [course, setCourse] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [activeInfoAssignmentId, setActiveInfoAssignmentId] = useState(null);
  const [collapsedSections, setCollapsedSections] = useState({
    'in-progress': false,
    completed: false
  });
  const [submissionByAssignmentId, setSubmissionByAssignmentId] = useState({});
  const [resubmitModalAssignment, setResubmitModalAssignment] = useState(null);
  const [resubmitModalTimestamp, setResubmitModalTimestamp] = useState(null);
  const [resubmitAllowed, setResubmitAllowed] = useState(false);
  const [resubmitPenaltyWarning, setResubmitPenaltyWarning] = useState(false);
  const [submissionNotice, setSubmissionNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submissionStatusLoaded, setSubmissionStatusLoaded] = useState(false);


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
      setSubmissionStatusLoaded(true);
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
    cardGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: '1.2rem'
    },
    timelineCard: {
      border: '1px solid #dbeafe',
      background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
      borderRadius: '16px',
      padding: '1.2rem',
      cursor: 'pointer',
      transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
      display: 'flex',
      flexDirection: 'column',
      height: '235px',
      position: 'relative'
    },
    sectionHeaderButton: {
      width: '100%',
      border: 'none',
      background: 'transparent',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 0,
      margin: '0 0 0.65rem 0',
      cursor: 'pointer'
    },
    sectionHeaderTitle: {
      margin: 0,
      fontSize: '0.95rem',
      fontWeight: 700,
      color: '#0f172a'
    },
    sectionHeaderArrow: {
      color: '#64748b',
      fontSize: '0.95rem',
      fontWeight: 700,
      lineHeight: 1
    },
    cardHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '0.8rem'
    },
    cardTitle: {
      margin: 0,
      fontSize: '1.05rem',
      fontWeight: 700,
      color: '#0f172a',
      lineHeight: 1.3,
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden'
    },
    tagRow: {
      marginTop: '0.5rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.4rem',
      flexWrap: 'wrap'
    },
    typeTag: {
      fontSize: '0.72rem',
      fontWeight: 600,
      color: '#1d4ed8',
      background: '#dbeafe',
      borderRadius: '999px',
      padding: '0.16rem 0.46rem'
    },
    dueLabel: {
      fontSize: '0.74rem',
      fontWeight: 700,
      color: '#64748b',
      textTransform: 'uppercase',
      letterSpacing: '0.02em',
      marginTop: '0.9rem',
      marginBottom: '0.2rem'
    },
    dueValue: {
      fontSize: '0.88rem',
      color: '#1f2937',
      fontWeight: 600
    },
    infoButton: {
      width: '24px',
      height: '24px',
      borderRadius: '999px',
      border: '1px solid #cbd5e1',
      background: 'white',
      color: '#475569',
      fontSize: '0.78rem',
      fontWeight: 700,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      lineHeight: 1
    },
    infoPopover: {
      position: 'absolute',
      top: '32px',
      right: 0,
      width: 'min(300px, 78vw)',
      background: 'white',
      border: '1px solid #dbeafe',
      borderRadius: '10px',
      boxShadow: '0 12px 24px rgba(15, 23, 42, 0.16)',
      padding: '0.7rem 0.78rem',
      zIndex: 5
    },
    infoPopoverRow: {
      display: 'grid',
      gridTemplateColumns: '80px 1fr',
      gap: '0.45rem',
      alignItems: 'start',
      marginBottom: '0.45rem',
      fontSize: '0.78rem'
    },
    infoPopoverLabel: {
      color: '#475569',
      fontWeight: 700
    },
    infoPopoverValue: {
      color: '#111827',
      lineHeight: 1.35
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
    },
    actionButtons: {
      display: 'flex',
      gap: '0.5rem',
      flexWrap: 'wrap',
      marginTop: 'auto'
    },
    startButton: {
      border: 'none',
      borderRadius: '8px',
      background: '#2563eb',
      color: 'white',
      padding: '0.45rem 0.75rem',
      cursor: 'pointer',
      fontWeight: 600,
      fontSize: '0.75rem',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
    },
    editButton: {
      border: 'none',
      borderRadius: '8px',
      background: '#2563eb',
      color: 'white',
      padding: '0.45rem 0.75rem',
      cursor: 'pointer',
      fontWeight: 600,
      fontSize: '0.75rem',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
    },
    viewButton: {
      border: 'none',
      borderRadius: '8px',
      background: '#1f2937',
      color: 'white',
      padding: '0.45rem 0.75rem',
      cursor: 'pointer',
      fontWeight: 600,
      fontSize: '0.75rem',
      transition: 'all 0.2s ease'
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

  const formatDueSummary = (dateObj) => {
    if (!dateObj) return 'No due date';
    return dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: PACIFIC_TIMEZONE,
      timeZoneName: 'short'
    });
  };

  const getRemainingInfoLabel = (item) => {
    if (item.isClosed) return 'Closed';
    return `${item.remainingTimePrefix} ${item.remainingTimeLabel}`;
  };

  const toggleSectionCollapsed = (sectionKey) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const openAssignment = (assignmentId, resubmit = false, readOnly = false) => {
    setActiveInfoAssignmentId(null);
    const params = new URLSearchParams();
    if (resubmit) params.set('resubmit', '1');
    if (readOnly) params.set('readonly', '1');
    const query = params.toString();
    window.location.hash = query
      ? `#student-course/${courseId}/assignment/${assignmentId}?${query}`
      : `#student-course/${courseId}/assignment/${assignmentId}`;
  };

  const handleAssignmentClick = (assignment, progress) => {
    setActiveInfoAssignmentId(null);
    if (progress?.submitted) {
      const hardDue = parseAssignmentDate(assignment?.due_date_hard);
      const softDue = parseAssignmentDate(assignment?.due_date_soft);
      const canResubmit = !hardDue || now.getTime() <= hardDue.getTime();
      const incursLatePenalty = canResubmit && softDue && now.getTime() > softDue.getTime();

      setResubmitModalAssignment(assignment);
      setResubmitModalTimestamp(progress?.submitted_at || null);
      setResubmitAllowed(Boolean(canResubmit));
      setResubmitPenaltyWarning(Boolean(incursLatePenalty));
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
                <button
                  type="button"
                  style={styles.sectionHeaderButton}
                  onClick={() => toggleSectionCollapsed(section.key)}
                >
                  <h3 style={styles.sectionHeaderTitle}>{section.title}</h3>
                  <span style={styles.sectionHeaderArrow}>
                    {collapsedSections[section.key] ? '▸' : '▾'}
                  </span>
                </button>
                {collapsedSections[section.key] ? null : section.items.length === 0 ? (
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>{section.emptyLabel}</p>
                ) : (
                  <div style={styles.cardGrid}>
                    {section.items.map((item) => {
                      const progress = getSubmissionMeta(item.assignment.id);
                      const canStart =
                        submissionStatusLoaded &&
                        !progress.submitted &&
                        !item.isClosed;

                      const canEdit =
                        submissionStatusLoaded &&
                        progress.submitted &&
                        !item.isClosed;

                      const showViewSubmittedButton =
                        submissionStatusLoaded &&
                        (section.key === 'completed' || Boolean(progress.submitted));

                      let cardStatusStyle = {};
                      const submittedAtDate = parseAssignmentDate(progress.submitted_at);
                      const submittedAtMs = submittedAtDate ? submittedAtDate.getTime() : null;
                      const softDueMs = item.softDueDate ? item.softDueDate.getTime() : null;
                      const hardDueMs = item.hardDueDate ? item.hardDueDate.getTime() : null;
                      const nowMs = now.getTime();

                      const submittedLateBeforeHardDue =
                        Boolean(progress.submitted) &&
                        softDueMs !== null &&
                        submittedAtMs !== null &&
                        submittedAtMs > softDueMs &&
                        (hardDueMs === null || submittedAtMs <= hardDueMs);
                      const unsubmittedPastDue =
                        !progress.submitted &&
                        softDueMs !== null &&
                        nowMs >= softDueMs;

                      if (submittedLateBeforeHardDue) {
                        cardStatusStyle = {
                          background: '#fffdf2',
                          borderColor: '#fde68a',
                        };
                      } else if (progress.submitted) {
                        cardStatusStyle = {
                          background: '#f5fdf8',
                          borderColor: '#a7f3d0',
                        };
                      } else if (unsubmittedPastDue) {
                        cardStatusStyle = {
                          background: '#fff5f5',
                          borderColor: '#fecaca',
                        };
                      }

                      let submissionBadge = null;
                      if (submissionStatusLoaded) {
                        if (submittedLateBeforeHardDue) {
                          submissionBadge = {
                            label: 'Submitted Late',
                            color: '#a16207',
                            background: '#fef3c7',
                          };
                        } else if (progress.submitted) {
                          submissionBadge = {
                            label: 'Submitted',
                            color: '#065f46',
                            background: '#d1fae5',
                          };
                        } else {
                          submissionBadge = {
                            label: 'Not Submitted',
                            color: '#b91c1c',
                            background: '#fee2e2',
                          };
                        }
                      }

                      const isInfoOpen = activeInfoAssignmentId === item.assignment.id;

                      return (
                        <div
                          key={item.assignment.id}
                          style={{ ...styles.timelineCard, ...cardStatusStyle }}
                          onClick={() => handleAssignmentClick(item.assignment, progress)}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 10px 20px rgba(15, 23, 42, 0.10)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          <div style={styles.cardHeader}>
                            <div style={{ minWidth: 0 }}>
                              <h3 style={styles.cardTitle}>{item.assignment.title}</h3>
                              <div style={styles.tagRow}>
                                <span style={styles.typeTag}>{item.assignment.type}</span>
                                {submissionBadge && (
                                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: submissionBadge.color, background: submissionBadge.background, borderRadius: '999px', padding: '0.16rem 0.46rem' }}>
                                    {submissionBadge.label}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div style={{ position: 'relative', flexShrink: 0 }}>
                              <button
                                style={styles.infoButton}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveInfoAssignmentId(isInfoOpen ? null : item.assignment.id);
                                }}
                                title="Assignment timing details"
                              >
                                i
                              </button>
                              {isInfoOpen && (
                                <div
                                  style={styles.infoPopover}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div style={styles.infoPopoverRow}>
                                    <span style={styles.infoPopoverLabel}>Release</span>
                                    <span style={styles.infoPopoverValue}>{formatDateObject(item.releaseDate)}</span>
                                  </div>
                                  <div style={styles.infoPopoverRow}>
                                    <span style={styles.infoPopoverLabel}>Due</span>
                                    <span style={styles.infoPopoverValue}>{formatDateObject(item.softDueDate || item.dueDate)}</span>
                                  </div>
                                  <div style={styles.infoPopoverRow}>
                                    <span style={styles.infoPopoverLabel}>Late Due</span>
                                    <span style={styles.infoPopoverValue}>{formatDateObject(item.hardDueDate)}</span>
                                  </div>
                                  <div style={{ ...styles.infoPopoverRow, marginBottom: 0 }}>
                                    <span style={styles.infoPopoverLabel}>Remaining</span>
                                    <span style={styles.infoPopoverValue}>{getRemainingInfoLabel(item)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={styles.dueLabel}>Due Date</div>
                          <div style={styles.dueValue}>{formatDueSummary(item.softDueDate || item.dueDate)}</div>

                          <div style={styles.actionButtons}>
                            {canStart && (
                              <button
                                style={styles.startButton}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAssignmentClick(item.assignment, progress);
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#1d4ed8';
                                  e.currentTarget.style.transform = 'translateY(-1px)';
                                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(37, 99, 235, 0.25)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#2563eb';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                  e.currentTarget.style.boxShadow = 'none';
                                }}
                              >
                                Start
                              </button>
                            )}

                            {showViewSubmittedButton && (
                              <button
                                style={styles.viewButton}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAssignment(item.assignment.id, false, !progress.submitted);
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#111827';
                                  e.currentTarget.style.transform = 'translateY(-1px)';
                                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(15, 23, 42, 0.25)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#1f2937';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                  e.currentTarget.style.boxShadow = 'none';
                                }}
                              >
                                View
                              </button>
                            )}

                            {canEdit && (
                              <button
                                style={styles.editButton}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAssignmentClick(item.assignment, progress);
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#1d4ed8';
                                  e.currentTarget.style.transform = 'translateY(-1px)';
                                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(37, 99, 235, 0.25)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#2563eb';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                  e.currentTarget.style.boxShadow = 'none';
                                }}
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
          top: '72px',
          left: 0,
          right: 0,
          bottom: 0,
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
              {resubmitAllowed ? 'Re-submit this assignment?' : 'Assignment already submitted'}
            </h3>
            <p style={{ margin: '0 0 0.5rem 0', color: '#374151', lineHeight: 1.45 }}>
              You already submitted <strong>{resubmitModalAssignment.title}</strong> on{' '}
              <strong>{formatTimestamp(resubmitModalTimestamp)}</strong>.
            </p>
            <p style={{ margin: '0 0 1rem 0', color: '#6b7280', fontSize: '0.9rem' }}>
              {resubmitAllowed
                ? 'You can submit again because the hard due date has not passed yet.'
                : 'This assignment is read-only because the hard due date has passed.'}
            </p>
            {resubmitPenaltyWarning && (
              <p style={{ margin: '0 0 1rem 0', color: '#b45309', fontSize: '0.9rem', fontWeight: 600 }}>
                Warning: resubmitting now will incur a late penalty.
              </p>
            )}
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
               {resubmitAllowed && (
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
              )}
            </div>
          </div>
        </div>
      )
      }

      {submissionNotice && (
        <div style={{
          position: 'fixed',
          top: '72px',
          left: 0,
          right: 0,
          bottom: 0,
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
