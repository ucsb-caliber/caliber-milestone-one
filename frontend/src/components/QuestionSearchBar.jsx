import React from 'react';

export default function QuestionSearchBar({
  searchQuery,
  searchFilter,
  onSearchQueryChange,
  onSearchFilterChange,
  onClearSearch,
  resultCount,
  showResultCount = false,
  compact = false,
  containerStyle = {}
}) {
  const padding = compact ? '0.85rem 1rem' : '0.95rem 1.1rem';
  const inputPadding = compact ? '0.72rem 0.95rem 0.72rem 2.35rem' : '0.8rem 1rem 0.8rem 2.75rem';
  const borderWidth = '1px';

  return (
    <div style={{
      background: compact ? '#ffffff' : 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
      borderRadius: '14px',
      padding,
      marginBottom: '1rem',
      boxShadow: compact ? 'none' : '0 10px 25px rgba(15, 23, 42, 0.06)',
      border: '1px solid #dbe3f0',
      display: 'flex',
      gap: '0.8rem',
      alignItems: 'center',
      flexWrap: 'wrap',
      ...containerStyle
    }}>
      <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
        <div style={{
          position: 'absolute',
          left: compact ? '0.75rem' : '1rem',
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#94a3b8',
          pointerEvents: 'none'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
        </div>
        <input
          type="text"
          placeholder="Search by creator, QID, title, course, type, blooms, question type, or tags..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          style={{
            width: '100%',
            padding: inputPadding,
            border: `${borderWidth} solid #d5deec`,
            borderRadius: '10px',
            fontSize: compact ? '0.95rem' : '1rem',
            background: '#ffffff',
            color: '#0f172a',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.8)',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            boxSizing: 'border-box',
            outline: 'none'
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <label style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: '600' }}>
          Search in:
        </label>
        <select
          value={searchFilter}
          onChange={(e) => onSearchFilterChange(e.target.value)}
          style={{
            padding: compact ? '0.58rem 0.72rem' : '0.72rem 2rem 0.72rem 0.9rem',
            border: `${borderWidth} solid #d5deec`,
            borderRadius: '10px',
            fontSize: '0.875rem',
            background: '#ffffff',
            color: '#1e293b',
            fontWeight: 600,
            cursor: 'pointer',
            outline: 'none',
            appearance: compact ? 'auto' : 'none',
            backgroundImage: compact
              ? 'none'
              : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 0.75rem center',
            minWidth: '140px'
          }}
        >
          <option value="all">All Fields</option>
          <option value="creator">Creator</option>
          <option value="qid">QID</option>
          <option value="title">Title</option>
          <option value="course">Course</option>
          <option value="course_type">Course Type</option>
          <option value="blooms">Blooms Taxonomy</option>
          <option value="question_type">Question Type</option>
          <option value="tags">Tags</option>
          <option value="text">Question Text</option>
          <option value="keywords">Keywords</option>
        </select>
      </div>

      {searchQuery && (
        <button
          type="button"
          onClick={onClearSearch}
          style={{
            padding: compact ? '0.58rem 0.8rem' : '0.62rem 0.9rem',
            background: '#eef2ff',
            color: '#334155',
            border: '1px solid #c7d2fe',
            borderRadius: '9px',
            minWidth: 'auto',
            minHeight: 'auto',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            lineHeight: 1
          }}
          title="Clear search"
        >
          Clear
        </button>
      )}

      {showResultCount && searchQuery && typeof resultCount === 'number' && (
        <div style={{
          fontSize: '0.82rem',
          color: '#475569',
          padding: '0.5rem 0.82rem',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          whiteSpace: 'nowrap'
        }}>
          Found <strong style={{ color: '#111827' }}>{resultCount}</strong> questions
        </div>
      )}
    </div>
  );
}
