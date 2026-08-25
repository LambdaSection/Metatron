import fs from 'node:fs/promises';
import path from 'node:path';
import { getLesson } from '../analyzer/lessons.js';
import { RULES } from '../analyzer/static.js';

const SEV_COLORS = {
  critical: '#e11d48',
  high: '#f97316',
  medium: '#eab308',
  low: '#38bdf8',
  info: '#94a3b8'
};

/**
 * Assemble les données de la carte à partir du résultat d'analyse.
 */
export function buildMapData({ files, classified }) {
  const all = [
    ...classified.regressed.map(f => ({ ...f, status: 'regressed' })),
    ...classified.new.map(f => ({ ...f, status: 'new' })),
    ...classified.known.map(f => ({ ...f, status: 'known' })),
    ...classified.recurring.map(f => ({ ...f, status: 'recurring' }))
  ];

  const fileNames = [...new Set(all.map(f => f.file ?? f.filePath ?? '(mémoire)'))];

  return {
    generatedAt: new Date().toISOString(),
    files: fileNames,
    points: all.map(f => ({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      line: f.line,
      excerpt: String(f.excerpt || '').slice(0, 160),
      status: f.status,
      occurrences: f.entry?.occurrences ?? 1,
      regressionCount: f.entry?.regressionCount ?? 0
    })),
    fixed: classified.fixed.map(e => ({
      ruleId: e.ruleId,
      file: e.file,
      occurrences: e.occurrences
    })),
    lessons: Object.fromEntries(
      [...new Set(all.map(f => f.ruleId))].map(id => [id, getLesson(id)])
    )
  };
}

/**
 * Construit les données de carte depuis la mémoire seule (sans rescan).
 */
export function buildMapDataFromMemory(memory) {
  const entries = Object.values(memory.entries);
  const ruleById = Object.fromEntries(RULES.map(r => [r.id, r]));

  const points = entries.filter(e => e.status !== 'fixed').map(e => ({
    ruleId: e.ruleId,
    title: ruleById[e.ruleId]?.title || e.ruleId,
    severity: ruleById[e.ruleId]?.severity || 'info',
    line: e.lines.at(-1),
    excerpt: '(voir fichier)',
    status: (e.regressionCount ? 'regressed' : e.occurrences >= 3 ? 'recurring' : 'known'),
    occurrences: e.occurrences,
    regressionCount: e.regressionCount ?? 0,
    file: e.file
  }));

  return {
    generatedAt: new Date().toISOString(),
    files: [...new Set(points.map(p => p.file))],
    points,
    fixed: entries.filter(e => e.status === 'fixed').map(e => ({
      ruleId: e.ruleId, file: e.file, occurrences: e.occurrences
    })),
    lessons: Object.fromEntries(
      [...new Set(points.map(p => p.ruleId))].map(id => [id, getLesson(id)])
    )
  };
}

/**
 * Génère un fichier HTML autonome (aucune dépendance externe).
 * @returns {Promise<string>} chemin du fichier écrit
 */
export async function writeMapFile(data, outPath) {
  const html = renderMapHtml(data);
  await fs.mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
  await fs.writeFile(outPath, html, 'utf8');
  return path.resolve(outPath);
}

