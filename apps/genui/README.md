# GenUI Lab: two architectures, one prompt

A dependency-free JavaScript learning workbench comparing two ways to generate an interactive UI with **Azure OpenAI**:

| | A: Defined functions | B: Generated JavaScript |
|---|---|---|
| Model output | Components, content, actions, and bindings as JSON | HTML, CSS, and JavaScript inside a JSON source envelope |
| Behavior | The model composes predefined actions | The model writes new browser logic |
| Rendering | Trusted DOM component registry | HTML/CSS mounted in a sandboxed document |
| Execution | Trusted JavaScript state runtime | Explicit Run executes model-written JavaScript |
| Inspection | Request, response, schema, runtime source, component mappings, state/action history | Request, response, schema, HTML/CSS/JS source, console, errors, CSP diagnostics |

In **live Azure mode**, both interfaces are created from the user's prompt in separate model calls with different instructions and schemas. Both use the configured deployment; these are two architectures, not necessarily two different GPT models. They do not share preview state.

In **Demo mode**, deterministic templates vary by prompt keywords (project, travel, fitness; plus a custom counter in code mode). Demo is **not GPT output** and does not synthesize arbitrary applications. Use Azure for actual prompt-driven generation. Failed Azure calls never silently fall back to Demo.

## Start and restart

Requires Node.js 22.9+ (tested on Node 24). No dependency installation is needed.

```powershell
Set-Location C:\Temp\genui
npm start
```

Open http://127.0.0.1:3000. To restart, press **Ctrl+C** in the server terminal, then run `npm start` again and reload the page. Restarting is necessary after server changes, including this refactor, or environment changes.

## Connect Azure OpenAI

1. Deploy a GPT model that supports the **Responses API** and **strict structured outputs** in your region.
2. Copy the template:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Edit `.env` locally with `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, and `AZURE_OPENAI_DEPLOYMENT`. Use the **deployment name**, not necessarily the model ID. Do not paste keys into prompts, generated code, or chat.
4. Restart, choose **Azure OpenAI / live model**, and generate one or both approaches. When Azure is configured, it is selected initially unless you have already chosen a source.

Use your latest compatible deployed GPT model; the app does not hardcode a universal "latest". API-key authentication is implemented; Entra-only resources need a separate authentication extension.

**Generate both makes two independent, billable Azure requests.** Each sends your prompt, the relevant instructions, and schema to your configured deployment. The original request and response for each lane remain independently inspectable. An error in one lane does not discard a successful result in the other.

The server posts to `https://YOUR-RESOURCE.openai.azure.com/openai/v1/responses`, attaches `api-key` server-side, and sets `store: false`. The resource root and `/openai/v1/` endpoint forms are accepted; no API-version query is needed for this v1 route. There is a 120-second upstream timeout and separate output-token budgets (8000 structured, 12000 code). Incomplete output, refusals, bad JSON, schema failures, and Azure errors are surfaced explicitly.

No key is returned to the browser or passed into the sandbox. Responses are not saved to disk by this app. `store: false` is not a guarantee about provider abuse-monitoring retention; review your organization's policies before sending sensitive data.

## Walkthrough

1. Enter **one shared prompt** or select an example.
2. Choose a generation source and **Both**, **A only**, or **B only**.
3. Generate. A validates and renders automatically; B displays source-ready status but **does not execute**.
4. In A, use forms and row controls. Select a component to inspect its JSON path and mapping.
5. In B, select **Review JavaScript**, inspect HTML/CSS too, then explicitly choose **Run generated code**. The frame is built fresh for every Run.
6. Switch **A / Defined functions** and **B / Generated JavaScript** in the inspector:
   - **How it works:** prompt used, pipeline, and design rationale (not private chain of thought).
   - **API request:** the exact request body, with no credentials.
   - **Raw response:** the complete original provider envelope, including `output[].content[].text` and usage if present.
   - **Schema:** the different contracts supplied in `text.format`.
   - **Output editor:** modify the selected JSON output without another model call. Each lane retains its own draft. Applying A resets trusted runtime state; applying B stops execution and stages the edited source for another explicit Run.
   - **JavaScript:** A shows the actual application-owned runtime implementation; B shows the current model-written (or locally edited) source.
   - **HTML / CSS:** B's current source only.
   - **State & execution:** A's mapping and state/action history, or B's bounded console/error/policy diagnostics.
7. **Stop** removes B's iframe and discards its document, handlers, timers, and in-memory state. Running it again starts fresh.

Original model responses are not changed by local edits or interactions. When separately generated outputs use different prompts, the workbench warns that they are not a same-prompt comparison.

## A: constrained action composition

`public/contract.mjs` defines and validates the component/action vocabulary. `public/structured-preview.mjs` renders trusted elements; `public/runtime.mjs` owns state.

- `appendRow`: form field keys map to target table columns in the declared order.
- `filterRows`: case-insensitive substring matching across cells. Empty input clears it.
- `toggleRow`: change a separate completion flag, initially false.
- `deleteRow`: remove a row by stable ID, not displayed index.
- `resetTable`: restore initial rows and clear completion and filtering.
- Metric `rowCount` / `completedCount` bindings and chart `completionSummary` bindings derive values from the target table, including filtered-out rows.

Example model-composed action:

```json
{
  "action": {
    "type": "appendRow",
    "targetId": "schedule",
    "fieldKeys": ["item", "when"]
  }
}
```

The target must exist and be a table with two columns; the form must declare both field keys. Every component includes `action`, `binding`, and `rowActions`, using `none` / empty values when unused. Unsupported actions, invalid references, duplicate IDs, incompatible bindings, malformed rows, and incorrect field mappings are rejected.

