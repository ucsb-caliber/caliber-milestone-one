import React, { useMemo, useState } from 'react';

export const defaultRandomization = () => ({
  enabled: false,
  seed_policy: 'student_assignment_question',
  variables: [],
  computed: [],
});

const normalizeVariable = (variable = {}, index = 0) => ({
  name: variable.name || `var_${index + 1}`,
  kind: variable.kind || 'int',
  min: variable.min ?? 1,
  max: variable.max ?? 10,
  precision: variable.precision ?? 2,
  values: Array.isArray(variable.values) ? variable.values : [],
  length: variable.length ?? 3,
  item_kind: variable.item_kind || 'int',
});

export const normalizeRandomization = (randomization) => {
  const source = randomization || defaultRandomization();
  return {
    enabled: Boolean(source.enabled),
    seed_policy: 'student_assignment_question',
    variables: Array.isArray(source.variables) ? source.variables.map(normalizeVariable) : [],
    computed: Array.isArray(source.computed)
      ? source.computed.map((item, index) => ({ name: item.name || `computed_${index + 1}`, expression: item.expression || '' }))
      : [],
  };
};

export const compactRandomization = (randomization) => {
  const normalized = normalizeRandomization(randomization);
  if (!normalized.enabled) return null;
  return {
    enabled: true,
    seed_policy: 'student_assignment_question',
    variables: normalized.variables.map(variable => {
      const base = { name: variable.name.trim(), kind: variable.kind };
      if (variable.kind === 'choice') return { ...base, values: variable.values };
      if (variable.kind === 'bool') return base;
      if (variable.kind === 'list') {
        const list = { ...base, item_kind: variable.item_kind, length: Number(variable.length) || 0 };
        if (variable.item_kind === 'choice') return { ...list, values: variable.values };
        if (variable.item_kind !== 'bool') return { ...list, min: Number(variable.min), max: Number(variable.max), precision: Number(variable.precision) || 0 };
        return list;
      }
      return { ...base, min: Number(variable.min), max: Number(variable.max), precision: variable.kind === 'float' ? Number(variable.precision) || 0 : undefined };
    }),
    computed: normalized.computed.filter(item => item.name.trim() && item.expression.trim()),
  };
};

const seededRandom = (seed) => {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = value * 16807 % 2147483647;
    return (value - 1) / 2147483646;
  };
};

const previewValues = (randomization, seedText) => {
  const normalized = normalizeRandomization(randomization);
  const seed = Array.from(seedText || 'preview').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const rand = seededRandom(seed);
  const values = {};
  const one = (variable, kind = variable.kind) => {
    if (kind === 'int') return Math.floor(rand() * (Number(variable.max) - Number(variable.min) + 1)) + Number(variable.min);
    if (kind === 'float') return Number((rand() * (Number(variable.max) - Number(variable.min)) + Number(variable.min)).toFixed(Number(variable.precision) || 2));
    if (kind === 'choice') return variable.values[Math.floor(rand() * Math.max(1, variable.values.length))];
    if (kind === 'bool') return rand() >= 0.5;
    return '';
  };
  normalized.variables.forEach(variable => {
    values[variable.name] = variable.kind === 'list'
      ? Array.from({ length: Number(variable.length) || 0 }, () => one(variable, variable.item_kind))
      : one(variable);
  });
  normalized.computed.forEach(item => {
    values[item.name] = item.expression ? `(computed) ${item.expression}` : '';
  });
  return values;
};

