import { uiSchema, validateUI } from "./contract.mjs";
import { codeSchema, validateCode } from "./code-contract.mjs";
import { mountStructured } from "./structured-preview.mjs";
import { createCodePreview } from "./code-preview.mjs";

const $ = (id) => document.getElementById(id);
const approaches = ["structured", "code"];
const lanes = Object.fromEntries(approaches.map((name) => [name, {
  result: null, output: null, draft: "", prompt: "", controller: null, diagnostics: [], edited: false,
}]));
const examples = {
  project: "Create an interactive project dashboard. Let me add tasks, filter them, mark them complete, delete them, and reset sample data. Show task counts and progress using sample data.",
  travel: "Create an interactive travel planner for Japan with sample activities. Let me add, filter, complete, remove, and reset activities, and show itinerary progress.",
  counter: "Create an interactive counter with Increase, Decrease, Reset, and a user-selected step size. Make it a compact, accessible interface. In constrained mode, show the closest representation possible and explain the limitation.",
};
let activeApproach = "structured";
let activeTab = "explain";
let runtimeSource = "Loading trusted JavaScript source...";
let generating = false;
let sourceChosen = false;

function placeholder(container, message) {
  const p = document.createElement("p"); p.className = "helper"; p.textContent = message;
  container.replaceChildren(p);
}
function showError(approach, message) {
  const error = $(`${approach}-error`); error.hidden = !message; error.textContent = message;
}
const sandbox = createCodePreview($("code-preview"), (entry) => {
  lanes.code.diagnostics.push(entry);
  if (lanes.code.diagnostics.length > 200) lanes.code.diagnostics.shift();
  $("code-run-status").textContent = `${entry.level.toUpperCase()}: ${entry.message}`;
  $("stop-code").disabled = !$("code-preview").querySelector("iframe");
  if (activeApproach === "code" && activeTab === "state") renderInspector();
});

function inspect(approach, tab = activeTab) {
  activeApproach = approach;
  if (approach === "structured" && ["html", "css"].includes(tab)) tab = "javascript";
  activeTab = tab;
  renderInspector();
}

