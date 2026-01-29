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
 * Upload a PDF file to Supabase Storage
 * @param {File} file - The PDF file to upload
 * @returns {Promise<string>} - The storage path of the uploaded PDF
 */
export async function uploadPDFToStorage(file) {
  try {
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('Not authenticated');
    }

    // Create a unique filename with user ID and timestamp
    const fileExt = file.name.split('.').pop();
    
    // Validate file extension exists and is safe
    if (!fileExt || fileExt.length > 10) {
      throw new Error('Invalid file extension');
    }
    
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('question-pdfs')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      throw error;
    }

    // Return the storage path (not a URL)
    return data.path;
  } catch (error) {
    console.error('PDF upload error:', error);
    throw new Error(error.message || 'Failed to upload PDF');
  }
}

/**
 * Upload a PDF file to the backend for processing
 * @param {File} file - The PDF file to upload and process
 * @param {string} storagePath - The Supabase Storage path of the PDF
 * @returns {Promise<Object>} - Upload response with status and message
 */
export async function uploadPDF(file, storagePath) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('storage_path', storagePath);
  
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
 * Upload an image file to Supabase Storage
 * @param {File} file - The image file to upload
 * @returns {Promise<string>} - The storage path of the uploaded image
 */
export async function uploadImage(file) {
  try {
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('Not authenticated');
    }

    // Create a unique filename with user ID and timestamp
    const fileExt = file.name.split('.').pop();
    
    // Validate file extension exists and is safe
    if (!fileExt || fileExt.length > 10) {
      throw new Error('Invalid file extension');
    }
    
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('question-images')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      throw error;
    }

    // Return the storage path (not a URL)
    // The path will be used to generate signed URLs on-demand when displaying questions
    return data.path;
  } catch (error) {
    console.error('Image upload error:', error);
    throw new Error(error.message || 'Failed to upload image');
  }
}

/**
 * Get a signed URL for an image stored in Supabase Storage
 * @param {string} imagePath - The storage path of the image
 * @returns {Promise<string>} - A signed URL valid for 1 hour
 */
export async function getImageSignedUrl(imagePath) {
  try {
    if (!imagePath) {
      return null;
    }

    // Generate a signed URL that expires in 1 hour
    // This ensures only currently authenticated users can access images
    const { data, error } = await supabase.storage
      .from('question-images')
      .createSignedUrl(imagePath, 3600); // 1 hour in seconds

    if (error) {
      console.error('Error creating signed URL:', error);
      return null;
    }

    return data.signedUrl;
  } catch (error) {
    console.error('Error getting signed URL:', error);
    return null;
  }
}

/**
 * Get a signed URL for a PDF stored in Supabase Storage
 * @param {string} pdfPath - The storage path of the PDF
 * @returns {Promise<string>} - A signed URL valid for 1 hour
 */
export async function getPDFSignedUrl(pdfPath) {
  try {
    if (!pdfPath) {
      return null;
    }

    // Generate a signed URL that expires in 1 hour
    // This ensures only currently authenticated users can access PDFs
    const { data, error } = await supabase.storage
      .from('question-pdfs')
      .createSignedUrl(pdfPath, 3600); // 1 hour in seconds

    if (error) {
      console.error('Error creating signed URL:', error);
      return null;
    }

    return data.signedUrl;
  } catch (error) {
    console.error('Error getting signed URL:', error);
    return null;
  }
}

/**
 * Fetch all questions from the backend with optional filters for verified_only and source_pdf
 */
export async function getQuestions(filters = {}) {
  try {
    const headers = await getAuthHeaders();

    // Construct query string for filters
    const params = new URLSearchParams();
    if (filters.verified_only !== undefined) params.append('verified_only', filters.verified_only);
    if (filters.source_pdf) params.append('source_pdf', filters.source_pdf);
    
    const url = `${API_BASE}/api/questions${params.toString() ? `?${params.toString()}` : ''}`;
    
    const response = await fetch(url, { headers });
    
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
    formData.append('school', questionData.school || '');
    formData.append('course', questionData.course || '');
    formData.append('course_type', questionData.course_type || '');
    formData.append('question_type', questionData.question_type || '');
    formData.append('blooms_taxonomy', questionData.blooms_taxonomy || '');
    formData.append('answer_choices', questionData.answer_choices || '[]');
    formData.append('correct_answer', questionData.correct_answer || '');
    if (questionData.source_pdf) {
      formData.append('source_pdf', questionData.source_pdf);
    }
    if (questionData.image_url) {
      formData.append('image_url', questionData.image_url);
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

/**
 * Update a question (used for editing text or verifying/approving)
 */
export async function updateQuestion(id, updateData) {
  try {
    const headers = await getAuthHeaders();
    headers['Content-Type'] = 'application/json';

    const response = await fetch(`${API_BASE}/api/questions/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updateData), // This sends { is_verified: true }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Update failed');
    }

    return response.json();
  } catch (error) {
    console.error("Update error:", error);
    throw error;
  }
}

/**
 * Get current user information including profile data
 */
export async function getUserInfo() {
  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE}/api/user`, {
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to fetch user info');
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
 * Update user profile (first name, last name only - not teacher status)
 */
export async function updateUserProfile(profileData) {
  try {
    const headers = await getAuthHeaders();
    headers['Content-Type'] = 'application/json';

    const response = await fetch(`${API_BASE}/api/user/profile`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(profileData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update profile');
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
 * Complete user onboarding (first name, last name, and teacher status)
 */
export async function completeOnboarding(onboardingData) {
  try {
    const headers = await getAuthHeaders();
    headers['Content-Type'] = 'application/json';

    const response = await fetch(`${API_BASE}/api/user/onboarding`, {
      method: 'POST',
      headers,
      body: JSON.stringify(onboardingData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to complete onboarding');
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
 * Update user preferences (icon shape, color, and initials)
 */
export async function updateUserPreferences(preferencesData) {
  try {
    const headers = await getAuthHeaders();
    headers['Content-Type'] = 'application/json';

    const response = await fetch(`${API_BASE}/api/user/preferences`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(preferencesData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update preferences');
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
 * Get user by user ID
 */
export async function getUserById(userId) {
  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(`${API_BASE}/api/users/${userId}`, {
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to fetch user');
    }

    return response.json();
  } catch (error) {
    if (error.message === 'Failed to fetch' || error.message.includes('fetch')) {
      throw new Error('Cannot connect to backend. Make sure the backend server is running on http://localhost:8000');
    }
    throw error;
  }
}
