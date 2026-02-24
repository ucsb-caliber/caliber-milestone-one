import React, { useState, useEffect } from "react";
import { useRef } from "react";
import * as api from "../api";
import QuestionCard from "../components/QuestionCard";

const VerifyQuestions = () => {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState([]);
  const [imageUrls, setImageUrls] = useState({});
  const skipCleanupRef = useRef(false);
  const cleanupStartedRef = useRef(false);
  const latestQuestionsRef = useRef([]);

  // Parse source file metadata from hash manually since you aren't using react-router-dom
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.split("?")[1] || "");
  const sourcePath = params.get("source") || params.get("file");
  const sourceFileName = params.get("file") || sourcePath;
  const orderParam = params.get("order") || "";
  const orderedIdsFromHash = orderParam
    .split(",")
    .map((id) => parseInt(id, 10))
    .filter((id) => Number.isInteger(id));

  const applyStableOrder = (pendingQuestions) => {
    if (!pendingQuestions || pendingQuestions.length === 0) return [];

    // Default deterministic order for first load.
    const fallbackSorted = [...pendingQuestions].sort((a, b) => a.id - b.id);
    if (orderedIdsFromHash.length === 0) return fallbackSorted;

    const orderIndex = new Map(orderedIdsFromHash.map((id, idx) => [id, idx]));
    return [...fallbackSorted].sort((a, b) => {
      const ai = orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.id - b.id;
    });
  };

  useEffect(() => {
    latestQuestionsRef.current = questions;
  }, [questions]);

  const cleanupUnverifiedQuestions = async (questionsToCheck, options = {}) => {
    if (sourcePath) {
      await api.deleteUnverifiedQuestionsBySource(sourcePath, options).catch(() => ({ deleted_count: 0 }));
      return;
    }

    const unverifiedQuestions = (questionsToCheck || []).filter((q) => q && q.is_verified !== true);
    if (unverifiedQuestions.length === 0) return;

    const BATCH_SIZE = 10;
    for (let i = 0; i < unverifiedQuestions.length; i += BATCH_SIZE) {
      const batch = unverifiedQuestions.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((q) => api.deleteQuestion(q.id, options).catch(() => false)));
    }
  };

  const runCleanupOnce = (options = {}) => {
    if (skipCleanupRef.current || cleanupStartedRef.current) return;
    const currentHash = window.location.hash.slice(1);
    if (currentHash.startsWith('verify') && !options.forceOnVerify) return;
    cleanupStartedRef.current = true;
    void (async () => {
      await cleanupUnverifiedQuestions(latestQuestionsRef.current, options);
      if (!sourcePath) return;
      // Retry to catch late-arriving background-generated drafts.
      setTimeout(() => {
        void api.deleteUnverifiedQuestionsBySource(sourcePath, options).catch(() => ({ deleted_count: 0 }));
      }, 4000);
      setTimeout(() => {
        void api.deleteUnverifiedQuestionsBySource(sourcePath, options).catch(() => ({ deleted_count: 0 }));
      }, 12000);
    })();
  };

  useEffect(() => {
    // Handle missing file parameter
    if (!sourcePath) {
      setError("No source file specified. Please upload a PDF to generate questions.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    let timer = null;
    let attempts = 0;
    const MAX_POLL_ATTEMPTS = 15;
    const POLL_INTERVAL_MS = 2000;

    const fetchDrafts = async () => {
      try {
        // Uses the filtered getQuestions from your api.js
        const data = await api.getQuestions({
          verified_only: false,
          source_pdf: sourcePath,
        });

        if (cancelled) return;
        const pendingQuestions = applyStableOrder(data.questions || []);
        setQuestions(pendingQuestions);
        setSelectedQuestionIds((prev) => {
          const incomingIds = pendingQuestions.map((q) => q.id);
          if (prev.length === 0) return incomingIds;
          const prevSet = new Set(prev);
          for (const id of incomingIds) prevSet.add(id);
          return Array.from(prevSet);
        });
        setError(null);

        const questionsWithImages = pendingQuestions.filter((q) => q.image_url);
        const urlEntries = await Promise.all(
          questionsWithImages.map(async (q) => {
            const signedUrl = await api.getImageSignedUrl(q.image_url);
            return [q.id, signedUrl];
          })
        );
        if (!cancelled) {
          setImageUrls(Object.fromEntries(urlEntries.filter(([, url]) => Boolean(url))));
        }

        if (pendingQuestions.length > 0) {
          setLoading(false);
        }
        if (attempts >= MAX_POLL_ATTEMPTS) {
          if (pendingQuestions.length === 0) setLoading(false);
          return;
        }

        attempts += 1;
        timer = setTimeout(fetchDrafts, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        console.error("Error fetching pending questions:", err);
        setError(err.message || "Failed to fetch questions. Please try again.");
        setLoading(false);
      }
    };

    setLoading(true);
    fetchDrafts();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sourcePath, orderParam]);


  const toggleQuestionSelection = (questionId) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId]
    );
  };

  const handleConfirmSelected = async () => {
    if (selectedQuestionIds.length === 0) return;

    setIsVerifying(true);
    try {
      // Limit concurrent HTTP requests by processing questions in batches
      const BATCH_SIZE = 10;
      const latestData = await api.getQuestions({
        verified_only: false,
        source_pdf: sourcePath,
      });
      const existingById = new Map((latestData.questions || []).map((q) => [q.id, q]));
      const selectedQuestions = selectedQuestionIds
        .map((id) => existingById.get(id))
        .filter(Boolean);

      if (selectedQuestions.length === 0) {
        throw new Error('No selected draft questions were found. They may have been deleted or already verified.');
      }

      for (let i = 0; i < selectedQuestions.length; i += BATCH_SIZE) {
        const batch = selectedQuestions.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map((q) =>
          api.updateQuestion(q.id, { is_verified: true }).catch(() => null)
        );
        await Promise.all(batchPromises);
      }

      const unselectedQuestions = (latestData.questions || []).filter((q) => !selectedQuestionIds.includes(q.id));
      await cleanupUnverifiedQuestions(unselectedQuestions);
      
      // Use hash navigation to return to the Question Bank
      skipCleanupRef.current = true;
      cleanupStartedRef.current = true;
      window.location.hash = "questions"; 
    } catch (err) {
      alert(`Failed to verify questions: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleEditQuestion = (question) => {
    const orderedIds = questions.map((q) => q.id).join(",");
    const returnTo = encodeURIComponent(
      `verify?source=${encodeURIComponent(sourcePath || "")}&file=${encodeURIComponent(sourceFileName || "")}&order=${encodeURIComponent(orderedIds)}`
    );
    skipCleanupRef.current = true;
    cleanupStartedRef.current = true;
    window.location.hash = `edit-question?id=${question.id}&returnTo=${returnTo}`;
  };

  useEffect(() => {
    const onHashChange = () => {
      const nextHash = window.location.hash.slice(1);
      if (!nextHash.startsWith('verify')) {
        runCleanupOnce();
      }
    };

    const onBeforeUnload = () => {
      runCleanupOnce({ keepalive: true });
    };

    const onVisibilityChange = () => {
      const currentHash = window.location.hash.slice(1);
      if (document.visibilityState === 'hidden' && !currentHash.startsWith('verify')) {
        runCleanupOnce({ keepalive: true });
      }
    };

    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const currentHash = window.location.hash.slice(1);
      if (!currentHash.startsWith('verify')) {
        runCleanupOnce({ keepalive: true, forceOnVerify: false });
      }
    };
  }, []);

  // Handle error state
  if (error) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#dc3545', marginBottom: '1rem' }}>Error</h1>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>{error}</p>
        <button
          onClick={() => window.location.hash = "home"}
          style={{
            background: '#007bff',
            color: 'white',
            padding: '0.75rem 1.5rem',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Go to Home
        </button>
      </div>
    );
  }

  // Handle loading state
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        Waiting for AI to generate questions from <strong>{sourceFileName}</strong>...
      </div>
    );
  }

  // Handle empty state when no pending questions are available (or still generating)
  if (questions.length === 0) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>No Pending Questions Found</h1>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>
          There are no pending questions for <strong>{sourceFileName}</strong> at the moment. If you just uploaded this file,
          questions may still be generating. You can retry or return to the question bank below.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: '#007bff',
            color: 'white',
            padding: '0.75rem 1.5rem',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            marginRight: '1rem'
          }}
        >
          Retry
        </button>
        <button
          onClick={() => window.location.hash = "questions"}
          style={{
            background: '#6c757d',
            color: 'white',
            padding: '0.75rem 1.5rem',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Go to Question Bank
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1rem 1rem 2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Review Questions</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>Review these drafts before approving them.</p>
      <p style={{ color: '#4b5563', marginBottom: '1rem', fontSize: '0.9rem' }}>
        Select a question to approve it to be added to the question bank. Selected questions are highlighted in green.
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        <button
          onClick={() => setSelectedQuestionIds(questions.map((q) => q.id))}
          style={{
            background: '#007bff',
            color: 'white',
            padding: '0.5rem 0.9rem',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.875rem'
          }}
        >
          Select All
        </button>
        <button
          onClick={() => setSelectedQuestionIds([])}
          style={{
            background: '#6c757d',
            color: 'white',
            padding: '0.5rem 0.9rem',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.875rem'
          }}
        >
          Clear Selection
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: '1.25rem'
      }}>
        {questions.map((q, index) => (
          <div
            key={q.id}
            style={{
              border: selectedQuestionIds.includes(q.id) ? '2px solid #10b981' : '2px solid #e5e7eb',
              borderRadius: '10px',
              padding: '0.75rem',
              background: '#f8fafc',
              cursor: 'pointer',
              boxShadow: selectedQuestionIds.includes(q.id)
                ? '0 6px 16px rgba(16,185,129,0.25)'
                : '0 2px 8px rgba(0,0,0,0.06)',
              transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s'
            }}
            onClick={() => toggleQuestionSelection(q.id)}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              if (!selectedQuestionIds.includes(q.id)) {
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
              } else {
                e.currentTarget.style.borderColor = '#059669';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(16,185,129,0.3)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              if (!selectedQuestionIds.includes(q.id)) {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
              } else {
                e.currentTarget.style.borderColor = '#10b981';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(16,185,129,0.25)';
              }
            }}
          >
            <QuestionCard
              question={q}
              imageUrl={imageUrls[q.id]}
              showEditButton={true}
              showDeleteButton={false}
              showUserIcon={false}
              questionNumber={`Q${index + 1}`}
              editButtonLabel="Edit Question"
              onEdit={handleEditQuestion}
            />
          </div>
        ))}
      </div>

      {questions.length > 0 && (
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={handleConfirmSelected}
            disabled={isVerifying || selectedQuestionIds.length === 0}
            style={{
              background: '#28a745',
              color: 'white',
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '4px',
              cursor: isVerifying || selectedQuestionIds.length === 0 ? 'not-allowed' : 'pointer',
              opacity: isVerifying || selectedQuestionIds.length === 0 ? 0.65 : 1,
              fontWeight: 'bold'
            }}
          >
            {isVerifying
              ? "Processing..."
              : `Confirm and Add ${selectedQuestionIds.length} Question${selectedQuestionIds.length === 1 ? '' : 's'}`}
          </button>
          <button
            onClick={async () => {
              await cleanupUnverifiedQuestions(questions);
              skipCleanupRef.current = true;
              cleanupStartedRef.current = true;
              window.location.hash = "questions";
            }}
            style={{
              background: '#6b7280',
              color: 'white',
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default VerifyQuestions;
