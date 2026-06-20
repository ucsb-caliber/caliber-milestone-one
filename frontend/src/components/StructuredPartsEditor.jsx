import React, { useState } from 'react';

const choiceIdForIndex = (index) => String.fromCharCode(65 + index);

const partKey = (part, index) => `${part.part_id || 'part'}-${index}`;

const typeLabels = {
  mcq: 'Multiple Choice',
  true_false: 'True/False',
  free_response: 'Free Response',
  short_answer: 'Short Answer',
  coding: 'Coding',
};

const getNextPartId = (parts) => {
  const existing = new Set(parts.map(part => (part.part_id || '').trim().toLowerCase()).filter(Boolean));
  let index = parts.length;
  let nextId = choiceIdForIndex(index).toLowerCase();

  while (existing.has(nextId)) {
    index += 1;
    nextId = choiceIdForIndex(index).toLowerCase();
  }

  return nextId;
};

const getPartValidationHints = (part, duplicateIds) => {
  const hints = [];
  const partId = (part.part_id || '').trim();

  if (!partId) hints.push('Add a part ID.');
  if (partId && duplicateIds.has(partId.toLowerCase())) hints.push('Use a unique part ID.');
  if (!part.prompt.trim()) hints.push('Add the part prompt.');

  if (part.type === 'mcq' || part.type === 'true_false') {
    const validChoices = (part.choices || []).filter(choice => choice.text.trim());
    if (validChoices.length < 2) hints.push('Fill in at least 2 answer choices.');
    if (!part.correct_answer) hints.push('Select the correct answer.');
    if (part.correct_answer && !validChoices.some(choice => choice.id === part.correct_answer)) {
      hints.push('Correct answer must match a filled choice.');
    }
  } else if (part.type === 'coding') {
    const coding = part.coding || {};
    const tests = Array.isArray(coding.tests) ? coding.tests : [];
    if (!tests.length) hints.push('Add at least one test case.');
    if (!Array.isArray(coding.allowed_languages) || coding.allowed_languages.length < 1) hints.push('Choose at least one language.');
    if (tests.some(test => !String(test.expected_output || '').trim())) hints.push('Each test needs expected output.');
    if (tests.some(test => test.mode === 'python_harness' && !String(test.harness || '').trim())) hints.push('Python harness tests need harness code.');
  } else {
    const validRubric = (part.rubric || []).some(level => level.criteria.trim() || Number(level.points || 0) > 0);
    if (!validRubric) hints.push('Add at least one rubric level.');
  }

  return hints;
};

export function defaultMultipartParts() {
  return [
    {
      part_id: 'a',
      label: 'Part A',
      type: 'mcq',
      prompt: '',
      choices: [
        { id: 'A', text: '' },
        { id: 'B', text: '' },
      ],
      correct_answer: '',
      points: 1,
      rubric: [],
    },
    {
      part_id: 'b',
      label: 'Part B',
      type: 'free_response',
      prompt: '',
      choices: [],
      correct_answer: '',
      points: null,
      rubric: [
        { points: 4, criteria: '' },
        { points: 2, criteria: '' },
        { points: 0, criteria: '' },
      ],
    },
  ];
}

export function defaultCodingPart() {
  return {
    part_id: 'a',
    label: 'Program',
    type: 'coding',
    prompt: '',
    choices: [],
    correct_answer: '',
    points: 10,
    rubric: [],
    coding: {
      allowed_languages: ['python', 'cpp'],
      starter_code_by_language: {
        python: '',
        cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}\n',
      },
      tests: [
        { name: 'Sample 1', visibility: 'visible', mode: 'stdin', input: '', expected_output: '', harness: '', points: 1 },
        { name: 'Hidden 1', visibility: 'hidden', mode: 'stdin', input: '', expected_output: '', harness: '', points: 1 },
      ],
      timeout_ms: 2000,
      memory_mb: 128,
      max_output_bytes: 20000,
    },
  };
}

