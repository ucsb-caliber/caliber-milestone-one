import React, { useState } from 'react';
import { formatPacificDateTime } from '../utils/datetime';
import { dashboardPalette } from './CourseDashboardUI';

const SettingsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
);

const TrashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);

const UserIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

const BookIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
  </svg>
);

function formatDueDate(date) {
  return formatPacificDateTime(date, {
    kind: 'schedule',
    month: 'short',
    day: 'numeric',
    year: undefined,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: undefined,
  }) || 'No due date';
}

const flatActionButtonStyle = {
  width: '32px',
  height: '32px',
  borderRadius: '8px',
  border: `1px solid ${dashboardPalette.border}`,
  background: dashboardPalette.white,
  color: dashboardPalette.muted,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export default function CourseCard({
  course,
  isPinned = false,
  onPin,
  onOpen,
  onSettings,
  onDelete,
  isInstructor = false,
  onViewDetails,
  assignmentCountOverride,
  showStudentsList = false,
  allUsers = [],
  studentNameById = {},
  variant = 'default',
  nextDue = null,
}) {
  const [showStudents, setShowStudents] = useState(false);

  if (!course) return null;

  const studentCount = course.student_ids?.length || 0;
  const assignmentCount = assignmentCountOverride ?? (course.assignments?.length || 0);
  const canPin = typeof onPin === 'function';
  const handleOpen = onOpen || (onViewDetails ? () => onViewDetails(course) : null);
  const showDueSection = variant === 'dashboard' || Boolean(nextDue);

  const getStudentInfo = (studentId) => {
    if (studentNameById && studentNameById[studentId]) return studentNameById[studentId];
    const user = allUsers.find((u) => u.user_id === studentId);
    if (!user) return studentId;
    if (user.first_name && user.last_name) return `${user.first_name} ${user.last_name}`;
    return user.email || studentId;
  };

  return (
    <div
      style={{
        background: dashboardPalette.white,
        borderRadius: '8px',
        border: `1px solid ${dashboardPalette.border}`,
        padding: '16px',
        cursor: handleOpen ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        minHeight: variant === 'dashboard' ? '196px' : 'auto',
      }}
      onClick={handleOpen || undefined}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = dashboardPalette.navyMid;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = dashboardPalette.border;
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: '28px',
            padding: '0 10px',
            borderRadius: '6px',
            background: dashboardPalette.navyLight,
            border: `1px solid ${dashboardPalette.border}`,
            color: dashboardPalette.navy,
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          {course.course_code || 'Course'}
        </div>

        {canPin ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPin();
            }}
            aria-label={isPinned ? 'Unpin course' : 'Pin course'}
            title={isPinned ? 'Unpin course' : 'Pin course'}
            style={{
              ...flatActionButtonStyle,
              color: isPinned ? dashboardPalette.gold : dashboardPalette.muted,
            }}
          >
            {isPinned ? '★' : '☆'}
          </button>
        ) : null}
      </div>

      <div>
        <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 600, color: dashboardPalette.navy, lineHeight: 1.35 }}>
          {course.course_name || 'Untitled course'}
        </h3>
        <p style={{ margin: 0, fontSize: '0.92rem', color: dashboardPalette.muted, lineHeight: 1.5 }}>
          {course.school_name || 'No school specified'}
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', color: dashboardPalette.muted, fontSize: '0.88rem' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <UserIcon />
          {studentCount} {studentCount === 1 ? 'student' : 'students'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <BookIcon />
          {assignmentCount} {assignmentCount === 1 ? 'assignment' : 'assignments'}
        </span>
      </div>

      {showStudentsList && studentCount > 0 ? (
        <div style={{ borderTop: `1px solid ${dashboardPalette.border}`, paddingTop: '12px' }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowStudents(!showStudents);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: dashboardPalette.navy,
              cursor: 'pointer',
              fontSize: '0.88rem',
              fontWeight: 500,
              padding: 0,
            }}
          >
            {showStudents ? 'Hide students' : 'Show students'}
          </button>
          {showStudents ? (
            <div
              style={{
                marginTop: '8px',
                padding: '8px 0 0',
                display: 'grid',
                gap: '4px',
                maxHeight: '140px',
                overflowY: 'auto',
              }}
            >
              {course.student_ids.map((studentId) => (
                <div key={studentId} style={{ fontSize: '0.88rem', color: dashboardPalette.text }}>
                  {getStudentInfo(studentId)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {showDueSection ? (
        <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: `1px solid ${dashboardPalette.border}` }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: dashboardPalette.muted }}>Next due</p>
          <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: dashboardPalette.text, lineHeight: 1.4 }}>
            {nextDue
              ? `${nextDue.assignment.title || 'Assignment'} ${formatDueDate(nextDue.dueDate)}`
              : 'No upcoming deadlines'}
          </p>
        </div>
      ) : null}

      {isInstructor ? (
        <div style={{ marginTop: 'auto', display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: `1px solid ${dashboardPalette.border}`, paddingTop: '12px' }}>
          <button
            type="button"
            title="Course settings"
            onClick={(e) => {
              e.stopPropagation();
              onSettings?.();
            }}
            style={flatActionButtonStyle}
          >
            <SettingsIcon />
          </button>
          <button
            type="button"
            title="Delete course"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            style={flatActionButtonStyle}
          >
            <TrashIcon />
          </button>
        </div>
      ) : null}
    </div>
  );
}