There is a 200-row runtime limit per table and 3000-character input limit. State survives inspection/tab changes, but not reload, regeneration, or applying edited JSON. Interactions do not call Azure or save to a backend. New behaviors require a contract, validator, runtime, and renderer extension.

## B: model-written browser code

`public/code-contract.mjs` asks for:

```json
{
  "title": "Application title",
  "description": "What it does",
  "html": "<button id=\"count\">Count: 0</button>",
  "css": "button { padding: 12px; }",
  "javascript": "let count = 0; document.getElementById('count').addEventListener('click', event => { event.target.textContent = 'Count: ' + (++count); });",
  "explanation": "A local variable and click handler implement the counter."
}
```

These strings are **data on the server**; Node never executes them. The validator checks required fields, string types, unknown fields, and limits (HTML 20000, CSS 16000, JavaScript 32000 characters), **not whether the code is safe or correct**. A valid envelope can still contain syntax errors, broken logic, or hostile code.

### Execution sequence

1. A user explicitly clicks **Run**.
2. `public/code-preview.mjs` creates an iframe with `sandbox="allow-scripts allow-forms"` and **no** `allow-same-origin`. `allow-forms` permits local submit events to reach JavaScript handlers; CSP `form-action 'none'` still blocks actual submissions.
3. `/sandbox` serves a **trusted bootstrap only**, using a fresh script nonce and a restrictive **HTTP-header** Content Security Policy. The header also includes `sandbox allow-scripts allow-forms`, so the bootstrap document is opaque-origin even if opened directly.
4. On the initial frame load, the host transfers a dedicated `MessagePort` and **only HTML/CSS/JavaScript**. The bootstrap validates the initialization message's parent source and origin.
5. The bootstrap mounts HTML inside that isolated document, creates a stylesheet from CSS, then executes the JavaScript as a classic script via a nonce-bearing script element. Generated code is never interpolated into the bootstrap HTML, evaluated by the host, or executed on the server. HTML fragment script tags are inert; inline handlers are blocked.
6. Console output, errors, rejected promises, CSP violations, and heartbeats travel back over the port. The host accepts only bounded diagnostic shapes, renders messages as text, caps history at 200, and rate-limits diagnostic display. There are **no privileged host commands**.

The model writes vanilla browser JavaScript, not Node.js. It can invent behaviors without adding them to A's catalog. External imports, `eval`, `new Function`, workers, nested frames, external resources, and network fetches are intentionally unavailable. The model is instructed to keep data in memory and avoid navigation.

### Important safety limits

This is a **local educational preview, not a production hostile-code execution service**:

- Opaque-origin isolation blocks access to the host DOM and origin storage. The sandbox receives no keys, provider envelopes, or privileged APIs.
- Sandbox flags omit navigation-to-top, same-origin, popups, downloads, and modals. Local form events are allowed, but CSP blocks actual form submissions. Permission policies disable sensitive device capabilities.
- CSP blocks network fetches, external scripts/styles/images, workers, child frames, objects, form submissions, and base-URL injection. Local `data:` / `blob:` image/media resources and inline CSS are allowed.
- **CSP is not a complete network firewall.** Self-navigation may issue an external request before the host detects a second frame load and removes it. Link clicks are prevented by the bootstrap, but arbitrary code can try other navigation paths. Do not put sensitive data in prompts or code you execute.
- **CPU and memory are not hard-limited.** A best-effort 8-second heartbeat watchdog removes unresponsive previews when the host remains responsive. An infinite loop can still freeze the tab or prevent the watchdog/Stop button from running. Reload or close the tab if needed.
- Generated code can alter its own document and spoof its own diagnostic output. Console messages and design rationales are not verified facts or security evidence.
- For public/multi-user or truly adversarial execution, use a separate browser process/container, strict egress controls, disposable filesystem, and enforced resource/time budgets.

Do not weaken the sandbox to enable host access or supply credentials to generated code.

## API and modules

`POST /api/generate` accepts `{ "prompt": "...", "mode": "demo" | "azure", "approach": "structured" | "code" }`. Omitting `approach` preserves the original structured API. Success returns `ui` for A or `code` for B, alongside `request`, `rawResponse`, `outputText`, and `metadata` (including approach). Code is never returned as host executable content.

- `server.mjs`: loopback HTTP server, allowlisted assets, approach routing, Azure call, response validation.
- `sandbox-document.mjs`: nonce-bearing bootstrap and per-document sandbox/CSP header.
- `public/contract.mjs`, `public/runtime.mjs`, `public/structured-preview.mjs`: constrained contract, state, and renderer.
- `public/code-contract.mjs`, `public/code-preview.mjs`: code contract, offline templates, and sandbox lifecycle.
- `public/app.mjs`: comparison orchestration, independent artifacts/drafts, and inspector.
- `public/index.html`, `public/style.css`: responsive workbench.
- `test/app.test.mjs`, `test/runtime.test.mjs`, `test/code.test.mjs`: HTTP, schema, action, isolation-policy, and bootstrap tests.

The server binds to `127.0.0.1` and is not authenticated or rate-limited for public use. Do not expose it publicly without a separate deployment security review.

## Verify

```powershell
npm test
```

Tests use mock Azure responses and require no key. They cover both output contracts, same-prompt routing, independent failures, code-as-data server handling, strict sandbox headers/nonces, bootstrap syntax, and the existing interactive runtime. They do not prove arbitrary generated code safe or guarantee availability under CPU/memory attacks. Live Azure inference requires your resource and must be verified separately.

## References

- [Azure OpenAI Responses API](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses)
- [Azure OpenAI structured outputs](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs)
- [MDN: iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox)
- [MDN: CSP sandbox directive](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/sandbox)
