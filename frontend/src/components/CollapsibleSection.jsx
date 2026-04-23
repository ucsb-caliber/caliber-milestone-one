import React, { useState, useEffect } from 'react';

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
    padding: '0.5rem 0.8rem',
    background: disabled ? '#f8fafc' : '#ffffff',
    color: disabled ? '#94a3b8' : '#0f172a',
    border: `1px solid ${disabled ? '#e2e8f0' : '#cbd5e1'}`,
    borderRadius: '9px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '0.82rem',
    fontWeight: 700,
    transition: 'all 0.15s ease'
  });

  return (
    <div>
      <h3 
        onClick={onToggle}
        style={{ 
          marginBottom: '1rem',
          paddingBottom: '0.6rem',
          borderBottom: `2px solid ${borderColor}`,
          color: '#0f172a',
          fontSize: '1.12rem',
          letterSpacing: '-0.01em',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          userSelect: 'none'
        }}
      >
        <span style={{ 
          transition: 'transform 0.2s',
          transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          display: 'inline-block'
        }}>
          ▼
        </span>
        {title} ({questions.length})
      </h3>
      {headerContent && !isCollapsed && (
        <div style={{ margin: '-0.35rem 0 0.9rem 1.35rem' }}>
          {headerContent}
        </div>
      )}
      
      {!isCollapsed && (
        <>
          {questions.length === 0 ? (
            emptyStateContent || (
              <div style={{
                padding: '2rem',
                background: '#f8f9fa',
                borderRadius: '4px',
                textAlign: 'center',
                color: '#666'
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
                    marginBottom: '0.95rem',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>
                    Showing {startIndex + 1}-{Math.min(endIndex, questions.length)} of {questions.length}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.55rem',
                      padding: '0.22rem',
                      borderRadius: '11px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0'
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
                      color: '#475569',
                      fontWeight: 600,
                      padding: '0.15rem 0.15rem 0.15rem 0.35rem',
                      borderRadius: '8px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0'
                    }}
                  >
                    Page{' '}
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
                        margin: '0 5px',
                        textAlign: 'center',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        padding: '0.2rem',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        color: '#0f172a',
                        background: '#ffffff'
                      }}
                    />
                    of {totalPages}{' '}
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
                  gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                  gap: '4rem 1.5rem'
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
