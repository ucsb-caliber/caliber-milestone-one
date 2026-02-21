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
import StudentCoursesPage from './pages/StudentCoursesPage.jsx'
import StudentCourseDashboard from './pages/StudentCourseDashboard.jsx'
import StudentAssignmentPage from './pages/StudentAssignmentPage.jsx'
import AdminCoursesPage from './pages/AdminCoursesPage.jsx'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import { getUserInfo } from './api.js'
import VerifyQuestions from './pages/VerifyQuestions.jsx' 
import Users from './pages/Users.jsx'
import Analytics from './pages/Analytics.jsx'
import "./index.css";

// Determine backend base URL from Vite env or default to localhost
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

// Nav link that reserves space for bold text so active state doesn't shift layout
function NavLink({ href, active, children, style = {}, ...props }) {
  return (
    <a href={href} style={{ color: active ? '#fff' : '#aaa', textDecoration: 'none', fontWeight: active ? 'bold' : 'normal', ...style }} {...props}>
      <span style={{ position: 'relative', display: 'inline-block' }}>
        <span style={{ fontWeight: 'bold', visibility: 'hidden' }} aria-hidden="true">{children}</span>
        <span style={{ position: 'absolute', left: 0, top: 0, whiteSpace: 'nowrap', fontWeight: active ? 'bold' : 'normal' }}>{children}</span>
      </span>
    </a>
  );
}

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
  const [showAdminMenu, setShowAdminMenu] = React.useState(false);
  const adminMenuRef = React.useRef(null);
  const [userInfo, setUserInfo] = React.useState(null);
  const [checkingProfile, setCheckingProfile] = React.useState(true);
  const [profilePrefs, setProfilePrefs] = React.useState({
    iconShape: 'circle',
    color: '#4f46e5',
    initials: ''
  });


  const { user, signOut, loading } = useAuth();
  const isInstructorOrAdmin = Boolean(userInfo?.teacher || userInfo?.admin);
  const isAdmin = Boolean(userInfo?.admin);

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
      setShowAdminMenu(false);
    };
     window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (adminMenuRef.current && !adminMenuRef.current.contains(event.target)) {
        setShowAdminMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    // Students land on courses; instructors/admins land on home
    window.location.hash = isInstructorOrAdmin ? 'home' : 'student-courses';
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

  const needsOnboarding = user && userInfo && !userInfo.profile_complete;

  React.useEffect(() => {
    if (!user || loading || checkingProfile || !userInfo || needsOnboarding) return;
    if (isInstructorOrAdmin) return;

    const isAllowedStudentPage =
      page === 'profile' ||
      page === 'student-courses' ||
      page.startsWith('student-course/');

    if (!isAllowedStudentPage) {
      window.location.hash = 'student-courses';
    }
  }, [user, loading, checkingProfile, userInfo, needsOnboarding, isInstructorOrAdmin, page]);

  // Show loading state while checking profile
  if (user && checkingProfile) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

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
              {isInstructorOrAdmin && (
                <NavLink href="#home" active={page === 'home'}>Home</NavLink>
              )}
              {isInstructorOrAdmin && (
                <NavLink href="#questions" active={page === 'questions'}>Question Bank</NavLink>
              )}
              {isAdmin && (
                <div
                  ref={adminMenuRef}
                  style={{ position: 'relative' }}
                >
                  <button
                    type="button"
                    onClick={() => setShowAdminMenu((prev) => !prev)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      margin: 0,
                      color: page.startsWith('admin/') ? '#fff' : '#aaa',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      cursor: 'pointer',
                      fontSize: '1rem'
                    }}
                  >
                    <span style={{ position: 'relative', display: 'inline-block' }}>
                      <span style={{ fontWeight: 'bold', visibility: 'hidden' }} aria-hidden="true">Admin ▾</span>
                      <span style={{ position: 'absolute', left: 0, top: 0, whiteSpace: 'nowrap', fontWeight: page.startsWith('admin/') ? 'bold' : 'normal' }}>Admin ▾</span>
                    </span>
                  </button>
                  {showAdminMenu && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '0.4rem',
                        background: '#111827',
                        border: '1px solid #374151',
                        borderRadius: '8px',
                        minWidth: '160px',
                        boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
                        zIndex: 1000
                      }}
                    >
                      <a
                        href="#admin/users"
                        onClick={() => setShowAdminMenu(false)}
                        style={{
                          display: 'block',
                          padding: '0.6rem 0.75rem',
                          color: '#e5e7eb',
                          textDecoration: 'none',
                          fontSize: '0.9rem',
                          borderBottom: '1px solid #374151'
                        }}
                      >
                        Users
                      </a>
                      <a
                        href="#admin/courses"
                        onClick={() => setShowAdminMenu(false)}
                        style={{
                          display: 'block',
                          padding: '0.6rem 0.75rem',
                          color: '#e5e7eb',
                          textDecoration: 'none',
                          fontSize: '0.9rem'
                        }}
                      >
                        All Courses
                      </a>
                    </div>
                  )}
                </div>
              )}
              {isInstructorOrAdmin && (
                <NavLink href="#courses" active={page === 'courses'}>Courses</NavLink>
              )}
              {isInstructorOrAdmin && (
                <NavLink href="#analytics" active={page === 'analytics'}>Analytics</NavLink>
              )}
              <NavLink href="#student-courses" active={page === 'student-courses' || page.startsWith('student-course/')}>
                {isInstructorOrAdmin ? 'Student View' : 'Courses'}
              </NavLink>
              <a
                href="#profile"
                style={{
                  color: page === 'profile' ? '#fff' : '#aaa',
                  textDecoration: 'none',
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
                <span style={{ position: 'relative', display: 'inline-block' }}>
                  <span style={{ fontWeight: 'bold', visibility: 'hidden' }} aria-hidden="true">{user.email}</span>
                  <span style={{ position: 'absolute', left: 0, top: 0, whiteSpace: 'nowrap', fontWeight: page === 'profile' ? 'bold' : 'normal' }}>{user.email}</span>
                </span>
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
            {isInstructorOrAdmin && page === 'home' && (
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            )}
            {isInstructorOrAdmin && page === 'questions' && (
              <ProtectedRoute>
                <QuestionBank />
              </ProtectedRoute>
            )}
            {isInstructorOrAdmin && page === 'create-question' && (
              <ProtectedRoute>
                <CreateQuestion />
              </ProtectedRoute>
            )}
            {isInstructorOrAdmin && page === 'edit-question' && (
              <ProtectedRoute>
                <EditQuestion />
              </ProtectedRoute>
            )}
            {page === 'profile' && (
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            )}
            {isInstructorOrAdmin && page === 'verify' && (
              <ProtectedRoute>
                <VerifyQuestions />
              </ProtectedRoute>
            )}
            {isAdmin && page === 'admin/users' && (
            <ProtectedRoute>
              <Users currentUser={userInfo} />
              </ProtectedRoute>)}
            {isAdmin && page === 'admin/courses' && (
              <ProtectedRoute>
                <AdminCoursesPage />
              </ProtectedRoute>
            )}
            {isInstructorOrAdmin && page === 'courses' && (
              <ProtectedRoute>
                <InstructorCoursesPage />
              </ProtectedRoute>
            )}
            {isInstructorOrAdmin && page === 'analytics' && (
              <ProtectedRoute>
                <Analytics />
              </ProtectedRoute>
            )}
            {page === 'student-courses' && (
              <ProtectedRoute>
                <StudentCoursesPage />
              </ProtectedRoute>
            )}
            {isInstructorOrAdmin && page.startsWith('course/') && !page.includes('/assignment/') && (
              <ProtectedRoute>
                <CourseDashboard />
              </ProtectedRoute>
            )}
            {page.startsWith('student-course/') && page.includes('/assignment/') && (
              <ProtectedRoute>
                <StudentAssignmentPage />
              </ProtectedRoute>
            )}
            {page.startsWith('student-course/') && !page.includes('/assignment/') && (
              <ProtectedRoute>
                <StudentCourseDashboard />
              </ProtectedRoute>
            )}
            {isInstructorOrAdmin && page.includes('/assignment/') && page.includes('/view') && (
              <ProtectedRoute>
                <AssignmentView />
              </ProtectedRoute>
            )}
            {isInstructorOrAdmin && page.includes('/assignment/') && (page.includes('/edit') || page.includes('/new')) && (
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
