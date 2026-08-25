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
import { loadMemory, saveMemory, reconcile, getStats } from './learning/memory.js';
import { startTutorSession } from './learning/tutor.js';
import { buildMapData, buildMapDataFromMemory, writeMapFile } from './learning/map.js';

const HELP = `
Metatron - AI Code Debugger & Analyzer + Tuteur d'apprentissage

USAGE:
  node metatron.js learn <file...>       Analyse + leçons + tuteur interactif
  node metatron.js analyze <file...>     Scan statique seul [--review] [--provider=N]
  node metatron.js run <file>            Exécution sandboxée [--timeout=10000]
  node metatron.js gentest <file>        Génère et exécute des tests (LLM)
  node metatron.js progress              Tableau de bord erreurs/progrès
  node metatron.js map [--out=path]      Carte HTML cliquable des erreurs
  node metatron.js gen [options]         Legacy générateur pas-à-pas
  node metatron.js help

LE MODE APPRENTISSAGE :
  learn    Détecte les erreurs, les classe (nouveau / déjà vu / récurrent /
           RÉGRESSION), affiche la leçon de chacune et ouvre une session
           tutor où tu poses tes questions en français sur ton code.
           Mémoire persistante dans .metatron/memory.json.
  progress Historique : récidives, corrigées, régressions.
  map      Génère metatron-map.html : points d'erreur cliquables par fichier,
           taille = récurrence, anneau rouge = régression. Sans fichiers en
           argument, reconstruit la carte depuis la mémoire.

EXAMPLES:
  node metatron.js learn src/app.js
  node metatron.js progress
  node metatron.js map --out=ma-carte.html
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

// ---------- learn ----------
async function cmdLearn(restArgs) {
  const targets = restArgs.filter(a => !a.startsWith('--'));
  if (targets.length === 0) {
    console.log('❌ Usage: node metatron.js learn <file...>');
    process.exitCode = 2;
    return;
  }

  const files = [];
  const findings = [];

  for (const target of targets) {
    const code = await readTarget(target);
    if (code === null) continue;
    files.push({ name: target, code });

    const syntax = await checkSyntax(target);
    if (!syntax.ok) {
      console.log(`⛔ ${target} — erreur de syntaxe :\n${syntax.error}\n`);
      continue;
    }
    for (const f of scanSource(code)) {
      findings.push({ ...f, file: target });
    }
  }

  const memory = await loadMemory();
  const classified = reconcile(findings, memory);
  const stats = getStats(memory);
  await saveMemory(memory);

  printFindingOverview(classified);

  let config = null;
  const providerId = detectProviderFromEnv();
  if (providerId) {
    config = await getProviderConfig(providerId);
  }

  await startTutorSession({ files, classified, stats, config });
}

function printFindingOverview(classified) {
  const icons = { regressed: '🚨', recurring: '🔁', new: '🆕', known: '👀', fixed: '✅' };
  console.log('\n📊 Résultat de l\'analyse :');
  for (const [kind, label] of [
    ['regressed', 'RÉGRESSIONS (corrigée puis revenue !)'],
    ['recurring', 'Récurrences (3 fois ou plus)'],
    ['new', 'Nouvelles erreurs'],
    ['known', 'Déjà connues'],
    ['fixed', 'Corrigées depuis la dernière fois 🎉']
  ]) {
    if (classified[kind].length === 0) continue;
    console.log(`\n${icons[kind]} ${label} (${classified[kind].length}) :`);
    for (const item of classified[kind]) {
      const file = item.file ?? item.entry?.file ?? '';
      const line = item.line ?? '';
      const title = item.title ?? item.ruleId;
      console.log(`   • ${title} — ${file}${line ? ':' + line : ''}`);
    }
  }
  console.log('');
}

// ---------- progress ----------
async function cmdProgress() {
  const memory = await loadMemory();
  const stats = getStats(memory);

  console.log('\n📈 METATRON — Progression');
  console.log('═'.repeat(50));
  console.log(`Erreurs distinctes rencontrées : ${stats.totalDistinct}`);
  console.log(`Encore ouvertes               : ${stats.openCount}`);
  console.log(`Corrigées                     : ${stats.fixedCount} 🎉`);
  console.log(`Régressions totales           : ${stats.regressionTotal}`);
  console.log(`Scans mémorisés               : ${stats.scans}`);

  if (stats.topRecurring.length > 0) {
    console.log('\nTop récidives (à travailler en priorité) :');
    for (const e of stats.topRecurring) {
      console.log(`   • [${e.occurrences}×] ${e.ruleId} — ${e.file}`);
    }
  }
  console.log('');
}

// ---------- map ----------
async function cmdMap(restArgs) {
  const targets = restArgs.filter(a => !a.startsWith('--'));
  const outArg = restArgs.find(a => a.startsWith('--out='));
  const outPath = outArg ? outArg.split('=').slice(1).join('=') : 'metatron-map.html';

  let data;
  if (targets.length > 0) {
    const findings = [];
    for (const target of targets) {
      const code = await readTarget(target);
      if (code === null) continue;
      if (!(await checkSyntax(target)).ok) {
        console.log(`⚠️ ${target} a des erreurs de syntaxe, ignoré pour la carte.`);
        continue;
      }
      for (const f of scanSource(code)) findings.push({ ...f, file: target });
    }
    const memory = await loadMemory();
    data = buildMapData({ files: targets.map(t => ({ name: t })), classified: reconcile(findings, memory) });
    await saveMemory(memory);
  } else {
    const memory = await loadMemory();
    data = buildMapDataFromMemory(memory);
    console.log('🗺️ Carte reconstruite depuis la mémoire projet.');
  }

  const written = await writeMapFile(data, outPath);
  console.log(`✅ Carte écrite : ${written}`);
  console.log(`   Ouvre-la dans ton navigateur pour explorer les points d'erreur.`);
}

// ---------- router ----------
const [,, command = 'help', ...restArgs] = process.argv;

switch (command) {
  case 'analyze': await cmdAnalyze(restArgs); break;
  case 'run': await cmdRun(restArgs); break;
  case 'gentest': await cmdGentest(restArgs); break;
  case 'learn': await cmdLearn(restArgs); break;
  case 'progress': await cmdProgress(); break;
  case 'map': await cmdMap(restArgs); break;
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
