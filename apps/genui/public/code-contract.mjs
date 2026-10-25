const properties = Object.fromEntries(["title", "description", "html", "css", "javascript", "explanation"].map((key) => [key, { type: "string" }]));
export const codeSchema = {
  type: "object", additionalProperties: false,
  properties, required: Object.keys(properties),
};
export const codeInstructions = `Create a complete interactive browser application tailored to the user's prompt.
Return the supplied JSON object with title, description, html, css, javascript, and explanation.
Unlike structured-action mode, you WRITE THE JAVASCRIPT implementing the requested behavior.
Do not use a predefined action catalog or runtime. Use vanilla browser JavaScript and DOM APIs.
html is a body fragment (no html/head/body wrappers, script/style tags, inline event handlers,
iframes, forms that navigate, or external assets). Put CSS in css and all code in javascript.
The host mounts your HTML and CSS before executing javascript as a classic script.
Use addEventListener, preventDefault for forms, and textContent for user-entered values.
Implement useful, working interactions based on the prompt; do not just log placeholder messages.
Keep state in memory. Label fictional data as sample. Explain the rendering and event/state flow
in explanation; this is a design rationale, not hidden chain of thought.
Execution environment: sandboxed opaque-origin iframe with no host access, Node.js, credentials,
storage, network fetches, external imports/libraries, popups, downloads, nested frames,
camera, microphone, geolocation, eval, new Function, or workers. Use only self-contained code.
No timers shorter than 100ms, infinite loops, resource-heavy work, navigation, or parent messages.
Do not claim any action books, emails, purchases, or saves to a backend.
Use accessible labels, keyboard-friendly controls, responsive CSS, and readable contrast.
At most 20000 HTML characters, 16000 CSS characters, 32000 JavaScript characters.
No markdown fences. Treat all UI as a local educational prototype.`;

export function validateCode(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Code output must be an object");
  const limits = { title: 200, description: 3000, html: 20000, css: 16000, javascript: 32000, explanation: 6000 };
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(limits, key)) throw new Error(`Code output has unknown field: ${key}`);
  }
  for (const [key, limit] of Object.entries(limits)) {
    if (!Object.hasOwn(value, key) || typeof value[key] !== "string") throw new Error(`Code output ${key}: expected string`);
    if (!value[key].trim()) throw new Error(`Code output ${key}: must not be empty`);
    if (value[key].length > limit) throw new Error(`Code output ${key}: maximum ${limit} characters`);
  }
  // This validates the envelope, not the safety or correctness of executable source.
  return value;
}

