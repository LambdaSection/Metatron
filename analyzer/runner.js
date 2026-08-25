import { spawn } from 'node:child_process';
import path from 'node:path';

/**
 * Execute a JS file in a child process with timeout, capturing all output.
 * @param {string} filePath
 * @param {{timeoutMs?: number}} options
 * @returns {Promise<{ok:boolean, exitCode:number|null, timedOut:boolean,
 *   durationMs:number, stdout:string, stderr:string, errors:Array<{name:string,message:string,line:number|null}>}>}
 */
export function runFile(filePath, { timeoutMs = 10000 } = {}) {
  return new Promise(resolve => {
    const absPath = path.resolve(filePath);
    const startedAt = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const proc = spawn(process.execPath, [absPath], {
      cwd: path.dirname(absPath),
      env: process.env,
      windowsHide: true,
      shell: false
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, timeoutMs);

    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });

    const finish = code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: !timedOut && code === 0,
        exitCode: code,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr,
        errors: parseErrors(stderr)
      });
    };

    proc.on('close', finish);
    proc.on('error', err => {
      stderr += `\nSpawn error: ${err.message}`;
      finish(null);
    });
  });
}

/**
 * Extract structured errors from a Node.js stderr trace.
 * @param {string} stderr
 * @returns {Array<{name:string,message:string,line:number|null}>}
 */
export function parseErrors(stderr) {
  if (!stderr || !stderr.trim()) return [];
  const errors = [];
  const lines = stderr.split(/\r?\n/);
  const errRe = /^([\w$]*(?:Error|Exception)):\s*(.*)$/;
  const stackRe = /:(\d+):\d+\)?\s*$/;

  for (const raw of lines) {
    if (raw.trim().startsWith('at ')) continue;
    const m = raw.match(errRe);
    if (m) {
      const stackLine = lines.find(l => l.trim().startsWith('at ') && stackRe.test(l));
      const lm = stackLine ? stackLine.match(stackRe) : null;
      errors.push({
        name: m[1],
        message: m[2].trim(),
        line: lm ? Number(lm[1]) : null
      });
    }
  }
  return errors;
}

/**
 * Format a runtime report as human-readable text.
 * @param {Object} result - result of runFile()
 * @returns {string[]}
 */
export function formatRunReport(result) {
  const out = [];
  if (result.timedOut) {
    out.push(`⏱️ TIMED OUT after ${result.durationMs}ms (possible infinite loop or blocking call)`);
  } else if (result.ok) {
    out.push(`✅ Exited cleanly in ${result.durationMs}ms (exit code 0)`);
  } else {
    out.push(`❌ Failed in ${result.durationMs}ms (exit code ${result.exitCode})`);
  }

  for (const e of result.errors) {
    out.push(`   ${e.name}: ${e.message}${e.line ? ` (line ~${e.line})` : ''}`);
  }

  if (result.stdout.trim()) {
    out.push('\n--- stdout ---');
    out.push(...result.stdout.trimEnd().split(/\r?\n/).map(l => `  ${l}`));
  }
  if (result.stderr.trim() && result.errors.length === 0) {
    out.push('\n--- stderr ---');
    out.push(...result.stderr.trimEnd().split(/\r?\n/).map(l => `  ${l}`));
  }
  return out;
}
