import React, { useState, useEffect } from 'react';
import {
  getQuestions,
  getDraftQuestions,
  getAllQuestions,
  deleteQuestion,
  updateQuestion,
  generateQuestionVariant,
  getImageSignedUrl,
  getUserById,
  getUserInfo
} from '../api';
import { useAuth } from '../AuthContext';
import QuestionCard from '../components/QuestionCard';
import CollapsibleSection from '../components/CollapsibleSection';
import QuestionTable from '../components/QuestionTable';
import QuestionSearchBar from '../components/QuestionSearchBar';
import StudentPreview from '../components/StudentPreview';
import { filterQuestionsBySearch } from '../utils/questionSearch';
import {
  CourseDashboardErrorBanner,
  CourseDashboardHeader,
  CourseDashboardIconButton,
  CourseDashboardSpinnerState,
  CourseDashboardPrimaryButton,
  CourseDashboardSecondaryButton,
  PageContainer,
  dashboardPalette,
  RefreshIcon,
} from '../components/CourseDashboardUI';
import { buildHashWithFrom } from '../utils/navigation';

// Sort function for newest-first ordering
const sortByNewest = (a, b) => new Date(b.created_at) - new Date(a.created_at);

const BANK_TABS = {
  QUESTIONS: 'questions',
  DRAFTS: 'drafts',
  ALL: 'all',
};

const getBankTabFromHash = () => {
  const rawHash = window.location.hash.slice(1);
  const [route, query = ''] = rawHash.split('?');
  if (route !== 'questions') return BANK_TABS.QUESTIONS;

  const params = new URLSearchParams(query);
  const tab = (params.get('tab') || BANK_TABS.QUESTIONS).toLowerCase();
  if (tab === BANK_TABS.DRAFTS || tab === BANK_TABS.ALL) {
    return tab;
  }
  return BANK_TABS.QUESTIONS;
};

const tabsHeaderRowStyle = {
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: '1rem',
  borderBottom: `1px solid ${dashboardPalette.border}`,
  marginBottom: '20px',
  flexWrap: 'wrap'
};

const viewToggleRowStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  marginLeft: 'auto',
  padding: '0.2rem',
  paddingBottom: '8px',
  flexShrink: 0,
  borderRadius: '10px',
  background: dashboardPalette.surface,
  gap: '0.2rem'
};

const getViewToggleButtonStyle = (active) => ({
  height: '32px',
  padding: '0 0.7rem',
  background: active ? dashboardPalette.white : 'transparent',
  color: active ? dashboardPalette.text : dashboardPalette.muted,
  border: `1px solid ${active ? dashboardPalette.border : 'transparent'}`,
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: active ? 700 : 600,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1
});

const questionBankTabsStyle = {
  display: 'flex',
  gap: '2rem',
  alignItems: 'flex-end',
  overflowX: 'auto',
  minWidth: 0,
  flex: '1 1 420px'
};

const getQuestionBankTabStyle = (active) => ({
  padding: '0 0 10px',
  margin: 0,
  background: 'transparent',
  color: active ? dashboardPalette.navy : dashboardPalette.muted,
  border: 'none',
  borderBottom: `2px solid ${active ? dashboardPalette.navy : 'transparent'}`,
  borderRadius: 0,
  cursor: 'pointer',
  fontSize: '0.95rem',
  fontWeight: 600,
  lineHeight: 1.2,
  whiteSpace: 'nowrap'
});

const modalOverlayStyle = {
  position: 'fixed',
  inset: '64px 0 0 0',
  background: 'rgba(10, 31, 53, 0.45)',
  zIndex: 1200,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  overflowY: 'auto',
  padding: '1rem'
};

const modalCardStyle = {
  background: dashboardPalette.white,
  borderRadius: '8px',
  border: `1px solid ${dashboardPalette.border}`,
  padding: '1.5rem'
};

const emptyStateStyle = {
  padding: '1.5rem',
  background: dashboardPalette.white,
  border: `1px solid ${dashboardPalette.border}`,
  borderRadius: '8px',
  textAlign: 'center',
  color: dashboardPalette.muted
};

const setQuestionBankTabInHash = (tab) => {
  if (tab && tab !== BANK_TABS.QUESTIONS) {
    window.location.hash = `questions?tab=${tab}`;
    return;
  }
  window.location.hash = 'questions';
};

