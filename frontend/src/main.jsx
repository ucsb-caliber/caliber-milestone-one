import React from 'react'
import ReactDOM from 'react-dom/client'
import UploadPDF from './pages/UploadPDF.jsx'
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
import GradeAssignmentPage from './pages/GradeAssignmentPage.jsx'
import LoggedOut from './pages/LoggedOut.jsx'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import { getUserInfo } from './api.js'
import VerifyQuestions from './pages/VerifyQuestions.jsx' 
import Analytics from './pages/Analytics.jsx'
import { AppChrome, AppMain, AppNavbar, CourseDashboardLoadingState } from './components/CourseDashboardUI.jsx';
import "./index.css";

// Determine backend base URL from Vite env or default to localhost
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

// Protected component that requires authentication
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <CourseDashboardLoadingState>Loading...</CourseDashboardLoadingState>;
  }
  
  if (!user) {
    return <Auth />;
  }
  
  return children;
}

// Simple router using hash-based navigation
function App() {
  const normalizeHashRoute = (route) => {
    if (!route) return route;
    return route.replace(
      /(course\/\d+\/assignment\/\d+\/grade)\/[^/]+$/,
      '$1/:student'
    );
  };

  const getPageFromHash = () => {
  const qs = new URLSearchParams(window.location.search);
  if (qs.get('logged_out') === '1') {
    return 'logged-out';
  }
  const hash = window.location.hash.slice(1);
  return normalizeHashRoute(hash.split('?')[0] || 'courses');
  };

  const [page, setPage] = React.useState(getPageFromHash());
  const [userInfo, setUserInfo] = React.useState(null);
  const [checkingProfile, setCheckingProfile] = React.useState(true);
  const [profilePrefs, setProfilePrefs] = React.useState({
    iconShape: 'circle',
    color: 'transparent',
    initials: ''
  });


  const { user, loading, signOut } = useAuth();
  const isInstructorOrAdmin = Boolean(userInfo?.teacher || userInfo?.admin);

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
            color: info.icon_color || '#111827',
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

  React.useEffect(() => {
    if (!user || loading || checkingProfile || !userInfo || page !== 'logged-out') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('logged_out');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    window.location.hash = isInstructorOrAdmin ? 'courses' : 'student-courses';
  }, [user, loading, checkingProfile, userInfo, page, isInstructorOrAdmin]);

  const handleLogoClick = (event) => {
    if (event) event.preventDefault();
    // Students land on courses; instructors/admins land on course dashboard
    window.location.hash = isInstructorOrAdmin ? 'courses' : 'student-courses';
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
  const showAppSidebar = Boolean(user && !needsOnboarding);

  React.useEffect(() => {
    if (!user || loading || checkingProfile || !userInfo || needsOnboarding) return;

    if (page === 'post-login-default') {
      window.location.hash = isInstructorOrAdmin ? 'courses' : 'student-courses';
      return;
    }

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
    return <CourseDashboardLoadingState>Loading...</CourseDashboardLoadingState>;
  }

  if (user && page === 'post-login-default') {
    return <CourseDashboardLoadingState>Loading...</CourseDashboardLoadingState>;
  }

  return (
    <AppChrome>
      {showAppSidebar ? (
        <AppNavbar
          apiBase={API_BASE}
          onLogoClick={handleLogoClick}
          user={user}
          isInstructorOrAdmin={isInstructorOrAdmin}
          page={page}
          profilePrefs={profilePrefs}
          signOut={signOut}
        />
      ) : null}
      <AppMain>
        {!user && !loading ? (
          page === 'logged-out' ? <LoggedOut /> : <Auth />
        ) : needsOnboarding ? (
          <Onboarding onComplete={handleOnboardingComplete} />
        ) : (
          <>
            {isInstructorOrAdmin && page === 'upload-pdf' && (
              <ProtectedRoute>
                <UploadPDF />
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
            {isInstructorOrAdmin && page === 'courses' && (
              <ProtectedRoute>
                <InstructorCoursesPage />
              </ProtectedRoute>
            )}
            {isInstructorOrAdmin && (page === 'analytics' || page === 'instructor/analytics') && (
              <ProtectedRoute>
                <Analytics />
              </ProtectedRoute>
            )}
            {page === 'student-courses' && (
              <ProtectedRoute>
                <StudentCoursesPage isInstructorView={isInstructorOrAdmin} />
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
            {isInstructorOrAdmin && page.includes('/assignment/') && page.includes('/grade/') && (
              <ProtectedRoute>
                <GradeAssignmentPage />
              </ProtectedRoute>
            )}
            {isInstructorOrAdmin && page.includes('/assignment/') && (page.includes('/edit') || page.includes('/new')) && (
              <ProtectedRoute>
                <CreateEditAssignment />
              </ProtectedRoute>
            )}
          </>
        )}
      </AppMain>
    </AppChrome>
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
