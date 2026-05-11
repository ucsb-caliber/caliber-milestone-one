import React, { useState, useEffect } from 'react';
import { dashboardPalette } from './CourseDashboardUI';

/**
 * CollapsibleSection - A comprehensive collapsible section component with pagination and view modes
 * 
 * @param {string} title - The title of the section
 * @param {Array} questions - Array of questions to display
 * @param {boolean} isCollapsed - Whether the section is collapsed
 * @param {function} onToggle - Callback when the section is toggled
 * @param {string} borderColor - The color of the bottom border
 * @param {string} viewMode - 'card' or 'table' view mode
 * @param {number} itemsPerPage - Number of items to display per page
 * @param {function} renderTableView - Function to render table view
 * @param {function} renderQuestionCard - Function to render a single question card
 * @param {Object} user - Current user object (for permissions)
 * @param {boolean} isTeacher - Whether current user is a teacher
 * @param {React.ReactNode} emptyStateContent - Content to show when no questions exist
 * @param {React.ReactNode} headerContent - Optional content rendered under the title
 */
export default function CollapsibleSection({ 
  title, 
  questions,
  isCollapsed, 
  onToggle, 
  borderColor = '#007bff',
  viewMode = 'card',
  itemsPerPage = 6,
  renderTableView,
  renderQuestionCard,
  user,
  isTeacher,
  emptyStateContent,
  headerContent
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState(1);

  // Sync page input with current page
  useEffect(() => {
    setPageInput(currentPage);
  }, [currentPage]);

  // Calculate pagination
  const totalPages = Math.ceil(questions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedQuestions = questions.slice(startIndex, endIndex);

  useEffect(() => {
    if (totalPages <= 0 && currentPage !== 1) {
      setCurrentPage(1);
      return;
    }
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Handle page input change
  const handlePageInputChange = (e) => {
    const onlyDigits = e.target.value.replace(/\D/g, "");
    setPageInput(onlyDigits);
  };

  // Handle page input submission (blur or Enter key)
  const handlePageInputSubmit = () => {
    const num = Number(pageInput);
    if (num >= 1 && num <= totalPages) {
      setCurrentPage(num);
    } else {
      setPageInput(currentPage);
    }
  };

  // Handle previous page
  const goToPreviousPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  // Handle next page
  const goToNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  };

  const paginationButtonStyle = (disabled) => ({
    height: '32px',
    padding: '0 0.6rem',
    background: disabled ? dashboardPalette.surface : dashboardPalette.white,
    color: disabled ? dashboardPalette.muted : dashboardPalette.text,
    border: `1px solid ${dashboardPalette.border}`,
    borderRadius: '8px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '0.82rem',
    fontWeight: 600,
    opacity: disabled ? 0.65 : 1
  });

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          marginBottom: '0.5rem',
          padding: '0 0 0.75rem',
          border: 'none',
          borderBottom: `1px solid ${dashboardPalette.border}`,
          background: 'transparent',
          color: dashboardPalette.text,
          fontSize: '1rem',
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          textAlign: 'left'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span
            aria-hidden="true"
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '2px',
              background: borderColor,
              flexShrink: 0
            }}
          />
          <span>{title}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: dashboardPalette.muted, fontSize: '0.85rem', fontWeight: 600 }}>
          <span>{questions.length}</span>
          <span
            style={{
              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              display: 'inline-block'
            }}
          >
            ▼
          </span>
        </span>
      </button>
      {headerContent && !isCollapsed && (
        <div style={{ margin: '0 0 0.5rem 0' }}>
          {headerContent}
        </div>
      )}
      
      {!isCollapsed && (
        <>
          {questions.length === 0 ? (
            emptyStateContent || (
              <div style={{
                padding: '1.5rem',
                background: dashboardPalette.white,
                border: `1px solid ${dashboardPalette.border}`,
                borderRadius: '8px',
                textAlign: 'center',
                color: dashboardPalette.muted
              }}>
                <p>No questions found.</p>
              </div>
            )
          ) : (
            viewMode === 'table' ? (
              renderTableView(questions)
            ) : (
              <div>
                {/* Pagination Controls */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    marginBottom: '0.75rem',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ fontSize: '0.9rem', color: dashboardPalette.muted, fontWeight: 600 }}>
                    Showing {startIndex + 1}-{Math.min(endIndex, questions.length)} of {questions.length}
                  </div>
                  <div
                    style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    flexWrap: 'wrap',
                    justifyContent: 'flex-end'
                    }}
                  >
                  <button
                    onClick={goToPreviousPage}
                    style={paginationButtonStyle(currentPage === 1)}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                  <span
                    style={{
                      fontSize: '0.82rem',
                      color: dashboardPalette.muted,
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    <span>Page</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={pageInput}
                      onChange={handlePageInputChange}
                      onBlur={handlePageInputSubmit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handlePageInputSubmit();
                        }
                      }}
                      style={{
                        width: '38px',
                        textAlign: 'center',
                        border: `1px solid ${dashboardPalette.border}`,
                        borderRadius: '6px',
                        height: '32px',
                        padding: '0.14rem',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: dashboardPalette.text,
                        background: dashboardPalette.white
                      }}
                    />
                    <span>of {totalPages}</span>
                  </span>
                  <button
                    onClick={goToNextPage}
                    style={paginationButtonStyle(currentPage === totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                  </div>
                </div>

                {/* Card Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: '16px'
                }}>
                  {paginatedQuestions.map(question => {
                    const isOwner = user && question.user_id === user.id;
                    const canDelete = isOwner;
                    const canEdit = isOwner && isTeacher;
                    return renderQuestionCard(question, canDelete, canEdit);
                  })}
                </div>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