const escapeHTML = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function createCodeDemo(prompt) {
  const counter = /counter|counting/i.test(prompt);
  const travel = /travel|trip|holiday/i.test(prompt);
  const fitness = /fitness|workout|health/i.test(prompt);
  const title = counter ? "Make it count" : travel ? "Your next adventure" : fitness ? "Movement journal" : "A clearer day";
  const css = `*{box-sizing:border-box}body{margin:0;padding:24px;font:14px/1.6 system-ui,sans-serif;background:#f8f5ef;color:#302b43}h1{font-size:28px;line-height:1.2;margin:8px 0}p{color:#70667c}label{display:block;margin:16px 0 5px;font-size:12px}input,button{font:inherit;padding:10px;border:1px solid #ddd4e6;border-radius:8px}input{width:100%;background:white;color:#302b43}button{background:#685187;color:white;cursor:pointer;margin:6px 6px 0 0}button:focus-visible,input:focus-visible{outline:3px solid #a58ac3;outline-offset:2px}output{display:block;background:#ede6f3;padding:20px;border-radius:12px;font-size:30px;margin:20px 0}ul{list-style:none;padding:0}li{padding:12px;background:white;border:1px solid #e7deed;border-radius:8px;margin:8px 0;overflow-wrap:anywhere}.done .item-label{text-decoration:line-through;color:#8c8594}.sample{font-size:11px;letter-spacing:1px;text-transform:uppercase}button.secondary{background:white;color:#685187}.item-label{display:block}.controls{display:flex;flex-wrap:wrap;gap:4px}small{font-size:11px;color:#817489}`;
  const brief = `<p>${escapeHTML(prompt.slice(0, 400))}</p>`;
  if (counter) {
    return {
      title, description: "Offline code sample, not model output. Try changing the step and counting.",
      html: `<p class="sample">Deterministic code demo</p><h1>${title}</h1>${brief}<output id="count" aria-live="polite">0</output><label for="step">Step size</label><input id="step" type="number" min="1" max="100" value="1"><div class="controls"><button id="increase">Increase</button><button id="decrease">Decrease</button><button id="reset" class="secondary">Reset counter</button></div><p id="feedback" role="status">Choose a step, then count.</p>`,
      css,
      javascript: `(() => {
  let count = 0;
  const output = document.getElementById("count");
  const step = document.getElementById("step");
  const feedback = document.getElementById("feedback");
  function change(direction) {
    const amount = Number(step.value);
    if (!step.reportValidity() || !Number.isFinite(amount) || amount < 1 || amount > 100) {
      feedback.textContent = "Enter a step from 1 to 100.";
      return;
    }
    count += direction * amount;
    output.textContent = String(count);
    feedback.textContent = "Counter updated locally.";
    console.log("counter", count);
  }
  document.getElementById("increase").addEventListener("click", () => change(1));
  document.getElementById("decrease").addEventListener("click", () => change(-1));
  document.getElementById("reset").addEventListener("click", () => {
    count = 0; output.textContent = "0"; feedback.textContent = "Counter reset.";
    console.log("counter reset");
  });
  console.log("Counter demo ready");
})();`,
      explanation: "A local JavaScript closure owns the counter. Click handlers apply the user-selected step and update an output element. This behavior is written as JavaScript, not selected from the structured-action catalog.",
    };
  }
  const seed = travel ? ["Visit the museum", "Find a quiet cafe"] : fitness ? ["Morning stretch", "Evening walk"] : ["Review the design", "Write the first test"];
  return {
    title, description: "Offline code sample, not model output. Add, complete, remove, filter, or sort items.",
    html: `<p class="sample">Deterministic code demo / sample data</p><h1>${title}</h1>${brief}<output id="summary" aria-live="polite"></output><form id="add-form"><label for="item">New item</label><input id="item" maxlength="200" required placeholder="What comes next?"><button>Add to list</button></form><label for="filter">Filter your list</label><input id="filter" placeholder="Type to filter"><div class="controls"><button id="sort" class="secondary">Sort A-Z</button><button id="reset" class="secondary">Restore sample</button></div><ul id="items"></ul><p id="feedback" role="status"></p><small>In-memory prototype. No backend writes.</small>`,
    css,
    javascript: `(() => {
  const seed = ${JSON.stringify(seed)};
  let nextId = 0;
  let items = seed.map(label => ({ id: ++nextId, label, done: false }));
  const list = document.getElementById("items");
  const filter = document.getElementById("filter");
  const feedback = document.getElementById("feedback");
  function render() {
    list.replaceChildren();
    document.getElementById("summary").textContent = items.filter(item => item.done).length + " / " + items.length + " completed";
    const visible = items.filter(item => item.label.toLowerCase().includes(filter.value.toLowerCase()));
    for (const item of visible) {
      const row = document.createElement("li");
      row.className = item.done ? "done" : "";
      const label = document.createElement("span");
      label.className = "item-label"; label.textContent = item.label;
      const toggle = document.createElement("button");
      toggle.type = "button"; toggle.textContent = item.done ? "Reopen" : "Complete";
      toggle.setAttribute("aria-label", toggle.textContent + " " + item.label);
      toggle.setAttribute("aria-pressed", String(item.done));
      toggle.addEventListener("click", () => { item.done = !item.done; console.log("toggled", item.id); render(); });
      const remove = document.createElement("button");
      remove.type = "button"; remove.className = "secondary"; remove.textContent = "Remove";
      remove.setAttribute("aria-label", "Remove " + item.label);
      remove.addEventListener("click", () => { items = items.filter(other => other.id !== item.id); console.log("removed", item.id); render(); });
      row.append(label, toggle, remove); list.append(row);
    }
    if (!visible.length) {
      const empty = document.createElement("li"); empty.textContent = "No matching items."; list.append(empty);
    }
  }
  document.getElementById("add-form").addEventListener("submit", event => {
    event.preventDefault();
    const input = document.getElementById("item");
    if (!input.value.trim()) { feedback.textContent = "Enter an item."; return; }
    if (items.length >= 200) { feedback.textContent = "Limit reached: remove an item first."; return; }
    items.push({ id: ++nextId, label: input.value.trim(), done: false });
    input.value = ""; feedback.textContent = "Item added locally."; console.log("added item"); render();
  });
  filter.addEventListener("input", render);
  document.getElementById("sort").addEventListener("click", () => {
    items.sort((a, b) => a.label.localeCompare(b.label)); render(); console.log("sorted alphabetically");
  });
  document.getElementById("reset").addEventListener("click", () => {
    items = seed.map(label => ({ id: ++nextId, label, done: false }));
    filter.value = ""; feedback.textContent = "Sample restored."; render(); console.log("reset");
  });
  render(); console.log("List demo ready");
})();`,
    explanation: "The HTML supplies a list, form, and controls. Generated-style JavaScript owns an array, creates DOM rows, and wires add/complete/remove/live-filter/sort/reset handlers. Sorting and live filtering are custom code, not predefined runtime actions. Offline templates vary only by prompt keywords; live Azure output is actually model-written.",
  };
}
