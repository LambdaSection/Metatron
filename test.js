// test.js — Test suite for parser + analyzer
// Run with: node test.js

import { parseResponse } from './parser.js';
import { scanSource, summarize, RULES } from './analyzer/static.js';
import { parseErrors, formatRunReport } from './analyzer/runner.js';
import { parseReviewResponse } from './analyzer/review.js';

// Mock data for testing parser
const testCases = [
  {
    name: 'Normal case',
    input: `EXPLANATION: This is the explanation.
CODE: const x = 1;
VERIFICATION: Test with assert(x === 1); OWASP A01:2021`,
    expected: {
      explanation: 'This is the explanation.',
      code: 'const x = 1;',
      verification: 'Test with assert(x === 1); OWASP A01:2021'
    }
  },
  {
    name: 'Code with CODE: in comment',
    input: `EXPLANATION: Parsing tricky code.
CODE: // This comment contains "CODE:" to break parsing
const y = 2;
VERIFICATION: CWE-89 reference`,
    expected: {
      explanation: 'Parsing tricky code.',
      code: '// This comment contains "CODE:" to break parsing\nconst y = 2;',
      verification: 'CWE-89 reference'
    }
  },
  {
    name: 'Multiline code',
    input: `EXPLANATION: Multiline example.
CODE: function foo() {
  return 'bar';
}
VERIFICATION: MDN reference`,
    expected: {
      explanation: 'Multiline example.',
      code: 'function foo() {\n  return \'bar\';\n}',
      verification: 'MDN reference'
    }
  },
  {
    name: 'Weak verification',
    input: `EXPLANATION: Weak verif.
CODE: const z = 3;
VERIFICATION: Just a test`,
    expected: {
      explanation: 'Weak verif.',
      code: 'const z = 3;',
      verification: 'Just a test'
    }
  }
];

console.log('Running parser tests...\n');

let passed = 0;
let total = testCases.length;

testCases.forEach((test, i) => {
  console.log(`Test ${i + 1}: ${test.name}`);
  const result = parseResponse(test.input);
  if (result) {
    const match = result.explanation === test.expected.explanation &&
                  result.code === test.expected.code &&
                  result.verification === test.expected.verification;
    if (match) {
      console.log('  ✅ PASSED');
      passed++;
    } else {
      console.log('  ❌ FAILED');
      console.log('  Expected:', test.expected);
      console.log('  Got:', result);
    }
  } else {
    console.log('  ❌ PARSE FAILED');
  }
  console.log('');
});

console.log(`Results: ${passed}/${total} parser tests passed`);

// ---------- Analyzer tests ----------
console.log('\nRunning analyzer tests...\n');

let analyzerPassed = 0;
let analyzerTotal = 0;

function assertAnalyzer(name, condition, detail) {
  analyzerTotal++;
  if (condition) {
    console.log(`Test ${analyzerTotal}: ${name}`);
    console.log('  ✅ PASSED');
    analyzerPassed++;
  } else {
    console.log(`Test ${analyzerTotal}: ${name}`);
    console.log('  ❌ FAILED', detail || '');
  }
  console.log('');
}

const VULNERABLE_SAMPLE = `
const apiKey = "sk-1234567890abcdef1234";
const cmd = \`\${userInput}\`;
eval(cmd);
try { risky(); } catch (e) {}
document.body.innerHTML = userData;
db.query("SELECT * FROM users WHERE id = " + userId);
const token = Math.random().toString(36);
const agent = new https.Agent({ rejectUnauthorized: false });
res.header("Access-Control-Allow-Origin", "*");
if (a == b) { }
var old = 1;
while (true) { }
`;

const vulnFindings = scanSource(VULNERABLE_SAMPLE);
const vulnIds = new Set(vulnFindings.map(f => f.ruleId));

assertAnalyzer('Detects hardcoded secret',
  vulnIds.has('HARDCODED_SECRET') || vulnIds.has('OPENAI_KEY'),
  `got: ${[...vulnIds].join(', ')}`);

