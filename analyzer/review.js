import { callAI } from '../ai.js';

const REVIEW_SYSTEM = `You are a rigorous senior code reviewer specialized in AI-generated JavaScript.
You receive source code plus deterministic static-analysis findings.
Analyze logic errors, runtime crash risks, edge cases, and security issues that regex rules CANNOT catch.
Ignore style. Only report real problems.

You MUST respond with a single JSON array and nothing else (no markdown fences, no prose):
[
  {
    "severity": "critical|high|medium|low",
    "title": "short issue title",
    "line": 12,
    "explanation": "why this is a problem",
    "suggestion": "concrete fix"
  }
]
Return [] if no issues found.`;

/**
 * Ask the configured LLM to review a file's code with static findings as context.
 * @param {{code:string, fileName:string, findings:Array}} params
 * @param {Object} config - provider config (see providers.js)
 * @returns {Promise<{findings:Array, raw:string}>}
 */
export async function reviewCode({ code, fileName, findings }, config) {
  const staticSummary = findings.length
    ? findings.map(f => `- [${f.severity}] line ${f.line}: ${f.title}`).join('\n')
    : '- none';

  const prompt = `File: ${fileName}

Static analysis already flagged:
${staticSummary}

Source code:
\`\`\`javascript
${code}
\`\`\`

Review this code now. Respond ONLY with the JSON array.`;

  const raw = await callAI(prompt, config, { system: REVIEW_SYSTEM });
  return { findings: parseReviewResponse(raw), raw };
}

/**
 * Robustly extract the JSON array from an LLM response.
 * @param {string} raw
 * @returns {Array}
 */
export function parseReviewResponse(raw) {
  const attempts = [raw.trim()];

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) attempts.push(fenced[1].trim());

  const bracketed = raw.match(/\[[\s\S]*\]/);
  if (bracketed) attempts.push(bracketed[0]);

  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // try next candidate
    }
  }
  throw new Error('LLM response was not parseable as a JSON array');
}
