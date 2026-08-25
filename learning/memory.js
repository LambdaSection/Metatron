import fs from 'node:fs/promises';
import path from 'node:path';

const MEMORY_DIR = '.metatron';
const MEMORY_FILE = 'memory.json';

/**
 * Charge la mémoire projet (crée une structure vide si absente).
 * @param {string} projectRoot
 */
export async function loadMemory(projectRoot = process.cwd()) {
  const file = path.join(projectRoot, MEMORY_DIR, MEMORY_FILE);
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return { version: 1, entries: {}, scans: [] };
  }
}

/**
 * Sauvegarde la mémoire projet.
 */
export async function saveMemory(memory, projectRoot = process.cwd()) {
  const dir = path.join(projectRoot, MEMORY_DIR);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, MEMORY_FILE),
    JSON.stringify(memory, null, 2),
    'utf8'
  );
}

function entryKey(ruleId, file) {
  return `${ruleId}|${file.replace(/\\/g, '/')}`;
}

/**
 * Réconcilie les findings actuels avec la mémoire et met à jour celle-ci.
 * Classification :
 *  - new        : première fois qu'on voit cette erreur (règle + fichier)
 *  - known      : déjà vue, toujours présente
 *  - recurring  : vue >= 3 fois
 *  - regressed  : était corrigée, elle est REVENUE (le pire)
 *  - fixed      : présente avant, disparue maintenant
 * @param {Array<{ruleId:string,line:number}>} findings
 * @param {Object} memory - objet mémoire MUTÉ en place
 * @returns {{new:Array,known:Array,recurring:Array,regressed:Array,fixed:Array}}
 */
export function reconcile(findings, memory) {
  const now = new Date().toISOString();
  const result = { new: [], known: [], recurring: [], regressed: [], fixed: [] };

  const seenKeys = new Set();

  for (const f of findings) {
    const key = entryKey(f.ruleId, f.file ?? f.filePath ?? '');
    seenKeys.add(key);

    let entry = memory.entries[key];
    if (!entry) {
      entry = memory.entries[key] = {
        ruleId: f.ruleId,
        file: (f.file ?? f.filePath ?? '').replace(/\\/g, '/'),
        firstSeen: now,
        lastSeen: now,
        occurrences: 1,
        lines: [f.line],
        status: 'open'
      };
      result.new.push({ ...f, entry });
    } else {
      entry.lastSeen = now;
      entry.occurrences++;
      entry.lines = [...new Set([...entry.lines, f.line])].slice(-10);
      if (entry.status === 'fixed') {
        entry.status = 'open';
        entry.regressionCount = (entry.regressionCount || 0) + 1;
        result.regressed.push({ ...f, entry });
      } else {
        entry.status = 'open';
        if (entry.occurrences >= 3) {
          result.recurring.push({ ...f, entry });
        } else {
          result.known.push({ ...f, entry });
        }
      }
    }
  }

  for (const [key, entry] of Object.entries(memory.entries)) {
    if (entry.status === 'open' && !seenKeys.has(key)) {
      entry.status = 'fixed';
      entry.fixedAt = now;
      result.fixed.push(entry);
    }
  }

  memory.scans.push({
    date: now,
    total: findings.length,
    bySeverity: countBy(findings, 'severity')
  });
  memory.scans = memory.scans.slice(-100);

  return result;
}

/**
 * Statistiques d'apprentissage à partir de la mémoire.
 */
export function getStats(memory) {
  const entries = Object.values(memory.entries);
  const open = entries.filter(e => e.status === 'open');
  const fixed = entries.filter(e => e.status === 'fixed');

  const topRecurring = open
    .slice()
    .sort((a, b) => b.occurrences - a.occurrences || b.regressionCount - a.regressionCount)
    .slice(0, 10);

  const byRule = {};
  for (const e of entries) byRule[e.ruleId] = (byRule[e.ruleId] || 0) + 1;

  return {
    totalDistinct: entries.length,
    openCount: open.length,
    fixedCount: fixed.length,
    regressionTotal: entries.reduce((s, e) => s + (e.regressionCount || 0), 0),
    topRecurring,
    byRule,
    scans: memory.scans.length
  };
}

function countBy(arr, field) {
  const out = {};
  for (const item of arr) {
    const k = item[field];
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}
