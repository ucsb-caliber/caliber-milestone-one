import React from 'react';

const PLACEHOLDER_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

const collectPlaceholders = (value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {});
  return Array.from(text.matchAll(PLACEHOLDER_RE)).map(match => match[1]);
};

const collectExpressionNames = (expression = '') => {
  const reserved = new Set(['sum', 'len', 'min', 'max', 'round', 'abs', 'str', 'int', 'float', 'true', 'false']);
  return Array.from(String(expression).matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g))
    .map(match => match[0])
    .filter(name => !reserved.has(name));
};

export function getQuestionQualityChecks(content, { text = '' } = {}) {
  const checks = [];
  const add = (code, message, severity = 'warning') => checks.push({ code, message, severity });
  const stem = String(content?.stem || text || '');
  const parts = Array.isArray(content?.parts) ? content.parts : [];

  if (!stem.trim() && !parts.some(part => String(part.prompt || '').trim())) {
    add('empty_prompt', 'Question has no prompt text.', 'error');
  }
  if (!parts.length) {
    add('no_parts', 'Question has no answerable parts.', 'error');
  }

  parts.forEach((part, index) => {
    const label = part.label || part.part_id || `Part ${index + 1}`;
    const type = part.type;

    if ((type === 'mcq' || type === 'true_false')) {
      const choices = Array.isArray(part.choices) ? part.choices : [];
      const choiceTexts = choices.map(choice => String(choice.text || '').trim().toLowerCase()).filter(Boolean);
      if (choiceTexts.length !== new Set(choiceTexts).size) {
        add('duplicate_choice', `${label} has duplicate answer choices.`);
      }
      if (!part.correct_answer) {
        add('missing_correct_answer', `${label} has no correct answer.`, 'error');
      }
      const validAnswers = new Set(choices.flatMap(choice => [choice.id, choice.text]).filter(Boolean));
      if (part.correct_answer && !validAnswers.has(part.correct_answer)) {
        add('invalid_correct_answer', `${label} correct answer does not match a choice.`, 'error');
      }
    }

    if (type === 'free_response' || type === 'short_answer') {
      const rubric = Array.isArray(part.rubric) ? part.rubric : [];
      if (!rubric.length) {
        add('missing_rubric', `${label} has no rubric.`);
      } else if (Math.max(...rubric.map(level => Number(level.points) || 0)) <= 0) {
        add('zero_rubric', `${label} rubric has no positive point level.`);
      }
    }

    if (type === 'coding' && part.coding) {
      const tests = Array.isArray(part.coding.tests) ? part.coding.tests : [];
      const testPoints = tests.reduce((sum, test) => sum + (Number(test.points) || 0), 0);
      if (part.points != null && testPoints > 0 && Math.abs(Number(part.points) - testPoints) > 0.001) {
        add('coding_points_mismatch', `${label} points do not match the sum of test points.`);
      }
      if (tests.some(test => test.visibility === 'visible' && String(test.expected_output || '').trim())) {
        add('visible_test_answer', `${label} has visible test expected output.`);
      }
    }
  });

  const randomization = content?.randomization;
  if (randomization?.enabled) {
    const variables = Array.isArray(randomization.variables) ? randomization.variables : [];
    const computed = Array.isArray(randomization.computed) ? randomization.computed : [];
    const declared = new Set([
      ...variables.map(item => item.name).filter(Boolean),
      ...computed.map(item => item.name).filter(Boolean),
    ]);
    const placeholders = new Set(collectPlaceholders(content));
    const expressionNames = new Set(computed.flatMap(item => collectExpressionNames(item.expression)));
    const unused = Array.from(declared).filter(name => !placeholders.has(name) && !expressionNames.has(name));
    const unresolved = Array.from(placeholders).filter(name => !declared.has(name));

    if (unused.length) {
      add('unused_randomization', `Randomization value is unused: ${unused.join(', ')}.`);
    }
    if (unresolved.length) {
      add('unresolved_randomization', `Prompt references unknown randomization value: ${unresolved.join(', ')}.`, 'error');
    }
  }

  return checks;
}

export function QualityCheckPanel({ checks, styles = {} }) {
  if (!checks?.length) {
    return React.createElement(
      'div',
      {
        style: {
        padding: '12px 14px',
        border: '1px solid #bbf7d0',
        background: '#f0fdf4',
        color: '#166534',
        borderRadius: '8px',
        fontSize: '0.875rem',
        fontWeight: 600
        }
      },
      'Quality checks clear'
    );
  }

  return React.createElement(
    'div',
    {
      style: {
      padding: '12px 14px',
      border: '1px solid #fde68a',
      background: '#fffbeb',
      color: '#92400e',
      borderRadius: '8px',
      fontSize: '0.875rem',
      ...styles.panel,
      }
    },
    React.createElement('div', { style: { fontWeight: 800, marginBottom: '8px', color: '#78350f' } }, 'Quality checks'),
    React.createElement(
      'ul',
      { style: { margin: 0, paddingLeft: '18px' } },
      checks.map((check, index) => React.createElement(
        'li',
        {
          key: `${check.code}-${index}`,
          style: { marginBottom: index === checks.length - 1 ? 0 : '5px' }
        },
        React.createElement('span', { style: { fontWeight: 700 } }, `${check.severity === 'error' ? 'Fix' : 'Review'}: `),
        check.message
      ))
    )
  );
}
