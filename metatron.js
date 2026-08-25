import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, showHelp, ask, closeInterface } from './cli.js';
import { selectProvider, getProviderConfig } from './providers.js';
import { callAI } from './ai.js';
import { parseResponse, isVerificationWeak } from './parser.js';
import { displayStepOutput, displayStepDetails, displayParsingFailure, displayWeakVerificationWarning, displayContextWarning, clearScreen } from './display.js';
import { saveSession, loadSession } from './session.js';
import { scanSource, checkSyntax, summarize } from './analyzer/static.js';
import { runFile, formatRunReport } from './analyzer/runner.js';
import { reviewCode } from './analyzer/review.js';
import { printAnalyzeReport, printSummary } from './analyzer/report.js';

const HELP = `
Metatron - AI Code Debugger & Analyzer

USAGE:
  node metatron.js analyze <file...> [--review] [--provider=N]
  node metatron.js run <file> [--timeout=10000]
  node metatron.js gentest <file>
  node metatron.js gen [options]     (legacy stepwise generator)
  node metatron.js help

COMMANDS:
  analyze    Static rule scan + syntax check on JS files.
             --review adds an LLM review layer (auto-detects API key
             in env: GROK_API_KEY / GROQ_API_KEY / CLAUDE_API_KEY / OLLAMA_MODEL).
             Exit code 1 if critical/high findings.
  run        Execute a file in a sandboxed child process with timeout,
             capture stdout/stderr and structured errors.
  gentest    Generate a node:test suite with the LLM, then execute it.
  gen        Legacy interactive stepwise code generation.

EXAMPLES:
  node metatron.js analyze src/app.js utils.js --review
  node metatron.js run script.js --timeout=5000
`;

const PROVIDER_ENV = [
  ['GROK_API_KEY', 1],
  ['GROQ_API_KEY', 3],
  ['CLAUDE_API_KEY', 4],
  ['OLLAMA_MODEL', 2]
];

function detectProviderFromEnv() {
  for (const [envVar, id] of PROVIDER_ENV) {
    if (process.env[envVar]) return id;
  }
  return null;
}

function flagValue(args, name, fallback) {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
}

async function readTarget(target) {
  try {
    const code = await fs.readFile(target, 'utf8');
    return code;
  } catch (err) {
    console.error(`❌ Cannot read ${target}: ${err.message}`);
    return null;
  }
}

// ---------- analyze ----------
async function cmdAnalyze(restArgs) {
  const targets = restArgs.filter(a => !a.startsWith('--'));
  const wantReview = restArgs.includes('--review');
  const providerOverride = flagValue(restArgs, 'provider', null);

  if (targets.length === 0) {
    console.log('❌ No file to analyze. Usage: node metatron.js analyze <file...>');
    process.exitCode = 2;
    return;
  }

  let llmConfig = null;
  if (wantReview) {
    const providerId = providerOverride ?? detectProviderFromEnv();
    if (!providerId) {
      console.log('⚠️ --review requested but no API key found in env (GROK_API_KEY, GROQ_API_KEY, CLAUDE_API_KEY or OLLAMA_MODEL). Skipping LLM layer.');
    } else {
      llmConfig = await getProviderConfig(providerId);
      console.log(`🤖 LLM review enabled (${llmConfig.model})`);
    }
  }

  let exitCode = 0;
  for (const target of targets) {
    const code = await readTarget(target);
    if (code === null) { exitCode = 2; continue; }

    const syntax = await checkSyntax(target);
    const findings = syntax.ok ? scanSource(code) : [];
    let llmReview = null;

    if (syntax.ok && llmConfig) {
      try {
        llmReview = await reviewCode({ code, fileName: target, findings }, llmConfig);
      } catch (err) {
        console.log(`⚠️ LLM review failed: ${err.message}`);
      }
    }

    printAnalyzeReport(target, syntax, findings, llmReview);
    exitCode = Math.max(exitCode, printSummary(findings, llmReview));
  }
  process.exitCode = exitCode;
}

// ---------- run ----------
async function cmdRun(restArgs) {
  const target = restArgs.find(a => !a.startsWith('--'));
  if (!target) {
    console.log('❌ No file to run. Usage: node metatron.js run <file> [--timeout=ms]');
    process.exitCode = 2;
    return;
  }
  const timeoutMs = flagValue(restArgs, 'timeout', 10000);

  console.log(`▶️ Running ${target} (timeout ${timeoutMs}ms)…\n`);
  const result = await runFile(target, { timeoutMs });
  console.log(formatRunReport(result).join('\n'));
  process.exitCode = result.ok ? 0 : 1;
}

