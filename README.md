# Metatron

<img width="200" height="200" alt="Metatron Logo" src="metatron-logo.svg" />


A stepwise, security-focused code generator CLI that forces an LLM to produce **one small verified step at a time**.

This project is intentionally minimal: a single Node.js script ([`metatron.js`](metatron.js)) that:
- asks you what you want to build,
- repeatedly requests the **next single critical step**,
- enforces a strict response format (**EXPLANATION / CODE / VERIFICATION**),
- accumulates generated code until you stop.

## What it does

When you run the CLI, it:
1. Prompts you to select an AI provider (Grok, Ollama, Groq, or Claude).
2. Prompts for your overall task (e.g. "PDF invoice generator from JSON cart").
3. Calls the selected AI provider's chat-completions API.
4. Requires the model to respond *only* as:

```
EXPLANATION: ...
CODE: ...
VERIFICATION: ...\n[step-XX verification]…
```

4. Parses those sections, appends the `CODE` snippet to a growing "full code" output, and appends the full step output to the running context so the next step has continuity.
5. On `stop`, prints the full accumulated code.

## Why this exists

Most "AI coding" workflows fail because they are:
- too big-bang (huge outputs you can't validate),
- too unstructured (no consistent format),
- too light on verification (no security/standards references).

Metatron's goal is to make generation **structured, incremental, and easier to audit**.

## Requirements

- Node.js 18+ (Node 20+ recommended)
- API key for cloud providers (Grok/Groq) or local Ollama installation

## Setup

Initialize the Node.js project and install dependencies:

```bash
npm init -y
npm pkg set type=module
npm i node-fetch
```

### API Keys (for cloud providers)

Set environment variables for your preferred provider(s):

**Grok (xAI):**
```bash
# Windows (cmd.exe)
set GROK_API_KEY=your_grok_key_here

# macOS/Linux
export GROK_API_KEY=your_grok_key_here
```

**Groq:**
```bash
# Windows (cmd.exe)
set GROQ_API_KEY=your_groq_key_here

# macOS/Linux
export GROQ_API_KEY=your_groq_key_here
```

**Ollama (Local):**
No API key needed, but you must have Ollama running locally:
```bash
# Install Ollama from https://ollama.ai/
# Pull a model (example)
ollama pull llama2
# Set model via environment variable (optional)
export OLLAMA_MODEL=llama2
```

## Run

```bash
node metatron.js
```

You'll see a prompt like:

- "Describe what you want to build…"
- Then step-by-step generation begins:
  - press **Enter** to request the next step
  - type **save** to save your current session to a file
  - type **stop** to print the full generated code
  - type **quit** to exit

## Session Management

Metatron supports saving and loading sessions to preserve your progress:

### Saving Sessions
During code generation, type `save` when prompted to save your current session to a JSON file.

### Loading Sessions
```bash
node metatron.js --session=metatron_session_1234567890123.json
```

This will resume exactly where you left off, including:
- Selected AI provider and configuration
- Current task and context
- Accumulated code and step count
- Full conversation history

## Supported AI Providers

**Grok (xAI):**
- Model: `grok-4`
- Endpoint: `https://api.x.ai/v1/chat/completions`
- Requires: `GROK_API_KEY` environment variable

**Ollama (Local):**
- Model: Configurable via `OLLAMA_MODEL` env var (default: `llama2`)
- Endpoint: `http://localhost:11434/v1/chat/completions`
- Requires: Ollama running locally, no API key needed

**Groq:**
- Model: `mixtral-8x7b-32768`
- Endpoint: `https://api.groq.com/openai/v1/chat/completions`
- Requires: `GROQ_API_KEY` environment variable

**Claude (Anthropic):**
- Model: `claude-3-sonnet-20240229`
- Endpoint: `https://api.anthropic.com/v1/messages`
- Requires: `CLAUDE_API_KEY` environment variable

## Configuration

In [`metatron.js`](metatron.js), provider configurations are handled dynamically in the `getProviderConfig()` function. You can modify the default models, endpoints, or add new providers by editing this function.

## Output format guarantees (and limits)

The system prompt forces the model to produce:
- a plain-English explanation of the step,
- the code for that single step,
- a verification hint (e.g., inline test/assertion + reference like OWASP/MDN/CVE).

If the model fails to follow the format, the parser will fall back to placeholder values, and the generated code for that step may be `// error` (see parsing in [`main()`](metatron.js:47)).

## Security notes

- **Secrets**: Your API key is used locally, but prompts and context are sent to the remote API provider. Don't paste sensitive secrets or proprietary code unless you accept that risk.
- **Verification is guidance, not proof**: References in `VERIFICATION` help auditing, but you still must run tests, static analysis, and security review yourself.
- **Prompt injection**: If you feed untrusted text into the task/context, the model can be influenced. Treat external inputs as hostile.

## Roadmap (ideas)

- Write a `package.json` and lockfile for reproducible installs.
- Add provider configuration via environment variables (endpoint/model).
- Save steps + full code to files.
- Add a "verification gate" that halts when a step can't be grounded in reliable sources (OWASP/MDN/CVE/etc.), explains what's happening, and asks the user targeted questions before continuing.
- Add an optional "strict verification" mode that rejects steps without a concrete reference (link/standard/CVE id) in `VERIFICATION`.
- Add a "verification gate" that requires you to confirm checks before continuing.