export function renderMapHtml(data) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Metatron — Carte des erreurs</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #0b1120; color: #e2e8f0;
    display: grid; grid-template-columns: 1fr 380px;
    grid-template-rows: auto 1fr; height: 100vh;
  }
  header {
    grid-column: 1 / -1; padding: 14px 22px;
    background: #111a2e; border-bottom: 1px solid #233252;
    display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
  }
  header h1 { font-size: 18px; font-weight: 600; }
  header .sub { color: #7c8db5; font-size: 12px; }
  .badge { font-size: 12px; padding: 3px 10px; border-radius: 999px; background:#1c2947; }
  svg-viewer, aside { overflow: auto; }
  #viewer { position: relative; }
  aside {
    border-left: 1px solid #233252; background: #101828;
    padding: 20px;
  }
  aside.empty { color:#55648a; display:flex; align-items:center; justify-content:center; text-align:center; }
  .lesson h2 { font-size:16px; margin-bottom:6px; }
  .lesson .meta { font-size:12px; color:#7c8db5; margin-bottom:14px; }
  .lesson h3 { font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#38bdf8; margin:14px 0 4px; }
  .lesson p { font-size:13.5px; line-height:1.55; color:#c9d4ea; }
  pre {
    background:#0b1120; border:1px solid #233252; border-radius:8px;
    padding:10px; font-size:12.5px; margin:6px 0; overflow-x:auto;
    line-height:1.5;
  }
  pre.bad { border-left:3px solid #e11d48; }
  pre.good { border-left:3px solid #22c55e; }
  .ref { font-size:12px; color:#7c8db5; word-break:break-all; }
  .legend { display:flex; gap:14px; font-size:12px; color:#7c8db5; margin-left:auto; }
  .dot { display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:5px; vertical-align:-1px; }
  .occ-pill {
    position:absolute; transform:translate(-50%,-50%); pointer-events:none;
    font-size:10px; font-weight:700; fill:#0b1120;
  }
  .file-label { fill:#9fb2d8; font-size:13px; font-weight:600; cursor:default; }
  .file-sub { fill:#55648a; font-size:11px; }
  circle.pt { cursor:pointer; transition: r .15s; }
  circle.pt:hover { filter: brightness(1.35); }
  circle.pt.selected { stroke:#fff; stroke-width:3px; }
  @keyframes pulse { 0%,100%{stroke-opacity:.9} 50%{stroke-opacity:.25} }
  circle.regressed { animation: pulse 1.4s ease-in-out infinite; }
</style>
</head>
<body>
<header>
  <h1>🗺️ Metatron — Carte des erreurs</h1>
  <span class="sub" id="gen-date"></span>
  <span class="badge" id="stat-total"></span>
  <span class="badge" id="stat-fixed"></span>
  <div class="legend">
    <span><i class="dot" style="background:${SEV_COLORS.critical}"></i>critique</span>
    <span><i class="dot" style="background:${SEV_COLORS.high}"></i>haut</span>
    <span><i class="dot" style="background:${SEV_COLORS.medium}"></i>moyen</span>
    <span><i class="dot" style="background:${SEV_COLORS.low}"></i>faible</span>
    <span><i class="dot" style="background:${SEV_COLORS.info}"></i>info</span>
    <span>◎ anneau rouge = régression</span>
    <span>• taille = récurrence</span>
  </div>
</header>
<div id="viewer"><svg id="map" width="100%" height="100%"></svg></div>
<aside class="empty" id="panel">← Clique sur un point pour voir la leçon<br>(quoi, pourquoi, exemple avant/après)</aside>

<script id="data" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script>
const DATA = JSON.parse(document.getElementById('data').textContent);

document.getElementById('gen-date').textContent =
  'généré le ' + new Date(DATA.generatedAt).toLocaleString('fr-FR');
document.getElementById('stat-total').textContent = DATA.points.length + ' erreur(s)';
document.getElementById('stat-fixed').textContent = '✅ ' + DATA.fixed.length + ' corrigée(s)';

const COLORS = ${JSON.stringify(SEV_COLORS)};
const svg = document.getElementById('map');
const panel = document.getElementById('panel');
const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

// Layout : un fichier par colonne, points empilés dessous
const COL_W = 230, TOP = 90, GAP_Y = 58, MAX_PER_COL = Math.max(1, Math.ceil(900 / GAP_Y));
let maxRows = 1;
DATA.points.forEach((p) => {
  p._fi = DATA.files.indexOf(p.file);
});

DATA.files.forEach((fname, fi) => {
  const pts = DATA.points.filter(p => p._fi === fi);
  const colX = 120 + fi * COL_W;
  const rows = Math.min(pts.length, MAX_PER_COL);
  maxRows = Math.max(maxRows, rows);
  pts.forEach((p, pi) => {
    const row = pi % MAX_PER_COL, colOff = Math.floor(pi / MAX_PER_COL);
    p.x = colX + colOff * 64;
    p.y = TOP + 60 + row * GAP_Y;
  });
  const t1 = el('text', { x: colX, y: 46, class: 'file-label' });
  t1.textContent = fname.split('/').pop();
  const t2 = el('text', { x: colX, y: 64, class: 'file-sub' });
  t2.textContent = fname;
  svg.appendChild(t1); svg.appendChild(t2);
});

svg.setAttribute('viewBox', \`0 0 \${Math.max(900, 120 + DATA.files.length*COL_W)} \${Math.max(500, TOP+80+maxRows*GAP_Y)}\`);

DATA.points.forEach((p, i) => {
  const g = el('g', {});
  const r = 8 + Math.min(p.occurrences, 10) * 1.1;
  const c = el('circle', {
    cx: p.x, cy: p.y, r,
    fill: COLORS[p.severity] || COLORS.info,
    class: 'pt' + (p.status === 'regressed' ? ' regressed' : '')
  });
  c.dataset.idx = i;
  if (p.status === 'regressed') {
    c.setAttribute('style', 'stroke:#ef4444;stroke-width:3px;');
  }
  c.addEventListener('click', () => select(i));
  g.appendChild(c);
  if (p.occurrences > 1) {
    const label = el('text', { x: p.x, y: p.y + 3.5, class: 'occ-pill', 'text-anchor': 'middle' });
    label.textContent = '×' + Math.min(p.occurrences, 99);
    g.appendChild(label);
  }
  svg.appendChild(g);
});

function esc(s){ const d=document.createElement('div'); d.textContent=s??''; return d.innerHTML; }

function select(i) {
  document.querySelectorAll('circle.pt').forEach(c => c.classList.remove('selected'));
  const node = [...document.querySelectorAll('circle.pt')].find(c => c.dataset.idx == i);
  if (node) node.classList.add('selected');

  const p = DATA.points[i];
  const L = DATA.lessons[p.ruleId] || {};
  const statusLabel = { regressed:'⚠️ RÉGRESSION', recurring:'🔁 récurrent', known:'déjà vu', new:'nouveau' }[p.status] || p.status;

  panel.className = 'lesson';
  panel.innerHTML = \`
    <h2>\${esc(p.title)}</h2>
    <div class="meta">\${p.ruleId} · \${esc(p.file)}:\${p.line} · \${statusLabel}
      · vu \${p.occurrences}×\${p.regressionCount ? ' · ' + p.regressionCount + ' régression(s)' : ''}</div>
    <pre class="bad">\${esc(p.excerpt)}</pre>
    <h3>Pourquoi c'est un problème</h3>
    <p>\${esc(L.explanation)}</p>
    \${L.why ? '<h3>En pratique</h3><p>' + esc(L.why) + '</p>' : ''}
    \${L.badExample ? '<h3>❌ Mauvais</h3><pre class="bad">' + esc(L.badExample) + '</pre>' : ''}
    \${L.goodExample ? '<h3>✅ Mieux</h3><pre class="good">' + esc(L.goodExample) + '</pre>' : ''}
    \${L.reference ? '<h3>Référence</h3><p class="ref">' + esc(L.reference) + '</p>' : ''}
  \`;
}
</script>
</body>
</html>`;
}

export { SEV_COLORS };
