import React from 'react'
import ReactDOM from 'react-dom/client'
import Home from './pages/Home.jsx'
import QuestionBank from './pages/QuestionBank.jsx'

// Determine backend base URL from Vite env or default to localhost
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

// Simple router using hash-based navigation
function App() {
  const [page, setPage] = React.useState(window.location.hash.slice(1) || 'home');

  React.useEffect(() => {
    const handleHashChange = () => {
      setPage(window.location.hash.slice(1) || 'home');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

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
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Caliber</h1>

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

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem' }}>
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
        </div>
      </nav>
      <main style={{ padding: '2rem' }}>
        {page === 'home' && <Home />}
        {page === 'questions' && <QuestionBank />}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