export function normalizeStructuredParts(parts) {
  const source = Array.isArray(parts) && parts.length > 0 ? parts : defaultMultipartParts();
  return source.map((part, index) => {
    const type = part.type === 'fr' ? 'free_response' : (part.type || 'free_response');
    const isAuto = type === 'mcq' || type === 'true_false';
    const isCoding = type === 'coding';
    const choices = type === 'true_false'
      ? [{ id: 'A', text: 'True' }, { id: 'B', text: 'False' }]
      : Array.isArray(part.choices) && part.choices.length > 0
        ? part.choices.map((choice, choiceIndex) => ({
            id: choice.id || choiceIdForIndex(choiceIndex),
            text: choice.text || '',
          }))
        : [{ id: 'A', text: '' }, { id: 'B', text: '' }];

    return {
      part_id: part.part_id || choiceIdForIndex(index).toLowerCase(),
      label: part.label || `Part ${choiceIdForIndex(index)}`,
      type,
      prompt: part.prompt || '',
      choices: isAuto ? choices : [],
      correct_answer: isAuto ? (part.correct_answer || choices[0]?.id || 'A') : '',
      points: isAuto || isCoding ? Number(part.points || (isCoding ? 10 : 1)) : null,
      rubric: isAuto || isCoding
        ? []
        : Array.isArray(part.rubric) && part.rubric.length > 0
          ? part.rubric.map(level => ({ points: Number(level.points) || 0, criteria: level.criteria || level.description || '' }))
          : [{ points: 4, criteria: '' }, { points: 2, criteria: '' }, { points: 0, criteria: '' }],
      coding: isCoding
        ? {
            ...defaultCodingPart().coding,
            ...(part.coding || {}),
            allowed_languages: Array.isArray(part.coding?.allowed_languages) && part.coding.allowed_languages.length
              ? part.coding.allowed_languages.filter(lang => lang === 'python' || lang === 'cpp')
              : ['python', 'cpp'],
            starter_code_by_language: {
              ...defaultCodingPart().coding.starter_code_by_language,
              ...(part.coding?.starter_code_by_language || {}),
            },
            tests: Array.isArray(part.coding?.tests) && part.coding.tests.length
              ? part.coding.tests.map((test, testIndex) => ({
                  name: test.name || `Test ${testIndex + 1}`,
                  visibility: test.visibility === 'visible' ? 'visible' : 'hidden',
                  mode: test.mode === 'python_harness' ? 'python_harness' : 'stdin',
                  input: test.input || '',
                  expected_output: test.expected_output || '',
                  harness: test.harness || '',
                  points: Number(test.points || 0) || 1,
                }))
              : defaultCodingPart().coding.tests,
          }
        : undefined,
    };
  });
}

export function structuredPartsTotal(parts) {
  return normalizeStructuredParts(parts).reduce((total, part) => {
    if (part.type === 'mcq' || part.type === 'true_false') {
      return total + Number(part.points || 1);
    }
    if (part.type === 'coding') {
      return total + Number(part.points || 0);
    }
    const rubricMax = Math.max(...(part.rubric || [{ points: 0 }]).map(level => Number(level.points) || 0));
    return total + rubricMax;
  }, 0);
}

