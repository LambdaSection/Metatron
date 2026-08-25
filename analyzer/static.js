import { spawnSync } from 'node:child_process';

/**
 * Static analysis rules targeting bugs and risks typical of AI-generated JS code.
 * Each rule: { id, severity, pattern, title, advice }
 * Severity order: critical > high > medium > low > info
 */
export const RULES = [
  {
    id: 'EVAL_USAGE',
    severity: 'critical',
    pattern: /\beval\s*\(/,
    title: 'Use of eval()',
    advice: 'Arbitrary code execution. Replace with explicit logic or JSON.parse.'
  },
  {
    id: 'NEW_FUNCTION',
    severity: 'high',
    pattern: /new\s+Function\s*\(/,
    title: 'Use of new Function() (implicit eval)',
    advice: 'Compiles strings as code. Refactor to a real function.'
  },
  {
    id: 'EXEC_INJECTION',
    severity: 'critical',
    pattern: /\b(exec|execSync|spawn|spawnSync)\s*\(\s*[`'"][^`'"]*[+$]\s*\{/,
    title: 'Shell command built with interpolation',
    advice: 'Command injection risk. Use execFile/spawn with argument array.'
  },
  {
    id: 'HARDCODED_SECRET',
    severity: 'critical',
    pattern: /(api[_-]?key|apikey|secret|password|passwd|pwd|token|auth[_-]?token)\s*[:=]\s*['"][^'"]{8,}['"]/i,
    title: 'Hardcoded credential',
    advice: 'Move to environment variables or a secrets manager.'
  },
  {
    id: 'AWS_ACCESS_KEY',
    severity: 'critical',
    pattern: /AKIA[0-9A-Z]{16}/,
    title: 'AWS access key literal',
    advice: 'Revoke immediately, rotate credentials.'
  },
  {
    id: 'GITHUB_TOKEN',
    severity: 'critical',
    pattern: /gh[pousr]_[A-Za-z0-9]{30,}/,
    title: 'GitHub token literal',
    advice: 'Revoke and regenerate token.'
  },
  {
    id: 'OPENAI_KEY',
    severity: 'critical',
    pattern: /sk-[A-Za-z0-9_-]{20,}/,
    title: 'OpenAI-style API key literal',
    advice: 'Revoke and store in environment variables.'
  },
  {
    id: 'TLS_BYPASS',
    severity: 'critical',
    pattern: /rejectUnauthorized\s*:\s*false/,
    title: 'TLS certificate validation disabled',
    advice: 'Enables MITM attacks. Remove or fix certificate chain instead.'
  },
  {
    id: 'SQL_CONCAT',
    severity: 'critical',
    pattern: /['"`]\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[^'"`]*['"`]\s*\+|\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[^;\n]*\$\{/i,
    title: 'SQL query built by concatenation',
    advice: 'Use parameterized queries or prepared statements.'
  },
  {
    id: 'WEAK_RANDOM_AUTH',
    severity: 'high',
    pattern: /Math\.random\s*\(\s*\)[^\n;]*(token|secret|password|otp|nonce|salt|sessionid)|(token|secret|password|otp|nonce|salt|sessionid)[^\n;]*Math\.random\s*\(/i,
    title: 'Math.random() used in security context',
    advice: 'Not cryptographically secure. Use crypto.randomUUID() or crypto.randomBytes().'
  },
  {
    id: 'INNERHTML_ASSIGN',
    severity: 'high',
    pattern: /\.innerHTML\s*=|document\.write\s*\(/,
    title: 'DOM write with unsanitized sink',
    advice: 'XSS vector. Use textContent or sanitize with DOMPurify.'
  },
  {
    id: 'EMPTY_CATCH',
    severity: 'medium',
    pattern: /catch\s*(\([^)]*\))?\s*\{\s*\}/,
    title: 'Empty catch block',
    advice: 'Errors are swallowed silently. Log, wrap, or rethrow.'
  },
  {
    id: 'CORS_WILDCARD',
    severity: 'medium',
    pattern: /Access-Control-Allow-Origin['"]?\s*[,:]=?\s*['"]\*['"]/i,
    title: 'CORS wildcard origin',
    advice: 'Allows any site to read responses. Whitelist origins instead.'
  },
  {
    id: 'LOCALSTORAGE_AUTH',
    severity: 'medium',
    pattern: /localStorage\.(setItem|getItem)\s*\(\s*['"`][^'"`]*(token|jwt|auth|session|secret)/i,
    title: 'Auth material stored in localStorage',
    advice: 'Readable by any XSS payload. Prefer httpOnly secure cookies.'
  },
  {
    id: 'INSECURE_HTTP_URL',
    severity: 'low',
    pattern: /http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/,
    title: 'Plain HTTP URL',
    advice: 'Traffic is unencrypted. Use https://.'
  },
  {
    id: 'WHILE_TRUE_NO_EXIT',
    severity: 'low',
    pattern: /while\s*\(\s*true\s*\)/i,
    title: 'while(true) loop',
    advice: 'Verify an exit condition exists on every path (hang/infinite loop risk).'
  },
  {
    id: 'UNAWAITED_FETCH',
    severity: 'info',
    pattern: /(?<!await\s|return\s|\.\w+\s)fetch\s*\(/,
    title: 'fetch() without await',
    advice: 'Fire-and-forget call: failures will be unhandled. Confirm intent.'
  },
  {
    id: 'LOOSE_EQUALITY',
    severity: 'info',
    pattern: /(?<![=!<>])==(?!=)|(?<=[a-zA-Z0-9_\)\]'"`])!=(?!=)/,
    title: 'Loose equality operator',
    advice: 'Coerces types unexpectedly. Prefer === and !==.'
  },
  {
    id: 'VAR_DECLARATION',
    severity: 'info',
    pattern: /\bvar\s+[A-Za-z_$]/,
    title: 'var declaration',
    advice: 'Function-scoped and hoisted. Prefer const/let.'
  },
  {
    id: 'DEBUG_LEFTOVER',
    severity: 'info',
    pattern: /^\s*console\.(log|debug)\s*\(/,
    title: 'console.log left in code',
    advice: 'Debug output in production code. Remove or use a logger.'
  },
  {
    id: 'TODO_MARKERS',
    severity: 'info',
    pattern: /\/\/.*(TODO|FIXME|HACK|XXX)\b/i,
    title: 'Unresolved TODO/FIXME marker',
    advice: 'AI models often leave placeholders. Track and resolve.'
  }
];

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

/**
 * Run all regex rules against source text.
 * @param {string} code
 * @returns {Array<{ruleId:string,severity:string,line:number,column:number,title:string,advice:string,excerpt:string}>}
 */
export function scanSource(code) {
  const lines = code.split(/\r?\n/);
  const findings = [];

  for (const rule of RULES) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g')
      ? rule.pattern.flags
      : rule.pattern.flags + 'g');
    lines.forEach((lineText, i) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(lineText)) !== null) {
        findings.push({
          ruleId: rule.id,
          severity: rule.severity,
          line: i + 1,
          column: m.index + 1,
          title: rule.title,
          advice: rule.advice,
          excerpt: lineText.trim().slice(0, 120)
        });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    });
  }

  return findings.sort((a, b) =>
    SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.line - b.line
  );
}

/**
 * Syntax-check a file using `node --check`.
 * @param {string} filePath
 * @returns {Promise<{ok:boolean, error:string|null}>}
 */
export function checkSyntax(filePath) {
  return new Promise(resolve => {
    const proc = spawnSync(process.execPath, ['--check', filePath], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000
    });
    if (proc.status === 0) {
      resolve({ ok: true, error: null });
    } else {
      resolve({
        ok: false,
        error: (proc.stderr || 'Unknown syntax error').trim()
      });
    }
  });
}

/**
 * Summarize findings counts by severity.
 * @param {Array} findings
 */
export function summarize(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}
