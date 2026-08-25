const SEVERITY_ICONS = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
  info: '⚪'
};

/**
 * Print a full analysis report to console.
 * @param {string} fileName
 * @param {{ok:boolean, error:string|null}} syntax
 * @param {Array} staticFindings
 * @param {{findings:Array}|null} llmReview - null if LLM layer skipped/failed
 */
export function printAnalyzeReport(fileName, syntax, staticFindings, llmReview) {
  console.log(`\n📋 Analysis: ${fileName}`);
  console.log('═'.repeat(60));

  if (!syntax.ok) {
    console.log('\n⛔ SYNTAX ERROR (node --check):');
    console.log(syntax.error.split(/\r?\n/).map(l => `   ${l}`).join('\n'));
    return;
  }
  console.log('✅ Syntax OK');

  const total = staticFindings.length;
  if (total === 0) {
    console.log('✅ Static rules: no findings');
  } else {
    console.log(`\n🔎 Static rules — ${total} finding(s):\n`);
    for (const f of staticFindings) {
      console.log(`${SEVERITY_ICONS[f.severity]} [${f.severity.toUpperCase()}] ${f.title} (${f.ruleId})`);
      console.log(`   ${fileName}:${f.line}:${f.column}`);
      console.log(`   │ ${f.excerpt}`);
      console.log(`   → ${f.advice}\n`);
    }
  }

  if (llmReview) {
    const n = llmReview.findings.length;
    if (n === 0) {
      console.log('🤖 LLM review: no additional findings');
    } else {
      console.log(`🤖 LLM review — ${n} finding(s):\n`);
      for (const f of llmReview.findings) {
        const sev = SEVERITY_ICONS[f.severity] ? f.severity : 'info';
        console.log(`${SEVERITY_ICONS[sev]} [${String(f.severity).toUpperCase()}] ${f.title}${f.line ? ` (line ${f.line})` : ''}`);
        if (f.explanation) console.log(`   ${f.explanation}`);
        if (f.suggestion) console.log(`   → ${f.suggestion}\n`);
      }
    }
  }
}

/**
 * Print severity summary and return exit code (1 if critical/high found).
 */
export function printSummary(staticFindings, llmReview) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of staticFindings) counts[f.severity]++;
  for (const f of (llmReview?.findings || [])) {
    const s = String(f.severity).toLowerCase();
    if (s in counts) counts[s]++;
  }

  console.log('─'.repeat(60));
  console.log(
    `Summary: ${counts.critical} critical · ${counts.high} high · ` +
    `${counts.medium} medium · ${counts.low} low · ${counts.info} info`
  );
  return counts.critical > 0 || counts.high > 0 ? 1 : 0;
}