export default function QuestionBank() {
  const { user } = useAuth();
  const [myQuestions, setMyQuestions] = useState([]);
  const [draftQuestions, setDraftQuestions] = useState([]);
  const [allQuestions, setAllQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [myQuestionsCollapsed, setMyQuestionsCollapsed] = useState(false);
  const [draftQuestionsCollapsed, setDraftQuestionsCollapsed] = useState(false);
  const [allQuestionsCollapsed, setAllQuestionsCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'card' or 'table'
  const [imageUrls, setImageUrls] = useState({}); // Cache for signed URLs
  const [userInfoCache, setUserInfoCache] = useState({}); // Cache for user info
  const [isTeacher, setIsTeacher] = useState(false); // Track if current user is a teacher
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState('all'); // 'all', 'keywords', 'tags', 'course', 'text'
  const [studentViewQuestion, setStudentViewQuestion] = useState(null);
  const [activeBankTab, setActiveBankTab] = useState(getBankTabFromHash);
  const [generationModalOpen, setGenerationModalOpen] = useState(false);
  const [generationModalQuestion, setGenerationModalQuestion] = useState(null);
  const [variantLoadingId, setVariantLoadingId] = useState(null);
  const [pendingVariantCount, setPendingVariantCount] = useState(0);
  const [approveDraftQuestion, setApproveDraftQuestion] = useState(null);
  const [approveDraftLoading, setApproveDraftLoading] = useState(false);

  const itemsPerPage = 6;

  // Filtered questions
  const filteredMyQuestions = filterQuestionsBySearch(myQuestions, searchQuery, searchFilter);
  const filteredDraftQuestions = filterQuestionsBySearch(draftQuestions, searchQuery, searchFilter);
  const filteredAllQuestions = filterQuestionsBySearch(allQuestions, searchQuery, searchFilter);
  const activeQuestions =
    activeBankTab === BANK_TABS.DRAFTS
      ? filteredDraftQuestions
      : activeBankTab === BANK_TABS.ALL
        ? filteredAllQuestions
        : filteredMyQuestions;

  const draftGenerationStatus = pendingVariantCount > 0
    ? `${pendingVariantCount} generating...`
    : '';

  const hydrateQuestionMetadata = async (questions, replace = false) => {
    const imageQuestions = questions.filter(q => q.image_url);
    const urlPromises = imageQuestions.map(async (q) => {
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
    setImageUrls(prev => (replace ? urlMap : { ...prev, ...urlMap }));

    const uniqueUserIds = [...new Set(questions.map(q => q.user_id).filter(Boolean))];
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
    setUserInfoCache(prev => (replace ? userMap : { ...prev, ...userMap }));
  };

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

  useEffect(() => {
    const syncTabFromHash = () => {
      setActiveBankTab(getBankTabFromHash());
    };

    syncTabFromHash();
    window.addEventListener('hashchange', syncTabFromHash);
    return () => window.removeEventListener('hashchange', syncTabFromHash);
  }, []);

  const loadBankData = async () => {
    setLoading(true);
    setError('');
    try {
      const [myData, draftData, allData] = await Promise.all([
        getQuestions({ verified_only: true, limit: 1000 }),
        getDraftQuestions({ limit: 1000 }),
        getAllQuestions({ limit: 1000 })
      ]);

      // Filter for verified questions only and sort by newest first
      const verifiedMyQuestions = (myData.questions || [])
        .filter(q => q.is_verified === true)
        .sort(sortByNewest);

      const draftMyQuestions = (draftData.questions || [])
        .filter(q => q.is_verified === false)
        .sort(sortByNewest);

      const verifiedAllQuestions = (allData.questions || [])
        .filter(q => q.is_verified === true)
        .sort(sortByNewest);

      setMyQuestions(verifiedMyQuestions);
      setDraftQuestions(draftMyQuestions);
      setAllQuestions(verifiedAllQuestions);
      await hydrateQuestionMetadata([...verifiedMyQuestions, ...draftMyQuestions, ...verifiedAllQuestions], true);
    } catch (err) {
      setError(err.message || 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBankData();
  }, []);

  const refreshDraftQuestions = async () => {
    try {
      const draftData = await getDraftQuestions({ limit: 1000 });
      const draftMyQuestions = (draftData.questions || []).sort(sortByNewest);
      setDraftQuestions(draftMyQuestions);
      await hydrateQuestionMetadata(draftMyQuestions, false);
    } catch (err) {
      console.error('Failed to refresh draft questions:', err);
    }
  };

  const handleDelete = async (questionId) => {
    try {
      await deleteQuestion(questionId);
      setDeleteConfirm(null);
      await loadBankData();
    } catch (err) {
      setError(err.message || 'Failed to delete question');
    }
  };

  const openApproveDraftModal = (question) => {
    setApproveDraftQuestion(question);
  };

  const closeApproveDraftModal = () => {
    setApproveDraftQuestion(null);
    setApproveDraftLoading(false);
  };

  const handleApproveDraft = async () => {
    if (!approveDraftQuestion) return;
    setApproveDraftLoading(true);
    try {
      await updateQuestion(approveDraftQuestion.id, { is_verified: true });
      closeApproveDraftModal();
      await loadBankData();
    } catch (err) {
      setError(err.message || 'Failed to approve draft question');
      setApproveDraftLoading(false);
    }
  };

  const handleGenerateVariant = async (question) => {
    setVariantLoadingId(question.id);
    setPendingVariantCount((count) => count + 1);
    setGenerationModalQuestion(question);
    setGenerationModalOpen(true);
    try {
      await generateQuestionVariant(question.id);
      await refreshDraftQuestions();
    } catch (err) {
      setError(err.message || 'Failed to generate question variant');
    } finally {
      setVariantLoadingId(null);
      setPendingVariantCount((count) => Math.max(0, count - 1));
    }
  };

  const closeGenerationModal = () => {
    setGenerationModalOpen(false);
    setGenerationModalQuestion(null);
    setVariantLoadingId(null);
  };

  const openBankTab = (tab) => {
    setActiveBankTab(tab);
    closeGenerationModal();
    setQuestionBankTabInHash(tab);
  };

  // Wrapper function to render table view using QuestionTable component
  const renderTableView = (questions) => {
    return (
      <QuestionTable
        questions={questions}
        userInfoCache={userInfoCache}
        user={user}
        showEditButton={isTeacher}
        showVariantButton={isTeacher && activeBankTab !== BANK_TABS.DRAFTS}
        showApproveButton={activeBankTab === BANK_TABS.DRAFTS}
        showBloomsTaxonomy={false}
        variantLoadingId={variantLoadingId}
        showUniversity={true}
        onDelete={(id) => setDeleteConfirm(id)}
        onGenerateVariant={handleGenerateVariant}
        onApproveDraft={openApproveDraftModal}
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
        showVariantButton={isTeacher && activeBankTab !== BANK_TABS.DRAFTS}
        showApproveButton={activeBankTab === BANK_TABS.DRAFTS}
        variantLoading={variantLoadingId === question.id}
        onDelete={(id) => setDeleteConfirm(id)}
        onStudentView={(q) => setStudentViewQuestion(q)}
        onGenerateVariant={handleGenerateVariant}
        onApproveDraft={openApproveDraftModal}
        compact={true}
      />
    );
  };

  return (
    <PageContainer maxWidth="1280px">
      <CourseDashboardHeader
        title="Question Bank"
        subtitle="Browse verified questions, draft variants, and shared question content."
        action={(
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <CourseDashboardPrimaryButton onClick={() => { window.location.hash = buildHashWithFrom('upload-pdf'); }}>
              Upload Questions by PDF
            </CourseDashboardPrimaryButton>
            <CourseDashboardSecondaryButton onClick={() => { window.location.hash = buildHashWithFrom('create-question'); }}>
              Create Question
            </CourseDashboardSecondaryButton>
            <CourseDashboardIconButton
              onClick={loadBankData}
              disabled={loading}
              title={loading ? 'Refreshing questions' : 'Refresh questions'}
              aria-label={loading ? 'Refreshing questions' : 'Refresh questions'}
              style={{ opacity: loading ? 0.65 : 1 }}
            >
              <span style={{ display: 'inline-flex', transform: loading ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
                <RefreshIcon />
              </span>
            </CourseDashboardIconButton>
          </div>
        )}
      />

      <div style={tabsHeaderRowStyle}>
        <div style={questionBankTabsStyle}>
          <button
            onClick={() => openBankTab(BANK_TABS.QUESTIONS)}
            style={getQuestionBankTabStyle(activeBankTab === BANK_TABS.QUESTIONS)}
          >
            My Questions
          </button>
          <button
            onClick={() => openBankTab(BANK_TABS.DRAFTS)}
            style={getQuestionBankTabStyle(activeBankTab === BANK_TABS.DRAFTS)}
          >
            My Drafts
          </button>
          <button
            onClick={() => openBankTab(BANK_TABS.ALL)}
            style={getQuestionBankTabStyle(activeBankTab === BANK_TABS.ALL)}
          >
            All Questions
          </button>
        </div>

        {!loading && (
          <div style={viewToggleRowStyle}>
            <button
              onClick={() => setViewMode('table')}
              style={getViewToggleButtonStyle(viewMode === 'table')}
            >
              Table View
            </button>
            <button
              onClick={() => setViewMode('card')}
              style={getViewToggleButtonStyle(viewMode === 'card')}
            >
              Card View
            </button>
          </div>
        )}
      </div>

      {loading && <CourseDashboardSpinnerState style={{ padding: '12px 0' }} />}

      {error && <CourseDashboardErrorBanner>{error}</CourseDashboardErrorBanner>}

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
          <div style={{ ...modalCardStyle, maxWidth: '400px', width: '90%' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.65rem', color: dashboardPalette.navy }}>Confirm Delete</h3>
            <p style={{ marginTop: 0, color: dashboardPalette.muted }}>Are you sure you want to delete this question? This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <CourseDashboardSecondaryButton onClick={() => setDeleteConfirm(null)}>
                Cancel
              </CourseDashboardSecondaryButton>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirm)}
                style={{
                  height: '40px',
                  padding: '0 1rem',
                  background: dashboardPalette.white,
                  color: dashboardPalette.dangerText,
                  border: `1px solid ${dashboardPalette.dangerBorder}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '700'
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {approveDraftQuestion && (
        <div
          style={{ ...modalOverlayStyle, inset: 0, alignItems: 'center', zIndex: 1100 }}
          onClick={closeApproveDraftModal}
        >
          <div
            style={{ ...modalCardStyle, width: 'min(460px, 100%)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: '0.65rem', color: dashboardPalette.navy }}>
              Approve Draft
            </h3>
            <p style={{ marginTop: 0, marginBottom: '1.25rem', color: dashboardPalette.muted, lineHeight: 1.5 }}>
              Are you sure you want to approve this draft? This will save the question into our question database.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <CourseDashboardSecondaryButton
                onClick={closeApproveDraftModal}
                disabled={approveDraftLoading}
                style={{ opacity: approveDraftLoading ? 0.6 : 1 }}
              >
                Cancel
              </CourseDashboardSecondaryButton>
              <CourseDashboardPrimaryButton
                onClick={handleApproveDraft}
                disabled={approveDraftLoading}
                style={{ opacity: approveDraftLoading ? 0.7 : 1 }}
              >
                {approveDraftLoading ? 'Approving...' : 'Approve'}
              </CourseDashboardPrimaryButton>
            </div>
          </div>
        </div>
      )}

      {studentViewQuestion && (
        <div
          style={modalOverlayStyle}
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
                  border: `1px solid ${dashboardPalette.border}`,
                  background: dashboardPalette.white,
                  color: dashboardPalette.text,
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
                  border: `1px solid ${dashboardPalette.border}`,
                  background: dashboardPalette.white,
                  color: dashboardPalette.text,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Close
              </button>
            </div>
            <div style={{ border: `1px solid ${dashboardPalette.border}`, borderRadius: '8px', overflowY: 'auto', background: dashboardPalette.surface, height: '78vh', maxHeight: '78vh' }}>
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

      {generationModalOpen && (
        <div
          style={{ ...modalOverlayStyle, zIndex: 1250 }}
          onClick={closeGenerationModal}
        >
          <div
            style={{ ...modalCardStyle, width: 'min(720px, 100%)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: dashboardPalette.navy, marginBottom: '0.45rem' }}>
                  Variant generation started
                </div>
                <p style={{ margin: 0, color: dashboardPalette.muted, fontSize: '0.98rem', lineHeight: 1.5 }}>
                  Variant generation is happening in the background and may take a minute.
                </p>
                {generationModalQuestion?.title ? (
                  <p style={{ margin: '0.75rem 0 0 0', color: dashboardPalette.muted, fontSize: '0.9rem' }}>
                    Source: {generationModalQuestion.title}
                  </p>
                ) : null}
              </div>
              <CourseDashboardSecondaryButton onClick={closeGenerationModal}>
                Close
              </CourseDashboardSecondaryButton>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
              <CourseDashboardPrimaryButton
                onClick={() => {
                  closeGenerationModal();
                  openBankTab(BANK_TABS.DRAFTS);
                }}
              >
                My Drafts
              </CourseDashboardPrimaryButton>
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <>
          <QuestionSearchBar
            searchQuery={searchQuery}
            searchFilter={searchFilter}
            onSearchQueryChange={setSearchQuery}
            onSearchFilterChange={setSearchFilter}
            onClearSearch={() => setSearchQuery('')}
            showResultCount={Boolean(searchQuery)}
            resultCount={activeQuestions.length}
            compact={true}
            containerStyle={{ marginBottom: '20px' }}
          />

          {activeBankTab === BANK_TABS.QUESTIONS && (
            <div style={{ marginBottom: '8px' }}>
              <CollapsibleSection
                title={searchQuery ? `My Questions (${filteredMyQuestions.length} of ${myQuestions.length})` : "My Questions"}
                questions={filteredMyQuestions}
                isCollapsed={myQuestionsCollapsed}
                onToggle={() => setMyQuestionsCollapsed(!myQuestionsCollapsed)}
                borderColor={dashboardPalette.navy}
                viewMode={viewMode}
                itemsPerPage={itemsPerPage}
                renderTableView={renderTableView}
                renderQuestionCard={renderQuestionCard}
                user={user}
                isTeacher={isTeacher}
                emptyStateContent={
                  <div style={emptyStateStyle}>
                    {searchQuery ? (
                      <p>No questions match your search in "My Questions".</p>
                    ) : (
                      <>
                        <p>You haven't created any questions yet.</p>
                        <CourseDashboardPrimaryButton
                          onClick={() => { window.location.hash = buildHashWithFrom('create-question'); }}
                          style={{ marginTop: '0.75rem' }}
                        >
                          Create Your First Question
                        </CourseDashboardPrimaryButton>
                      </>
                    )}
                  </div>
                }
              />
            </div>
          )}

          {activeBankTab === BANK_TABS.DRAFTS && (
            <div style={{ marginBottom: '8px' }}>
              <CollapsibleSection
                title="My Drafts"
                questions={filteredDraftQuestions}
                isCollapsed={draftQuestionsCollapsed}
                onToggle={() => setDraftQuestionsCollapsed(!draftQuestionsCollapsed)}
                borderColor={dashboardPalette.gold}
                viewMode={viewMode}
                itemsPerPage={itemsPerPage}
                renderTableView={renderTableView}
                renderQuestionCard={renderQuestionCard}
                user={user}
                isTeacher={isTeacher}
                headerContent={
                  draftGenerationStatus ? (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.45rem 0.65rem',
                        background: dashboardPalette.surface,
                        border: `1px solid ${dashboardPalette.border}`,
                        borderRadius: '8px',
                        color: dashboardPalette.navy,
                        fontSize: '0.8rem',
                        fontWeight: 700
                      }}
                    >
                      <span
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          border: `2px solid ${dashboardPalette.navyLight}`,
                          borderTopColor: dashboardPalette.navy,
                          animation: 'caliber-spin 0.8s linear infinite',
                          flexShrink: 0
                        }}
                      />
                      {draftGenerationStatus}
                    </div>
                  ) : null
                }
                emptyStateContent={
                  <div style={emptyStateStyle}>
                    {searchQuery ? (
                      <p>No drafts match your search in "My Drafts".</p>
                    ) : (
                      <p>You do not have any draft questions yet.</p>
                    )}
                  </div>
                }
              />
            </div>
          )}

          {activeBankTab === BANK_TABS.ALL && (
            <div style={{ marginBottom: '8px' }}>
              <CollapsibleSection
                title={searchQuery ? `All Questions (${filteredAllQuestions.length} of ${allQuestions.length})` : "All Questions"}
                questions={filteredAllQuestions}
                isCollapsed={allQuestionsCollapsed}
                onToggle={() => setAllQuestionsCollapsed(!allQuestionsCollapsed)}
                borderColor={dashboardPalette.navyMid}
                viewMode={viewMode}
                itemsPerPage={itemsPerPage}
                renderTableView={renderTableView}
                renderQuestionCard={renderQuestionCard}
                user={user}
                isTeacher={isTeacher}
                emptyStateContent={
                  <div style={emptyStateStyle}>
                    {searchQuery ? (
                      <p>No questions match your search in "All Questions".</p>
                    ) : (
                      <p>No questions found in the system.</p>
                    )}
                  </div>
                }
              />
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
