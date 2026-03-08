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
import QuestionSearchBar from '../components/QuestionSearchBar';
import StudentPreview from '../components/StudentPreview';
import { filterQuestionsBySearch } from '../utils/questionSearch';

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
  const [viewMode, setViewMode] = useState('table'); // 'card' or 'table'
  const [imageUrls, setImageUrls] = useState({}); // Cache for signed URLs
  const [userInfoCache, setUserInfoCache] = useState({}); // Cache for user info
  const [isTeacher, setIsTeacher] = useState(false); // Track if current user is a teacher
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState('all'); // 'all', 'keywords', 'tags', 'course', 'text'
  const [studentViewQuestion, setStudentViewQuestion] = useState(null);

  const itemsPerPage = 6;

  // Filtered questions
  const filteredMyQuestions = filterQuestionsBySearch(myQuestions, searchQuery, searchFilter);
  const filteredAllQuestions = filterQuestionsBySearch(allQuestions, searchQuery, searchFilter);

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
        getQuestions({ limit: 1000 }),
        getAllQuestions({ limit: 1000 })
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
        showEditButton={isTeacher}
        showUniversity={true}
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
        showStudentViewButton={true}
        onDelete={(id) => setDeleteConfirm(id)}
        onStudentView={(q) => setStudentViewQuestion(q)}
      />
    );
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0.25rem 0.5rem 1.75rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1.2rem'
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '2.3rem',
              fontWeight: '800',
              color: '#0f172a',
              letterSpacing: '-0.025em',
              lineHeight: 1.08
            }}
          >
            Question Bank
          </h1>
          <p style={{ margin: '0.45rem 0 0 0', color: '#475569', fontSize: '0.95rem' }}>
            Search verified prompts quickly and use AI upload to generate new drafts from PDFs.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            onClick={() => window.location.hash = 'upload-pdf'}
            style={{
              padding: '0.72rem 1.1rem',
              background: 'linear-gradient(125deg, #06b6d4 0%, #2563eb 45%, #7c3aed 100%)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '700',
              letterSpacing: '0.01em',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease',
              boxShadow: '0 10px 22px rgba(37,99,235,0.35), inset 0 1px 0 rgba(255,255,255,0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.filter = 'brightness(1.04)';
              e.currentTarget.style.boxShadow = '0 12px 24px rgba(37,99,235,0.4), inset 0 1px 0 rgba(255,255,255,0.35)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.filter = 'brightness(1)';
              e.currentTarget.style.boxShadow = '0 10px 22px rgba(37,99,235,0.35), inset 0 1px 0 rgba(255,255,255,0.35)';
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Upload Questions by PDF
          </button>

          <button
            onClick={() => window.location.hash = 'create-question'}
            style={{
              padding: '0.72rem 1rem',
              background: '#ffffff',
              color: '#0f172a',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '0.88rem',
              fontWeight: '700',
              transition: 'background-color 0.15s ease',
              boxShadow: '0 1px 2px rgba(15,23,42,0.08)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
          >
            Create Question
          </button>

          <button
            onClick={loadQuestions}
            disabled={loading}
            title={loading ? 'Refreshing questions' : 'Refresh questions'}
            aria-label={loading ? 'Refreshing questions' : 'Refresh questions'}
            style={{
              padding: '0.25rem',
              width: 'auto',
              background: 'transparent',
              color: loading ? '#94a3b8' : '#1d4ed8',
              border: 'none',
              borderRadius: '0',
              cursor: loading ? 'not-allowed' : 'pointer',
              lineHeight: 0,
              opacity: loading ? 0.8 : 1,
              transition: 'all 0.15s ease'
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              style={{ transform: loading ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
            >
              <path
                d="M20 4v6h-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 20v-6h6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M20 10a8 8 0 0 0-14-4L4 10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 14a8 8 0 0 0 14 4l2-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <QuestionSearchBar
        searchQuery={searchQuery}
        searchFilter={searchFilter}
        onSearchQueryChange={setSearchQuery}
        onSearchFilterChange={setSearchFilter}
        onClearSearch={() => setSearchQuery('')}
        showResultCount={Boolean(searchQuery)}
        resultCount={filteredMyQuestions.length + filteredAllQuestions.length}
        containerStyle={{ marginBottom: '1.7rem' }}
      />

      {loading && <p style={{ color: '#64748b', fontWeight: 600 }}>Loading questions...</p>}

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

      {studentViewQuestion && (
        <div
          style={{
            position: 'fixed',
            inset: '64px 0 0 0',
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1200,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            overflowY: 'auto',
            padding: '1rem'
          }}
          onClick={() => setStudentViewQuestion(null)}
        >
          <div
            style={{ width: 'min(1050px, 100%)', background: 'transparent' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div
                style={{
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  background: 'white',
                  color: '#374151',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '1rem'
                }}
              >
                Student View
              </div>
              <button
                type="button"
                onClick={() => setStudentViewQuestion(null)}
                style={{
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  background: 'white',
                  color: '#374151',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Close
              </button>
            </div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflowY: 'auto', background: '#f8fafc', height: '78vh', maxHeight: '78vh' }}>
              <StudentPreview
                inline={true}
                isPreviewMode={false}
                forceReadOnly={true}
                showStatusBanner={false}
                showHeader={false}
                showPrevNextButtons={false}
                assignmentTitle={studentViewQuestion.title || 'Untitled Question'}
                assignmentType={studentViewQuestion.question_type?.toUpperCase() || 'Question'}
                questions={[studentViewQuestion]}
              />
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <div
              style={{
                display: 'inline-flex',
                background: '#f8fafc',
                border: '1px solid #dbe5f1',
                borderRadius: '11px',
                padding: '0.25rem',
                gap: '0.25rem'
              }}
            >
              <button
                onClick={() => setViewMode('table')}
                style={{
                  padding: '0.45rem 0.9rem',
                  background: viewMode === 'table' ? '#ffffff' : 'transparent',
                  color: viewMode === 'table' ? '#0f172a' : '#64748b',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: viewMode === 'table' ? '700' : '600',
                  boxShadow: viewMode === 'table' ? '0 1px 3px rgba(15,23,42,0.12)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                Table View
              </button>
              <button
                onClick={() => setViewMode('card')}
                style={{
                  padding: '0.45rem 0.9rem',
                  background: viewMode === 'card' ? '#ffffff' : 'transparent',
                  color: viewMode === 'card' ? '#0f172a' : '#64748b',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: viewMode === 'card' ? '700' : '600',
                  boxShadow: viewMode === 'card' ? '0 1px 3px rgba(15,23,42,0.12)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                Card View
              </button>
            </div>
          </div>

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
