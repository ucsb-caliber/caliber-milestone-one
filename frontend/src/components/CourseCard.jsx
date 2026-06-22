import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Settings,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import { formatPacificDateTime } from '../utils/datetime';
import { dashboardPalette } from './CourseDashboardUI';

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

function getCourseAccent(course) {
  return course?.course_code
    ? { bg: dashboardPalette.navyLight, text: dashboardPalette.navy, rail: dashboardPalette.gold }
    : { bg: dashboardPalette.subtle, text: dashboardPalette.text, rail: dashboardPalette.gold };
}

const actionButtonStyle = {
  width: '34px',
  height: '34px',
  borderRadius: '8px',
  border: `1px solid ${dashboardPalette.border}`,
  background: dashboardPalette.white,
  color: dashboardPalette.muted,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const metricStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  color: dashboardPalette.muted,
  fontSize: '0.86rem',
  fontWeight: 700,
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
  const accent = getCourseAccent(course);

  const getStudentInfo = (studentId) => {
    if (studentNameById && studentNameById[studentId]) return studentNameById[studentId];
    const matchedUser = allUsers.find((u) => u.user_id === studentId);
    if (!matchedUser) return studentId;
    if (matchedUser.first_name && matchedUser.last_name) return `${matchedUser.first_name} ${matchedUser.last_name}`;
    return matchedUser.email || studentId;
  };

  return (
    <article
      className="caliber-course-card"
      style={{
        background: dashboardPalette.white,
        borderRadius: '8px',
        border: `1px solid ${dashboardPalette.border}`,
        boxShadow: '0 1px 2px rgba(17,21,23,0.06)',
        cursor: handleOpen ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        minHeight: variant === 'dashboard' ? '212px' : 'auto',
        overflow: 'hidden',
        position: 'relative',
      }}
      onClick={handleOpen || undefined}
    >
      <div style={{ height: '4px', background: isPinned ? accent.rail : dashboardPalette.navy }} aria-hidden="true" />

      <div style={{ padding: '0 18px 18px', display: 'grid', gap: '16px', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: '30px',
              padding: '0 10px',
              borderRadius: '8px',
              background: accent.bg,
              color: accent.text,
              fontSize: '0.78rem',
              fontWeight: 750,
            }}
          >
            {course.course_code || 'Course'}
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            {canPin ? (
              <button
                type="button"
                className="caliber-icon-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPin();
                }}
                aria-label={isPinned ? 'Unpin course' : 'Pin course'}
                title={isPinned ? 'Unpin course' : 'Pin course'}
                style={{
                  ...actionButtonStyle,
                  color: isPinned ? dashboardPalette.goldDark : dashboardPalette.muted,
                  background: isPinned ? dashboardPalette.surfaceWarm : actionButtonStyle.background,
                  borderColor: isPinned ? 'rgba(184,117,3,0.25)' : dashboardPalette.border,
                }}
              >
                <Star size={17} fill={isPinned ? 'currentColor' : 'none'} aria-hidden="true" />
              </button>
            ) : null}
            {handleOpen ? (
              <span
                style={{
                  ...actionButtonStyle,
                  pointerEvents: 'none',
                  color: dashboardPalette.ink,
                }}
                aria-hidden="true"
              >
                <ArrowRight size={17} />
              </span>
            ) : null}
          </div>
        </div>

        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: '1.12rem', fontWeight: 800, color: dashboardPalette.ink, lineHeight: 1.25 }}>
            {course.course_name || 'Untitled course'}
          </h3>
          <p style={{ margin: 0, fontSize: '0.92rem', color: dashboardPalette.muted, lineHeight: 1.5 }}>
            {course.school_name || 'No school specified'}
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 16px' }}>
          <span style={metricStyle}>
            <Users size={15} aria-hidden="true" />
            {studentCount} {studentCount === 1 ? 'student' : 'students'}
          </span>
          <span style={metricStyle}>
            <BookOpen size={15} aria-hidden="true" />
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
                fontWeight: 800,
                padding: 0,
              }}
            >
              {showStudents ? 'Hide students' : 'Show students'}
            </button>
            {showStudents ? (
              <div
                style={{
                  marginTop: '10px',
                  display: 'grid',
                  gap: '6px',
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
          <div
            style={{
              marginTop: 'auto',
              padding: '13px',
              borderRadius: '8px',
              background: dashboardPalette.subtle,
              border: `1px solid ${dashboardPalette.border}`,
            }}
          >
            <p style={{ margin: 0, fontSize: '0.78rem', color: dashboardPalette.muted, fontWeight: 750, letterSpacing: 0 }}>
              <CalendarClock size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} aria-hidden="true" />
              Next due
            </p>
            <p style={{ margin: '6px 0 0', fontSize: '0.92rem', color: dashboardPalette.text, lineHeight: 1.4, fontWeight: 650 }}>
              {nextDue
                ? `${nextDue.assignment.title || 'Assignment'} - ${formatDueDate(nextDue.dueDate)}`
                : 'No upcoming deadlines'}
            </p>
          </div>
        ) : null}

        {isInstructor ? (
          <div style={{ marginTop: 'auto', display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: `1px solid ${dashboardPalette.border}`, paddingTop: '12px' }}>
            <button
              type="button"
              title="Course settings"
              className="caliber-icon-button"
              onClick={(e) => {
                e.stopPropagation();
                onSettings?.();
              }}
              style={actionButtonStyle}
            >
              <Settings size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Delete course"
              className="caliber-icon-button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.();
              }}
              style={actionButtonStyle}
            >
              <Trash2 size={17} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
