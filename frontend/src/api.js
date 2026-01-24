import { supabase } from './supabaseClient';

// API base URL - can be overridden with VITE_API_BASE environment variable
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

/**
 * Get authentication headers with the current user's token
 */
async function getAuthHeaders() {
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
}

/**
 * Fetch all questions from the backend
 */
export async function getQuestions() {
  const headers = await getAuthHeaders();
  
  const response = await fetch(`${API_BASE}/api/questions`, {
    headers,
  });

  if (!response.ok) {
    throw new Error('Failed to fetch questions');
  }

  return response.json();
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
