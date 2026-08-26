# Metatron

<img width="200" height="200" alt="Metatron Logo" src="metatron-logo.svg" />

**AI Code Debugger & Learning Tutor** — Metatron analyzes your codebase, explains every
issue it finds *in plain language*, remembers your recurring mistakes, and helps you
stop making them.

Roadmap publique : [ROADMAP.md](ROADMAP.md)

## Why

Research shows LLM-generated code accumulates vulnerabilities with every unreviewed
iteration. Scanners give you a wall of warnings — Metatron turns each finding into a
**lesson**: what's wrong, why it matters, a bad/good example, and a reference.
It then tracks each error over time and flags **regressions** when a "fixed" issue
comes back.

## Install

Requires Node.js ≥ 18.

```bash
git clone https://github.com/LambdaSection/Metatron && cd Metatron && npm link
# or, once published:
npm install -g metatron
```

## Usage

```bash
# Analyze a whole codebase, get interactive lessons per error
metatron learn .

# Static scan only (exit code 1 on critical/high findings — CI friendly)
metatron analyze src/

# Run a file in a sandboxed child process with timeout + structured errors
metatron run script.js --timeout=5000

# Dashboard: recurring mistakes, fixed count, regressions
metatron progress

# Clickable HTML map of every error point (severity, recurrence, lessons)
metatron map --out=map.html
```

Directories are scanned recursively (`node_modules`, `.git`, build artifacts excluded).

## What it detects

21 static rules targeting bugs typical of AI-generated JavaScript:

- Hardcoded secrets / API keys (OpenAI, GitHub, AWS patterns)
- SQL & shell command injection, `eval`, `new Function`
- TLS verification bypass, CORS wildcards, insecure HTTP
- `Math.random()` used for tokens/sessions
- Empty catch blocks, `while(true)` without exit, unawaited promises
- Loose equality, `var`, debug leftovers, unresolved TODOs

Every rule ships with a built-in lesson in French (*quoi / pourquoi / exemple ❌✅ / référence*).
Run `metatron --help` for the full command surface.

## Memory & regression tracking

Each scan updates `.metatron/memory.json` (project-local):

| Status | Meaning |
|---|---|
| 🆕 New | first occurrence |
| 👀 Known | still present |
| 🔁 Recurring | seen 3+ times |
| 🚨 Regression | was fixed, came back |
| ✅ Fixed | gone during a scan covering its file |

`metatron progress` shows your top recurring mistakes so you know what to study next.

## Optional LLM layer

No API key needed for static analysis. With one configured, Metatron gets smarter:

```bash
export GROK_API_KEY=...     # or GROQ_API_KEY / CLAUDE_API_KEY / OLLAMA_MODEL

metatron analyze src/ --review   # adds semantic LLM review beyond regex rules
metatron learn src/app.js        # tutor mode: ask anything about YOUR code
```

The tutor answers in French, reasons over your analyzed files, and covers everything —
architecture, naming, design — not just detected errors.

## Not a security tool

Findings are heuristics; LLM output is guidance, not proof. Always review and test
your code. Metatron makes review *easier* — it doesn't remove the need for it.

## Legacy

The original stepwise generator (EXPLANATION / CODE / VERIFICATION with human gates)
is still available: `metatron gen`.

## License

See [LICENSE](LICENSE).
