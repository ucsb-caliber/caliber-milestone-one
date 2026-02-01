import React, { useState, useEffect } from "react";
import * as api from "../api";

const VerifyQuestions = () => {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Parse filename from hash manually since you aren't using react-router-dom
  const hash = window.location.hash;
  const sourceFile = new URLSearchParams(hash.split("?")[1] || "").get("file");

  useEffect(() => {
    // Handle missing file parameter
    if (!sourceFile) {
      setError("No source file specified. Please upload a PDF to generate questions.");
      setLoading(false);
      return;
    }

    const fetchDrafts = async () => {
      try {
        // Uses the filtered getQuestions from your api.js
        const data = await api.getQuestions({
          verified_only: false,
          source_pdf: sourceFile,
        });
        setQuestions(data.questions || []);
        setError(null);
      } catch (err) {
        console.error("Error fetching pending questions:", err);
        setError(err.message || "Failed to fetch questions. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchDrafts();
  }, [sourceFile]);


  const handleTextChange = (index, newText) => {
  setQuestions(prev =>
    prev.map((q, i) =>
      i === index ? { ...q, text: newText } : q
    )
  );
  };

  const handleConfirmAll = async () => {
    setIsVerifying(true);
    try {
      // Limit concurrent HTTP requests by processing questions in batches
      const BATCH_SIZE = 10;

      for (let i = 0; i < questions.length; i += BATCH_SIZE) {
        const batch = questions.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map((q) =>
          api.updateQuestion(q.id, { text: q.text, is_verified: true })
        );
        await Promise.all(batchPromises);
      }
      
      // Use hash navigation to return to the Question Bank
      window.location.hash = "questions"; 
    } catch (err) {
      alert("Failed to verify questions.");
    } finally {
      setIsVerifying(false);
    }
  };

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
        Waiting for AI to generate questions from <strong>{sourceFile}</strong>...
      </div>
    );
  }

  // Handle empty state when no pending questions are available (or still generating)
  if (questions.length === 0) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>No Pending Questions Found</h1>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>
          There are no pending questions for <strong>{sourceFile}</strong> at the moment. If you just uploaded this file,
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
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Review Questions</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>Review these drafts before approving them.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {questions.map((q, index) => (
          <div key={q.id} style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '8px' }}>
            <div style={{ fontWeight: 'bold', color: '#007bff', marginBottom: '0.5rem' }}>Question {index + 1}</div>
            {q.title && (
              <div style={{ 
                fontSize: '1.1rem', 
                fontWeight: 'bold', 
                color: '#333', 
                marginBottom: '0.5rem',
                padding: '0.5rem',
                background: '#f8f9fa',
                borderRadius: '4px'
              }}>
                {q.title}
              </div>
            )}
            <textarea
              style={{ width: '100%', minHeight: '80px', padding: '0.5rem' }}
              value={q.text}
              onChange={(e) => handleTextChange(index, e.target.value)}
            />
          </div>
        ))}
      </div>

      {questions.length > 0 && (
        <button
          onClick={handleConfirmAll}
          disabled={isVerifying}
          style={{
            marginTop: '1.5rem',
            background: '#28a745',
            color: 'white',
            padding: '0.75rem 1.5rem',
            border: 'none',
            borderRadius: '4px',
            cursor: isVerifying ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          {isVerifying ? "Processing..." : `Confirm and Add ${questions.length} Questions`}
        </button>
      )}
    </div>
  );
};

export default VerifyQuestions;