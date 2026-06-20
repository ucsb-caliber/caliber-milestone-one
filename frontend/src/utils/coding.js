export const DEFAULT_CPP_STARTER_CODE = `class Solution {
public:
  int solve(int n) {
    return n;
  }
};
`;

export function createEmptyCodingTest(index = 0) {
  return {
    name: `Test ${index + 1}`,
    description: '',
    input: '',
    output: '',
    code: '',
  };
}

export function createDefaultCodingConfig() {
  return {
    language: 'cpp',
    function_signature: 'int solve(int n)',
    starter_code: DEFAULT_CPP_STARTER_CODE,
    visible_tests: [
      {
        name: 'Identity',
        description: 'Returns the input unchanged.',
        input: '4',
        output: '4',
        code: 'Solution s; return caliber_expect_eq(s.solve(4), 4, message, expected_output, received_output);',
      },
    ],
    hidden_tests: [
      {
        name: 'Zero',
        description: 'Handles zero.',
        input: '',
        output: '',
        code: 'Solution s; return caliber_expect_eq(s.solve(0), 0, message, expected_output, received_output);',
      },
    ],
    time_limit_ms: 2000,
    memory_limit_mb: 256,
    points: 10,
  };
}

export function normalizeCodingTests(rawTests, { preserveEmpty = false } = {}) {
  if (!Array.isArray(rawTests)) return [];
  const normalized = rawTests
    .map((test, index) => ({
      name: String(test?.name || `Test ${index + 1}`),
      description: String(test?.description || ''),
      input: String(test?.input || ''),
      output: String(test?.output || ''),
      code: String(test?.code || ''),
    }));
  return preserveEmpty ? normalized : normalized.filter((test) => test.code.trim());
}

export function normalizeCodingConfig(rawConfig, { preserveEmptyTests = false } = {}) {
  const defaults = createDefaultCodingConfig();
  const config = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  return {
    language: 'cpp',
    function_signature: String(config.function_signature || defaults.function_signature),
    starter_code: String(config.starter_code || defaults.starter_code),
    visible_tests: normalizeCodingTests(config.visible_tests ?? defaults.visible_tests, { preserveEmpty: preserveEmptyTests }),
    hidden_tests: normalizeCodingTests(config.hidden_tests ?? defaults.hidden_tests, { preserveEmpty: preserveEmptyTests }),
    time_limit_ms: Math.max(250, Number(config.time_limit_ms || defaults.time_limit_ms)),
    memory_limit_mb: Math.max(64, Number(config.memory_limit_mb || defaults.memory_limit_mb)),
    points: Math.max(0, Number(config.points || defaults.points)),
  };
}

export function normalizeEditableCodingConfig(rawConfig) {
  return normalizeCodingConfig(rawConfig, { preserveEmptyTests: true });
}

export function sanitizeCodingConfigForSave(rawConfig) {
  return normalizeCodingConfig(rawConfig, { preserveEmptyTests: false });
}

export function getCodingAuthoringError(rawConfig) {
  const config = normalizeEditableCodingConfig(rawConfig);
  if (!config.function_signature.trim()) {
    return 'Coding questions need a function signature';
  }
  if (!config.starter_code.trim()) {
    return 'Coding questions need starter code';
  }
  if ((config.visible_tests || []).length < 1) {
    return 'Add at least one visible test for coding questions';
  }
  if ((config.hidden_tests || []).length < 1) {
    return 'Add at least one hidden test for coding questions';
  }

  for (let index = 0; index < config.visible_tests.length; index += 1) {
    const test = config.visible_tests[index] || {};
    if (!String(test.input || '').trim()) {
      return `Visible test ${index + 1} needs a sample input`;
    }
    if (!String(test.output || '').trim()) {
      return `Visible test ${index + 1} needs an expected output`;
    }
    if (!String(test.code || '').trim()) {
      return `Visible test ${index + 1} needs an autograder check`;
    }
  }

  for (let index = 0; index < config.hidden_tests.length; index += 1) {
    const test = config.hidden_tests[index] || {};
    if (!String(test.code || '').trim()) {
      return `Hidden test ${index + 1} needs an autograder check`;
    }
  }

  return '';
}

export function getQuestionCodingConfig(question) {
  if (question?.coding && typeof question.coding === 'object') {
    return normalizeCodingConfig(question.coding);
  }
  try {
    return normalizeCodingConfig(JSON.parse(question?.answer_choices || '{}'));
  } catch {
    return normalizeCodingConfig(null);
  }
}

export function isCodingQuestion(questionType) {
  return String(questionType || '').toLowerCase() === 'coding';
}
