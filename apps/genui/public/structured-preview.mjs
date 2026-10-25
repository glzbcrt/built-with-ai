import { createRuntime } from "./runtime.mjs";

function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

export function mountStructured(container, specification, { onInspect, onChange }) {
  const runtime = createRuntime(specification);
  const components = new Map(specification.sections.flatMap((s) => s.components.map((c) => [c.id, c])));
  const trace = [];
  let selected = null;
  container.className = `preview theme-${specification.theme}`;
  container.replaceChildren(node("h2", "ui-title", specification.title), node("p", "ui-description", specification.description));
  const feedback = node("p", "action-feedback", "Actions update browser memory. Reload, regeneration, or applying JSON resets this interface.");
  feedback.setAttribute("role", "status");
  container.append(feedback);

  function interact(action, message, after = () => {}) {
    try {
      action(); after(); refresh();
      feedback.setAttribute("role", "status");
      feedback.textContent = `${message} No model or network call was needed.`;
      onChange();
    } catch (error) {
      feedback.setAttribute("role", "alert");
      feedback.textContent = `Action failed: ${error.message}`;
    }
  }
  const renderers = {
    text(c, card) { card.append(node("p", "", c.text)); },
    metric(c, card) { card.append(node("div", "metric-value", runtime.getMetric(c.id)), node("p", "", c.text)); },
    chart(c, card) {
      const bars = node("div", "bars");
      const items = runtime.getChart(c.id);
      const max = Math.max(1, ...items.map((item) => item.value));
      for (const item of items) {
        const row = node("div", "bar-row");
        const bar = node("progress");
        bar.max = max; bar.value = item.value;
        bar.setAttribute("aria-label", `${item.label}: ${item.value}`);
        row.append(node("span", "", item.label), bar, node("span", "", String(item.value)));
        bars.append(row);
      }
      card.append(bars);
    },
    table(c, card) {
      const wrap = node("div", "table-scroll");
      const table = node("table");
      table.setAttribute("aria-label", c.title);
      const head = node("thead"); const heading = node("tr");
      for (const column of [...c.columns, ...(c.rowActions.length ? ["Actions"] : [])]) {
        const th = node("th", "", column); th.scope = "col"; heading.append(th);
      }
      head.append(heading);
      const body = node("tbody");
      const state = runtime.getTable(c.id);
      for (const row of state.visibleRows) {
        const tr = node("tr", row.completed ? "row-completed" : "");
        row.cells.forEach((cell) => tr.append(node("td", "", cell)));
        if (c.rowActions.length) {
          const controls = node("td", "row-controls");
          for (const action of c.rowActions) {
            const toggle = action === "toggleRow";
            const label = toggle ? (row.completed ? "Reopen" : "Complete") : "Delete";
            const button = node("button", "row-action", label);
            button.type = "button"; button.dataset.rowId = row.id; button.dataset.action = action;
            button.setAttribute("aria-label", `${label} ${row.cells[0]}`);
            if (toggle) button.setAttribute("aria-pressed", String(row.completed));
            button.addEventListener("click", () => interact(() => runtime.rowAction(c.id, row.id, action), `${label} action applied.`));
            controls.append(button);
          }
          tr.append(controls);
        }
        body.append(tr);
      }
      if (!state.visibleRows.length) {
        const tr = node("tr");
        const td = node("td", "", state.rows.length ? "No matching items. Clear the filter to show all." : "No items yet. Add one with the form.");
        td.colSpan = c.columns.length + (c.rowActions.length ? 1 : 0); tr.append(td); body.append(tr);
      }
      table.append(head, body); wrap.append(table); card.append(wrap);
      card.append(node("p", "table-summary", `${state.visibleRows.length} of ${state.rows.length} items shown${state.query ? ` | Filter: ${state.query}` : ""}.`));
    },
    form(c, card, path) {
      const form = node("form");
      for (const [index, field] of c.fields.entries()) {
        const id = `structured-${path.replaceAll(/[^a-z0-9]/gi, "-")}-${index}`;
        const label = node("label", "", field.label); label.htmlFor = id;
        const input = node("input"); input.id = id; input.type = field.inputType; input.placeholder = field.placeholder;
        input.required = c.action.type === "appendRow"; input.maxLength = 3000; input.name = field.key;
        if (field.inputType === "number") input.step = "any";
        if (c.action.type === "filterRows") input.value = runtime.getTable(c.action.targetId).query;
        form.append(label, input);
      }
      const submit = node("button", "ui-button", c.action.type === "appendRow" ? "Add item" : "Apply filter");
      submit.type = "submit"; form.append(submit);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        interact(
          () => runtime.submit(c.id, Object.fromEntries(new FormData(form))),
          c.action.type === "appendRow" ? "Item added; bound values updated. An active filter can hide the new item." : "Filter applied; metrics still count all items.",
          () => { if (c.action.type === "appendRow") form.reset(); },
        );
      });
      card.append(form);
    },
    button(c, card) {
      const button = node("button", "ui-button", c.title);
      button.type = "button";
      button.addEventListener("click", () => interact(
        () => runtime.activate(c.id), "Original items restored; completion and filter cleared.",
        () => {
          container.querySelectorAll("form").forEach((form) => {
            const source = components.get(form.closest("[data-component-id]").dataset.componentId);
            if (source.action.type === "filterRows" && source.action.targetId === c.action.targetId) {
              form.querySelectorAll("input").forEach((input) => { input.value = ""; });
            }
          });
        },
      ));
      card.append(button);
      if (c.text) card.append(node("p", "", c.text));
    },
  };

  function refresh() {
    const focused = document.activeElement;
    const focusTable = focused?.closest("[data-component-id]")?.dataset.componentId;
    const focusRow = focused?.dataset.rowId;
    const focusAction = focused?.dataset.action;
    container.querySelectorAll("[data-component-id]").forEach((card) => {
      const c = components.get(card.dataset.componentId);
      if (!["table", "metric", "chart"].includes(c.type)) return;
      card.replaceChildren(node("h4", "", c.title)); renderers[c.type](c, card);
    });
    if (focusRow) {
      const card = [...container.querySelectorAll("[data-component-id]")].find((item) => item.dataset.componentId === focusTable);
      const next = [...card.querySelectorAll("[data-row-id]")].find((item) => item.dataset.rowId === focusRow && item.dataset.action === focusAction);
      (next || card).focus({ preventScroll: true });
    }
  }

  specification.sections.forEach((section, sectionIndex) => {
    const group = node("section", "ui-section");
    group.append(node("h3", "", section.title));
    const grid = node("div", "component-grid");
    section.components.forEach((c, index) => {
      const path = `$.sections[${sectionIndex}].components[${index}]`;
      const mapping = { id: c.id, path, type: c.type, renderer: `renderers.${c.type}`, action: c.action, binding: c.binding, rowActions: c.rowActions, sectionRationale: section.explanation };
      trace.push(mapping);
      const card = node("div", `ui-component type-${c.type}`);
      card.dataset.componentId = c.id; card.tabIndex = 0;
      card.setAttribute("aria-label", `${c.title || c.type}; select to inspect component`);
      card.append(node("h4", "", c.title)); renderers[c.type](c, card, path);
      const inspect = () => {
        container.querySelectorAll(".selected").forEach((item) => item.classList.remove("selected"));
        card.classList.add("selected");
        selected = { path, spec: c, mapping };
        onInspect();
      };
      card.addEventListener("click", (event) => { if (!event.target.closest("button, input, form")) inspect(); });
      card.addEventListener("keydown", (event) => {
        if (event.target === card && ["Enter", " "].includes(event.key)) { event.preventDefault(); inspect(); }
      });
      grid.append(card);
    });
    group.append(grid); container.append(group);
  });
  return { snapshot: () => ({ selected, trace, ...runtime.snapshot() }) };
}
