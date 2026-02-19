import { Settings } from 'lucide-react';
import React from 'react';

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

export default function CourseCard({ course, isPinned, onPin, onOpen, onSettings, onDelete, isInstructor }) {
  if (!course) return null;

  const studentCount = course.student_ids?.length || 0;
  const assignmentCount = course.assignments?.length || 0;

  const getHashColor = (str) => {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    if (!str) return colors[0];
    
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const themeColor = getHashColor(course.course_name);

  const actionButtonStyle = {
    padding: '10px',
    background: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1rem'
  };

  return (
    <div 
      style={{
        background: 'white',
        borderRadius: '20px',
        border: '1px solid #e2e8f0',
        padding: '24px',
        transition: 'all 0.3s ease',
        cursor: 'pointer',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
      }}
      onClick={onOpen}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-5px)';
        e.currentTarget.style.borderColor = themeColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = '#e2e8f0';
      }}
    >
      <div 
        style={{ position: 'absolute', top: '20px', right: '20px', cursor: 'pointer', color: isPinned ? '#f59e0b' : '#cbd5e1', fontSize: '1.2rem' }}
        onClick={(e) => { e.stopPropagation(); onPin(); }}
      >
        {isPinned ? '★' : '☆'}
      </div>

      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: `${themeColor}15`, color: themeColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '16px' }}>
        {(course.course_name || '?').charAt(0)}
      </div>

      <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: '800', color: '#0f172a' }}>
        {course.course_name || 'Untitled Course'}
      </h3>
      
      <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '500', display: 'block', marginBottom: '20px' }}>
        {course.school_name || 'General Course'}
      </span>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <div style={{ background: '#f1f5f9', padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '600', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <UserIcon/> {studentCount} {studentCount === 1 ? 'Student' : "Students"}
        </div>
        <div style={{ background: '#f1f5f9', padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '600', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <BookIcon/> {assignmentCount} {assignmentCount === 1 ? 'Assignment' : 'Assignments'}
        </div>
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', gap: '10px', justifyContent: 'flex-end'}}>
        {isInstructor && (
          <>
            <button 
              title="Course Settings"
              onClick={(e) => { e.stopPropagation(); onSettings(); }}
              style={actionButtonStyle}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
            >
              <SettingsIcon/>
            </button>
            <button 
              title="Delete Course"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              style={actionButtonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#fef2f2';
                e.currentTarget.style.borderColor = '#fecaca';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.borderColor = '#e2e8f0';
              }}
            >
              <TrashIcon/>
            </button>
          </>
        )}
      </div>
    </div>
  );
}