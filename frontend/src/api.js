import { supabase } from './supabaseClient';

// API base URL - can be overridden with VITE_API_BASE environment variable
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

/**
 * Get authentication headers with the current user's token
 */
async function getAuthHeaders() {
  // Check if we're in test mode
  const isTestMode = localStorage.getItem('test-mode') === 'true';
  
  if (isTestMode) {
    // Use test token
    return {
      'Authorization': 'Bearer test-token-1',
    };
  }

  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }
  
  return {
    'Authorization': `Bearer ${session.access_token}`,
  };
}

/**
 * Upload a PDF file to the backend
 */
export async function uploadPDF(file) {
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    const headers = await getAuthHeaders();

    const response = await fetch(`${API_BASE}/api/upload-pdf`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Upload failed');
    }

    return response.json();
  } catch (error) {
    // Provide more helpful error messages
    if (error.message === 'Failed to fetch' || error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend. Make sure the backend server is running on http://localhost:8000');
    }
    throw error;
  }
}

/**
 * Fetch all questions from the backend
 */
export async function getQuestions() {
  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE}/api/questions`, {
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Failed to fetch questions';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail || errorMessage;
      } catch (e) {
        // If response is not JSON, use the text
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    // Provide more helpful error messages
    if (error.message === 'Failed to fetch' || error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend. Make sure the backend server is running on http://localhost:8000');
    }
    throw error;
  }
}

/**
 * Fetch all questions from all users
 */
export async function getAllQuestions() {
  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE}/api/questions/all`, {
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Failed to fetch all questions';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail || errorMessage;
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    if (error.message === 'Failed to fetch' || error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend. Make sure the backend server is running on http://localhost:8000');
    }
    throw error;
  }
}

/**
 * Fetch a single question by ID
 */
export async function getQuestion(id) {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_BASE}/api/questions/${id}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error('Question not found');
  }

  return response.json();
}

/**
 * Create a new question
 */
export async function createQuestion(questionData) {
  try {
    const headers = await getAuthHeaders();
    
    const formData = new FormData();
    formData.append('text', questionData.text);
    formData.append('tags', questionData.tags || '');
    formData.append('keywords', questionData.keywords || '');
    formData.append('course', questionData.course || '');
    formData.append('answer_choices', questionData.answer_choices || '[]');
    formData.append('correct_answer', questionData.correct_answer || '');
    if (questionData.source_pdf) {
      formData.append('source_pdf', questionData.source_pdf);
    }

    const response = await fetch(`${API_BASE}/api/questions`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create question');
    }

    return response.json();
  } catch (error) {
    if (error.message === 'Failed to fetch' || error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend. Make sure the backend server is running on http://localhost:8000');
    }
    throw error;
  }
}

/**
 * Delete a question by ID
 */
export async function deleteQuestion(id) {
  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE}/api/questions/${id}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Failed to delete question';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail || errorMessage;
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return true;
  } catch (error) {
    if (error.message === 'Failed to fetch' || error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend. Make sure the backend server is running on http://localhost:8000');
    }
    throw error;
  }
}