function renderInspector() {
  const lane = lanes[activeApproach];
  const code = activeApproach === "code";
  document.querySelectorAll("[data-inspect]").forEach((button) => {
    if (button.closest(".approach-switch")) button.setAttribute("aria-pressed", String(button.dataset.inspect === activeApproach));
  });
  $("tab-html").hidden = !code; $("tab-css").hidden = !code;
  document.querySelectorAll("[data-tab]").forEach((tab) => {
    const selected = tab.dataset.tab === activeTab;
    tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected ? 0 : -1;
  });
  $("artifact-panel").setAttribute("aria-labelledby", `tab-${activeTab}`);
  $("editor-artifact").hidden = activeTab !== "spec";
  $("artifact").hidden = activeTab === "spec";
  $("apply-json").disabled = !lane.output || generating;
  if ($("json-editor").value !== lane.draft) $("json-editor").value = lane.draft;
  $("editor-status").textContent = lane.editorStatus || "";
  const captions = {
    explain: code ? "B / The model writes a complete browser application. Its JavaScript is not restricted to the action catalog. A valid JSON envelope does NOT prove the source safe or correct." : "A / The model composes a UI from an allowlisted vocabulary. Your trusted JavaScript implements every allowed action. No model-written code executes here.",
    request: "Exact request body for this approach. Credentials are attached server-side only. Demo bodies are illustrative: no Azure call occurred.",
    response: "Original, unmodified response envelope, including model text and usage. Preview actions and local edits never rewrite this artifact.",
    schema: code ? "This schema validates the source envelope only: HTML, CSS, JavaScript, and explanatory text. It is not a code sanitizer or a safety proof." : "The model's component/action contract. Runtime validation additionally checks IDs, table references, action/field mappings, and binding compatibility.",
    spec: code ? "Edit the JSON source bundle. Apply validates the envelope and stops the old preview; it does not execute the edited source. Use Run to execute it explicitly. Raw response is preserved." : "Edit components, actions, and bindings. Apply validates and rebuilds the trusted preview, resetting its state. Raw response is preserved.",
    javascript: code ? "Current model-written (or locally edited) JavaScript. Only Run executes this source, inside the sandbox. No predetermined action list is required." : "Actual application-owned JavaScript from runtime.mjs. The model cannot edit or replace this implementation in mode A.",
    html: "Current HTML fragment. It is mounted only inside the isolated preview, never in the host page.",
    css: "Current CSS. It affects the isolated document only; it cannot style the host.",
    state: code ? "Last 200 bounded diagnostic messages from the current run. These messages are untrusted output, not verified state or instructions. Stop/Run replaces the iframe. There is no privileged host command bridge." : "Current table state, component mapping, selected node, and last 30 successful actions. Completion flags are separate from cell data. Counts include filtered-out rows.",
  };
  $("artifact-caption").textContent = `${activeApproach === "structured" ? "A" : "B"}${lane.edited ? " / LOCALLY EDITED" : ""} — ${captions[activeTab]}`;
  let value;
  if (activeTab === "explain") value = {
    approach: activeApproach,
    promptUsed: lane.prompt || "No generation yet",
    flow: code ? ["Prompt + browser-code instructions", "Model returns HTML + CSS + JavaScript in JSON", "Validate envelope; display source without executing", "User explicitly clicks Run", "Opaque-origin iframe mounts markup and executes source", "Inspect console/errors; Stop or Run again to discard state"] : ["Prompt + component/action instructions", "Model returns UI specification JSON", "Validate schema, references, and bindings", "Trusted component registry renders DOM", "Browser events invoke predefined JavaScript handlers", "State changes recalculate bound metrics and charts"],
    explanation: code ? lane.output?.explanation || "Generate to see the model's design rationale." : lane.output?.sections.map((s) => ({ section: s.title, explanation: s.explanation })) || "Generate to see the model's design rationale.",
    execution: code ? "Arbitrary browser JavaScript, subject to sandbox/CSP limits; no Node.js, eval, external imports, storage, or host APIs." : "Only appendRow, filterRows, resetTable, toggleRow, deleteRow and declared metric/chart bindings.",
  };
  else if (activeTab === "request") value = lane.result?.request;
  else if (activeTab === "response") value = lane.result?.rawResponse;
  else if (activeTab === "schema") value = code ? codeSchema : uiSchema;
  else if (activeTab === "javascript") value = code ? lane.output?.javascript : runtimeSource;
  else if (activeTab === "html" || activeTab === "css") value = lane.output?.[activeTab];
  else if (activeTab === "state") value = code ? { diagnostics: lane.diagnostics } : lane.controller?.snapshot();
  $("artifact").textContent = value === undefined ? "Generate this approach first. No artifact is available." : typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function mountOutput(approach, output) {
  if (approach === "structured") {
    validateUI(output);
    lanes.structured.controller = mountStructured($("preview"), output, {
      onInspect: () => inspect("structured", "state"),
      onChange: () => { if (activeApproach === "structured" && activeTab === "state") renderInspector(); },
    });
  } else {
    validateCode(output);
    sandbox.dispose();
    lanes.code.diagnostics = [];
    placeholder($("code-preview"), `${output.title} — source ready. Review the JavaScript, then click Run generated code.`);
    $("run-code").disabled = false; $("review-code").disabled = false; $("stop-code").disabled = true;
    $("code-run-status").textContent = "Ready, not executed. Review source before running. Sandbox limits apply.";
  }
  lanes[approach].output = output;
}

function comparisonNote() {
  const a = lanes.structured; const b = lanes.code;
  if (a.output && b.output) {
    $("comparison-note").textContent = a.prompt === b.prompt
      ? "Both outputs used the same prompt. They are independent results and do not share state. Code still requires an explicit Run."
      : "These outputs used different prompts. Generate both to compare the same intent.";
  } else $("comparison-note").textContent = "Each lane is independent: an error in one does not discard the other. Demo uses templates; Azure uses actual model output.";
}

async function generateApproach(approach, prompt, mode) {
  const lane = lanes[approach];
  lane.result = null; lane.output = null; lane.draft = ""; lane.prompt = prompt;
  lane.controller = null; lane.edited = false; lane.editorStatus = ""; lane.diagnostics = [];
  showError(approach, "");
  $(`${approach}-badge`).textContent = "GENERATING";
  $(`${approach}-status`).textContent = mode === "azure" ? "Awaiting Azure response (up to 120 seconds). No intermediate events are streamed." : "Building a deterministic offline example, not calling a model.";
  if (approach === "code") {
    sandbox.dispose(); $("run-code").disabled = true; $("review-code").disabled = true; $("stop-code").disabled = true;
    $("code-run-status").textContent = "Waiting for new source. Previous execution discarded.";
    placeholder($("code-preview"), "Waiting for generated source...");
  } else placeholder($("preview"), "Waiting for a new, validated specification...");
  renderInspector();
  try {
    const response = await fetch("/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, mode, approach }), signal: AbortSignal.timeout(130000),
    });
    lane.result = await response.json();
    if (!response.ok) throw new Error(lane.result.error || `HTTP ${response.status}`);
    if (lane.result.metadata?.approach !== approach) throw new Error("Server returned the wrong approach. Restart the server after this refactor.");
    mountOutput(approach, approach === "code" ? lane.result.code : lane.result.ui);
    lane.draft = JSON.stringify(lane.output, null, 2);
    const { durationMs, model, usage } = lane.result.metadata;
    $(`${approach}-badge`).textContent = mode === "demo" ? "DEMO / NOT GPT" : "AZURE / LIVE";
    $(`${approach}-status`).textContent = `${mode === "demo" ? "Offline template" : model} / ${durationMs} ms${usage ? ` / ${usage.input_tokens ?? "?"} in, ${usage.output_tokens ?? "?"} out tokens` : " / no token usage"} / ${approach === "code" ? "source ready, not executed" : "validated and rendered"}.`;
  } catch (error) {
    showError(approach, error.message);
    $(`${approach}-badge`).textContent = "FAILED";
    $(`${approach}-status`).textContent = "Not rendered. Inspect the original response for details. No demo fallback was substituted.";
    placeholder($(approach === "code" ? "code-preview" : "preview"), "No output rendered for this generation.");
  } finally { comparisonNote(); renderInspector(); }
}