// ---------- gentest ----------
async function cmdGentest(restArgs) {
  const target = restArgs.find(a => !a.startsWith('--'));
  if (!target) {
    console.log('❌ No file. Usage: node metatron.js gentest <file>');
    process.exitCode = 2;
    return;
  }

  const providerId = detectProviderFromEnv() ?? await selectProvider();
  const config = await getProviderConfig(providerId);

  const code = await readTarget(target);
  if (code === null) return;

  console.log('\n🧪 Generating test suite…');
  const prompt = `Generate a complete Node.js test suite using the built-in \`node:test\` module and \`node:assert/strict\` for this file.
Cover normal cases, edge cases and error cases. Import functions from "${path.basename(target)}".
Respond ONLY with the test file content, no markdown fences, no explanations.

\`\`\`javascript
${code}
\`\`\``;

  const raw = await callAI(prompt, config);
  const cleaned = raw.replace(/^```(?:javascript|js)?\s*/m, '').replace(/```\s*$/m, '').trim();

  const outFile = target.replace(/\.(js|mjs|cjs)$/, '') + '.test.mjs';
  await fs.writeFile(outFile, cleaned + '\n', 'utf8');
  console.log(`💾 Tests written to ${outFile}\n`);

  console.log('▶️ Running generated tests…\n');
  const result = await runFile(outFile, { timeoutMs: 60000 });
  console.log(formatRunReport(result).join('\n'));
  process.exitCode = result.ok ? 0 : 1;
}

// ---------- legacy stepwise generation ----------
async function cmdGen(args) {
  let sessionData = null;
  if (args.sessionFile) {
    try {
      sessionData = await loadSession(args.sessionFile);
      console.log(`📂 Loaded session from ${args.sessionFile}\n`);
    } catch (err) {
      console.error(`❌ Failed to load session: ${err.message}`);
      process.exit(1);
    }
  }

  clearScreen();
  console.log('Metatron – Stepwise Code Generator\n');

  const provider = sessionData ? sessionData.provider : await selectProvider();
  const config = sessionData ? sessionData.config : await getProviderConfig(provider);

  const task = sessionData ? sessionData.task : await ask('Describe what you want to build (e.g. "PDF invoice generator from JSON cart"): ');
  console.log('\nStarting step-by-step generation. Press Enter to continue, type "stop" to finish.\n');

  let fullCode = sessionData ? sessionData.fullCode : '';
  let context = sessionData ? sessionData.context : `Overall task: ${task}\n\n`;
  let step = sessionData ? sessionData.step : 1;
  const MAX_TOKENS = 128000;

  while (true) {
    const prompt = `Current context so far:\n${context}\n\nWhat is the next SINGLE critical logical step for this task?`;
    console.log(`\nStep ${step} – asking AI…\n`);

    const raw = await callAI(prompt, config);
    const parsed = parseResponse(raw);

    if (!parsed) {
      displayParsingFailure(raw);
      const retry = await ask('Parsing failed. Try again with new prompt? (y/n): ');
      if (retry.toLowerCase() === 'y') continue;
      console.log('Session ended due to parsing failure');
      break;
    }

    const { explanation, code, verification } = parsed;

    if (isVerificationWeak(verification)) {
      displayWeakVerificationWarning(verification);
      const confirm = await ask('⚠️ Weak verification (no OWASP/CWE/RFC/MDN/CVE). Continue accumulating code? (y/n): ');
      if (confirm.toLowerCase() !== 'y') {
        console.log('Step rejected - not accumulating code');
        context += raw + '\n\n';
        step++;
        continue;
      }
    }

    fullCode += code + '\n\n';
    displayStepOutput(explanation, code, verification);

    const estimatedTokens = context.length / 4;
    if (estimatedTokens > MAX_TOKENS * 0.8) {
      displayContextWarning(estimatedTokens, MAX_TOKENS);
    }

    let answer = await ask('→ Press Enter for next step, "details" to show full content, "save" to save session, "stop" to output full code, "quit" to exit: ');

    if (answer.toLowerCase() === 'details') {
      displayStepDetails(explanation, code, verification);
      answer = await ask('→ Press Enter for next step, "save" to save session, "stop" to output full code, "quit" to exit: ');
    }

    if (answer.toLowerCase() === 'quit') break;

    if (answer.toLowerCase() === 'save') {
      await saveSession({
        provider, config, task, fullCode, context, step,
        timestamp: new Date().toISOString()
      });
      continue;
    }

    if (answer.toLowerCase() === 'stop') {
      console.log('\nFull generated code:\n');
      console.log(fullCode);
      break;
    }

    context += raw + '\n\n';
    step++;
  }

  closeInterface();
}

// ---------- router ----------
const [,, command = 'help', ...restArgs] = process.argv;

switch (command) {
  case 'analyze': await cmdAnalyze(restArgs); break;
  case 'run': await cmdRun(restArgs); break;
  case 'gentest': await cmdGentest(restArgs); break;
  case 'gen': {
    const args = parseArgs();
    if (args.showHelp) { showHelp(); break; }
    await cmdGen(args);
    break;
  }
  case '--help': case '-h': case 'help':
    console.log(HELP);
    break;
  default:
    console.log(`Unknown command: ${command}\n${HELP}`);
    process.exitCode = 2;
}
