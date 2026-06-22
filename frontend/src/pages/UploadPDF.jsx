import React, { useRef, useState } from 'react';
import { uploadPDF, getUploadStatus, cancelUploadJob } from '../api';
import {
  CourseDashboardBackButton,
  CourseDashboardPrimaryButton,
  CourseDashboardSecondaryButton,
  CourseDashboardInput,
  CourseDashboardSelect,
  dashboardPalette,
} from '../components/CourseDashboardUI';
import { buildHashWithFrom, getFromHash, navigateBackWithFallback } from '../utils/navigation';

const NAVY = dashboardPalette.navy;
const GOLD = dashboardPalette.gold;

const UploadFlowIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const ParseLayoutIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
    <line x1="8" y1="8" x2="16" y2="8" />
    <line x1="8" y1="11" x2="15" y2="11" />
    <line x1="8" y1="14" x2="13.5" y2="14" />
    <circle
      cx="6.5"
      cy="6.5"
      r="1.2"
      fill={NAVY}
      stroke="none"
      style={{ animation: 'layoutPulse 2.4s ease-in-out infinite' }}
    />
    <path
      d="M17.3 5.8l0.5 1.2 1.2 0.5-1.2 0.5-0.5 1.2-0.5-1.2-1.2-0.5 1.2-0.5z"
      fill={GOLD}
      stroke="none"
      style={{ animation: 'goldSparklePulse 3s ease-in-out infinite' }}
    />
  </svg>
);

const SegmentFormatIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="5" width="7" height="6" rx="1.5" />
    <line x1="5.5" y1="7.2" x2="8.5" y2="7.2" />
    <line x1="5.5" y1="9" x2="9" y2="9" />
    <rect x="13" y="5" width="7" height="6" rx="1.5" />
    <line x1="14.5" y1="7.2" x2="17.5" y2="7.2" />
    <line x1="14.5" y1="9" x2="18" y2="9" />
    <rect x="4" y="13" width="16" height="6" rx="1.5" />
    <line x1="5.5" y1="15.2" x2="10" y2="15.2" />
    <line x1="5.5" y1="17" x2="14" y2="17" />
    <path
      d="M19.3 4.8l0.5 1.2 1.2 0.5-1.2 0.5-0.5 1.2-0.5-1.2-1.2-0.5 1.2-0.5z"
      fill={GOLD}
      stroke="none"
      style={{ animation: 'goldSparklePulse 3s ease-in-out infinite' }}
    />
    <path
      d="M16.8 6.3l0.3 0.7 0.7 0.3-0.7 0.3-0.3 0.7-0.3-0.7-0.7-0.3 0.7-0.3z"
      fill={GOLD}
      stroke="none"
      style={{ animation: 'goldSparklePulse 3s ease-in-out infinite', animationDelay: '0.35s' }}
    />
  </svg>
);

const PdfSelectedIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9z" />
    <polyline points="14 3 14 9 20 9" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="16" x2="14" y2="16" />
  </svg>
);

const PIPELINE_STEPS = [
  {
    step: 1,
    title: '1. Upload PDF',
    text: 'Your PDF is saved to secure storage and queued for background processing.',
    icon: UploadFlowIcon,
  },
  {
    step: 2,
    title: '2. Parse layout',
    text: 'opendataloader-pdf walks the PDF structure — paragraphs, headings, lists, tables — into a JSON reading order with bounding boxes.',
    icon: ParseLayoutIcon,
  },
  {
    step: 3,
    title: '3. Segment & format',
    text: 'Heuristics group elements into individual questions. When LLM cleanup is enabled locally, a pass normalizes each question markdown before review.',
    icon: SegmentFormatIcon,
  },
];

