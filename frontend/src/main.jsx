import React from 'react'
import ReactDOM from 'react-dom/client'
import Home from './pages/Home.jsx'
import QuestionBank from './pages/QuestionBank.jsx'
import CreateQuestion from './pages/CreateQuestion.jsx'
import EditQuestion from './pages/EditQuestion.jsx'
import Profile from './pages/Profile.jsx'
import Auth from './pages/Auth.jsx'
import Onboarding from './pages/Onboarding.jsx'
import InstructorCoursesPage from './pages/InstructorCoursesPage.jsx'
import CourseDashboard from './pages/CourseDashboard.jsx'
import CreateEditAssignment from './pages/CreateEditAssignment.jsx'
import AssignmentView from './pages/AssignmentView.jsx'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import { getUserInfo } from './api.js'
import VerifyQuestions from './pages/VerifyQuestions.jsx' 
import Users from './pages/Users.jsx'
import "./index.css";

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
  const [userInfo, setUserInfo] = React.useState(null);
  const [checkingProfile, setCheckingProfile] = React.useState(true);
  const [profilePrefs, setProfilePrefs] = React.useState({
    iconShape: 'circle',
    color: '#4f46e5',
    initials: ''
  });


  const { user, signOut, loading } = useAuth();

  // Check if user profile is complete and load preferences
  React.useEffect(() => {
    async function checkProfile() {
      if (user && !loading) {
        try {
          const info = await getUserInfo();
          setUserInfo(info);
          // Set profile preferences from backend
          setProfilePrefs({
            iconShape: info.icon_shape || 'circle',
            color: info.icon_color || '#4f46e5',
            initials: info.initials || getDefaultInitials(info)
          });
        } catch (error) {
          console.error('Error fetching user info:', error);
        } finally {
          setCheckingProfile(false);
        }
      } else {
        setCheckingProfile(false);
      }
    }
    
    checkProfile();
  }, [user, loading]);

  // Listen for profile preference updates
  React.useEffect(() => {
    const handlePreferencesUpdate = (event) => {
      setProfilePrefs(event.detail);
    };
    
    window.addEventListener('profilePreferencesUpdated', handlePreferencesUpdate);
    return () => window.removeEventListener('profilePreferencesUpdated', handlePreferencesUpdate);
  }, []);

  const getDefaultInitials = (info) => {
    if (info?.first_name && info?.last_name) {
      return `${info.first_name[0]}${info.last_name[0]}`.toUpperCase();
    }
    const email = user?.email || info?.email || '';
    const display = (email.split('@')[0] || '').trim();
    if (!display) return 'U';
    return display.slice(0, 2).toUpperCase();
  };

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

  const handleOnboardingComplete = async () => {
    // Refresh user info after onboarding
    try {
      const info = await getUserInfo();
      setUserInfo(info);
    } catch (error) {
      console.error('Error fetching updated user info:', error);
    }
  };

  // Show loading state while checking profile
  if (user && checkingProfile) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  // Show onboarding if user is authenticated but profile is incomplete
  const needsOnboarding = user && userInfo && !userInfo.profile_complete;

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
              href="#users"
              style={{
                color: page === 'users' ? '#fff' : '#aaa',
                textDecoration: 'none',
                fontWeight: page === 'users' ? 'bold' : 'normal'
                }}
              >
                Users
              </a>
              <a
                href="#courses"
                style={{
                  color: page === 'courses' ? '#fff' : '#aaa',
                  textDecoration: 'none',
                  fontWeight: page === 'courses' ? 'bold' : 'normal'
                }}
              >
                Courses
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
                    width: 28,
                    height: 28,
                    background: profilePrefs.color,
                    color: 'white',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.8rem',
                    borderRadius: profilePrefs.iconShape === 'square' ? 6 : 9999,
                    ...(profilePrefs.iconShape === 'hex'
                      ? { clipPath: 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0% 50%)' }
                      : {}),
                    flexShrink: 0
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
        ) : needsOnboarding ? (
          <Onboarding onComplete={handleOnboardingComplete} />
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
            {page === 'edit-question' && (
              <ProtectedRoute>
                <EditQuestion />
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
            {page === 'users' && (
            <ProtectedRoute>
              <Users currentUser={userInfo} />
              </ProtectedRoute>)}
            {page === 'courses' && (
              <ProtectedRoute>
                <InstructorCoursesPage />
              </ProtectedRoute>
            )}
            {page.startsWith('course/') && !page.includes('/assignment/') && (
              <ProtectedRoute>
                <CourseDashboard />
              </ProtectedRoute>
            )}
            {page.includes('/assignment/') && page.includes('/view') && (
              <ProtectedRoute>
                <AssignmentView />
              </ProtectedRoute>
            )}
            {page.includes('/assignment/') && (page.includes('/edit') || page.includes('/new')) && (
              <ProtectedRoute>
                <CreateEditAssignment />
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
