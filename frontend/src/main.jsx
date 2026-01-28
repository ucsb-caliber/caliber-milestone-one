import React from 'react'
import ReactDOM from 'react-dom/client'
import Home from './pages/Home.jsx'
import QuestionBank from './pages/QuestionBank.jsx'
import CreateQuestion from './pages/CreateQuestion.jsx'
import Profile from './pages/Profile.jsx'
import Auth from './pages/Auth.jsx'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import { loadProfilePrefs } from './profilePrefs.js'
import VerifyQuestions from './pages/VerifyQuestions.jsx' 
// Determine backend base URL from Vite env or default to localhost
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

// Protected component that requires authentication
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }
  
  if (!user) {
    return <Auth />;
  }
  
  return children;
}

// Simple router using hash-based navigation
function App() {

  const getPageFromHash = () => {
  const hash = window.location.hash.slice(1);
  return hash.split('?')[0] || 'home';
  };

  const [page, setPage] = React.useState(getPageFromHash());


  const { user, signOut, loading } = useAuth();
  const profilePrefs = React.useMemo(() => loadProfilePrefs(user), [user?.id]);

  React.useEffect(() => {
    const handleHashChange = () => {
      setPage(getPageFromHash());
    };
     window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.hash = 'home';
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleLogoClick = () => {
    // Navigate to home and refresh the page
    window.location.hash = 'home';
    window.location.reload();
  };

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', margin: 0, padding: 0 }}>
      <nav style={{
        background: '#333',
        color: 'white',
        padding: '1rem',
        display: 'flex',
        gap: '1rem',
        alignItems: 'center'
      }}>
        <h1 style={{ margin: 0 }}>
          <a
            href="#home"
            onClick={handleLogoClick}
            style={{ fontSize: '1.5rem', cursor: 'pointer', color: 'inherit', textDecoration: 'none' }}
          >
            Caliber
          </a>
        </h1>

        {/* Temporary API docs link immediately to the right of the title */}
        <a
          href={`${API_BASE}/docs`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#fff',
            marginLeft: '0.5rem',
            textDecoration: 'none',
            fontSize: '0.9rem',
            opacity: 0.95
          }}
        >
          API Docs
        </a>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {user && (
            <>
              <a
                href="#home"
                style={{
                  color: page === 'home' ? '#fff' : '#aaa',
                  textDecoration: 'none',
                  fontWeight: page === 'home' ? 'bold' : 'normal'
                }}
              >
                Home
              </a>
              <a
                href="#questions"
                style={{
                  color: page === 'questions' ? '#fff' : '#aaa',
                  textDecoration: 'none',
                  fontWeight: page === 'questions' ? 'bold' : 'normal'
                }}
              >
                Question Bank
              </a>
              <a
                href="#profile"
                style={{
                  color: page === 'profile' ? '#fff' : '#aaa',
                  textDecoration: 'none',
                  fontWeight: page === 'profile' ? 'bold' : 'normal',
                  fontSize: '0.9rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
                title="View your profile"
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    background: profilePrefs.color,
                    color: 'white',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.75rem',
                    borderRadius: profilePrefs.iconShape === 'square' ? 6 : 9999,
                    ...(profilePrefs.iconShape === 'hex'
                      ? { clipPath: 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%)' }
                      : {})
                  }}
                >
                  {(profilePrefs.initials || '').toUpperCase()}
                </span>
                {user.email}
              </a>
              <button
                onClick={handleSignOut}
                style={{
                  background: '#555',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                Sign Out
              </button>
            </>
          )}
        </div>
      </nav>
      <main style={{ padding: '2rem' }}>
        {!user && !loading ? (
          <Auth />
        ) : (
          <>
            {page === 'home' && (
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            )}
            {page === 'questions' && (
              <ProtectedRoute>
                <QuestionBank />
              </ProtectedRoute>
            )}
            {page === 'create-question' && (
              <ProtectedRoute>
                <CreateQuestion />
              </ProtectedRoute>
            )}
            {page === 'profile' && (
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            )}
            {page === 'verify' && (
              <ProtectedRoute>
                <VerifyQuestions />
              </ProtectedRoute>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function AppWrapper() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>
)
