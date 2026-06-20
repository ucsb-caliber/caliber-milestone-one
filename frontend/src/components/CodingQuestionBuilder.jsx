import React from 'react';
import CodeEditor from './CodeEditor';
import CodingAutograderHelpModal from './CodingAutograderHelpModal';
import { createEmptyCodingTest } from '../utils/coding';

export default function CodingQuestionBuilder({ codingConfig, onChange, inputStyle }) {
  const config = codingConfig || {};
  const [showHelp, setShowHelp] = React.useState(false);

  const helperStyle = { fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem', lineHeight: 1.45 };
  const fieldLabelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' };
  const fieldGroupStyle = { display: 'flex', flexDirection: 'column', gap: '0.1rem' };

  const updateField = (field, value) => {
    onChange?.({ ...config, [field]: value });
  };

  const updateTest = (field, index, key, value) => {
    const nextTests = [...(config[field] || [])];
    nextTests[index] = { ...nextTests[index], [key]: value };
    updateField(field, nextTests);
  };

  const addTest = (field) => {
    updateField(field, [...(config[field] || []), createEmptyCodingTest((config[field] || []).length)]);
  };

  const removeTest = (field, index) => {
    updateField(field, (config[field] || []).filter((_, idx) => idx !== index));
  };

  const renderTestGroup = (field, title, hint, addLabel, { showSampleIO = false } = {}) => (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: '#111827' }}>{title}</div>
          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>{hint}</div>
        </div>
        <button
          type="button"
          onClick={() => addTest(field)}
          style={{
            border: '1px dashed #94a3b8',
            background: 'white',
            borderRadius: '8px',
            padding: '0.45rem 0.75rem',
            cursor: 'pointer',
            fontWeight: 600,
            color: '#334155',
          }}
        >
          {addLabel}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {(config[field] || []).map((test, index) => (
          <div key={`${field}-${index}`} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1rem', background: '#f8fafc' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
              <div style={fieldGroupStyle}>
                <label style={fieldLabelStyle}>{`Test Name ${index + 1}`}</label>
                <input
                  type="text"
                  value={test.name || ''}
                  placeholder={`Test ${index + 1} name`}
                  style={inputStyle}
                  onChange={(e) => updateTest(field, index, 'name', e.target.value)}
                />
                <div style={helperStyle}>Short label for this test result card.</div>
              </div>
              <div style={fieldGroupStyle}>
                <label style={fieldLabelStyle}>Description</label>
                <input
                  type="text"
                  value={test.description || ''}
                  placeholder="Short description shown in the UI"
                  style={inputStyle}
                  onChange={(e) => updateTest(field, index, 'description', e.target.value)}
                />
                <div style={helperStyle}>Visible summary explaining what this test is checking.</div>
              </div>
              {showSampleIO && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={fieldGroupStyle}>
                    <label style={fieldLabelStyle}>Sample Input</label>
                    <textarea
                      value={test.input || ''}
                      placeholder="What students should think of as the test input"
                      style={{ ...inputStyle, minHeight: '92px', fontFamily: 'monospace', resize: 'vertical' }}
                      onChange={(e) => updateTest(field, index, 'input', e.target.value)}
                    />
                    <div style={helperStyle}>Required for visible tests. Show the input case students should reason about.</div>
                  </div>
                  <div style={fieldGroupStyle}>
                    <label style={fieldLabelStyle}>Expected Output</label>
                    <textarea
                      value={test.output || ''}
                      placeholder="Expected output for this visible sample"
                      style={{ ...inputStyle, minHeight: '92px', fontFamily: 'monospace', resize: 'vertical' }}
                      onChange={(e) => updateTest(field, index, 'output', e.target.value)}
                    />
                    <div style={helperStyle}>Required for visible tests. This is what students should expect to see for the sample.</div>
                  </div>
                </div>
              )}
              <div style={fieldGroupStyle}>
                <label style={fieldLabelStyle}>Autograder Check</label>
                <CodeEditor
                  language="cpp"
                  value={test.code || ''}
                  height="190px"
                  onChange={(nextCode) => updateTest(field, index, 'code', nextCode)}
                />
                <div style={helperStyle}>
                  Trusted C++ snippet run inside the harness. It should return `true` when the student solution passes.
                  Use `caliber_expect_eq(...)` for clearer expected/received failure output.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
              <button
                type="button"
                onClick={() => removeTest(field, index)}
                style={{
                  border: 'none',
                  background: '#fee2e2',
                  color: '#b91c1c',
                  borderRadius: '8px',
                  padding: '0.45rem 0.75rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, color: '#111827' }}>Coding Setup</div>
          <div style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '0.25rem' }}>
            Configure the function students implement and the limits used by the runner.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowHelp(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            border: '1px solid #bfdbfe',
            background: '#eff6ff',
            color: '#1d4ed8',
            borderRadius: '999px',
            padding: '0.5rem 0.85rem',
            fontWeight: 700,
            fontSize: '0.88rem',
            cursor: 'pointer',
          }}
        >
          Autograder Help
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={fieldGroupStyle}>
          <label style={fieldLabelStyle}>Function Signature</label>
          <input
            type="text"
            value={config.function_signature || ''}
            placeholder="Function signature"
            style={inputStyle}
            onChange={(e) => updateField('function_signature', e.target.value)}
          />
          <div style={helperStyle}>The function students are expected to implement, such as `int solve(int n)`.</div>
        </div>
        <div style={fieldGroupStyle}>
          <label style={fieldLabelStyle}>Points</label>
          <input
            type="number"
            min="1"
            value={config.points ?? 10}
            placeholder="Points"
            style={inputStyle}
            onChange={(e) => updateField('points', Number(e.target.value) || 0)}
          />
          <div style={helperStyle}>Total points earned if all hidden tests pass.</div>
        </div>
        <div style={fieldGroupStyle}>
          <label style={fieldLabelStyle}>Time Limit (ms)</label>
          <input
            type="number"
            min="250"
            value={config.time_limit_ms ?? 2000}
            placeholder="Time ms"
            style={inputStyle}
            onChange={(e) => updateField('time_limit_ms', Number(e.target.value) || 2000)}
          />
          <div style={helperStyle}>Maximum execution time per run in milliseconds.</div>
        </div>
        <div style={fieldGroupStyle}>
          <label style={fieldLabelStyle}>Memory Limit (MB)</label>
          <input
            type="number"
            min="64"
            value={config.memory_limit_mb ?? 256}
            placeholder="Memory MB"
            style={inputStyle}
            onChange={(e) => updateField('memory_limit_mb', Number(e.target.value) || 256)}
          />
          <div style={helperStyle}>Maximum memory available to the code runner.</div>
        </div>
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontWeight: 700, color: '#111827', marginBottom: '0.5rem' }}>Starter Code</div>
        <div style={{ ...helperStyle, marginBottom: '0.75rem', marginTop: 0 }}>
          This is the code students see when they open the problem. Include the `Solution` class and the target function stub.
        </div>
        <CodeEditor
          language="cpp"
          height="280px"
          value={config.starter_code || ''}
          onChange={(nextCode) => updateField('starter_code', nextCode)}
        />
      </div>

      {renderTestGroup('visible_tests', 'Visible Tests', 'Students can run these with the Run Code button. Sample input and expected output are required here.', 'Add Visible Test', { showSampleIO: true })}
      {renderTestGroup('hidden_tests', 'Hidden Tests', 'Used only when the assignment is submitted for grading.', 'Add Hidden Test')}
      {showHelp && <CodingAutograderHelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
