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
  emptyStateContent
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

  return (
    <div>
      <h3 
        onClick={onToggle}
        style={{ 
          marginBottom: '1rem',
          paddingBottom: '0.5rem',
          borderBottom: `2px solid ${borderColor}`,
          color: '#333',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '15px' }}>
                  <button
                    onClick={goToPreviousPage}
                    style={{
                      padding: '0.5rem 0.75rem',
                      background: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold'
                    }}
                    disabled={currentPage === 1}
                  >
                    ←
                  </button>
                  <span>
                    Page
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
                      style={{ width: "30px", margin: "0 6px", textAlign: "center" }}
                    />
                    of {totalPages}
                  </span>
                  <button
                    onClick={goToNextPage}
                    style={{
                      padding: '0.5rem 0.75rem',
                      background: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold'
                    }}
                    disabled={currentPage === totalPages}
                  >
                    →
                  </button>
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
