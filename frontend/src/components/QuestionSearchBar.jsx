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
  const padding = compact ? '1rem 1.25rem' : '1rem 1.5rem';
  const inputPadding = compact ? '0.75rem 1rem 0.75rem 2.5rem' : '0.875rem 1rem 0.875rem 3rem';
  const borderWidth = compact ? '1px' : '2px';

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding,
      marginBottom: '1rem',
      boxShadow: compact ? 'none' : '0 1px 3px rgba(0,0,0,0.1)',
      border: '1px solid #e5e7eb',
      display: 'flex',
      gap: '1rem',
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
          color: '#9ca3af',
          pointerEvents: 'none'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
        </div>
        <input
          type="text"
          placeholder="Search questions by keyword, tag, course, or text..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          style={{
            width: '100%',
            padding: inputPadding,
            border: `${borderWidth} solid #e5e7eb`,
            borderRadius: '8px',
            fontSize: compact ? '0.95rem' : '1rem',
            boxSizing: 'border-box',
            outline: 'none'
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <label style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: '500' }}>
          Search in:
        </label>
        <select
          value={searchFilter}
          onChange={(e) => onSearchFilterChange(e.target.value)}
          style={{
            padding: compact ? '0.6rem 0.75rem' : '0.75rem 2rem 0.75rem 1rem',
            border: `${borderWidth} solid #e5e7eb`,
            borderRadius: '8px',
            fontSize: '0.875rem',
            background: 'white',
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
          <option value="text">Question Text</option>
          <option value="keywords">Keywords</option>
          <option value="tags">Tags</option>
          <option value="course">Course/School</option>
        </select>
      </div>

      {searchQuery && (
        <button
          type="button"
          onClick={onClearSearch}
          style={{
            padding: compact ? '0.6rem 0.75rem' : '0.5rem 0.75rem',
            background: '#f3f4f6',
            color: '#374151',
            border: compact ? '1px solid #d1d5db' : 'none',
            borderRadius: compact ? '8px' : '50%',
            minWidth: compact ? 'auto' : '24px',
            minHeight: compact ? 'auto' : '24px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: compact ? '500' : '400',
            lineHeight: 1
          }}
          title="Clear search"
        >
          {compact ? 'Clear' : 'x'}
        </button>
      )}

      {showResultCount && searchQuery && typeof resultCount === 'number' && (
        <div style={{
          fontSize: '0.875rem',
          color: '#6b7280',
          padding: '0.5rem 1rem',
          background: '#f3f4f6',
          borderRadius: '6px',
          whiteSpace: 'nowrap'
        }}>
          Found <strong style={{ color: '#111827' }}>{resultCount}</strong> questions
        </div>
      )}
    </div>
  );
}
