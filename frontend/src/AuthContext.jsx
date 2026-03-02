import React, { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext({});
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
const PORTAL_BASE_URL = (import.meta.env.VITE_PORTAL_BASE_URL || '').replace(/\/$/, '');
const AUTH_USER_STORAGE_KEY = 'caliber-auth-user';

function portalUrl(path) {
  return PORTAL_BASE_URL ? `${PORTAL_BASE_URL}${path}` : path;
}

// Helper function to check if test mode is enabled
function isTestModeEnabled() {
  return localStorage.getItem('test-mode') === 'true';
}

function getTestUser() {
  return {
    id: 'test-user-1',
    user_id: 'test-user-1',
    email: 'test-user-1@example.com',
    authenticated: true,
    auth_provider: 'test-mode',
  };
}

function storeAuthUser(user) {
  if (!user) {
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    return;
  }
  localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
}

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function fetchKeycloakUser() {
  const headers = {};
  if (isTestModeEnabled()) {
    headers.Authorization = 'Bearer test-token-1';
  }

  const response = await fetch(`${API_BASE}/api/user`, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Unable to fetch authenticated user');
  }

  const payload = await response.json();
  return {
    id: payload.user_id,
    user_id: payload.user_id,
    email: payload.email || '',
    first_name: payload.first_name || '',
    last_name: payload.last_name || '',
    authenticated: true,
    auth_provider: 'keycloak',
  };
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check if test mode should be enabled (check for URL param or localStorage)
  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      const storedUser = loadStoredUser();
      if (storedUser) {
        setUser(storedUser);
      }

      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('test-mode') === 'true') {
        localStorage.setItem('test-mode', 'true');
        const testUser = getTestUser();
        if (!cancelled) {
          setUser(testUser);
          storeAuthUser(testUser);
          setLoading(false);
        }
        return;
      }

      if (isTestModeEnabled()) {
        const testUser = getTestUser();
        if (!cancelled) {
          setUser(testUser);
          storeAuthUser(testUser);
          setLoading(false);
        }
        return;
      }

      try {
        const nextUser = await fetchKeycloakUser();
        if (!cancelled) {
          setUser(nextUser);
          storeAuthUser(nextUser);
        }
      } catch (err) {
        console.error('Failed to load Keycloak session:', err);
        if (!cancelled) {
          setUser(null);
          storeAuthUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshUser = async () => {
    if (isTestModeEnabled()) {
      const testUser = getTestUser();
      setUser(testUser);
      storeAuthUser(testUser);
      setLoading(false);
      return testUser;
    }

    setLoading(true);
    try {
      const nextUser = await fetchKeycloakUser();
      setUser(nextUser);
      storeAuthUser(nextUser);
      return nextUser;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async () => {
    window.location.assign(portalUrl('/login?next=%2Fcaliber%2F%23student-courses'));
  };

  const signIn = async () => {
    window.location.assign(portalUrl('/login?next=%2Fcaliber%2F%23student-courses'));
  };

  const signOut = async () => {
    if (isTestModeEnabled()) {
      localStorage.removeItem('test-mode');
      setUser(null);
      storeAuthUser(null);
      return;
    }

    setUser(null);
    storeAuthUser(null);
    window.location.assign(portalUrl('/logout?next=%2Fcaliber%2F%3Flogged_out%3D1'));
  };

  const value = {
    user,
    loading,
    refreshUser,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
