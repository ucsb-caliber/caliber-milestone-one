import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { uploadQuestions } from '../api'; // Assuming this function exists in api.js for bulk upload
import ProtectedRoute from '../components/ProtectedRoute'; // Assuming this component exists

const ReviewQuestions = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [questions, setQuestions] = useState(location.state?.questions || []);
  const [loading, setLoading] = useState(false);

  // Function to handle editing a question
  const handleEditQuestion = (index, field, value) => {
    const updatedQuestions = [...questions];
    updatedQuestions[index][field] = value;
    setQuestions(updatedQuestions);
  };

  // Function to handle editing options
  const handleEditOption = (qIndex, oIndex, value) => {
    const updatedQuestions = [...questions];
    updatedQuestions[qIndex].options[oIndex] = value;
    setQuestions(updatedQuestions);
  };

  // Function to confirm and upload
  const handleConfirm = async () => {
    setLoading(true);
    try {
      await uploadQuestions(questions); // Call API to upload
      navigate('/'); // Navigate to home
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload questions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!questions.length) {
    return <div>No questions to review. Please upload a PDF first.</div>;
  }

  return (
    <ProtectedRoute>
      <div style={{ padding: '20px' }}>
        <h1>Review Questions</h1>
        <p>Please review and edit the questions extracted from the PDF. Click "Confirm and Upload" when ready.</p>
        {questions.map((q, qIndex) => (
          <div key={qIndex} style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '10px' }}>
            <label>
              Question Text:
              <input
                type="text"
                value={q.question_text}
                onChange={(e) => handleEditQuestion(qIndex, 'question_text', e.target.value)}
                style={{ width: '100%', marginBottom: '10px' }}
              />
            </label>
            <div>
              Options:
              {q.options.map((option, oIndex) => (
                <input
                  key={oIndex}
                  type="text"
                  value={option}
                  onChange={(e) => handleEditOption(qIndex, oIndex, e.target.value)}
                  style={{ width: '100%', marginBottom: '5px' }}
                />
              ))}
            </div>
            <label>
              Correct Answer (index):
              <select
                value={q.correct_answer}
                onChange={(e) => handleEditQuestion(qIndex, 'correct_answer', parseInt(e.target.value))}
                style={{ width: '100%' }}
              >
                {q.options.map((_, oIndex) => (
                  <option key={oIndex} value={oIndex}>{oIndex}</option>
                ))}
              </select>
            </label>
          </div>
        ))}
        <button onClick={handleConfirm} disabled={loading} style={{ padding: '10px 20px' }}>
          {loading ? 'Uploading...' : 'Confirm and Upload'}
        </button>
      </div>
    </ProtectedRoute>
  );
};

export default ReviewQuestions;