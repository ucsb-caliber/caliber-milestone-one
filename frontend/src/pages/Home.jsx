import React, { useState } from 'react';
import { uploadPDF, uploadPDFToStorage } from '../api';

export default function Home() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showInstructions, setInstructions] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError('');
    } else {
      setFile(null);
      setError('Please select a valid PDF file');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setUploading(true);
    setMessage('');
    setError('');

    try {
      // First upload PDF to Supabase Storage
      const storagePath = await uploadPDFToStorage(file);
      
      // Then upload to backend for processing with the storage path
      const result = await uploadPDF(file, storagePath);
      if (result.status === "queued") {
      // This changes the hash, which triggers your useEffect in main.jsx to change the 'page' state
        window.location.hash = `verify?file=${encodeURIComponent(result.filename)}`;
      }
      setMessage(`Success! ${result.message}`);
      setFile(null);
      // Reset file input
      e.target.reset();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: '450px', margin: '0 auto', paddingTop: '6rem' }}>
      <h2>Upload PDF for Processing</h2>
      <p style={{ color: '#666' }}>
        Upload a PDF file to extract questions. The file will be processed in the background
        and questions will appear in the Question Bank.
      </p>

      <form onSubmit={handleSubmit} style={{ marginTop: '2rem' }}>
        <div 
          style={{
            display: 'flex',
            justifyContent: 'center',
            margin: '2rem 0'
          }}
        >

        <input
          id="pdf-upload"
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          disabled={uploading}
          style={{ display: 'none' }}
        />

        <label
          htmlFor="pdf-upload"
          style={{
            width: '450px',
            height: '200px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1/75rem',
            border: '2px dashed #e9ebf5',
            borderRadius: '16px',
            cursor: uploading ? 'not-allowed' : 'pointer',
            background: '#fcfcfc',
            color: '#334155',
            textAlign: 'center'
          }}
        >
          {!file ? (
          <>
            {/* Empty state */}
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#eef2ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '0.75rem'
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#4f46e5"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>

            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1f2937' }}>
              Select PDF
            </div>

            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Maximum size 25MB
            </div>
          </>
        ) : (
          <>
            {/* Selected file state */}
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#eef2ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '0.75rem'
              }}
            >
              <span style={{ fontSize: '1.5rem', color: '#4f46e5' }}>📄</span>
            </div>

            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1f2937' }}>
              {file.name}
            </div>

            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
              {(file.size / 1024).toFixed(2)} KB
            </div>
          </>
        )}
      </label>
      </div>

      <button
        type="submit"
        disabled={!file || uploading}
        style={{
          width: '100%',
          padding: '0.9rem',
          background: !file || uploading ? '#cbd5e1' : '#4f46e5',
          color: 'white',
          border: 'none',
          borderRadius: '10px',
          fontSize: '1rem',
          fontWeight: '600',
          cursor: !file || uploading ? 'not-allowed' : 'pointer'
        }}
      >
        {uploading ? 'Extracting…' : 'Extract Questions'}
      </button>

      </form>

      {message && (
        <div style={{
          marginTop: '1rem',
          padding: '1rem',
          background: '#d4edda',
          border: '1px solid #c3e6cb',
          borderRadius: '10px',
          color: '#155724'
        }}>
          {message}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: '1rem',
          padding: '1rem',
          background: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '10px',
          color: '#721c24'
        }}>
          {error}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: '2rem'
        }}
      >
        <button
          type="button"
          onClick={() => setInstructions(!showInstructions)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: '#475569',
            fontSize: '0.95rem',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: '#64748b',
              fontSize: '0.95rem',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#64748b"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>

            <span>How it works</span>

            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#64748b"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{
                marginLeft: '0.2rem',
                transition: 'transform 0.2s ease',
                transform: showInstructions ? 'rotate(180deg)' : 'rotate(0deg)'
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>

        {showInstructions && (
          <div
            style={{
              marginTop: '1rem',
              padding: '1rem',
              background: '#f8fafc',
              borderRadius: '8px',
              color: '#475569'
            }}
          >
            <ol style={{ paddingLeft: '1.25rem', margin: 0 }}>
              <li>Select a PDF file from your computer</li>
              <li>Click “Extract Questions” to send it to the backend</li>
              <li>The backend processes the PDF in the background</li>
              <li>Questions are extracted and stored in the database</li>
              <li>Visit the Question Bank page to view the results</li>
            </ol>
          </div>
        )}
      </div>

    </div>
  );
}
