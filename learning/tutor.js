import { ask, closeInterface } from '../cli.js';
import { getLesson } from '../analyzer/lessons.js';
import { callAI } from '../ai.js';

const TUTOR_SYSTEM = `Tu es un tuteur de code bienveillant et rigoureux, en français.
Contexte : l'utilisateur code avec l'aide d'IA et veut APPRENDRE de ses erreurs.
Tu reçois ses fichiers analysés, les erreurs détectées et leur historique.

Règles :
- Réponds en français, de façon concise et concrète.
- Explique le POURQUOI avant le comment : la mécanique du problème d'abord.
- Illustre avec un mini exemple avant/après quand c'est utile.
- Si la question porte sur autre chose que les erreurs listées (architecture, design, nommage...), réponds quand même : tu es le mentor du projet entier.
- Termine parfois par une question courte qui fait progresser (méthode socratique), sans être lourd.`;

/**
 * Session interactive post-analyse : navigation dans les erreurs,
 * leçons détaillées et questions libres au tuteur LLM.
 * @param {{files:Array<{name:string,code:string}>, classified:Object, stats:Object, config:Object|null}} ctx
 */
export async function startTutorSession({ files, classified, stats, config }) {
  const all = [
    ...classified.regressed.map(f => ({ ...f, status: 'REGRESSION' })),
    ...classified.new.map(f => ({ ...f, status: 'NOUVEAU' })),
    ...classified.known.map(f => ({ ...f, status: 'DÉJÀ VU' })),
    ...classified.recurring.map(f => ({ ...f, status: `RÉCURRENT ×${f.entry.occurrences}` }))
  ];

  console.log(`
╔══════════════════════════════════════════════╗
║  METATRON TUTOR — apprendre de tes erreurs   ║
╚══════════════════════════════════════════════╝

Commandes :
  <numéro>          Voir la leçon détaillée de l'erreur N
  liste             Re-lister les erreurs
  stats             Progrès et erreurs récurrentes
  <question libre>  Poser une question au tuteur (code, archi, tout)
  quitter           Sortir
${config ? '' : '\n⚠️ Pas de clé API détectée : mode lecture seule (pas de questions libres).\n'}
`);

  while (true) {
    const raw = await ask('tutor>');
    if (raw === null) break;
    const input = raw.trim();
    if (!input) continue;

    if (/^(quitter|q|quit|exit)$/i.test(input)) break;

    if (/^(liste|l|list)$/i.test(input)) {
      printFindingList(all);
      continue;
    }

    if (/^stats$/i.test(input)) {
      printStats(stats);
      continue;
    }

    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= all.length) {
      printLesson(all[num - 1]);
      continue;
    }

    if (!config) {
      console.log('⚠️ Mode lecture seule : configure GROK_API_KEY / GROQ_API_KEY / CLAUDE_API_KEY ou OLLAMA_MODEL pour poser des questions.\n');
      continue;
    }

    await askTutor(input, { files, all, config });
  }

  closeInterface();
}

function printFindingList(all) {
  if (all.length === 0) {
    console.log('✅ Aucune erreur détectée. Pose tes questions librement !\n');
    return;
  }
  console.log('');
  all.forEach((f, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. [${f.status}] ${f.title} — ${f.file}:${f.line}`);
  });
  console.log('');
}

function printLesson(f) {
  const lesson = getLesson(f.ruleId);
  console.log(`
┌─ LEÇON — ${lesson.category} ─────────────────────────────
│ ${f.title}
│ 📍 ${f.file}:${f.line}  ·  statut: ${f.status}  ·  vu ${f.entry?.occurrences ?? 1}×
│
│ QUOI : ${f.excerpt}
│
│ POURQUOI C'EST UN PROBLÈME :
│ ${lesson.explanation}
${lesson.why ? `│\n│ EN PRATIQUE :\n│ ${lesson.why}` : ''}
${lesson.badExample ? `\n│ ❌ MAUVAIS :\n${indent(lesson.badExample)}\n│\n│ ✅ MIEUX :\n${indent(lesson.goodExample)}` : ''}
${lesson.reference ? `\n│ 📚 ${lesson.reference}` : ''}
└──────────────────────────────────────────────
`);
}

function indent(code) {
  return code.split('\n').map(l => `│   ${l}`).join('\n');
}

function printStats(stats) {
  console.log(`
📈 PROGRÈS
  Erreurs distinctes rencontrées : ${stats.totalDistinct}
  Encore ouvertes                : ${stats.openCount}
  Corrigées                      : ${stats.fixedCount} 🎉
  Régressions totales            : ${stats.regressionTotal}

  Top récidives :`);
  for (const e of stats.topRecurring.slice(0, 5)) {
    console.log(`   • ${e.ruleId} — ${e.file} (${e.occurrences}×)`);
  }
  console.log('');
}

async function askTutor(question, { files, all, config }) {
  const codeContext = files.map(f =>
    `--- ${f.name} ---\n${f.code.length > 6000 ? f.code.slice(0, 6000) + '\n... (tronqué)' : f.code}`
  ).join('\n\n');

  const findingsSummary = all.map(f =>
    `- [${f.status}] (${f.severity}) ${f.title} — ${f.file}:${f.line}`
  ).join('\n') || '- aucune';

  const prompt = `Fichiers analysés :
${codeContext}

Erreurs détectées (avec historique) :
${findingsSummary}

Question de l'utilisateur :
"${question}"`;

  try {
    console.log('🤔 …\n');
    const answer = await callAI(prompt, config, { system: TUTOR_SYSTEM });
    console.log(`${answer}\n`);
  } catch (err) {
    console.log(`⚠️ Le tuteur n'a pas pu répondre : ${err.message}\n`);
  }
}
