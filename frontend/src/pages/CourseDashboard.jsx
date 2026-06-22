import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { getAllUsers, getCourse, getUserInfo, deleteAssignment } from '../api';
import { useAuth } from '../AuthContext';
import { formatPacificDateTime, parseScheduleDate } from '../utils/datetime';
import { getAssignmentQuestionCount } from '../utils/assignmentQuestions';
import {
  CourseDashboardErrorBanner,
  CourseDashboardPrimaryButton,
  CourseDashboardSecondaryButton,
  CourseDashboardSpinnerState,
  dashboardPalette,
} from '../components/CourseDashboardUI';

function formatAssignmentDate(value) {
  return formatPacificDateTime(value, { kind: 'schedule' }) || 'Not set';
}

function formatDateObject(value) {
  return formatPacificDateTime(value, { kind: 'schedule' }) || 'Not set';
}

function getCourseIdFromHash() {
  const match = window.location.hash.match(/#course\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function getRelevantDueDate(assignment) {
  return parseScheduleDate(assignment.due_date_soft) || parseScheduleDate(assignment.due_date_hard) || null;
}

function getStatusMeta(item) {
  if (item.isUnreleased) {
    return { label: 'Unreleased', tone: dashboardPalette.muted, bg: dashboardPalette.subtle, border: dashboardPalette.border };
  }
  if (item.isClosed && item.assignment.grade_released) {
    return { label: 'Released', tone: dashboardPalette.teal, bg: '#E7F4F2', border: '#B9DAD6' };
  }
  if (item.isClosed) {
    return { label: 'Needs grading', tone: dashboardPalette.goldDark, bg: dashboardPalette.surfaceWarm, border: dashboardPalette.clay };
  }
  if (item.isLate) {
    return { label: 'Late window', tone: dashboardPalette.coral, bg: '#FFF1EF', border: '#F3B5AD' };
  }
  return { label: 'Open', tone: dashboardPalette.teal, bg: '#E7F4F2', border: '#B9DAD6' };
}

function AssignmentRow({ item, canOpen, isInstructor, onOpen, onDelete }) {
  const status = getStatusMeta(item);
  const assignment = item.assignment;

  return (
    <div
      className="caliber-assignment-row"
      role={canOpen ? 'button' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      onClick={canOpen ? onOpen : undefined}
      onKeyDown={(event) => {
        if (!canOpen) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 1.4fr) 116px minmax(150px, 0.8fr) minmax(150px, 0.8fr) 96px auto',
        gap: '12px',
        alignItems: 'center',
        minHeight: '58px',
        padding: '10px 12px',
        borderTop: `1px solid ${dashboardPalette.border}`,
        cursor: canOpen ? 'pointer' : 'default',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: dashboardPalette.ink, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {assignment.title || 'Untitled assignment'}
        </div>
        <div style={{ marginTop: 3, color: dashboardPalette.muted, fontSize: '0.8rem' }}>
          {assignment.type || 'Assignment'}
        </div>
      </div>

      <span
        style={{
          justifySelf: 'start',
          minHeight: 24,
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: 6,
          padding: '0 8px',
          border: `1px solid ${status.border}`,
          background: status.bg,
          color: status.tone,
          fontSize: '0.76rem',
          fontWeight: 750,
          whiteSpace: 'nowrap',
        }}
      >
        {status.label}
      </span>

      <div style={{ color: dashboardPalette.text, fontSize: '0.85rem' }}>{formatDateObject(item.releaseDate)}</div>
      <div style={{ color: dashboardPalette.text, fontSize: '0.85rem' }}>{formatDateObject(item.softDueDate || item.dueDate)}</div>
      <div style={{ color: dashboardPalette.text, fontSize: '0.85rem', fontWeight: 700 }}>
        {getAssignmentQuestionCount(assignment)}
      </div>

      {isInstructor ? (
        <button
          type="button"
          aria-label={`Delete ${assignment.title || 'assignment'}`}
          title="Delete assignment"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          className="caliber-icon-button"
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            border: `1px solid ${dashboardPalette.dangerBorder}`,
            background: dashboardPalette.white,
            color: dashboardPalette.dangerText,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  );
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
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const courseId = getCourseIdFromHash();
  const canOpenAssignments = isInstructor || isAdmin;

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
          getUserInfo(),
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
  }, [courseId, user?.id]);

  useEffect(() => {
    const timerId = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const getUserDisplayName = (nextUser) => {
    if (nextUser?.first_name && nextUser?.last_name) return `${nextUser.first_name} ${nextUser.last_name}`;
    return nextUser?.email || nextUser?.user_id || 'Unknown';
  };

  const getInstructorName = () => {
    const instructor = allUsers.find((nextUser) => nextUser.user_id === course?.instructor_id);
    return instructor ? getUserDisplayName(instructor) : 'Unknown';
  };

  const getStudentInfo = (studentId) => {
    const student = allUsers.find((nextUser) => nextUser.user_id === studentId);
    return student ? getUserDisplayName(student) : studentId;
  };

  const handleDeleteAssignment = async () => {
    if (!deleteConfirmId) return;

    setDeleting(true);
    try {
      await deleteAssignment(deleteConfirmId);
      setCourse((previous) => ({
        ...previous,
        assignments: (previous.assignments || []).filter((assignment) => assignment.id !== deleteConfirmId),
      }));
      setDeleteConfirmId(null);
    } catch (err) {
      setError(err.message || 'Failed to delete assignment');
    } finally {
      setDeleting(false);
    }
  };

  const styles = {
    container: {
      width: '100%',
      maxWidth: 1240,
      margin: '0 auto',
      color: dashboardPalette.text,
    },
    topLink: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      color: dashboardPalette.navy,
      textDecoration: 'none',
      fontSize: '0.88rem',
      fontWeight: 750,
      marginBottom: 16,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 16,
      alignItems: 'flex-start',
      marginBottom: 20,
      flexWrap: 'wrap',
    },
    title: {
      margin: 0,
      color: dashboardPalette.navy,
      fontSize: '1.8rem',
      lineHeight: 1.18,
      fontWeight: 850,
    },
    subtitle: {
      margin: '8px 0 0',
      color: dashboardPalette.muted,
      fontSize: '0.95rem',
    },
    metricRow: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
      marginTop: 12,
    },
    metric: {
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: 30,
      padding: '0 10px',
      borderRadius: 6,
      border: `1px solid ${dashboardPalette.border}`,
      background: dashboardPalette.white,
      color: dashboardPalette.text,
      fontSize: '0.82rem',
      fontWeight: 750,
    },
    layout: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) 320px',
      gap: 20,
      alignItems: 'start',
    },
    panel: {
      background: dashboardPalette.white,
      border: `1px solid ${dashboardPalette.border}`,
      borderRadius: 8,
      boxShadow: '0 1px 2px rgba(17,21,23,0.06)',
    },
    panelHeader: {
      padding: '16px 18px',
      borderBottom: `1px solid ${dashboardPalette.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    panelTitle: {
      margin: 0,
      color: dashboardPalette.ink,
      fontSize: '1rem',
      fontWeight: 800,
    },
    tableHeader: {
      display: 'grid',
      gridTemplateColumns: 'minmax(220px, 1.4fr) 116px minmax(150px, 0.8fr) minmax(150px, 0.8fr) 96px auto',
      gap: 12,
      padding: '10px 12px',
      color: dashboardPalette.muted,
      fontSize: '0.75rem',
      fontWeight: 800,
      borderBottom: `1px solid ${dashboardPalette.border}`,
    },
    empty: {
      padding: 28,
      color: dashboardPalette.muted,
      borderTop: `1px solid ${dashboardPalette.border}`,
    },
    groupTitle: {
      margin: 0,
      padding: '14px 12px 6px',
      color: dashboardPalette.ink,
      fontSize: '0.88rem',
      fontWeight: 800,
    },
    sidePanel: {
      background: dashboardPalette.white,
      border: `1px solid ${dashboardPalette.border}`,
      borderRadius: 8,
      boxShadow: '0 1px 2px rgba(17,21,23,0.06)',
      overflow: 'hidden',
    },
    infoList: {
      display: 'grid',
      gap: 0,
    },
    infoRow: {
      display: 'grid',
      gridTemplateColumns: '112px minmax(0, 1fr)',
      gap: 12,
      padding: '11px 14px',
      borderTop: `1px solid ${dashboardPalette.border}`,
      fontSize: '0.87rem',
    },
    infoLabel: {
      color: dashboardPalette.muted,
      fontWeight: 750,
    },
    infoValue: {
      color: dashboardPalette.text,
      fontWeight: 650,
      minWidth: 0,
    },
    roster: {
      display: 'grid',
      gap: 0,
      maxHeight: 360,
      overflowY: 'auto',
    },
    rosterRow: {
      padding: '10px 14px',
      borderTop: `1px solid ${dashboardPalette.border}`,
      color: dashboardPalette.text,
      fontSize: '0.86rem',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    modalBackdrop: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(17, 21, 23, 0.46)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 16,
    },
    modal: {
      background: dashboardPalette.white,
      border: `1px solid ${dashboardPalette.border}`,
      borderRadius: 8,
      padding: 20,
      maxWidth: 420,
      width: '100%',
      boxShadow: '0 16px 36px rgba(17,21,23,0.22)',
    },
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <a href="#courses" style={styles.topLink}><ArrowLeft size={16} /> Courses</a>
        <CourseDashboardSpinnerState label="Loading course" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <a href="#courses" style={styles.topLink}><ArrowLeft size={16} /> Courses</a>
        <CourseDashboardErrorBanner>{error}</CourseDashboardErrorBanner>
      </div>
    );
  }

  if (!course) {
    return (
      <div style={styles.container}>
        <a href="#courses" style={styles.topLink}><ArrowLeft size={16} /> Courses</a>
        <div style={styles.panel}>
          <div style={styles.empty}>Course not found.</div>
        </div>
      </div>
    );
  }

  const now = currentTime;
  const allAssignments = course.assignments || [];
  const timelineWithMeta = [...allAssignments]
    .map((assignment) => {
      const releaseDate = parseScheduleDate(assignment.release_date);
      const softDueDate = parseScheduleDate(assignment.due_date_soft);
      const hardDueDate = parseScheduleDate(assignment.due_date_hard);
      const dueDate = softDueDate || hardDueDate || null;
      const nowMs = now.getTime();

      const isClosed = Boolean(hardDueDate && nowMs > hardDueDate.getTime());
      const isUnreleased = !releaseDate || releaseDate.getTime() > nowMs;
      const isLate = Boolean(softDueDate && nowMs > softDueDate.getTime() && !isClosed);
      const isOpen = !isUnreleased && !isClosed;

      return {
        assignment,
        releaseDate,
        softDueDate,
        hardDueDate,
        dueDate,
        isClosed,
        isUnreleased,
        isLate,
        isOpen,
      };
    })
    .sort((a, b) => {
      const aDue = getRelevantDueDate(a.assignment);
      const bDue = getRelevantDueDate(b.assignment);
      return (aDue ? aDue.getTime() : Number.POSITIVE_INFINITY) - (bDue ? bDue.getTime() : Number.POSITIVE_INFINITY);
    });

  const openAssignments = timelineWithMeta.filter((item) => item.isOpen);
  const needsGrading = timelineWithMeta.filter((item) => item.isClosed && !item.assignment.grade_released);
  const released = timelineWithMeta.filter((item) => item.isClosed && item.assignment.grade_released);
  const unreleased = timelineWithMeta.filter((item) => item.isUnreleased);
  const assignmentGroups = [
    { key: 'open', label: 'Open', items: openAssignments },
    { key: 'needs-grading', label: 'Needs grading', items: needsGrading },
    { key: 'released', label: 'Released', items: released },
    { key: 'unreleased', label: 'Unreleased', items: unreleased },
  ];

  const metrics = [
    `${allAssignments.length} assignment${allAssignments.length === 1 ? '' : 's'}`,
    `${openAssignments.length} open`,
    `${needsGrading.length} needs grading`,
    `${course.student_ids?.length || 0} student${(course.student_ids?.length || 0) === 1 ? '' : 's'}`,
  ];

  return (
    <div style={styles.container}>
      <a href="#courses" style={styles.topLink}>
        <ArrowLeft size={16} aria-hidden="true" />
        Courses
      </a>

      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{course.course_name || 'Untitled course'}</h1>
          <p style={styles.subtitle}>
            {[course.course_code, course.school_name].filter(Boolean).join(' · ') || 'Course workspace'}
          </p>
          <div style={styles.metricRow}>
            {metrics.map((metric) => (
              <span key={metric} style={styles.metric}>{metric}</span>
            ))}
          </div>
        </div>
        {isInstructor ? (
          <CourseDashboardPrimaryButton onClick={() => { window.location.hash = `#course/${courseId}/assignment/new`; }}>
            <Plus size={16} aria-hidden="true" />
            New Assignment
          </CourseDashboardPrimaryButton>
        ) : null}
      </div>

      <div style={styles.layout} className="caliber-course-workspace">
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Assignments</h2>
            <span style={{ color: dashboardPalette.muted, fontSize: '0.84rem', fontWeight: 700 }}>
              {formatAssignmentDate(now)}
            </span>
          </div>

          <div className="caliber-assignment-table-header" style={styles.tableHeader}>
            <span>Assignment</span>
            <span>Status</span>
            <span>Release</span>
            <span>Due</span>
            <span>Questions</span>
            <span />
          </div>

          {timelineWithMeta.length === 0 ? (
            <div style={styles.empty}>
              {isInstructor ? 'Create your first assignment to start the course timeline.' : 'Assignments will appear here once they are added.'}
            </div>
          ) : (
            assignmentGroups.map((group) => (
              group.items.length > 0 ? (
                <div key={group.key}>
                  <h3 style={styles.groupTitle}>{group.label}</h3>
                  {group.items.map((item) => (
                    <AssignmentRow
                      key={item.assignment.id}
                      item={item}
                      canOpen={canOpenAssignments}
                      isInstructor={isInstructor}
                      onOpen={() => { window.location.hash = `#course/${courseId}/assignment/${item.assignment.id}/view`; }}
                      onDelete={() => setDeleteConfirmId(item.assignment.id)}
                    />
                  ))}
                </div>
              ) : null
            ))
          )}
        </section>

        <aside style={{ display: 'grid', gap: 16 }}>
          <section style={styles.sidePanel}>
            <div style={styles.panelHeader}>
              <h2 style={styles.panelTitle}>Course details</h2>
            </div>
            <div style={styles.infoList}>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Instructor</span>
                <span style={styles.infoValue}>{getInstructorName()}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>School</span>
                <span style={styles.infoValue}>{course.school_name || 'Not set'}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>Code</span>
                <span style={styles.infoValue}>{course.course_code || 'Not set'}</span>
              </div>
            </div>
          </section>

          <section style={styles.sidePanel}>
            <div style={styles.panelHeader}>
              <h2 style={styles.panelTitle}>Roster</h2>
              <span style={{ color: dashboardPalette.muted, fontSize: '0.84rem', fontWeight: 700 }}>
                {course.student_ids?.length || 0}
              </span>
            </div>
            {course.student_ids?.length > 0 ? (
              <div style={styles.roster}>
                {course.student_ids.map((studentId) => (
                  <div key={studentId} style={styles.rosterRow}>{getStudentInfo(studentId)}</div>
                ))}
              </div>
            ) : (
              <div style={styles.empty}>No students enrolled yet.</div>
            )}
          </section>
        </aside>
      </div>

      {deleteConfirmId ? (
        <div style={styles.modalBackdrop}>
          <div style={styles.modal}>
            <h3 style={{ margin: '0 0 8px', color: dashboardPalette.ink, fontSize: '1.12rem', fontWeight: 800 }}>
              Delete assignment?
            </h3>
            <p style={{ margin: '0 0 18px', color: dashboardPalette.muted, fontSize: '0.9rem', lineHeight: 1.5 }}>
              This will remove the assignment from the course. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <CourseDashboardSecondaryButton onClick={() => setDeleteConfirmId(null)} disabled={deleting}>
                Cancel
              </CourseDashboardSecondaryButton>
              <button
                type="button"
                onClick={handleDeleteAssignment}
                disabled={deleting}
                style={{
                  minHeight: 42,
                  padding: '0 16px',
                  border: `1px solid ${dashboardPalette.dangerText}`,
                  borderRadius: 8,
                  background: deleting ? dashboardPalette.coral : dashboardPalette.dangerText,
                  color: dashboardPalette.white,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  fontWeight: 750,
                }}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
