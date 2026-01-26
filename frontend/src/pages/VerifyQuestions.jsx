import React, { useState, useEffect } from "react";
import * as api from "../api";

const VerifyQuestions = () => {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);

  // Parse filename from hash manually since you aren't using react-router-dom
  const hash = window.location.hash;
  const sourceFile = new URLSearchParams(hash.split("?")[1] || "").get("file");

  useEffect(() => {
    if (!sourceFile) return;

    const fetchDrafts = async () => {
      try {
        // Uses the filtered getQuestions from your api.js
        const data = await api.getQuestions({
          verified_only: false,
          source_pdf: sourceFile,
        });
        setQuestions(data.questions || []);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching pending questions:", err);
      }
    };

    fetchDrafts();
    //const interval = setInterval(fetchDrafts, 3000); // Poll for background results
    //return () => clearInterval(interval);
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
      // Calls your update_question crud logic to set is_verified = True
      const promises = questions.map((q) =>
        api.updateQuestion(q.id, { text: q.text, is_verified: true})

      );
      await Promise.all(promises);
      
      // Use hash navigation to return to the Question Bank
      window.location.hash = "questions"; 
    } catch (err) {
      alert("Failed to verify questions.");
    } finally {
      setIsVerifying(false);
    }
  };

  if (loading && questions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        Waiting for AI to generate questions from <strong>{sourceFile}</strong>...
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