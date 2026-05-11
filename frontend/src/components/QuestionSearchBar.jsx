import React from 'react';
import {
  CourseDashboardInput,
  CourseDashboardSecondaryButton,
  CourseDashboardSelect,
  dashboardPalette,
} from './CourseDashboardUI';

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
  const padding = compact ? '0' : '0.95rem 1.1rem';
  const inputPadding = compact ? '0 0.85rem 0 2.2rem' : '0 1rem 0 2.75rem';

  return (
    <div style={{
      background: compact ? 'transparent' : dashboardPalette.white,
      borderRadius: compact ? 0 : '8px',
      padding,
      marginBottom: 0,
      border: compact ? 'none' : `1px solid ${dashboardPalette.border}`,
      display: 'flex',
      gap: compact ? '0.75rem' : '0.75rem',
      alignItems: 'center',
      flexWrap: 'wrap',
      ...containerStyle
    }}>
      <div style={{ flex: 1, minWidth: compact ? '260px' : '250px', position: 'relative' }}>
        <div style={{
          position: 'absolute',
          left: compact ? '0.75rem' : '1rem',
          top: '50%',
          transform: 'translateY(-50%)',
          color: dashboardPalette.muted,
          pointerEvents: 'none'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
        </div>
        <CourseDashboardInput
          type="text"
          placeholder="Search questions by keyword, tag, course, or text..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          style={{
            width: '100%',
            height: compact ? '40px' : '40px',
            padding: inputPadding,
            fontSize: compact ? '0.88rem' : '1rem',
            boxSizing: 'border-box',
            outline: 'none',
            minWidth: 0
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '0.45rem' : '0.5rem', flexShrink: 0 }}>
        <label style={{ fontSize: compact ? '0.82rem' : '0.82rem', color: dashboardPalette.muted, fontWeight: '600', whiteSpace: 'nowrap' }}>
          Search in:
        </label>
        <CourseDashboardSelect
          value={searchFilter}
          onChange={(e) => onSearchFilterChange(e.target.value)}
          style={{
            height: compact ? '40px' : '40px',
            padding: compact ? '0 0.7rem' : '0 0.9rem',
            fontSize: compact ? '0.82rem' : '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            outline: 'none',
            minWidth: compact ? '144px' : '140px'
          }}
        >
          <option value="all">All Fields</option>
          <option value="text">Question Text</option>
          <option value="keywords">Keywords</option>
          <option value="tags">Tags</option>
          <option value="course">Course/School</option>
        </CourseDashboardSelect>
      </div>

      {searchQuery && (
        <CourseDashboardSecondaryButton
          type="button"
          onClick={onClearSearch}
          style={{
            height: compact ? '40px' : '40px',
            padding: compact ? '0 0.65rem' : '0 0.9rem',
            minWidth: 'auto',
            fontWeight: 600,
            fontSize: compact ? '0.8rem' : '0.9rem'
          }}
          title="Clear search"
        >
          Clear
        </CourseDashboardSecondaryButton>
      )}

      {showResultCount && searchQuery && typeof resultCount === 'number' && (
        <div style={{
          fontSize: compact ? '0.78rem' : '0.82rem',
          color: dashboardPalette.muted,
          padding: compact ? '0.35rem 0.5rem' : '0.5rem 0.82rem',
          background: dashboardPalette.surface,
          border: `1px solid ${dashboardPalette.border}`,
          borderRadius: '8px',
          whiteSpace: 'nowrap'
        }}>
          Found <strong style={{ color: dashboardPalette.text }}>{resultCount}</strong> questions
        </div>
      )}
    </div>
  );
}
