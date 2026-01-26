import React, { useState } from 'react';
import { uploadPDF } from '../api';

export default function Home() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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
      const result = await uploadPDF(file);
      if (result.status === "queued") {
      // This changes the hash, which triggers your useEffect in main.jsx to change the 'page' state
        window.location.hash = `verify?file=${result.filename}`;
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
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2>Upload PDF for Processing</h2>
      <p style={{ color: '#666' }}>
        Upload a PDF file to extract questions. The file will be processed in the background
        and questions will appear in the Question Bank.
      </p>

      <form onSubmit={handleSubmit} style={{ marginTop: '2rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            disabled={uploading}
            style={{
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              width: '100%'
            }}
          />
        </div>

        {file && (
          <div style={{ marginBottom: '1rem', color: '#333' }}>
            Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(2)} KB)
          </div>
        )}

        <button
          type="submit"
          disabled={!file || uploading}
          style={{
            padding: '0.75rem 1.5rem',
            background: !file || uploading ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: !file || uploading ? 'not-allowed' : 'pointer',
            fontSize: '1rem',
            fontWeight: 'bold'
          }}
        >
          {uploading ? 'Uploading...' : 'Upload PDF'}
        </button>
      </form>

      {message && (
        <div style={{
          marginTop: '1rem',
          padding: '1rem',
          background: '#d4edda',
          border: '1px solid #c3e6cb',
          borderRadius: '4px',
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
          borderRadius: '4px',
          color: '#721c24'
        }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#f8f9fa', borderRadius: '4px' }}>
        <h3 style={{ marginTop: 0 }}>How it works:</h3>
        <ol style={{ paddingLeft: '1.5rem', color: '#666' }}>
          <li>Select a PDF file from your computer</li>
          <li>Click "Upload PDF" to send it to the backend</li>
          <li>The backend processes the PDF in the background</li>
          <li>Questions are extracted and stored in the database</li>
          <li>Visit the Question Bank page to view the results</li>
        </ol>
      </div>
    </div>
  );
}
