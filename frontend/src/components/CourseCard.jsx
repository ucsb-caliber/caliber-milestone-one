import React, { useState } from 'react';

/**
 * CourseCard - A reusable component to display a course
 * 
 * Props:
 * - course: The course object with id, course_name, school_name, instructor_id, student_ids, etc.
 * - onEdit: Callback when edit button is clicked (optional)
 * - onDelete: Callback when delete button is clicked (optional)
 * - onViewDetails: Callback when card is clicked to view details (optional)
 * - isInstructor: Boolean indicating if current user is the instructor
 * - allUsers: Array of all users for displaying student names (optional)
 */
export default function CourseCard({ 
  course, 
  onEdit, 
  onDelete, 
  onViewDetails,
  isInstructor = false,
  allUsers = [],
  showStudentsList = isInstructor,
  assignmentCountOverride,
  studentNameById = {}
}) {
  const [showStudents, setShowStudents] = useState(false);

  // Get student names from user IDs
  const getStudentInfo = (studentId) => {
    if (studentNameById && studentNameById[studentId]) {
      return studentNameById[studentId];
    }
    const user = allUsers.find(u => u.user_id === studentId);
    if (user) {
      if (user.first_name && user.last_name) {
        return `${user.first_name} ${user.last_name}`;
      }
      return user.email || studentId;
    }
    return studentId;
  };

  const studentCount = course.student_ids?.length || 0;
  const assignmentCount = assignmentCountOverride ?? (course.assignments?.length || 0);

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '12px',
        padding: '1.5rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        border: '1px solid #e5e7eb',
        transition: 'transform 0.2s, box-shadow 0.2s',
        cursor: onViewDetails ? 'pointer' : 'default'
      }}
      onClick={() => onViewDetails && onViewDetails(course)}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h3 style={{ 
            margin: 0, 
            fontSize: '1.25rem', 
            fontWeight: '700',
            color: '#111827'
          }}>
            {course.course_name}
          </h3>
          {isInstructor && (
            <span style={{
              background: '#dbeafe',
              color: '#1d4ed8',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: '600'
            }}>
              Instructor
            </span>
          )}
        </div>
        {course.school_name && (
          <span style={{
            display: 'inline-block',
            marginTop: '0.5rem',
            background: '#f3f4f6',
            color: '#4b5563',
            padding: '0.25rem 0.75rem',
            borderRadius: '4px',
            fontSize: '0.875rem'
          }}>
            {course.school_name}
          </span>
        )}
      </div>

      {/* Stats */}
      <div style={{ 
        display: 'flex', 
        gap: '1.5rem', 
        marginBottom: '1rem',
        padding: '0.75rem 0',
        borderTop: '1px solid #f3f4f6',
        borderBottom: '1px solid #f3f4f6'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#4f46e5' }}>
            {studentCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            {studentCount === 1 ? 'Student' : 'Students'}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#059669' }}>
            {assignmentCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            {assignmentCount === 1 ? 'Assignment' : 'Assignments'}
          </div>
        </div>
      </div>

      {/* Students List (Collapsible) */}
      {showStudentsList && studentCount > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowStudents(!showStudents);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#4f46e5',
              cursor: 'pointer',
              fontSize: '0.875rem',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}
          >
            <span style={{
              transition: 'transform 0.2s',
              transform: showStudents ? 'rotate(90deg)' : 'rotate(0deg)',
              display: 'inline-block'
            }}>
              ▶
            </span>
            {showStudents ? 'Hide Students' : 'Show Students'}
          </button>
          
          {showStudents && (
            <div style={{
              marginTop: '0.5rem',
              padding: '0.75rem',
              background: '#f9fafb',
              borderRadius: '6px',
              maxHeight: '150px',
              overflowY: 'auto'
            }}>
              {course.student_ids.map((studentId, index) => (
                <div 
                  key={studentId}
                  style={{
                    padding: '0.25rem 0',
                    fontSize: '0.875rem',
                    color: '#374151',
                    borderBottom: index < course.student_ids.length - 1 ? '1px solid #e5e7eb' : 'none'
                  }}
                >
                  {getStudentInfo(studentId)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {isInstructor && (onEdit || onDelete) && (
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem', 
          justifyContent: 'flex-end',
          paddingTop: '0.5rem'
        }}>
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(course);
              }}
              style={{
                padding: '0.5rem 1rem',
                background: '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                transition: 'background-color 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4338ca'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#4f46e5'}
            >
              Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(course);
              }}
              style={{
                padding: '0.5rem 1rem',
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                transition: 'background-color 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#b91c1c'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
