import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { getQuestions, getAllQuestions, deleteQuestion, getImageSignedUrl, getUserById, getUserInfo } from '../api';
import { useAuth } from '../AuthContext';
import QuestionCard from '../components/QuestionCard';
import CollapsibleSection from '../components/CollapsibleSection';
import QuestionTable from '../components/QuestionTable';

// User Icon Component
const UserIcon = ({ userInfo, size = 40 }) => {
  if (!userInfo) return null;
  
  const getInitials = () => {
    if (userInfo.initials) return userInfo.initials;
    if (userInfo.first_name && userInfo.last_name) {
      return `${userInfo.first_name[0]}${userInfo.last_name[0]}`.toUpperCase();
    }
    if (userInfo.email) {
      return userInfo.email.substring(0, 2).toUpperCase();
    }
    return 'U';
  };
  
  const getName = () => {
    if (userInfo.first_name && userInfo.last_name) {
      return `${userInfo.first_name} ${userInfo.last_name}`;
    }
    return userInfo.email || userInfo.user_id;
  };
  
  const shape = userInfo.icon_shape || 'circle';
  const color = userInfo.icon_color || '#4f46e5';
  
  const getShapeStyles = () => {
    if (shape === 'circle') {
      return { borderRadius: '50%' };
    } else if (shape === 'square') {
      return { borderRadius: '4px' };
    } else if (shape === 'hex') {
      // True hexagon using clip-path
      return { 
        clipPath: 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%)'
      };
    }
    return { borderRadius: '50%' };
  };
  
  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: color,
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${size / 2.5}px`,
        fontWeight: 'bold',
        ...getShapeStyles(),
        flexShrink: 0
      }}
      title={getName()}
      aria-label={`Question created by ${getName()}`}
      role="img"
    >
      {getInitials()}
    </div>
  );
};

// Color palette for keyword bubbles
const KEYWORD_COLORS = ['#e3f2fd', '#f3e5f5', '#e8f5e9', '#fff3e0', '#fce4ec'];

// Sort function for newest-first ordering
const sortByNewest = (a, b) => new Date(b.created_at) - new Date(a.created_at);

export default function QuestionBank() {
  const { user } = useAuth();
  const [myQuestions, setMyQuestions] = useState([]);
  const [allQuestions, setAllQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [myQuestionsCollapsed, setMyQuestionsCollapsed] = useState(false);
  const [allQuestionsCollapsed, setAllQuestionsCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState('card'); // 'card' or 'table'
  const [imageUrls, setImageUrls] = useState({}); // Cache for signed URLs
  const [userInfoCache, setUserInfoCache] = useState({}); // Cache for user info
  const [isTeacher, setIsTeacher] = useState(false); // Track if current user is a teacher
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState('all'); // 'all', 'keywords', 'tags', 'course', 'text'

  const itemsPerPage = 6;

  // Filter questions based on search query and filter type
  const filterQuestions = (questions) => {
    if (!searchQuery.trim()) return questions;
    
    const query = searchQuery.toLowerCase().trim();
    
    return questions.filter(question => {
      const text = (question.text || '').toLowerCase();
      const title = (question.title || '').toLowerCase();
      const keywords = (question.keywords || '').toLowerCase();
      const tags = (question.tags || '').toLowerCase();
      const course = (question.course || '').toLowerCase();
      const school = (question.school || '').toLowerCase();
      const questionType = (question.question_type || '').toLowerCase();
      const bloomsTaxonomy = (question.blooms_taxonomy || '').toLowerCase();
      
      switch (searchFilter) {
        case 'keywords':
          return keywords.includes(query);
        case 'tags':
          return tags.includes(query);
        case 'course':
          return course.includes(query) || school.includes(query);
        case 'text':
          return text.includes(query) || title.includes(query);
        case 'all':
        default:
          return (
            text.includes(query) ||
            title.includes(query) ||
            keywords.includes(query) ||
            tags.includes(query) ||
            course.includes(query) ||
            school.includes(query) ||
            questionType.includes(query) ||
            bloomsTaxonomy.includes(query)
          );
      }
    });
  };

  // Filtered questions
  const filteredMyQuestions = filterQuestions(myQuestions);
  const filteredAllQuestions = filterQuestions(allQuestions);

  // Fetch current user info to check if they are a teacher
  useEffect(() => {
    async function fetchUserInfo() {
      try {
        const info = await getUserInfo();
        setIsTeacher(info.teacher === true);
      } catch (err) {
        console.error('Failed to fetch user info:', err);
        setIsTeacher(false);
      }
    }
    if (user) {
      fetchUserInfo();
    }
  }, [user]);

  const loadQuestions = async () => {
    setLoading(true);
    setError('');
    try {
      const [myData, allData] = await Promise.all([
        getQuestions(),
        getAllQuestions()
      ]);

      // Filter for verified questions only and sort by newest first
      const verifiedMyQuestions = (myData.questions || [])
        .filter(q => q.is_verified === true)
        .sort(sortByNewest);

      const verifiedAllQuestions = (allData.questions || [])
        .filter(q => q.is_verified === true)
        .sort(sortByNewest);
      
      setMyQuestions(verifiedMyQuestions);
      setAllQuestions(verifiedAllQuestions);
      
      // Generate signed URLs for all questions with images
      const allQuestionsWithImages = [...verifiedMyQuestions, ...verifiedAllQuestions].filter(q => q.image_url);
      const urlPromises = allQuestionsWithImages.map(async (q) => {
        const signedUrl = await getImageSignedUrl(q.image_url);
        return { id: q.id, url: signedUrl };
      });
      
      const urls = await Promise.all(urlPromises);
      const urlMap = {};
      urls.forEach(({ id, url }) => {
        if (url) {
          urlMap[id] = url;
        }
      });
      setImageUrls(urlMap);
      
      // Fetch user info for all questions
      const uniqueUserIds = [...new Set([...verifiedMyQuestions, ...verifiedAllQuestions].map(q => q.user_id))];
      const userPromises = uniqueUserIds.map(async (userId) => {
        try {
          const userInfo = await getUserById(userId);
          return { userId, userInfo };
        } catch (error) {
          console.error(`Failed to fetch user ${userId}:`, error);
          return { userId, userInfo: null };
        }
      });
      
      const users = await Promise.all(userPromises);
      const userMap = {};
      users.forEach(({ userId, userInfo }) => {
        if (userInfo) {
          userMap[userId] = userInfo;
        }
      });
      setUserInfoCache(userMap);
    } catch (err) {
      setError(err.message || 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  const handleDelete = async (questionId) => {
    try {
      await deleteQuestion(questionId);
      setDeleteConfirm(null);
      await loadQuestions();
    } catch (err) {
      setError(err.message || 'Failed to delete question');
    }
  };

  // Wrapper function to render table view using QuestionTable component
  const renderTableView = (questions) => {
    return (
      <QuestionTable
        questions={questions}
        userInfoCache={userInfoCache}
        user={user}
        onDelete={(id) => setDeleteConfirm(id)}
      />
    );
  };

  const renderQuestionCard = (question, showDeleteButton = true, showEditButton = false) => {
    return (
      <QuestionCard
        key={question.id}
        question={question}
        userInfo={userInfoCache[question.user_id]}
        imageUrl={imageUrls[question.id]}
        showDeleteButton={showDeleteButton}
        showEditButton={showEditButton}
        onDelete={(id) => setDeleteConfirm(id)}
      />
    );
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', paddingBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>Question Bank</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {/* View Toggle */}
          <div style={{
            display: 'flex',
            background: '#f3f4f6',
            borderRadius: '8px',
            padding: '0.25rem',
            gap: '0.25rem'
          }}>
            <button
              onClick={() => setViewMode('card')}
              style={{
                padding: '0.5rem 1rem',
                background: viewMode === 'card' ? 'white' : 'transparent',
                color: viewMode === 'card' ? '#111827' : '#6b7280',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: viewMode === 'card' ? '600' : '500',
                boxShadow: viewMode === 'card' ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              Card View
            </button>
            <button
              onClick={() => setViewMode('table')}
              style={{
                padding: '0.5rem 1rem',
                background: viewMode === 'table' ? 'white' : 'transparent',
                color: viewMode === 'table' ? '#111827' : '#6b7280',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: viewMode === 'table' ? '600' : '500',
                boxShadow: viewMode === 'table' ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              Table View
            </button>
          </div>
          <button
            onClick={() => window.location.hash = 'create-question'}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '600',
              transition: 'background-color 0.15s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#218838'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#28a745'}
          >
            + Create New Question
          </button>
          <button
            onClick={loadQuestions}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: '500',
              opacity: loading ? 0.6 : 1,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#0056b3')}
            onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = '#007bff')}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '1rem 1.5rem',
        marginBottom: '2rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex',
        gap: '1rem',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        {/* Search Input */}
        <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
          <div style={{
            position: 'absolute',
            left: '1rem',
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
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.875rem 1rem 0.875rem 3rem',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '1rem',
              outline: 'none',
              transition: 'border-color 0.15s ease',
              boxSizing: 'border-box'
            }}
            onFocus={(e) => e.target.style.borderColor = '#007bff'}
            onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: '#e5e7eb',
                border: 'none',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6b7280',
                fontSize: '1rem',
                lineHeight: 1
              }}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {/* Filter Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: '500' }}>
            Search in:
          </label>
          <select
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{
              padding: '0.75rem 2rem 0.75rem 1rem',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '0.875rem',
              background: 'white',
              cursor: 'pointer',
              outline: 'none',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
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

        {/* Search Results Count */}
        {searchQuery && (
          <div style={{
            fontSize: '0.875rem',
            color: '#6b7280',
            padding: '0.5rem 1rem',
            background: '#f3f4f6',
            borderRadius: '6px',
            whiteSpace: 'nowrap'
          }}>
            Found <strong style={{ color: '#111827' }}>{filteredMyQuestions.length + filteredAllQuestions.length}</strong> questions
          </div>
        )}
      </div>

      {loading && <p>Loading questions...</p>}

      {error && (
        <div style={{
          padding: '1rem',
          background: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '4px',
          color: '#721c24',
          marginBottom: '1rem'
        }}>
          {error}
        </div>
      )}

      {deleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '8px',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h3 style={{ marginTop: 0 }}>Confirm Delete</h3>
            <p>Are you sure you want to delete this question? This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <>
          {/* My Questions Section */}
          <div style={{ marginBottom: '4rem' }}>
            <CollapsibleSection
              title={searchQuery ? `My Questions (${filteredMyQuestions.length} of ${myQuestions.length})` : "My Questions"}
              questions={filteredMyQuestions}
              isCollapsed={myQuestionsCollapsed}
              onToggle={() => setMyQuestionsCollapsed(!myQuestionsCollapsed)}
              borderColor="#007bff"
              viewMode={viewMode}
              itemsPerPage={itemsPerPage}
              renderTableView={renderTableView}
              renderQuestionCard={renderQuestionCard}
              user={user}
              isTeacher={isTeacher}
              emptyStateContent={
                <div style={{
                  padding: '2rem',
                  background: '#f8f9fa',
                  borderRadius: '4px',
                  textAlign: 'center',
                  color: '#666'
                }}>
                  {searchQuery ? (
                    <p>No questions match your search in "My Questions".</p>
                  ) : (
                    <>
                      <p>You haven't created any questions yet.</p>
                      <button
                        onClick={() => window.location.hash = 'create-question'}
                        style={{
                          marginTop: '1rem',
                          padding: '0.5rem 1rem',
                          background: '#28a745',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Create Your First Question
                      </button>
                    </>
                  )}
                </div>
              }
            />
          </div>

          {/* All Questions Section */}
          <div>
            <CollapsibleSection
              title={searchQuery ? `All Questions (${filteredAllQuestions.length} of ${allQuestions.length})` : "All Questions"}
              questions={filteredAllQuestions}
              isCollapsed={allQuestionsCollapsed}
              onToggle={() => setAllQuestionsCollapsed(!allQuestionsCollapsed)}
              borderColor="#28a745"
              viewMode={viewMode}
              itemsPerPage={itemsPerPage}
              renderTableView={renderTableView}
              renderQuestionCard={renderQuestionCard}
              user={user}
              isTeacher={isTeacher}
              emptyStateContent={
                <div style={{
                  padding: '2rem',
                  background: '#f8f9fa',
                  borderRadius: '4px',
                  textAlign: 'center',
                  color: '#666'
                }}>
                  {searchQuery ? (
                    <p>No questions match your search in "All Questions".</p>
                  ) : (
                    <p>No questions found in the system.</p>
                  )}
                </div>
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
