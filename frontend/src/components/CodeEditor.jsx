import React from 'react';
import Editor from '@monaco-editor/react';

export default function CodeEditor({
  value,
  onChange,
  language = 'cpp',
  height = '320px',
  readOnly = false,
}) {
  return (
    <div style={{ border: '1px solid #d1d5db', borderRadius: '10px', overflow: 'hidden' }}>
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={(nextValue) => onChange?.(nextValue || '')}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          readOnly,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          tabSize: 2,
          wordWrap: 'on',
          lineNumbersMinChars: 3,
          padding: { top: 12, bottom: 12 },
        }}
        theme="vs"
      />
    </div>
  );
}