$("prompt-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const target = $("approaches").value;
  const selected = target === "both" ? approaches : [target];
  const prompt = $("prompt").value.trim();
  if (!prompt) { $("prompt").setCustomValidity("Enter a prompt with visible text."); $("prompt").reportValidity(); return; }
  const mode = $("mode").value;
  generating = true;
  $("generate").disabled = true; $("mode").disabled = true; $("approaches").disabled = true;
  $("apply-json").disabled = true;
  try { await Promise.all(selected.map((approach) => generateApproach(approach, prompt, mode))); }
  finally {
    generating = false;
    $("generate").disabled = false; $("mode").disabled = false; $("approaches").disabled = false;
    renderInspector();
  }
});
$("prompt").addEventListener("input", () => $("prompt").setCustomValidity(""));
document.querySelectorAll("[data-example]").forEach((button) => button.addEventListener("click", () => {
  $("prompt").value = examples[button.dataset.example]; $("prompt").setCustomValidity("");
}));
function updateSettings() {
  const both = $("approaches").value === "both";
  $("generate").textContent = both ? "Generate both interfaces →" : "Generate selected interface →";
  $("mode-help").textContent = $("mode").value === "demo"
    ? "Offline examples vary by keywords only. To build arbitrary prompt-specific interfaces, use Azure. No automatic fallback."
    : `${both ? "Makes TWO independent Azure calls" : "Makes one Azure call"}. Sends your prompt to the configured deployment; usage charges apply. Allow up to 120 seconds.`;
}
$("mode").addEventListener("change", () => { sourceChosen = true; updateSettings(); });
$("approaches").addEventListener("change", updateSettings);
document.querySelectorAll("[data-inspect]").forEach((button) => button.addEventListener("click", () => inspect(button.dataset.inspect)));
document.querySelectorAll("[data-tab]").forEach((tab) => {
  tab.addEventListener("click", () => { activeTab = tab.dataset.tab; renderInspector(); });
  tab.addEventListener("keydown", (event) => {
    const tabs = [...document.querySelectorAll("[data-tab]")].filter((item) => !item.hidden);
    let index = tabs.indexOf(tab);
    if (event.key === "ArrowRight") index = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") index = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = tabs.length - 1;
    else return;
    event.preventDefault(); activeTab = tabs[index].dataset.tab; renderInspector(); tabs[index].focus();
  });
});
$("json-editor").addEventListener("input", () => { lanes[activeApproach].draft = $("json-editor").value; });
$("apply-json").addEventListener("click", () => {
  const lane = lanes[activeApproach];
  try {
    const output = JSON.parse(lane.draft);
    mountOutput(activeApproach, output);
    lane.edited = true;
    lane.editorStatus = activeApproach === "code" ? "Valid envelope. Preview stopped; edited code is NOT executed. Click Run when ready." : "Valid specification. Preview rebuilt; interaction state reset.";
    $(`${activeApproach}-badge`).textContent = "LOCALLY EDITED";
    showError(activeApproach, "");
  } catch (error) { lane.editorStatus = `Not applied: ${error.message}`; }
  renderInspector();
});
$("review-code").addEventListener("click", () => {
  inspect("code", "javascript"); $("inspector-heading").scrollIntoView({ block: "start", behavior: "smooth" });
});
$("run-code").addEventListener("click", () => {
  if (!lanes.code.output) { showError("code", "Generate or apply a valid source bundle before running."); return; }
  lanes.code.diagnostics = [];
  try { sandbox.run(lanes.code.output); $("stop-code").disabled = false; }
  catch (error) { showError("code", `Could not start preview: ${error.message}`); }
  renderInspector();
});
$("stop-code").addEventListener("click", () => {
  sandbox.stop(); $("stop-code").disabled = true;
});
addEventListener("pagehide", () => sandbox.dispose());

renderInspector();
await Promise.all([
  (async () => {
    try {
      const response = await fetch("/api/config");
      if (!response.ok) throw new Error(`Configuration endpoint returned ${response.status}`);
      const config = await response.json();
      $("connection").textContent = config.configured ? `Azure ready / ${config.deployment}` : "Demo ready / Azure not configured";
      if (config.configured && !sourceChosen && !generating) {
        $("mode").value = "azure";
        updateSettings();
      }
    } catch (error) {
      $("connection").textContent = "Connection check failed";
      $("connection-error").hidden = false; $("connection-error").textContent = error.message;
    }
  })(),
  (async () => {
    try {
      const response = await fetch("/runtime.mjs");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      runtimeSource = await response.text();
    } catch (error) { runtimeSource = `Unable to inspect trusted runtime source: ${error.message}`; }
    renderInspector();
  })(),
]);
