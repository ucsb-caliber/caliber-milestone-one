import React, { useRef, useState } from 'react';
import { uploadPDF, getUploadStatus, cancelUploadJob } from '../api';

const UploadFlowIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const OcrFlowIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
    <line x1="8" y1="8" x2="16" y2="8" />
    <line x1="8" y1="11" x2="15" y2="11" />
    <line x1="8" y1="14" x2="13.5" y2="14" />
    <rect
      x="5.2"
      y="16.8"
      width="5.5"
      height="1.8"
      rx="0.9"
      fill="#60a5fa"
      stroke="none"
      style={{ animation: 'ocrSweep 2.4s ease-in-out infinite' }}
    />
  </svg>
);

const LlmFlowIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <line x1="8" y1="10" x2="16" y2="10" />
    <line x1="8" y1="13" x2="15" y2="13" />
    <line x1="8" y1="16" x2="13" y2="16" />
    <path
      d="M17.3 5.8l0.5 1.2 1.2 0.5-1.2 0.5-0.5 1.2-0.5-1.2-1.2-0.5 1.2-0.5z"
      fill="#14b8a6"
      stroke="none"
      style={{ animation: 'llmSparklePulse 3s ease-in-out infinite' }}
    />
    <path
      d="M14.8 6.8l0.3 0.7 0.7 0.3-0.7 0.3-0.3 0.7-0.3-0.7-0.7-0.3 0.7-0.3z"
      fill="#2dd4bf"
      stroke="none"
      style={{ animation: 'llmSparklePulse 3s ease-in-out infinite', animationDelay: '0.35s' }}
    />
  </svg>
);

const PdfSelectedIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9z" />
    <polyline points="14 3 14 9 20 9" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="16" x2="14" y2="16" />
  </svg>
);