export function validateStructuredParts(parts) {
  const normalized = normalizeStructuredParts(parts);
  if (normalized.length < 2 && normalized[0]?.type !== 'coding') return 'Multipart questions need at least 2 parts';

  const ids = new Set();
  for (const part of normalized) {
    if (!part.part_id.trim()) return 'Each part needs a part ID';
    if (ids.has(part.part_id.trim())) return 'Part IDs must be unique';
    ids.add(part.part_id.trim());

    if (!part.prompt.trim()) return `${part.label || part.part_id} needs a prompt`;

    if (part.type === 'mcq' || part.type === 'true_false') {
      const validChoices = (part.choices || []).filter(choice => choice.text.trim());
      if (validChoices.length < 2) return `${part.label || part.part_id} needs at least 2 answer choices`;
      if (!part.correct_answer) return `${part.label || part.part_id} needs a correct answer`;
      if (!validChoices.some(choice => choice.id === part.correct_answer)) {
        return `${part.label || part.part_id} correct answer must match one of its choices`;
      }
    } else if (part.type === 'coding') {
      const tests = Array.isArray(part.coding?.tests) ? part.coding.tests : [];
      if (!tests.length) return `${part.label || part.part_id} needs at least one test`;
      if (!Array.isArray(part.coding?.allowed_languages) || part.coding.allowed_languages.length < 1) {
        return `${part.label || part.part_id} needs at least one language`;
      }
      if (tests.some(test => !String(test.expected_output || '').trim())) return `${part.label || part.part_id} tests need expected output`;
      if (tests.some(test => test.mode === 'python_harness' && !String(test.harness || '').trim())) return `${part.label || part.part_id} Python harness tests need harness code`;
    } else {
      const validRubric = (part.rubric || []).some(level => level.criteria.trim() || Number(level.points || 0) > 0);
      if (!validRubric) return `${part.label || part.part_id} needs at least one rubric level`;
    }
  }

  return '';
}

export function partsToLegacyRubric(parts) {
  return normalizeStructuredParts(parts)
    .filter(part => part.type === 'free_response' || part.type === 'short_answer')
    .map(part => ({
      part_label: part.label,
      rubric_levels: (part.rubric || []).map(level => ({
        points: Number(level.points) || 0,
        criteria: level.criteria || '',
      })),
    }));
}