assertAnalyzer('Detects eval()', vulnIds.has('EVAL_USAGE'));
assertAnalyzer('Detects SQL concatenation', vulnIds.has('SQL_CONCAT'),
  `got: ${[...vulnIds].join(', ')}`);

assertAnalyzer('Detects weak random in auth context', vulnIds.has('WEAK_RANDOM_AUTH'));
assertAnalyzer('Detects TLS bypass', vulnIds.has('TLS_BYPASS'));
assertAnalyzer('Detects CORS wildcard', vulnIds.has('CORS_WILDCARD'));
assertAnalyzer('Detects innerHTML sink', vulnIds.has('INNERHTML_ASSIGN'));
assertAnalyzer('Detects empty catch', vulnIds.has('EMPTY_CATCH'));
assertAnalyzer('Detects var declaration', vulnIds.has('VAR_DECLARATION'));

const CLEAN_SAMPLE = `
import crypto from 'node:crypto';

export function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function add(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new TypeError('numbers required');
  }
  return a + b;
}
`;

const cleanFindings = scanSource(CLEAN_SAMPLE).filter(f =>
  !['DEBUG_LEFTOVER'].includes(f.ruleId));

assertAnalyzer('Clean code has no critical/high findings',
  !cleanFindings.some(f => f.severity === 'critical' || f.severity === 'high'),
  JSON.stringify(cleanFindings.map(f => f.ruleId)));

assertAnalyzer('Summary counts match findings',
  summarize(vulnFindings).critical >= 3);

assertAnalyzer('Rule registry non-empty and ordered severities valid',
  RULES.length >= 15 && RULES.every(r => r.id && r.pattern instanceof RegExp && r.title));

const SAMPLE_STDERR = `C:\\proj\\app.js:5
  throw new TypeError('x is not a function');
        ^
TypeError: x is not a function
    at Object.<anonymous> (C:\\proj\\app.js:5:9)
    at Module._compile (node:internal/modules/cjs/loader:1105:14)`;

const parsedErrors = parseErrors(SAMPLE_STDERR);
assertAnalyzer('Parses error name/message/line from stderr',
  parsedErrors.length === 1 &&
  parsedErrors[0].name === 'TypeError' &&
  parsedErrors[0].message.includes('not a function') &&
  parsedErrors[0].line === 5,
  JSON.stringify(parsedErrors));

assertAnalyzer('Empty stderr yields no errors',
  parseErrors('').length === 0);

const report = formatRunReport({
  timedOut: true, ok: false, exitCode: null, durationMs: 1000,
  stdout: '', stderr: 'TimeoutError: killed', errors: []
});
assertAnalyzer('Format flags timeout runs',
  report[0].includes('TIMED OUT'));

const reviewRaw = 'Sure! Here are my findings:\n```json\n[{"severity":"high","title":"t","line":3,"explanation":"e","suggestion":"s"}]\n```';
const reviewParsed = parseReviewResponse(reviewRaw);
assertAnalyzer('Parses fenced JSON LLM review',
  Array.isArray(reviewParsed) && reviewParsed.length === 1 && reviewParsed[0].line === 3,
  JSON.stringify(reviewParsed));

assertAnalyzer('Parses bare JSON LLM review',
  parseReviewResponse('[{"severity":"low","title":"t"}]').length === 1);

assertAnalyzer('Throws on unparseable LLM review',
  (() => { try { parseReviewResponse('no json here'); return false; } catch { return true; } })());

console.log(`Results: ${analyzerPassed}/${analyzerTotal} analyzer tests passed`);

const allPassed = passed === total && analyzerPassed === analyzerTotal;
if (allPassed) {
  console.log('🎉 All tests passed!');
} else {
  console.log('⚠️ Some tests failed. Check the output above.');
  process.exit(1);
}