export default function RandomizationEditor({ value, onChange, styles = {} }) {
  const [seedText, setSeedText] = useState('preview-student');
  const randomization = normalizeRandomization(value);
  const preview = useMemo(() => previewValues(randomization, seedText), [randomization, seedText]);
  const inputStyle = styles.input || { width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' };
  const labelStyle = styles.label || { display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#374151', marginBottom: '6px' };
  const buttonStyle = { padding: '7px 10px', border: '1px solid #d1d5db', background: 'white', borderRadius: '6px', cursor: 'pointer' };
  const update = (patch) => onChange({ ...randomization, ...patch });
  const updateVariable = (index, patch) => {
    const variables = [...randomization.variables];
    variables[index] = normalizeVariable({ ...variables[index], ...patch }, index);
    update({ variables });
  };
  const updateComputed = (index, patch) => {
    const computed = [...randomization.computed];
    computed[index] = { ...computed[index], ...patch };
    update({ computed });
  };

  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '14px', marginTop: '18px', background: '#f9fafb' }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 800, color: '#111827' }}>
        <input type="checkbox" checked={randomization.enabled} onChange={(event) => update({ enabled: event.target.checked })} />
        Randomization
      </label>
      {randomization.enabled && (
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Variables</label>
            <button type="button" style={buttonStyle} onClick={() => update({ variables: [...randomization.variables, normalizeVariable({}, randomization.variables.length)] })}>+ Variable</button>
          </div>
          {randomization.variables.map((variable, index) => {
            const valueKind = variable.kind === 'list' ? variable.item_kind : variable.kind;
            return (
            <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 90px 90px 90px 34px', gap: '8px', marginBottom: '8px' }}>
              <input style={inputStyle} value={variable.name} onChange={(event) => updateVariable(index, { name: event.target.value })} placeholder="name" />
              <select style={inputStyle} value={variable.kind} onChange={(event) => updateVariable(index, { kind: event.target.value })}>
                <option value="int">int</option>
                <option value="float">float</option>
                <option value="choice">choice</option>
                <option value="bool">bool</option>
                <option value="list">list</option>
              </select>
              {variable.kind === 'list' ? (
                <select style={inputStyle} value={variable.item_kind} onChange={(event) => updateVariable(index, { item_kind: event.target.value })}>
                  <option value="int">int items</option>
                  <option value="float">float items</option>
                  <option value="choice">choice items</option>
                  <option value="bool">bool items</option>
                </select>
              ) : <span />}
              {valueKind === 'choice' ? (
                <input style={inputStyle} value={variable.values.join(', ')} onChange={(event) => updateVariable(index, { values: event.target.value.split(',').map(item => item.trim()).filter(Boolean) })} placeholder="values" />
              ) : valueKind === 'bool' ? (
                <span />
              ) : (
                <input style={inputStyle} type="number" value={variable.min} onChange={(event) => updateVariable(index, { min: event.target.value })} placeholder="min" />
              )}
              {valueKind === 'choice' || valueKind === 'bool' ? <span /> : <input style={inputStyle} type="number" value={variable.max} onChange={(event) => updateVariable(index, { max: event.target.value })} placeholder="max" />}
              {variable.kind === 'list' ? <input style={inputStyle} type="number" min="0" value={variable.length} onChange={(event) => updateVariable(index, { length: event.target.value })} placeholder="len" /> : <span />}
              <button type="button" style={{ ...buttonStyle, color: '#b91c1c' }} onClick={() => update({ variables: randomization.variables.filter((_, i) => i !== index) })}>x</button>
            </div>
          );})}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 10px' }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Computed</label>
            <button type="button" style={buttonStyle} onClick={() => update({ computed: [...randomization.computed, { name: `computed_${randomization.computed.length + 1}`, expression: '' }] })}>+ Computed</button>
          </div>
          {randomization.computed.map((item, index) => (
            <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 34px', gap: '8px', marginBottom: '8px' }}>
              <input style={inputStyle} value={item.name} onChange={(event) => updateComputed(index, { name: event.target.value })} placeholder="name" />
              <input style={inputStyle} value={item.expression} onChange={(event) => updateComputed(index, { expression: event.target.value })} placeholder="a * b" />
              <button type="button" style={{ ...buttonStyle, color: '#b91c1c' }} onClick={() => update({ computed: randomization.computed.filter((_, i) => i !== index) })}>x</button>
            </div>
          ))}
          <label style={labelStyle}>Preview seed</label>
          <input style={{ ...inputStyle, marginBottom: '8px' }} value={seedText} onChange={(event) => setSeedText(event.target.value)} />
          <pre style={{ margin: 0, padding: '10px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>{JSON.stringify(preview, null, 2)}</pre>
        </div>
      )}
    </section>
  );
}