export default function UploadPDF() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [processing, setProcessing] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [cancelingJob, setCancelingJob] = useState(false);
  const [metadata, setMetadata] = useState({
    school: '',
    course: '',
    course_type: ''
  });
  const fileInputRef = useRef(null);
  const currentJobId = processing?.job_id || activeJob?.jobId || null;
  const currentJobToken = processing?.job_token || activeJob?.jobToken || null;
  const statusMessage = (processing?.message || '').toLowerCase();
  const isFormattingStep = statusMessage.includes('formatting') ||
    statusMessage.includes('llm') ||
    statusMessage.includes('cleanup') ||
    statusMessage.includes('preparing question records') ||
    statusMessage.includes('saving generated questions') ||
    processing?.status === 'completed';
  const isParsingStep = statusMessage.includes('parsing') ||
    statusMessage.includes('ocr') ||
    statusMessage.includes('fallback extractor') ||
    statusMessage.includes('compatibility parser');
  const pipelineStep = isFormattingStep ? 3 : (isParsingStep ? 2 : 1);

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const monitorUploadJob = async (jobId, jobToken = null) => {
    while (true) {
      const status = await getUploadStatus(jobId, jobToken);
      setProcessing((prev) => ({
        ...status,
        job_token: prev?.job_token || jobToken || null,
      }));

      if (status.status === 'completed') {
        return status;
      }
      if (status.status === 'canceled') {
        return status;
      }
      if (status.status === 'failed') {
        throw new Error(status.message || 'Upload processing failed');
      }
      await wait(1500);
    }
  };

  const handleCancelJob = async () => {
    if (!currentJobId || cancelingJob) return;

    setCancelingJob(true);
    setError('');
    try {
      const status = await cancelUploadJob(currentJobId, currentJobToken);
      setProcessing((prev) => ({
        ...status,
        job_token: prev?.job_token || currentJobToken || null,
      }));
    } catch (err) {
      setError(err.message || 'Failed to request cancellation');
    } finally {
      setCancelingJob(false);
    }
  };

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

  const runUpload = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setUploading(true);
    setMessage('');
    setError('');
    setProcessing(null);
    setActiveJob(null);
    setCancelingJob(false);

    try {
      // Upload to backend; backend stores file in Supabase Storage, then parses.
      const result = await uploadPDF(file, undefined, metadata);
      if (result.status === "queued" && result.job_id) {
        const sourcePath = result.storage_path;
        if (!sourcePath) {
          throw new Error('Backend did not return a storage path');
        }
        const fileName = result.filename || file.name;
        const jobToken = result.job_token || null;
        setActiveJob({
          jobId: result.job_id,
          jobToken,
          sourcePath,
          fileName
        });

        setProcessing({
          job_id: result.job_id,
          job_token: jobToken,
          status: "queued",
          progress_percent: result.progress_percent || 10,
          message: "Queued for processing",
          expected_questions: null,
          created_questions: 0
        });

        const finalStatus = await monitorUploadJob(result.job_id, jobToken);
        const savedCount = Number(finalStatus.created_questions || 0);
        if (finalStatus.status === 'canceled') {
          if (savedCount > 0) {
            setMessage(`Canceled. Saved ${savedCount} unverified questions.`);
            window.location.hash = `verify?source=${encodeURIComponent(sourcePath)}&file=${encodeURIComponent(fileName)}`;
          } else {
            setMessage('Canceled before any questions were saved.');
          }
        } else {
          setMessage(`Success! Created ${finalStatus.created_questions || 0} questions.`);
          window.location.hash = `verify?source=${encodeURIComponent(sourcePath)}&file=${encodeURIComponent(fileName)}`;
        }
      } else if (result.status === "queued") {
        const sourcePath = result.storage_path;
        if (!sourcePath) {
          throw new Error('Backend did not return a storage path');
        }
        const fileName = result.filename || file.name;
        window.location.hash = `verify?source=${encodeURIComponent(sourcePath)}&file=${encodeURIComponent(fileName)}`;
      }
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setProcessing(null);
      setError(err.message || 'Upload failed');
    } finally {
      setActiveJob(null);
      setCancelingJob(false);
      setUploading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file first');
      return;
    }
    setError('');
    setShowMetadataModal(true);
  };

  const handleConfirmMetadata = async () => {
    if (!metadata.school || !metadata.course || !metadata.course_type) {
      setError('School, course, and course type are required before upload.');
      return;
    }
    setShowMetadataModal(false);
    await runUpload();
  };

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', paddingTop: '1.5rem', paddingLeft: '1rem', paddingRight: '1rem' }}>
      <button
        type="button"
        onClick={() => {
          window.location.hash = 'questions';
        }}
        style={{
          background: '#f1f5f9',
          color: '#334155',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          padding: '0.45rem 0.75rem',
          fontSize: '0.85rem',
          fontWeight: 600,
          cursor: 'pointer',
          marginBottom: '1rem'
        }}
      >
        Back to Question Bank
      </button>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 500, marginBottom: '0.5rem' }}>Upload PDF for Processing</h1>
      <p style={{ color: '#666' }}>
        Upload a PDF file to extract questions. The file will be processed in the background
        and questions will appear in the Question Bank.
      </p>

      <div
        style={{
          marginTop: '1rem',
          marginBottom: '1rem',
          padding: '1rem',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          background: '#f8fafc'
        }}
      >
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>
          How The Pipeline Works
        </div>
        <div style={{ fontSize: '0.82rem', color: '#475569', marginBottom: '0.8rem' }}>
          Upload starts a multi-stage extraction pipeline. OCR reads raw text from each page, then our LLM
          restructures that text into cleaner markdown-style prompts so question drafts are consistent and easier to review.
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem'
          }}
        >
          {[
            {
              step: 1,
              title: '1. Upload PDF',
              text: 'The file is uploaded to storage and queued for processing.',
              icon: <UploadFlowIcon />,
            },
            {
              step: 2,
              title: '2. OCR Parsing',
              text: 'OCR (optical character recognition) reads text from scanned pages and imperfect layouts.',
              icon: <OcrFlowIcon />,
            },
            {
              step: 3,
              title: '3. LLM Cleanup',
              text: 'The LLM reformats extracted content into cleaner, consistent question drafts for verification.',
              icon: <LlmFlowIcon />,
            },
          ].map((item) => (
            <div
              key={item.step}
              style={{
                borderRadius: '10px',
                border: pipelineStep === item.step ? '1px solid #60a5fa' : '1px solid #dbeafe',
                background: pipelineStep === item.step ? '#eff6ff' : '#ffffff',
                padding: '0.75rem'
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  border: pipelineStep === item.step ? '1px solid #93c5fd' : '1px solid #dbeafe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#ffffff',
                  marginBottom: '0.5rem'
                }}
              >
                {item.icon}
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e3a8a', marginBottom: '0.3rem' }}>
                {item.title}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                {item.text}
              </div>
            </div>
          ))}
        </div>
      </div>

      {uploading && processing && (
        <div
          style={{
            marginTop: '1rem',
            marginBottom: '1rem',
            padding: '1rem',
            borderRadius: '10px',
            border: '1px solid #dbeafe',
            background: '#f8fbff'
          }}
        >
          <div style={{ fontSize: '0.95rem', color: '#1e3a8a', marginBottom: '0.35rem', fontWeight: 600 }}>
            {processing.message || 'Processing upload'}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.7rem' }}>
            This pipeline can take 5-10 minutes (or longer) for large/scanned PDFs.
          </div>
          <div style={{ width: '100%', height: '10px', borderRadius: '999px', background: '#e2e8f0', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.max(0, Math.min(100, processing.progress_percent || 0))}%`,
                height: '100%',
                background: '#2563eb',
                transition: 'width 0.35s ease'
              }}
            />
          </div>
          <div style={{ marginTop: '0.45rem', textAlign: 'right', fontSize: '0.8rem', color: '#334155' }}>
            {Math.max(0, Math.min(100, processing.progress_percent || 0))}%
          </div>
          {currentJobId && ['queued', 'running', 'cancelling'].includes(processing.status) && (
            <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleCancelJob}
                disabled={cancelingJob || processing.status === 'cancelling'}
                style={{
                  background: '#ffffff',
                  color: '#b91c1c',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '0.4rem 0.7rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: (cancelingJob || processing.status === 'cancelling') ? 'not-allowed' : 'pointer',
                  opacity: (cancelingJob || processing.status === 'cancelling') ? 0.7 : 1
                }}
              >
                {processing.status === 'cancelling' || cancelingJob ? 'Stopping…' : 'Stop'}
              </button>
            </div>
          )}
          {currentJobId && ['queued', 'running', 'cancelling'].includes(processing.status) && (
            <div style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: '#64748b', textAlign: 'right' }}>
              Stopping keeps any questions parsed so far and opens review for those drafts.
            </div>
          )}
        </div>
      )}

      {!uploading && (
      <form onSubmit={handleSubmit} style={{ marginTop: '2rem', maxWidth: '460px', marginLeft: 'auto', marginRight: 'auto' }}>
        <div 
          style={{
            display: 'flex',
            justifyContent: 'center',
            margin: '2rem 0'
          }}
        >

        <input
          ref={fileInputRef}
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
              <PdfSelectedIcon />
            </div>

            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1f2937', maxWidth: '95%', wordBreak: 'break-word' }}>
              {file.name}
            </div>
          </>
        )}
      </label>
      </div>

      <button
        type="submit"
        disabled={!file || uploading}
        style={{
          width: '220px',
          display: 'block',
          margin: '0 auto',
          padding: '0.65rem 0.9rem',
          background: !file || uploading ? '#cbd5e1' : '#4f46e5',
          color: 'white',
          border: 'none',
          borderRadius: '10px',
          fontSize: '0.9rem',
          fontWeight: '600',
          cursor: !file || uploading ? 'not-allowed' : 'pointer'
        }}
      >
        {uploading ? 'Extracting…' : 'Extract Questions'}
      </button>

      </form>
      )}

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

      {showMetadataModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            width: 'min(520px, 92vw)',
            background: 'white',
            borderRadius: '12px',
            padding: '1.25rem',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#111827' }}>Before Uploading</h3>
            <p style={{ margin: '0 0 1rem 0', color: '#6b7280', fontSize: '0.9rem' }}>
              Select the school, course, and course type for generated questions.
            </p>

            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <select
                value={metadata.school}
                onChange={(e) => setMetadata((prev) => ({ ...prev, school: e.target.value }))}
                style={{ padding: '0.65rem', borderRadius: '8px', border: '1px solid #d1d5db' }}
              >
                <option value="">Select school</option>
                <option value="UCSB">UCSB</option>
                <option value="UCLA">UCLA</option>
                <option value="UC Berkeley">UC Berkeley</option>
                <option value="Other">Other</option>
              </select>

              <input
                type="text"
                placeholder="Course (e.g., CS 16)"
                value={metadata.course}
                onChange={(e) => setMetadata((prev) => ({ ...prev, course: e.target.value }))}
                style={{ padding: '0.65rem', borderRadius: '8px', border: '1px solid #d1d5db' }}
              />

              <input
                type="text"
                placeholder="Course type (e.g., Intro CS)"
                value={metadata.course_type}
                onChange={(e) => setMetadata((prev) => ({ ...prev, course_type: e.target.value }))}
                style={{ padding: '0.65rem', borderRadius: '8px', border: '1px solid #d1d5db' }}
              />
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                onClick={() => setShowMetadataModal(false)}
                disabled={uploading}
                style={{
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.55rem 0.9rem',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  fontWeight: 600
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmMetadata}
                disabled={uploading}
                style={{
                  background: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.55rem 0.9rem',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  fontWeight: 600
                }}
              >
                {uploading ? 'Uploading...' : 'Upload PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ocrSweep {
          0% { transform: translateX(0px); opacity: 0.35; }
          50% { transform: translateX(8.2px); opacity: 0.95; }
          100% { transform: translateX(0px); opacity: 0.35; }
        }

        @keyframes llmSparklePulse {
          0% { transform: scale(0.95); opacity: 0.45; }
          20% { transform: scale(1.15); opacity: 1; }
          55% { transform: scale(1); opacity: 0.75; }
          100% { transform: scale(0.95); opacity: 0.45; }
        }
      `}</style>

    </div>
  );
}
