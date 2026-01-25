import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const AuthContext = createContext({});

// Helper function to check if test mode is enabled
function isTestModeEnabled() {
  return localStorage.getItem('test-mode') === 'true';
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
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Helper function to set access token as a cookie
  const setAccessTokenCookie = (accessToken, expiresAt) => {
    if (accessToken) {
      // Set cookie to expire at the same time as the token (or 1 hour if no expiry provided)
      let expiryDate;
      if (expiresAt) {
        expiryDate = new Date(expiresAt * 1000); // Convert Unix timestamp to Date
      } else {
        // Default to 1 hour from now (typical Supabase token lifetime)
        expiryDate = new Date();
        expiryDate.setHours(expiryDate.getHours() + 1);
      }
      document.cookie = `access_token=${accessToken}; path=/; expires=${expiryDate.toUTCString()}; SameSite=Lax`;
    } else {
      // Clear the cookie
      document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    }
  };

  // Check if test mode should be enabled (check for URL param or localStorage)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('test-mode') === 'true') {
      localStorage.setItem('test-mode', 'true');
      // Initialize with test user 1
      const testUser = {
        id: 'test-user-1',
        email: 'test-user-1@example.com'
      };
      setUser(testUser);
      setAccessTokenCookie('test-token-1');
      setLoading(false);
      return;
    }

    if (isTestModeEnabled()) {
      // Restore test session
      const testUser = {
        id: 'test-user-1',
        email: 'test-user-1@example.com'
      };
      setUser(testUser);
      setAccessTokenCookie('test-token-1');
      setLoading(false);
      return;
    }

    // Normal Supabase authentication
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setAccessTokenCookie(session?.access_token, session?.expires_at);
      setLoading(false);
    });

    // Listen for changes on auth state (sign in, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setAccessTokenCookie(session?.access_token, session?.expires_at);
      setLoading(false);
    });

    return () => subscription?.unsubscribe?.();
  }, []);

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
    // Cookie will be set by onAuthStateChange listener
    return data;
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    // Cookie will be set by onAuthStateChange listener
    return data;
  };

  const signOut = async () => {
    if (isTestModeEnabled()) {
      localStorage.removeItem('test-mode');
      setUser(null);
      setAccessTokenCookie(null);
      return;
    }
    
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // Cookie will be cleared by onAuthStateChange listener
  };

  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
