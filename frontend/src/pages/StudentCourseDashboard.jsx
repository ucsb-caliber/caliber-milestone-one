import React, { useEffect, useState } from 'react';
import { getCourse, getAllUsers, getAssignmentProgress } from '../api';
import { formatPacificDateTime, parseScheduleDate, parseUtcTimestamp } from '../utils/datetime';
import { CourseDashboardBackButton, CourseDashboardSpinnerState, dashboardPalette } from '../components/CourseDashboardUI';

const DAY_MS = 1000 * 60 * 60 * 24;

function formatDateObject(dateObj) {
  return formatPacificDateTime(dateObj, { kind: 'schedule' }) || 'Not set';
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
    const releaseDate = parseScheduleDate(assignment.release_date);
    return releaseDate ? releaseDate <= now : true;
  });

  const getSortDueTime = (assignment) => {
    const dueSoft = parseScheduleDate(assignment.due_date_soft);
    const dueHard = parseScheduleDate(assignment.due_date_hard);
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
                submitted_at: progress?.submitted_at || (isSubmitted ? progress?.updated_at : null) || null,
                score_earned: progress?.score_earned,
                score_total: progress?.score_total,
              }
            ];
          } catch (err) {
            return [assignment.id, { submitted: false, submitted_at: null, score_earned: null, score_total: null }];
          }
        })
      );

      setSubmissionByAssignmentId(Object.fromEntries(statusEntries));
      setSubmissionStatusLoaded(true);
    }

    loadSubmissionStatus();
  }, [course]);

  const timelineWithMeta = timelineAssignments.map((assignment) => {
    const releaseDate = parseScheduleDate(assignment.release_date);
    const softDueDate = parseScheduleDate(assignment.due_date_soft);
    const hardDueDate = parseScheduleDate(assignment.due_date_hard);
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

  const isAssignmentSubmitted = (assignmentId) => Boolean(submissionByAssignmentId[assignmentId]?.submitted);

  const timelineInProgressOrLate = timelineWithMeta.filter(
    (item) => !isAssignmentSubmitted(item.assignment.id) && (item.isInProgress || item.isLate)
  );
  const timelineCompleted = timelineWithMeta.filter(
    (item) => item.isClosed || isAssignmentSubmitted(item.assignment.id)
  );

  const styles = {
    container: {
      maxWidth: '1180px',
      margin: '0 auto',
      padding: '24px'
    },
    header: {
      marginBottom: '24px'
    },
    title: {
      margin: 0,
      fontSize: '1.75rem',
      fontWeight: '700',
      color: dashboardPalette.navy
    },
    subtitle: {
      margin: '8px 0 0 0',
      fontSize: '0.95rem',
      color: dashboardPalette.muted
    },
    section: {
      background: dashboardPalette.white,
      borderRadius: '8px',
      padding: '24px',
      marginBottom: '24px',
      border: `1px solid ${dashboardPalette.border}`
    },
    sectionTitle: {
      margin: '0 0 16px 0',
      fontSize: '1.125rem',
      fontWeight: '600',
      color: dashboardPalette.navy
    },
    infoRow: {
      display: 'flex',
      padding: '12px 0',
      borderBottom: `1px solid ${dashboardPalette.border}`
    },
    infoLabel: {
      width: '140px',
      fontWeight: '600',
      color: dashboardPalette.text
    },
    infoValue: {
      color: dashboardPalette.muted
    },
    cardGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: '14px'
    },
    timelineCard: {
      border: `1px solid ${dashboardPalette.border}`,
      background: dashboardPalette.white,
      borderRadius: '8px',
      padding: '14px',
      cursor: 'pointer',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '228px',
      position: 'relative'
    },
    cardAccent: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '3px',
      borderTopLeftRadius: '8px',
      borderTopRightRadius: '8px',
    },
    cardTopRow: {
      marginBottom: '10px'
    },
    cardMetaRow: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: '8px',
      minWidth: 0,
      minHeight: '48px'
    },
    sectionHeaderButton: {
      width: '100%',
      border: 'none',
      background: 'transparent',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 0,
      margin: '0 0 12px 0',
      cursor: 'pointer'
    },
    sectionHeaderTitle: {
      margin: 0,
      fontSize: '0.95rem',
      fontWeight: 700,
      color: dashboardPalette.text
    },
    sectionHeaderArrow: {
      color: dashboardPalette.muted,
      fontSize: '0.95rem',
      fontWeight: 700,
      lineHeight: 1
    },
    cardHeader: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      minWidth: 0,
      flex: 1
    },
    cardTitle: {
      margin: 0,
      fontSize: '1rem',
      fontWeight: 700,
      color: dashboardPalette.text,
      lineHeight: 1.3,
      display: '-webkit-box',
      WebkitLineClamp: 2,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden'
    },
    cardSubtitle: {
      margin: 0,
      fontSize: '0.78rem',
      color: dashboardPalette.muted,
      lineHeight: 1.4
    },
    tagRow: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '5px',
      flexWrap: 'wrap',
      minWidth: 0,
      overflow: 'visible',
      minHeight: '48px',
      alignContent: 'flex-start'
    },
    typeTag: {
      fontSize: '0.68rem',
      fontWeight: 600,
      color: dashboardPalette.navy,
      background: dashboardPalette.surface,
      border: `1px solid ${dashboardPalette.border}`,
      borderRadius: '999px',
      padding: '2px 7px',
      whiteSpace: 'nowrap'
    },
    statusPill: {
      fontSize: '0.68rem',
      fontWeight: 700,
      borderRadius: '999px',
      padding: '2px 7px',
      whiteSpace: 'nowrap'
    },
    cardBody: {
      display: 'grid',
      gap: '8px',
      marginTop: '10px'
    },
    metaList: {
      display: 'grid',
      gap: '6px'
    },
    metaRow: {
      display: 'grid',
      gridTemplateColumns: '72px minmax(0, 1fr)',
      gap: '10px',
      alignItems: 'start',
      paddingTop: '6px',
      borderTop: `1px solid ${dashboardPalette.border}`
    },
    metaLabel: {
      fontSize: '0.68rem',
      fontWeight: 700,
      color: dashboardPalette.muted,
      textTransform: 'uppercase',
      letterSpacing: '0.02em'
    },
    metaValue: {
      fontSize: '0.8rem',
      fontWeight: 600,
      color: dashboardPalette.text,
      lineHeight: 1.35
    },
    infoButton: {
      width: '22px',
      height: '22px',
      borderRadius: '999px',
      border: `1px solid ${dashboardPalette.border}`,
      background: dashboardPalette.white,
      color: dashboardPalette.muted,
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
      background: dashboardPalette.white,
      border: `1px solid ${dashboardPalette.border}`,
      borderRadius: '8px',
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
      color: dashboardPalette.muted,
      fontWeight: 700
    },
    infoPopoverValue: {
      color: dashboardPalette.text,
      lineHeight: 1.35
    },
    emptyState: {
      background: dashboardPalette.surface,
      borderRadius: '8px',
      padding: '32px',
      textAlign: 'center',
      border: `1px dashed ${dashboardPalette.border}`
    },
    error: {
      padding: '12px 14px',
      borderRadius: '8px',
      background: dashboardPalette.dangerBg,
      color: dashboardPalette.dangerText,
      border: `1px solid ${dashboardPalette.dangerBorder}`
    },
    actionButtons: {
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap',
      marginTop: 'auto',
      paddingTop: '12px',
      borderTop: `1px solid ${dashboardPalette.border}`
    },
    startButton: {
      border: `1px solid ${dashboardPalette.navy}`,
      borderRadius: '8px',
      background: dashboardPalette.navy,
      color: dashboardPalette.white,
      padding: '0 11px',
      height: '32px',
      cursor: 'pointer',
      fontWeight: 600,
      fontSize: '0.74rem',
    },
    editButton: {
      border: `1px solid ${dashboardPalette.navy}`,
      borderRadius: '8px',
      background: dashboardPalette.navy,
      color: dashboardPalette.white,
      padding: '0 11px',
      height: '32px',
      cursor: 'pointer',
      fontWeight: 600,
      fontSize: '0.74rem',
    },
    viewButton: {
      border: `1px solid ${dashboardPalette.border}`,
      borderRadius: '8px',
      background: dashboardPalette.white,
      color: dashboardPalette.text,
      padding: '0 11px',
      height: '32px',
      cursor: 'pointer',
      fontWeight: 600,
      fontSize: '0.74rem',
    }
  };

  const getSubmissionMeta = (assignmentId) => (
    submissionByAssignmentId[assignmentId] || { submitted: false, submitted_at: null, score_earned: null, score_total: null }
  );

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown';
    return formatPacificDateTime(timestamp, { kind: 'event' }) || 'Unknown';
  };

  const formatDueSummary = (dateObj) => {
    return formatPacificDateTime(dateObj, {
      kind: 'schedule',
      month: 'short',
      day: 'numeric',
      year: undefined,
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }) || 'No due date';
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
    params.set('from', window.location.hash || `#student-course/${courseId}`);
    const query = params.toString();
    window.location.hash = query
      ? `#student-course/${courseId}/assignment/${assignmentId}?${query}`
      : `#student-course/${courseId}/assignment/${assignmentId}`;
  };

  const handleAssignmentClick = (assignment, progress) => {
    setActiveInfoAssignmentId(null);
    if (progress?.submitted) {
      const hardDue = parseScheduleDate(assignment?.due_date_hard);
      const softDue = parseScheduleDate(assignment?.due_date_soft);
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

  const handleBack = () => {
    window.location.hash = '#student-courses';
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

  if (error) {
    return (
      <div style={styles.container}>
        <CourseDashboardBackButton onClick={handleBack} style={{ marginBottom: '16px' }}>
          Back
        </CourseDashboardBackButton>
        <div style={styles.error}>{error}</div>
      </div>
    );
  }

  if (!course) {
    return (
      <div style={styles.container}>
        <CourseDashboardBackButton onClick={handleBack} style={{ marginBottom: '16px' }}>
          Back
        </CourseDashboardBackButton>
        <p>Course not found</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <CourseDashboardBackButton onClick={handleBack} style={{ marginBottom: '16px' }}>
        Back
      </CourseDashboardBackButton>

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
            <h3 style={{ margin: '0 0 0.5rem 0', color: dashboardPalette.text }}>No Released Assignments</h3>
            <p style={{ margin: 0, color: dashboardPalette.muted }}>
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
                  <p style={{ margin: 0, color: dashboardPalette.muted, fontSize: '0.875rem' }}>{section.emptyLabel}</p>
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
                      const submittedAtDate = parseUtcTimestamp(progress.submitted_at);
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
                        cardStatusStyle = {};
                      } else if (progress.submitted) {
                        cardStatusStyle = {};
                      } else if (unsubmittedPastDue) {
                        cardStatusStyle = {};
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
                      const cardAccentColor = submittedLateBeforeHardDue
                        ? '#eab308'
                        : progress.submitted
                          ? '#22c55e'
                          : unsubmittedPastDue
                            ? '#ef4444'
                            : dashboardPalette.navy;
                      const availabilityLabel = item.isClosed
                        ? 'Closed assignment'
                        : item.isLate
                          ? 'Late submissions still accepted'
                          : progress.submitted
                            ? 'Submitted and available to review'
                            : 'Ready to start';

                      return (
                        <div
                          key={item.assignment.id}
                          style={{ ...styles.timelineCard, ...cardStatusStyle }}
                          onClick={() => handleAssignmentClick(item.assignment, progress)}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = cardAccentColor;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = dashboardPalette.border;
                          }}
                        >
                          <div style={{ ...styles.cardAccent, background: cardAccentColor }} />
                          <div style={styles.cardTopRow}>
                            <div style={styles.cardHeader}>
                              <div style={styles.cardMetaRow}>
                                <div style={styles.tagRow}>
                                  <span style={styles.typeTag}>{item.assignment.type}</span>
                                  {submissionBadge && (
                                    <span style={{ ...styles.statusPill, color: submissionBadge.color, background: submissionBadge.background }}>
                                      {submissionBadge.label}
                                    </span>
                                  )}
                                  {item.assignment.grade_released && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const params = new URLSearchParams();
                                        params.set('view', 'grade');
                                        params.set('from', window.location.hash || `#student-course/${courseId}`);
                                        window.location.hash = `#student-course/${courseId}/assignment/${item.assignment.id}?${params.toString()}`;
                                      }}
                                      style={{ ...styles.statusPill, color: dashboardPalette.navy, background: dashboardPalette.surface, border: `1px solid ${dashboardPalette.border}`, cursor: 'pointer' }}
                                    >
                                      Grades released
                                    </button>
                                  )}
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
                              <h3 style={styles.cardTitle}>{item.assignment.title}</h3>
                              <p style={styles.cardSubtitle}>
                                {availabilityLabel}
                              </p>
                            </div>
                          </div>

                          <div style={styles.cardBody}>
                            <div style={styles.metaList}>
                              <div style={{ ...styles.metaRow, borderTop: 'none', paddingTop: 0 }}>
                                <div style={styles.metaLabel}>Due</div>
                                <div style={styles.metaValue}>{formatDueSummary(item.softDueDate || item.dueDate)}</div>
                              </div>
                              <div style={styles.metaRow}>
                                <div style={styles.metaLabel}>Late Due</div>
                                <div style={styles.metaValue}>{formatDueSummary(item.hardDueDate)}</div>
                              </div>
                              {item.assignment.grade_released && progress.score_earned != null && progress.score_total != null && (
                                <div style={styles.metaRow}>
                                  <div style={styles.metaLabel}>Score</div>
                                  <div style={styles.metaValue}>
                                    {Math.round(Number(progress.score_earned) * 100) / 100} / {Math.round(Number(progress.score_total) * 100) / 100}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={styles.actionButtons}>
                            {canStart && (
                              <button
                                style={styles.startButton}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAssignmentClick(item.assignment, progress);
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = dashboardPalette.navyMid;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = dashboardPalette.navy;
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
                                  e.currentTarget.style.background = dashboardPalette.surface;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = dashboardPalette.white;
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
                                  e.currentTarget.style.background = dashboardPalette.navyMid;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = dashboardPalette.navy;
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
                  <hr style={{ border: 0, borderTop: `1px solid ${dashboardPalette.border}`, margin: '12px 0 16px 0' }} />
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
            background: dashboardPalette.white,
            width: 'min(520px, 92vw)',
            borderRadius: '8px',
            padding: '20px',
            border: `1px solid ${dashboardPalette.border}`
          }}>
            <h3 style={{ margin: '0 0 0.75rem 0', color: dashboardPalette.text }}>
              {resubmitAllowed ? 'Re-submit this assignment?' : 'Assignment already submitted'}
            </h3>
            <p style={{ margin: '0 0 0.5rem 0', color: dashboardPalette.text, lineHeight: 1.45 }}>
              You already submitted <strong>{resubmitModalAssignment.title}</strong> on{' '}
              <strong>{formatTimestamp(resubmitModalTimestamp)}</strong>.
            </p>
            <p style={{ margin: '0 0 1rem 0', color: dashboardPalette.muted, fontSize: '0.9rem' }}>
              {resubmitAllowed
                ? 'You can submit again because the late due date has not passed yet.'
                : 'This assignment is read-only because the late due date has passed.'}
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
                  border: `1px solid ${dashboardPalette.border}`,
                  borderRadius: '8px',
                  background: dashboardPalette.white,
                  color: dashboardPalette.text,
                  padding: '0 12px',
                  height: '36px',
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
                    border: `1px solid ${dashboardPalette.navy}`,
                    borderRadius: '8px',
                    background: dashboardPalette.navy,
                    color: dashboardPalette.white,
                    padding: '0 12px',
                    height: '36px',
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
            background: dashboardPalette.white,
            width: 'min(460px, 92vw)',
            borderRadius: '8px',
            padding: '20px',
            border: `1px solid ${dashboardPalette.border}`
          }}>
            <h3 style={{ margin: '0 0 0.6rem 0', color: dashboardPalette.text }}>
              {submissionNotice.assignmentTitle} {submissionNotice.type}
            </h3>
            <p style={{ margin: '0 0 0.95rem 0', color: dashboardPalette.text, lineHeight: 1.45 }}>
              {submissionNotice.assignmentTitle} {submissionNotice.type} at{' '}
              <strong>{formatTimestamp(submissionNotice.submittedAt)}</strong>.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSubmissionNotice(null)}
                style={{
                  border: `1px solid ${dashboardPalette.navy}`,
                  borderRadius: '8px',
                  background: dashboardPalette.navy,
                  color: dashboardPalette.white,
                  padding: '0 12px',
                  height: '36px',
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
