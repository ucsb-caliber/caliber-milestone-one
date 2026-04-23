import React from 'react';
import CodeEditor from './CodeEditor';

const sectionStyle = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: '14px',
  padding: '1.25rem',
  marginBottom: '1rem',
};

function Example({ title, note, code, height = '120px' }) {
  return (
    <div style={{ marginBottom: '1.1rem' }}>
      <div style={{ fontWeight: 700, color: '#111827', marginBottom: '0.35rem' }}>{title}</div>
      {note && <div style={{ color: '#475569', fontSize: '0.92rem', marginBottom: '0.55rem' }}>{note}</div>}
      <CodeEditor language="cpp" value={code} readOnly={true} height={height} />
    </div>
  );
}

export default function CodingAutograderHelpModal({ onClose }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        zIndex: 20000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(980px, 100%)',
          maxHeight: '88vh',
          overflowY: 'auto',
          background: '#f8fafc',
          borderRadius: '18px',
          padding: '1.25rem',
          boxShadow: '0 30px 60px rgba(15, 23, 42, 0.24)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div>
            <h1 style={{ margin: '0 0 0.45rem 0', fontSize: '1.9rem', color: '#111827' }}>How To Write Coding Tests</h1>
            <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>
              Each autograder test is a trusted C++ snippet that runs inside the harness and must return a boolean.
              Visible tests also need sample input and expected output text so students can see concrete examples before they run code.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: '#e2e8f0',
              color: '#0f172a',
              borderRadius: '999px',
              width: '36px',
              height: '36px',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '1rem',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0, color: '#111827' }}>About `caliber_expect_eq(...)`</h2>
          <CodeEditor
            language="cpp"
            value={`bool caliber_expect_eq(actual, expected, message, expected_output, received_output)`}
            readOnly={true}
            height="70px"
          />
          <div style={{ color: '#475569', lineHeight: 1.7, marginTop: '0.75rem' }}>
            This helper is the easiest way to compare the student result to the value you expect.
            It is recommended for most tests because it automatically builds clearer failure feedback.
          </div>
          <div style={{ display: 'grid', gap: '0.7rem', marginTop: '0.9rem' }}>
            <div>
              <strong>`actual`</strong>
              <div style={{ color: '#475569' }}>The value returned by the student’s function, such as `s.solve(4)`.</div>
            </div>
            <div>
              <strong>`expected`</strong>
              <div style={{ color: '#475569' }}>The correct value you want the student code to produce.</div>
            </div>
            <div>
              <strong>`message`</strong>
              <div style={{ color: '#475569' }}>
                A harness variable that stores the failure message shown after `Run Code`.
                Most of the time you do not need to set it yourself, because `caliber_expect_eq(...)` fills it automatically when values do not match.
              </div>
            </div>
            <div>
              <strong>`expected_output`</strong>
              <div style={{ color: '#475569' }}>
                A harness variable used for the displayed expected result.
                Usually you do not need to set it manually when using `caliber_expect_eq(...)`, because the helper derives it from `expected`.
              </div>
            </div>
            <div>
              <strong>`received_output`</strong>
              <div style={{ color: '#475569' }}>
                A harness variable used for the displayed student result.
                Usually you do not need to set it manually when using `caliber_expect_eq(...)`, because the helper derives it from `actual`.
              </div>
            </div>
          </div>
          <div style={{ color: '#475569', lineHeight: 1.7, marginTop: '0.9rem' }}>
            When do you need to fill things in yourself?
          </div>
          <ul style={{ color: '#475569', lineHeight: 1.7, marginBottom: 0 }}>
            <li>For normal equality checks, just call `caliber_expect_eq(...)` and do not manually set `message`, `expected_output`, or `received_output`.</li>
            <li>For visible sample tests, you should still fill the form’s `Sample Input` and `Expected Output` fields so students can see an example before running code.</li>
            <li>If your check is more custom, like a tolerance-based floating-point comparison, you may set `expected_output`, `received_output`, or `message` yourself before returning `true` or `false`.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0, color: '#111827' }}>Mental Model</h2>
          <p style={{ color: '#475569', lineHeight: 1.6 }}>
            Your starter code should define a `Solution` class and the target function. In every test, you usually:
          </p>
          <ol style={{ color: '#475569', lineHeight: 1.7, marginBottom: 0 }}>
            <li>Create a `Solution` instance.</li>
            <li>Call the student’s function.</li>
            <li>Compare the result to the expected value.</li>
            <li>Return `true` or `false`, ideally with `caliber_expect_eq(...)` so failed runs show expected and received values.</li>
          </ol>
        </div>

        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0, color: '#111827' }}>Basic Examples</h2>
          <Example
            title="Example 1: Single integer result"
            note="Good for functions like `int solve(int n)`."
            code={`Solution s;\nreturn caliber_expect_eq(s.solve(4), 4, message, expected_output, received_output);`}
          />
          <Example
            title="Example 2: Multiple checks in one test"
            note="Useful when one visible test should cover a few common cases."
            code={`Solution s;\nreturn caliber_expect_eq(s.solve(1), 1, message, expected_output, received_output)\n    && caliber_expect_eq(s.solve(2), 2, message, expected_output, received_output)\n    && caliber_expect_eq(s.solve(10), 10, message, expected_output, received_output);`}
            height="140px"
          />
          <Example
            title="Example 3: Vector result"
            note="Compare vectors directly if your function returns a vector."
            code={`Solution s;\nstd::vector<int> expected = {1, 2, 3};\nreturn caliber_expect_eq(s.solve(3), expected, message, expected_output, received_output);`}
            height="135px"
          />
        </div>

        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0, color: '#111827' }}>What `caliber_expect_eq(...)` Does</h2>
          <div style={{ color: '#475569', lineHeight: 1.7 }}>
            It compares the student result to the expected value and returns `true` when they match.
            If they do not match, it automatically fills in:
          </div>
          <ul style={{ color: '#475569', lineHeight: 1.7, marginBottom: 0 }}>
            <li>`expected_output` with a displayable version of the expected value</li>
            <li>`received_output` with a displayable version of the student result</li>
            <li>`message` with a helpful failure summary like `Expected: 4. Received: 5.`</li>
          </ul>
          <div style={{ color: '#475569', lineHeight: 1.7, marginTop: '0.75rem' }}>
            That is why it is the recommended helper for most visible and hidden tests. It gives students much clearer feedback after clicking `Run Code`.
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0, color: '#111827' }}>String Examples</h2>
          <Example
            title="String equality"
            code={`Solution s;\nreturn caliber_expect_eq(s.solve("abc"), std::string("cba"), message, expected_output, received_output);`}
          />
          <Example
            title="Case with edge conditions"
            code={`Solution s;\nreturn caliber_expect_eq(s.solve(""), std::string(""), message, expected_output, received_output)\n    && caliber_expect_eq(s.solve("a"), std::string("a"), message, expected_output, received_output)\n    && caliber_expect_eq(s.solve("abba"), std::string("abba"), message, expected_output, received_output);`}
            height="140px"
          />
        </div>

        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0, color: '#111827' }}>Visible Sample Test Example</h2>
          <div style={{ color: '#475569', marginBottom: '0.75rem', lineHeight: 1.6 }}>
            For visible tests, fill in all three pieces:
            sample input, expected output, and the autograder check.
          </div>
          <div style={{ display: 'grid', gap: '0.55rem', color: '#334155', fontSize: '0.92rem' }}>
            <div><strong>Sample Input:</strong> <code>4</code></div>
            <div><strong>Expected Output:</strong> <code>4</code></div>
          </div>
          <div style={{ marginTop: '0.8rem' }}>
            <Example
              title="Autograder Check"
              code={`Solution s;\nreturn caliber_expect_eq(s.solve(4), 4, message, expected_output, received_output);`}
            />
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0, color: '#111827' }}>What To Put In Each Field</h2>
          <div style={{ display: 'grid', gap: '0.8rem' }}>
            <div>
              <strong>Test Name</strong>
              <div style={{ color: '#475569' }}>Short label like `Base Case`, `Negative Numbers`, or `Large Input`.</div>
            </div>
            <div>
              <strong>Description</strong>
              <div style={{ color: '#475569' }}>Student-facing summary of what the test is checking.</div>
            </div>
            <div>
              <strong>Sample Input</strong>
              <div style={{ color: '#475569' }}>Required for visible tests. Show the example input the student should reason about.</div>
            </div>
            <div>
              <strong>Expected Output</strong>
              <div style={{ color: '#475569' }}>Required for visible tests. Show the output students should expect for that sample.</div>
            </div>
            <div>
              <strong>Autograder Check</strong>
              <div style={{ color: '#475569' }}>The C++ snippet that calls the student function and returns `true` or `false`. `caliber_expect_eq(...)` gives clearer expected/received failures.</div>
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0, color: '#111827' }}>Starter Code Example</h2>
          <CodeEditor
            language="cpp"
            value={`class Solution {\npublic:\n  int solve(int n) {\n    return n;\n  }\n};`}
            readOnly={true}
            height="170px"
          />
        </div>

        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0, color: '#111827' }}>Floating Point Example</h2>
          <CodeEditor
            language="cpp"
            value={`Solution s;\ndouble actual = s.solve(2.0);\ndouble expected = 1.41421356237;\nexpected_output = "1.414214";\nreceived_output = caliber_to_string(actual);\nreturn std::abs(actual - expected) < 1e-6;`}
            readOnly={true}
            height="150px"
          />
        </div>

        <div style={sectionStyle}>
          <h2 style={{ marginTop: 0, color: '#111827' }}>Tips</h2>
          <ul style={{ color: '#475569', lineHeight: 1.7, marginBottom: 0 }}>
            <li>Keep visible tests simple and illustrative so students can use `Run Code` meaningfully.</li>
            <li>Put stronger edge cases in hidden tests.</li>
            <li>Prefer direct equality checks over complicated test logic when possible.</li>
            <li>Make sure your starter code and tests agree on function name, argument types, and return type.</li>
            <li>If a return type is floating point, compare with a tolerance instead of exact equality.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