export default function StructuredPartsEditor({ parts, onChange, styles = {} }) {
  const [collapsedParts, setCollapsedParts] = useState(new Set());
  const normalizedParts = normalizeStructuredParts(parts);
  const inputStyle = styles.input || {};
  const secondaryBtn = styles.secondaryBtn || {};
  const labelStyle = styles.label || {};
  const controlBtnStyle = {
    ...secondaryBtn,
    minWidth: '34px',
    height: '34px',
    padding: '6px 9px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  };
  const duplicateIds = normalizedParts.reduce((ids, part, _, allParts) => {
    const partId = (part.part_id || '').trim().toLowerCase();
    if (partId && allParts.filter(candidate => (candidate.part_id || '').trim().toLowerCase() === partId).length > 1) {
      ids.add(partId);
    }
    return ids;
  }, new Set());

  const updatePart = (index, patch) => {
    onChange(normalizedParts.map((part, partIndex) => (
      partIndex === index ? { ...part, ...patch } : part
    )));
  };

  const addPart = () => {
    const nextId = getNextPartId(normalizedParts);
    onChange([
      ...normalizedParts,
      {
        part_id: nextId,
        label: `Part ${nextId.toUpperCase()}`,
        type: 'free_response',
        prompt: '',
        choices: [],
        correct_answer: '',
        points: null,
        rubric: [{ points: 4, criteria: '' }, { points: 2, criteria: '' }, { points: 0, criteria: '' }],
      },
    ]);
  };

  const duplicatePart = (index) => {
    const part = normalizedParts[index];
    const nextId = getNextPartId(normalizedParts);
    onChange([
      ...normalizedParts.slice(0, index + 1),
      {
        ...part,
        part_id: nextId,
        label: `${part.label || `Part ${part.part_id?.toUpperCase() || nextId.toUpperCase()}`} Copy`,
        choices: (part.choices || []).map(choice => ({ ...choice })),
        rubric: (part.rubric || []).map(level => ({ ...level })),
      },
      ...normalizedParts.slice(index + 1),
    ]);
  };

  const removePart = (index) => {
    if (normalizedParts.length <= 2) return;
    onChange(normalizedParts.filter((_, partIndex) => partIndex !== index));
  };

  const togglePart = (key) => {
    setCollapsedParts((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const movePart = (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= normalizedParts.length) return;
    const reordered = [...normalizedParts];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    onChange(reordered);
  };

  const updateChoice = (partIndex, choiceIndex, text) => {
    const part = normalizedParts[partIndex];
    const choices = [...part.choices];
    choices[choiceIndex] = { ...choices[choiceIndex], text };
    updatePart(partIndex, { choices });
  };

  const addChoice = (partIndex) => {
    const part = normalizedParts[partIndex];
    const choices = [...part.choices, { id: choiceIdForIndex(part.choices.length), text: '' }];
    updatePart(partIndex, { choices });
  };

  const removeChoice = (partIndex, choiceIndex) => {
    const part = normalizedParts[partIndex];
    if (part.choices.length <= 2) return;
    const choices = part.choices
      .filter((_, index) => index !== choiceIndex)
      .map((choice, index) => ({ ...choice, id: choiceIdForIndex(index) }));
    updatePart(partIndex, {
      choices,
      correct_answer: choices.some(choice => choice.id === part.correct_answer) ? part.correct_answer : choices[0]?.id || '',
    });
  };

  const updateRubric = (partIndex, levelIndex, field, value) => {
    const part = normalizedParts[partIndex];
    const rubric = [...part.rubric];
    rubric[levelIndex] = {
      ...rubric[levelIndex],
      [field]: field === 'points' ? Number(value || 0) : value,
    };
    updatePart(partIndex, { rubric });
  };

  const addRubric = (partIndex) => {
    const part = normalizedParts[partIndex];
    updatePart(partIndex, { rubric: [...part.rubric, { points: 0, criteria: '' }] });
  };

  const updateCoding = (partIndex, patch) => {
    const part = normalizedParts[partIndex];
    updatePart(partIndex, { coding: { ...(part.coding || defaultCodingPart().coding), ...patch } });
  };

  const updateCodingStarter = (partIndex, language, value) => {
    const part = normalizedParts[partIndex];
    updateCoding(partIndex, {
      starter_code_by_language: {
        ...(part.coding?.starter_code_by_language || {}),
        [language]: value,
      },
    });
  };

  const updateCodingLanguage = (partIndex, language, enabled) => {
    const part = normalizedParts[partIndex];
    const current = new Set(part.coding?.allowed_languages || []);
    if (enabled) current.add(language);
    if (!enabled && current.size > 1) current.delete(language);
    updateCoding(partIndex, { allowed_languages: Array.from(current) });
  };

  const updateCodingTest = (partIndex, testIndex, field, value) => {
    const part = normalizedParts[partIndex];
    const tests = [...(part.coding?.tests || [])];
    tests[testIndex] = {
      ...tests[testIndex],
      [field]: field === 'points' ? Number(value || 0) : value,
    };
    updateCoding(partIndex, { tests });
  };

  const addCodingTest = (partIndex, visibility = 'hidden') => {
    const part = normalizedParts[partIndex];
    const tests = [...(part.coding?.tests || [])];
    tests.push({ name: `Test ${tests.length + 1}`, visibility, mode: 'stdin', input: '', expected_output: '', harness: '', points: 1 });
    updateCoding(partIndex, { tests });
  };

  const removeCodingTest = (partIndex, testIndex) => {
    const part = normalizedParts[partIndex];
    const tests = (part.coding?.tests || []).filter((_, index) => index !== testIndex);
    if (!tests.length) return;
    updateCoding(partIndex, { tests });
  };

  const removeRubric = (partIndex, levelIndex) => {
    const part = normalizedParts[partIndex];
    if (part.rubric.length <= 1) return;
    updatePart(partIndex, { rubric: part.rubric.filter((_, index) => index !== levelIndex) });
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <label style={labelStyle}>Parts</label>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>Total: {structuredPartsTotal(normalizedParts)} points</div>
        </div>
        <button type="button" style={{ ...secondaryBtn, padding: '8px 12px' }} onClick={addPart}>
          + Add Part
        </button>
      </div>

      {normalizedParts.map((part, partIndex) => {
        const isAuto = part.type === 'mcq' || part.type === 'true_false';
        const isCoding = part.type === 'coding';
        const key = partKey(part, partIndex);
        const isCollapsed = collapsedParts.has(key);
        const hints = getPartValidationHints(part, duplicateIds);
        return (
          <div
            key={key}
            style={{
              background: '#f8fafc',
              border: `1px solid ${hints.length ? '#f59e0b' : '#e2e8f0'}`,
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '90px minmax(180px, 1fr) 170px auto', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
              <input
                type="text"
                value={part.part_id}
                onChange={(event) => updatePart(partIndex, { part_id: event.target.value.trim().toLowerCase() })}
                style={inputStyle}
                aria-label="Part ID"
              />
              <input
                type="text"
                value={part.label}
                onChange={(event) => updatePart(partIndex, { label: event.target.value })}
                style={inputStyle}
                aria-label="Part label"
              />
              <select
                value={part.type}
                onChange={(event) => {
                  const type = event.target.value;
                  updatePart(partIndex, normalizeStructuredParts([{ ...part, type }])[0]);
                }}
                style={inputStyle}
              >
                <option value="mcq">Multiple Choice</option>
                <option value="true_false">True/False</option>
                <option value="free_response">Free Response</option>
                <option value="short_answer">Short Answer</option>
                <option value="coding">Coding</option>
              </select>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'nowrap' }}>
                <button type="button" onClick={() => togglePart(key)} style={controlBtnStyle} aria-expanded={!isCollapsed} aria-label={isCollapsed ? `Expand ${part.label}` : `Collapse ${part.label}`} title={isCollapsed ? 'Expand part' : 'Collapse part'}>
                  {isCollapsed ? '▸' : '▾'}
                </button>
                <button type="button" onClick={() => movePart(partIndex, -1)} disabled={partIndex === 0} style={controlBtnStyle} aria-label={`Move ${part.label} up`} title="Move up">↑</button>
                <button type="button" onClick={() => movePart(partIndex, 1)} disabled={partIndex === normalizedParts.length - 1} style={controlBtnStyle} aria-label={`Move ${part.label} down`} title="Move down">↓</button>
                <button type="button" onClick={() => duplicatePart(partIndex)} style={controlBtnStyle} aria-label={`Duplicate ${part.label}`} title="Duplicate part">⧉</button>
                <button type="button" onClick={() => removePart(partIndex)} disabled={normalizedParts.length <= 2} style={{ ...controlBtnStyle, color: '#dc2626' }} aria-label={`Remove ${part.label}`} title="Remove part">✕</button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: isCollapsed ? 0 : '12px' }}>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                {typeLabels[part.type] || 'Part'} · {isAuto || isCoding ? `${Number(part.points || (isCoding ? 10 : 1))} point${Number(part.points || (isCoding ? 10 : 1)) === 1 ? '' : 's'}` : `${Math.max(...(part.rubric || [{ points: 0 }]).map(level => Number(level.points) || 0))} max points`}
              </div>
              {hints.length > 0 && (
                <div style={{ fontSize: '13px', color: '#b45309', textAlign: 'right' }}>
                  {hints.length === 1 ? hints[0] : `${hints.length} items need attention`}
                </div>
              )}
            </div>

            {hints.length > 1 && !isCollapsed && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '6px', color: '#92400e', fontSize: '13px', padding: '8px 10px', marginBottom: '12px' }}>
                {hints.map((hint) => (
                  <div key={hint}>{hint}</div>
                ))}
              </div>
            )}

            {!isCollapsed && (
              <>
                <textarea
                  value={part.prompt}
                  onChange={(event) => updatePart(partIndex, { prompt: event.target.value })}
                  placeholder="Part prompt"
                  style={{ ...inputStyle, minHeight: '92px', marginBottom: '12px', fontFamily: 'inherit' }}
                />

                {isAuto ? (
                  <div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>Points</label>
                      <input
                        type="number"
                        min="0"
                        value={part.points ?? 1}
                        onChange={(event) => updatePart(partIndex, { points: Number(event.target.value || 0) })}
                        style={{ ...inputStyle, width: '90px' }}
                      />
                    </div>
                    {part.choices.map((choice, choiceIndex) => (
                      <div key={choice.id} style={{ display: 'grid', gridTemplateColumns: part.type !== 'true_false' && part.choices.length > 2 ? '24px 24px minmax(140px, 1fr) 34px' : '24px 24px minmax(140px, 1fr)', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <input
                          type="radio"
                          name={`part-${partIndex}-correct`}
                          checked={part.correct_answer === choice.id}
                          onChange={() => updatePart(partIndex, { correct_answer: choice.id })}
                          aria-label={`Mark choice ${choice.id} correct`}
                        />
                        <span style={{ width: '24px', fontWeight: 600 }}>{choice.id}</span>
                        <input
                          type="text"
                          value={choice.text}
                          onChange={(event) => updateChoice(partIndex, choiceIndex, event.target.value)}
                          disabled={part.type === 'true_false'}
                          style={inputStyle}
                        />
                        {part.type !== 'true_false' && part.choices.length > 2 && (
                          <button type="button" onClick={() => removeChoice(partIndex, choiceIndex)} style={{ ...controlBtnStyle, color: '#dc2626' }} aria-label={`Remove choice ${choice.id}`} title="Remove choice">✕</button>
                        )}
                      </div>
                    ))}
                    {part.type !== 'true_false' && (
                      <button type="button" style={{ ...secondaryBtn, padding: '8px 12px', borderStyle: 'dashed' }} onClick={() => addChoice(partIndex)}>
                        + Add Choice
                      </button>
                    )}
                  </div>
                ) : part.type === 'coding' ? (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(120px, 1fr) minmax(120px, 1fr)', gap: '10px', marginBottom: '12px' }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>
                        Points
                        <input
                          type="number"
                          min="0"
                          value={part.points ?? 10}
                          onChange={(event) => updatePart(partIndex, { points: Number(event.target.value || 0) })}
                          style={{ ...inputStyle, marginTop: '6px' }}
                        />
                      </label>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>
                        Timeout (ms)
                        <input
                          type="number"
                          min="100"
                          max="10000"
                          value={part.coding?.timeout_ms ?? 2000}
                          onChange={(event) => updateCoding(partIndex, { timeout_ms: Number(event.target.value || 2000) })}
                          style={{ ...inputStyle, marginTop: '6px' }}
                        />
                      </label>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>
                        Memory (MB)
                        <input
                          type="number"
                          min="32"
                          max="1024"
                          value={part.coding?.memory_mb ?? 128}
                          onChange={(event) => updateCoding(partIndex, { memory_mb: Number(event.target.value || 128) })}
                          style={{ ...inputStyle, marginTop: '6px' }}
                        />
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', alignItems: 'center' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#374151' }}>
                        <input
                          type="checkbox"
                          checked={(part.coding?.allowed_languages || []).includes('python')}
                          onChange={(event) => updateCodingLanguage(partIndex, 'python', event.target.checked)}
                        />
                        Python
                      </label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#374151' }}>
                        <input
                          type="checkbox"
                          checked={(part.coding?.allowed_languages || []).includes('cpp')}
                          onChange={(event) => updateCodingLanguage(partIndex, 'cpp', event.target.checked)}
                        />
                        C++
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>
                        Python starter code
                        <textarea
                          value={part.coding?.starter_code_by_language?.python || ''}
                          onChange={(event) => updateCodingStarter(partIndex, 'python', event.target.value)}
                          style={{ ...inputStyle, minHeight: '120px', marginTop: '6px', fontFamily: 'monospace' }}
                        />
                      </label>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>
                        C++ starter code
                        <textarea
                          value={part.coding?.starter_code_by_language?.cpp || ''}
                          onChange={(event) => updateCodingStarter(partIndex, 'cpp', event.target.value)}
                          style={{ ...inputStyle, minHeight: '120px', marginTop: '6px', fontFamily: 'monospace' }}
                        />
                      </label>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>Tests</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="button" style={{ ...secondaryBtn, padding: '6px 10px', borderStyle: 'dashed' }} onClick={() => addCodingTest(partIndex, 'visible')}>+ Visible</button>
                        <button type="button" style={{ ...secondaryBtn, padding: '6px 10px', borderStyle: 'dashed' }} onClick={() => addCodingTest(partIndex, 'hidden')}>+ Hidden</button>
                      </div>
                    </div>
                    {(part.coding?.tests || []).map((test, testIndex) => (
                      <div key={testIndex} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', marginBottom: '10px', background: 'white' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 1fr) 130px 110px 80px 34px', gap: '8px', marginBottom: '8px' }}>
                          <input type="text" value={test.name || ''} onChange={(event) => updateCodingTest(partIndex, testIndex, 'name', event.target.value)} placeholder="Test name" style={inputStyle} />
                          <select value={test.mode || 'stdin'} onChange={(event) => updateCodingTest(partIndex, testIndex, 'mode', event.target.value)} style={inputStyle}>
                            <option value="stdin">stdin/stdout</option>
                            <option value="python_harness">Python harness</option>
                          </select>
                          <select value={test.visibility || 'hidden'} onChange={(event) => updateCodingTest(partIndex, testIndex, 'visibility', event.target.value)} style={inputStyle}>
                            <option value="visible">Visible</option>
                            <option value="hidden">Hidden</option>
                          </select>
                          <input type="number" min="0" value={test.points ?? 1} onChange={(event) => updateCodingTest(partIndex, testIndex, 'points', event.target.value)} style={inputStyle} />
                          <button type="button" onClick={() => removeCodingTest(partIndex, testIndex)} disabled={(part.coding?.tests || []).length <= 1} style={{ ...controlBtnStyle, color: '#dc2626' }} aria-label="Remove test" title="Remove test">✕</button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <textarea
                            value={(test.mode || 'stdin') === 'python_harness' ? (test.harness || '') : (test.input || '')}
                            onChange={(event) => updateCodingTest(partIndex, testIndex, (test.mode || 'stdin') === 'python_harness' ? 'harness' : 'input', event.target.value)}
                            placeholder={(test.mode || 'stdin') === 'python_harness' ? 'Python harness code' : 'stdin input'}
                            style={{ ...inputStyle, minHeight: '92px', fontFamily: 'monospace' }}
                          />
                          <textarea value={test.expected_output || ''} onChange={(event) => updateCodingTest(partIndex, testIndex, 'expected_output', event.target.value)} placeholder="expected stdout" style={{ ...inputStyle, minHeight: '72px', fontFamily: 'monospace' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    {(part.rubric || []).map((level, levelIndex) => (
                      <div key={levelIndex} style={{ display: 'grid', gridTemplateColumns: part.rubric.length > 1 ? '80px minmax(140px, 1fr) 34px' : '80px minmax(140px, 1fr)', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <input
                          type="number"
                          min="0"
                          value={level.points}
                          onChange={(event) => updateRubric(partIndex, levelIndex, 'points', event.target.value)}
                          style={{ ...inputStyle, width: '80px' }}
                          aria-label={`Rubric level ${levelIndex + 1} points`}
                        />
                        <input
                          type="text"
                          value={level.criteria}
                          onChange={(event) => updateRubric(partIndex, levelIndex, 'criteria', event.target.value)}
                          placeholder="Rubric criteria"
                          style={inputStyle}
                        />
                        {part.rubric.length > 1 && (
                          <button type="button" onClick={() => removeRubric(partIndex, levelIndex)} style={{ ...controlBtnStyle, color: '#dc2626' }} aria-label={`Remove rubric level ${levelIndex + 1}`} title="Remove rubric level">✕</button>
                        )}
                      </div>
                    ))}
                    <button type="button" style={{ ...secondaryBtn, padding: '8px 12px', borderStyle: 'dashed' }} onClick={() => addRubric(partIndex)}>
                      + Add Rubric Level
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