export default function UploadPDF() {
  const currentHash = window.location.hash;
  const fromHash = getFromHash(currentHash);
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
  const isSegmentFormatStep =
    statusMessage.includes('segmenting') ||
    statusMessage.includes('formatting') ||
    statusMessage.includes('llm') ||
    statusMessage.includes('cleanup') ||
    statusMessage.includes('preparing question records') ||
    statusMessage.includes('saving generated questions') ||
    processing?.status === 'completed';
  const isParseLayoutStep =
    statusMessage.includes('parsing') ||
    statusMessage.includes('opendataloader') ||
    statusMessage.includes('fallback extractor') ||
    statusMessage.includes('compatibility parser');
  const pipelineStep = isSegmentFormatStep ? 3 : (isParseLayoutStep ? 2 : 1);

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
            window.location.hash = buildHashWithFrom(`verify?source=${encodeURIComponent(sourcePath)}&file=${encodeURIComponent(fileName)}`, currentHash);
          } else {
            setMessage('Canceled before any questions were saved.');
          }
        } else {
          setMessage(`Success! Created ${finalStatus.created_questions || 0} questions.`);
          window.location.hash = buildHashWithFrom(`verify?source=${encodeURIComponent(sourcePath)}&file=${encodeURIComponent(fileName)}`, currentHash);
        }
      } else if (result.status === "queued") {
        const sourcePath = result.storage_path;
        if (!sourcePath) {
          throw new Error('Backend did not return a storage path');
        }
        const fileName = result.filename || file.name;
        window.location.hash = buildHashWithFrom(`verify?source=${encodeURIComponent(sourcePath)}&file=${encodeURIComponent(fileName)}`, currentHash);
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

  const handleBack = () => {
    navigateBackWithFallback('#questions', fromHash);
  };

  const pipelineStepCardStyle = (step) => {
    const isActive = pipelineStep === step;
    return {
      borderRadius: '8px',
      border: `1px solid ${isActive ? dashboardPalette.navy : dashboardPalette.border}`,
      borderLeft: isActive ? `3px solid ${dashboardPalette.gold}` : `1px solid ${dashboardPalette.border}`,
      background: isActive ? dashboardPalette.navyLight : dashboardPalette.white,
      padding: '0.75rem',
    };
  };

  const pipelineIconBoxStyle = (step) => {
    const isActive = pipelineStep === step;
    return {
      width: '42px',
      height: '42px',
      borderRadius: '8px',
      border: `1px solid ${isActive ? dashboardPalette.navyMid : dashboardPalette.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: dashboardPalette.white,
      marginBottom: '0.5rem',
    };
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', paddingTop: '1.5rem', paddingLeft: '1rem', paddingRight: '1rem' }}>
      <CourseDashboardBackButton onClick={handleBack} style={{ marginBottom: '16px' }}>
        Back
      </CourseDashboardBackButton>
      <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.75rem', fontWeight: 600, lineHeight: 1.2, color: dashboardPalette.navy }}>
        Upload PDF for Processing
      </h1>
      <p style={{ margin: 0, color: dashboardPalette.muted, fontSize: '0.95rem', lineHeight: 1.5 }}>
        Upload a PDF to generate question drafts. Processing runs in the background and results appear in the Question Bank for verification.
      </p>

      <div
        style={{
          marginTop: '1rem',
          marginBottom: '1rem',
          padding: '24px',
          border: `1px solid ${dashboardPalette.border}`,
          borderRadius: '8px',
          background: dashboardPalette.white,
        }}
      >
        <div style={{ fontSize: '1rem', fontWeight: 600, color: dashboardPalette.navy, marginBottom: '0.75rem' }}>
          How the pipeline works
        </div>
        <div style={{ fontSize: '0.92rem', color: dashboardPalette.muted, marginBottom: '0.8rem', lineHeight: 1.5 }}>
          Uploads run through a structured-PDF pipeline. We extract the document&apos;s existing layout (no OCR),
          split it into individual questions, and optionally tidy the markdown with a local LLM before you verify the drafts.
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {PIPELINE_STEPS.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.step} style={pipelineStepCardStyle(item.step)}>
                <div style={pipelineIconBoxStyle(item.step)}>
                  <Icon />
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: dashboardPalette.navy, marginBottom: '0.3rem' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '0.82rem', color: dashboardPalette.muted, lineHeight: 1.45 }}>
                  {item.text}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {uploading && processing && (
        <div
          style={{
            marginTop: '1rem',
            marginBottom: '1rem',
            padding: '24px',
            borderRadius: '8px',
            border: `1px solid ${dashboardPalette.border}`,
            background: dashboardPalette.white,
          }}
        >
          <div style={{ fontSize: '0.95rem', color: dashboardPalette.navy, marginBottom: '0.35rem', fontWeight: 600 }}>
            {processing.message || 'Processing upload'}
          </div>
          <div style={{ fontSize: '0.82rem', color: dashboardPalette.muted, marginBottom: '0.7rem', lineHeight: 1.45 }}>
            Large or complex PDFs can take several minutes — segmentation and the optional LLM pass run per question.
          </div>
          <div style={{ width: '100%', height: '10px', borderRadius: '999px', background: dashboardPalette.border, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.max(0, Math.min(100, processing.progress_percent || 0))}%`,
                height: '100%',
                background: dashboardPalette.navy,
                transition: 'width 0.35s ease',
              }}
            />
          </div>
          <div style={{ marginTop: '0.45rem', textAlign: 'right', fontSize: '0.82rem', color: dashboardPalette.text }}>
            {Math.max(0, Math.min(100, processing.progress_percent || 0))}%
          </div>
          {currentJobId && ['queued', 'running', 'cancelling'].includes(processing.status) && (
            <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleCancelJob}
                disabled={cancelingJob || processing.status === 'cancelling'}
                style={{
                  background: dashboardPalette.dangerBg,
                  color: dashboardPalette.dangerText,
                  border: `1px solid ${dashboardPalette.dangerBorder}`,
                  borderRadius: '8px',
                  padding: '0.4rem 0.7rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: (cancelingJob || processing.status === 'cancelling') ? 'not-allowed' : 'pointer',
                  opacity: (cancelingJob || processing.status === 'cancelling') ? 0.7 : 1,
                }}
              >
                {processing.status === 'cancelling' || cancelingJob ? 'Stopping…' : 'Stop'}
              </button>
            </div>
          )}
          {currentJobId && ['queued', 'running', 'cancelling'].includes(processing.status) && (
            <div style={{ marginTop: '0.45rem', fontSize: '0.82rem', color: dashboardPalette.muted, textAlign: 'right' }}>
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
            margin: '2rem 0',
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
            border: `2px dashed ${dashboardPalette.border}`,
            borderRadius: '8px',
            cursor: uploading ? 'not-allowed' : 'pointer',
            background: dashboardPalette.surface,
            color: dashboardPalette.text,
            textAlign: 'center',
          }}
        >
          {!file ? (
          <>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '8px',
                background: dashboardPalette.navyLight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke={NAVY}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>

            <div style={{ fontSize: '1rem', fontWeight: 600, color: dashboardPalette.navy }}>
              Select PDF
            </div>

            <div style={{ fontSize: '0.875rem', color: dashboardPalette.muted, marginTop: '0.25rem' }}>
              Maximum size 25MB
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '8px',
                background: dashboardPalette.navyLight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <PdfSelectedIcon />
            </div>

            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: dashboardPalette.navy, maxWidth: '95%', wordBreak: 'break-word' }}>
              {file.name}
            </div>
          </>
        )}
      </label>
      </div>

      <CourseDashboardPrimaryButton
        type="submit"
        disabled={!file || uploading}
        style={{
          width: '220px',
          display: 'block',
          margin: '0 auto',
          opacity: !file || uploading ? 0.6 : 1,
          cursor: !file || uploading ? 'not-allowed' : 'pointer',
        }}
      >
        {uploading ? 'Processing…' : 'Extract Questions'}
      </CourseDashboardPrimaryButton>

      </form>
      )}

      {message && (
        <div style={{
          marginTop: '1rem',
          padding: '12px 16px',
          background: '#fff9e6',
          border: `1px solid ${dashboardPalette.gold}`,
          borderRadius: '8px',
          color: dashboardPalette.text,
          fontSize: '0.92rem',
        }}>
          {message}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: '1rem',
          padding: '12px 16px',
          background: dashboardPalette.dangerBg,
          border: `1px solid ${dashboardPalette.dangerBorder}`,
          borderRadius: '8px',
          color: dashboardPalette.dangerText,
          fontSize: '0.92rem',
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
          zIndex: 1000,
        }}>
          <div style={{
            width: 'min(520px, 92vw)',
            background: dashboardPalette.white,
            borderRadius: '8px',
            border: `1px solid ${dashboardPalette.border}`,
            padding: '1.25rem',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: dashboardPalette.navy, fontSize: '1.1rem', fontWeight: 600 }}>
              Before uploading
            </h3>
            <p style={{ margin: '0 0 1rem 0', color: dashboardPalette.muted, fontSize: '0.92rem', lineHeight: 1.5 }}>
              Select the school, course, and course type for generated questions.
            </p>

            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <CourseDashboardSelect
                value={metadata.school}
                onChange={(e) => setMetadata((prev) => ({ ...prev, school: e.target.value }))}
                style={{ width: '100%' }}
              >
                <option value="">Select school</option>
                <option value="UCSB">UCSB</option>
                <option value="UCLA">UCLA</option>
                <option value="UC Berkeley">UC Berkeley</option>
                <option value="Other">Other</option>
              </CourseDashboardSelect>

              <CourseDashboardInput
                type="text"
                placeholder="Course (e.g., CS 16)"
                value={metadata.course}
                onChange={(e) => setMetadata((prev) => ({ ...prev, course: e.target.value }))}
                style={{ width: '100%' }}
              />

              <CourseDashboardInput
                type="text"
                placeholder="Course type (e.g., Intro CS)"
                value={metadata.course_type}
                onChange={(e) => setMetadata((prev) => ({ ...prev, course_type: e.target.value }))}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <CourseDashboardSecondaryButton
                type="button"
                onClick={() => setShowMetadataModal(false)}
                disabled={uploading}
                style={{ opacity: uploading ? 0.6 : 1, cursor: uploading ? 'not-allowed' : 'pointer' }}
              >
                Cancel
              </CourseDashboardSecondaryButton>
              <CourseDashboardPrimaryButton
                type="button"
                onClick={handleConfirmMetadata}
                disabled={uploading}
                style={{ opacity: uploading ? 0.6 : 1, cursor: uploading ? 'not-allowed' : 'pointer' }}
              >
                {uploading ? 'Uploading…' : 'Upload PDF'}
              </CourseDashboardPrimaryButton>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes layoutPulse {
          0% { transform: scale(0.9); opacity: 0.45; }
          50% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.45; }
        }

        @keyframes goldSparklePulse {
          0% { transform: scale(0.95); opacity: 0.45; }
          20% { transform: scale(1.15); opacity: 1; }
          55% { transform: scale(1); opacity: 0.75; }
          100% { transform: scale(0.95); opacity: 0.45; }
        }
      `}</style>

    </div>
  );
}
