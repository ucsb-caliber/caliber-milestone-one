import React, { useState, useEffect } from 'react';
import { getCourse, getAllUsers, getUserInfo, deleteAssignment } from '../api';
import { useAuth } from '../AuthContext';
import { formatPacificDateTime, parseScheduleDate } from '../utils/datetime';
import {
  CourseDashboardBackButton,
  CourseDashboardErrorBanner,
  CourseDashboardHeader,
  CourseDashboardLoadingState,
  CourseDashboardPrimaryButton,
  MutedText,
  PageContainer,
  SurfaceCard,
  dashboardPalette,
} from '../components/CourseDashboardUI';
import { buildHashWithFrom, getFromHash, navigateBackWithFallback } from '../utils/navigation';

const DAY_MS = 1000 * 60 * 60 * 24;

function formatAssignmentDate(dateStr) {
  return formatPacificDateTime(dateStr, { kind: 'schedule' }) || 'Not set';
}

function formatDateObject(dateObj) {
  return formatPacificDateTime(dateObj, { kind: 'schedule' }) || 'Not set';
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
  const currentHash = window.location.hash;
  const fromHash = getFromHash(currentHash);
  const backToCoursesHash = '#courses';
  const canViewAssignments = isInstructor || isAdmin;
  const handleBack = () => {
    navigateBackWithFallback(backToCoursesHash, fromHash);
  };

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

  const styles = {
    section: {
      background: dashboardPalette.white,
      borderRadius: '8px',
      padding: '1.25rem',
      marginBottom: '1.1rem',
      border: `1px solid ${dashboardPalette.border}`,
    },
    sectionTitle: {
      margin: 0,
      fontSize: '1.05rem',
      fontWeight: 700,
      color: dashboardPalette.navy
    },
    mutedText: {
      margin: 0,
      color: dashboardPalette.muted,
      fontSize: '0.9rem'
    },
    infoRow: {
      display: 'flex',
      padding: '0.7rem 0',
      borderBottom: `1px solid ${dashboardPalette.border}`,
      gap: '1rem'
    },
    infoLabel: {
      minWidth: '150px',
      fontWeight: 600,
      color: dashboardPalette.navy
    },
    infoValue: {
      color: dashboardPalette.text,
      flex: 1
    },
    studentGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
      gap: '0.65rem'
    },
    studentCard: {
      padding: '0.75rem 0.9rem',
      background: dashboardPalette.white,
      border: `1px solid ${dashboardPalette.border}`,
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      gap: '0.65rem'
    },
    studentAvatar: {
      width: '36px',
      height: '36px',
      borderRadius: '999px',
      background: dashboardPalette.gold,
      color: dashboardPalette.navy,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 700,
      fontSize: '0.78rem',
      letterSpacing: '0.02em'
    },
    error: {
      marginBottom: '1rem'
    },
    timelineCard: {
      border: `1px solid ${dashboardPalette.border}`,
      background: dashboardPalette.white,
      borderRadius: '8px',
      padding: '1.05rem 1.15rem',
      marginBottom: '0.95rem'
    }
  };

  if (loading) {
    return (
      <PageContainer maxWidth="1200px">
        <CourseDashboardBackButton onClick={handleBack} style={{ marginBottom: '16px' }}>
          Back
        </CourseDashboardBackButton>
        <CourseDashboardLoadingState>Loading course...</CourseDashboardLoadingState>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer maxWidth="1200px">
        <CourseDashboardBackButton onClick={handleBack} style={{ marginBottom: '16px' }}>
          Back
        </CourseDashboardBackButton>
        <CourseDashboardErrorBanner>{error}</CourseDashboardErrorBanner>
      </PageContainer>
    );
  }

  if (!course) {
    return (
      <PageContainer maxWidth="1200px">
        <CourseDashboardBackButton onClick={handleBack} style={{ marginBottom: '16px' }}>
          Back
        </CourseDashboardBackButton>
        <SurfaceCard>
          <MutedText>Course not found.</MutedText>
        </SurfaceCard>
      </PageContainer>
    );
  }

  const now = currentTime;
  const allAssignments = course.assignments || [];

  const getRelevantDueDate = (assignment) => {
    const dueSoft = parseScheduleDate(assignment.due_date_soft);
    const dueHard = parseScheduleDate(assignment.due_date_hard);
    return dueSoft || dueHard || null;
  };

  const getSortDueTime = (assignment) => {
    const due = getRelevantDueDate(assignment);
    if (due) return due.getTime();
    return Number.POSITIVE_INFINITY;
  };

  const unreleasedAssignments = allAssignments.filter((assignment) => {
    if (!assignment.release_date) return true;
    const releaseDate = parseScheduleDate(assignment.release_date);
    return releaseDate ? releaseDate > now : true;
  });

  const sortByUpcomingDue = (assignments) => (
    [...assignments].sort((a, b) => getSortDueTime(a) - getSortDueTime(b))
  );

  const timelineAssignments = sortByUpcomingDue(allAssignments);

  const timelineWithMeta = timelineAssignments.map((assignment) => {
    const releaseDate = parseScheduleDate(assignment.release_date);
    const softDueDate = parseScheduleDate(assignment.due_date_soft);
    const hardDueDate = parseScheduleDate(assignment.due_date_hard);
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
      status = { label: 'In Progress', tone: dashboardPalette.navy, bg: dashboardPalette.navyLight };
    } else if (isLate || isClosed) {
      status = { label: 'Late', tone: dashboardPalette.dangerText, bg: dashboardPalette.dangerBg };
    } else if (daysUntilDue !== null) {
      status = { label: 'Upcoming', tone: dashboardPalette.navy, bg: dashboardPalette.surface };
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
  const isAssignmentGraded = (assignment) => Boolean(assignment?.grade_released);
  const inProgressCount = timelineWithMeta.filter((item) => item.isInProgress || item.isLate).length;
  const unreleasedIdSet = new Set(unreleasedAssignments.map((assignment) => assignment.id));
  const timelineInProgressOrLate = timelineWithMeta.filter((item) => (item.isInProgress || item.isLate) && !unreleasedIdSet.has(item.assignment.id));
  const timelinePendingGrading = timelineWithMeta.filter((item) => item.isClosed && !isAssignmentGraded(item.assignment));
  const timelineGraded = timelineWithMeta.filter((item) => item.isClosed && isAssignmentGraded(item.assignment));
  const timelineUnreleased = timelineWithMeta.filter((item) => unreleasedIdSet.has(item.assignment.id));
  const pendingGradingCount = timelinePendingGrading.length;
  const gradedCount = timelineGraded.length;

  return (
    <PageContainer maxWidth="1200px">
      <CourseDashboardBackButton onClick={handleBack} style={{ marginBottom: '16px' }}>
        Back
      </CourseDashboardBackButton>

      <SurfaceCard style={{ marginBottom: '24px' }}>
        <CourseDashboardHeader
          title={course.course_name}
          subtitle={course.course_code || 'Course'}
          action={
            isInstructor ? (
              <CourseDashboardPrimaryButton onClick={() => { window.location.hash = buildHashWithFrom(`#course/${courseId}/assignment/new`, currentHash); }}>
                + New Assignment
              </CourseDashboardPrimaryButton>
            ) : null
          }
        />

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '0.7rem',
          marginTop: '1rem'
        }}>
          {[
            { label: 'Total Assignments', value: allAssignments.length },
            { label: 'In Progress', value: inProgressCount },
            { label: 'Ungraded', value: pendingGradingCount },
            { label: 'Graded', value: gradedCount }
          ].map((metric) => (
            <div key={metric.label} style={{
              background: dashboardPalette.white,
              border: `1px solid ${dashboardPalette.border}`,
              borderRadius: '8px',
              padding: '0.7rem 0.8rem'
            }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: dashboardPalette.navy }}>{metric.value}</div>
              <div style={{ fontSize: '0.76rem', fontWeight: 600, color: dashboardPalette.muted }}>{metric.label}</div>
            </div>
          ))}
        </div>
      </SurfaceCard>

      <div style={styles.section}>
        <div style={{ marginBottom: '1.15rem' }}>
          <h2 style={{ ...styles.sectionTitle, fontSize: '1.15rem', fontWeight: 700 }}>Assignment Timeline</h2>
        </div>

        {timelineWithMeta.length === 0 ? (
          <div style={{
            border: `1px solid ${dashboardPalette.border}`,
            borderRadius: '8px',
            padding: '2.2rem 1rem',
            textAlign: 'center',
            background: dashboardPalette.white
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>No assignments yet</h3>
            <p style={{ margin: 0, color: dashboardPalette.muted }}>
              {isInstructor ? 'Create your first assignment to initialize the timeline.' : 'Assignments will appear here once your instructor adds them.'}
            </p>
          </div>
        ) : (
          <div>
            {[
              { key: 'in-progress', title: 'In Progress', emptyLabel: 'No In Progress assignments.', items: timelineInProgressOrLate },
              { key: 'pending-grading', title: 'Ungraded', emptyLabel: 'No ungraded assignments.', items: timelinePendingGrading },
              { key: 'graded', title: 'Graded', emptyLabel: 'No graded assignments.', items: timelineGraded },
              { key: 'unreleased', title: 'Unreleased', emptyLabel: 'No Unreleased assignments.', items: timelineUnreleased }
            ].map((section, sectionIndex) => (
              <div key={section.key}>
                <h3 style={{ margin: '0 0 0.65rem 0', fontSize: '0.95rem', fontWeight: 700, color: dashboardPalette.navy }}>{section.title}</h3>
                {section.items.length === 0 ? (
                  <p style={styles.mutedText}>{section.emptyLabel}</p>
                ) : (
                  section.items.map((item) => (
                    <div
                      key={item.assignment.id}
                      style={{
                        ...styles.timelineCard,
                        cursor: canViewAssignments ? 'pointer' : 'default',
                        transition: 'border-color 0.15s'
                      }}
                      onClick={() => {
                        if (canViewAssignments) {
                          window.location.hash = buildHashWithFrom(`#course/${courseId}/assignment/${item.assignment.id}/view`, currentHash);
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (canViewAssignments) {
                          e.currentTarget.style.borderColor = dashboardPalette.navyMid;
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = dashboardPalette.border;
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', color: dashboardPalette.navy }}>{item.assignment.title}</h3>
                            {!(item.isClosed && item.status.label === 'Late') && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: item.status.tone, background: item.status.bg, borderRadius: '6px', padding: '0.15rem 0.45rem', border: `1px solid ${dashboardPalette.border}` }}>
                                {item.status.label}
                              </span>
                            )}
                            {item.isClosed && (
                              section.key === 'pending-grading' ? (
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: '6px', padding: '0.15rem 0.45rem', border: `1px solid ${dashboardPalette.border}` }}>
                                  Ungraded
                                </span>
                              ) : (
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#166534', background: '#dcfce7', borderRadius: '6px', padding: '0.15rem 0.45rem', border: `1px solid ${dashboardPalette.border}` }}>
                                  Graded
                                </span>
                              )
                            )}
                            {item.assignment.grade_released && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#065f46', background: '#d1fae5', borderRadius: '6px', padding: '0.15rem 0.45rem', border: `1px solid ${dashboardPalette.border}` }}>
                                Released
                              </span>
                            )}
                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: dashboardPalette.navy, background: dashboardPalette.navyLight, borderRadius: '6px', padding: '0.15rem 0.4rem', border: `1px solid ${dashboardPalette.border}` }}>
                              {item.assignment.type}
                            </span>
                          </div>
                          <div style={{ marginTop: '0.7rem', fontSize: '0.82rem', color: dashboardPalette.muted, display: 'flex', gap: '1.15rem', rowGap: '0.45rem', flexWrap: 'wrap' }}>
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
                              background: dashboardPalette.white,
                              color: dashboardPalette.dangerText,
                              border: `1px solid ${dashboardPalette.dangerBorder}`,
                              borderRadius: '6px',
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
                            color: dashboardPalette.muted,
                            marginBottom: '0.35rem',
                            columnGap: '0.6rem'
                          }}>
                            <span style={{ textAlign: 'left' }}>{formatDateObject(item.releaseDate)}</span>
                            <span style={{ textAlign: 'right' }}>{formatDateObject(item.softDueDate || item.dueDate)}</span>
                          </div>
                          <div style={{ height: '8px', borderRadius: '999px', background: dashboardPalette.border, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${item.timeRemainingPercent ?? 0}%`,
                              background: dashboardPalette.navy
                            }} />
                          </div>
                          {section.key === 'in-progress' && (
                            <div style={{ marginTop: '0.4rem', fontSize: '0.76rem', color: dashboardPalette.text, fontWeight: 700 }}>
                              {item.remainingTimePrefix} {item.remainingTimeLabel}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {sectionIndex < 3 && (
                  <hr style={{ border: 0, borderTop: `1px solid ${dashboardPalette.border}`, margin: '0.85rem 0 1rem 0' }} />
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
        </div>
        <p style={{ ...styles.mutedText, marginBottom: '0.8rem' }}>
          Enrollment changes are managed from the Platform home page.
        </p>

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
            background: dashboardPalette.white,
            borderRadius: '8px',
            border: `1px solid ${dashboardPalette.border}`,
            padding: '1.5rem',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem', fontWeight: 600, color: dashboardPalette.navy }}>
              Delete Assignment?
            </h3>
            <p style={{ margin: '0 0 1.5rem 0', color: dashboardPalette.muted, fontSize: '0.875rem', lineHeight: 1.5 }}>
              Are you sure you want to delete this assignment? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleting}
                style={{
                  padding: '0.5rem 1rem',
                  background: dashboardPalette.white,
                  color: dashboardPalette.text,
                  border: `1px solid ${dashboardPalette.border}`,
                  borderRadius: '8px',
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
                  background: dashboardPalette.white,
                  color: deleting ? dashboardPalette.muted : dashboardPalette.dangerText,
                  border: `1px solid ${dashboardPalette.dangerBorder}`,
                  borderRadius: '8px',
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

    </PageContainer>
  );
}
