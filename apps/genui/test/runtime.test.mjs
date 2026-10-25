import test from "node:test";
import assert from "node:assert/strict";
import { createDemo, validateUI } from "../public/contract.mjs";
import { createRuntime, MAX_ROWS } from "../public/runtime.mjs";

const components = (ui) => new Map(ui.sections.flatMap((s) => s.components.map((c) => [c.id, c])));

test("action and binding validation rejects incompatible or dangling wiring", () => {
  const cases = [
    (c) => { c.get("new-item").action.targetId = "missing"; },
    (c) => { c.get("new-item").action.targetId = "metric-1"; },
    (c) => { c.get("new-item").action.fieldKeys = ["item"]; },
    (c) => { c.get("new-item").action.fieldKeys = ["item", "item"]; },
    (c) => { c.get("new-item").action.fieldKeys = ["item", "unknown"]; },
    (c) => { c.get("new-item").action.type = "none"; },
    (c) => { c.get("new-item").fields[1].key = "item"; },
    (c) => { c.get("new-item").fields[0].key = "x.y"; },
    (c) => { c.get("new-item").fields[0].label = " "; },
    (c) => { c.get("filter-items").fields[0].inputType = "email"; },
    (c) => { c.get("filter-items").action.type = "appendRow"; },
    (c) => { c.get("next-action").action.type = "filterRows"; },
    (c) => { c.get("next-action").action.fieldKeys = ["item"]; },
    (c) => { c.get("summary").action = c.get("next-action").action; },
    (c) => { c.get("summary").action.targetId = "schedule"; },
    (c) => { c.get("metric-1").binding.targetId = "missing"; },
    (c) => { c.get("metric-1").binding.type = "completionSummary"; },
    (c) => { c.get("summary").binding = { type: "rowCount", targetId: "schedule" }; },
    (c) => { c.get("activity").binding.type = "rowCount"; },
    (c) => { c.get("summary").binding.targetId = "schedule"; },
    (c) => { c.get("summary").rowActions = ["deleteRow"]; },
    (c) => { c.get("schedule").rowActions = ["deleteRow", "deleteRow"]; },
    (c) => { c.get("next-action").action.type = "eval"; },
  ];
  for (const mutate of cases) {
    const ui = createDemo("test");
    mutate(components(ui));
    assert.throws(() => validateUI(ui));
  }
});

test("forms append mapped cells, update metrics/chart, and keep original JSON immutable", () => {
  const ui = createDemo("project");
  const original = structuredClone(ui);
  const runtime = createRuntime(ui);
  const first = runtime.getTable("schedule").rows[0].id;
  const event = runtime.submit("new-item", { item: "  Write tests  ", when: "Monday" });
  assert.equal(event.handler, "runtime.submit");
  assert.equal(event.action, "appendRow");
  assert.deepEqual(event.before, { rows: 2, completed: 0, query: "" });
  assert.deepEqual(event.after, { rows: 3, completed: 0, query: "" });
  assert.deepEqual(runtime.getTable("schedule").rows[2].cells, ["Write tests", "Monday"]);
  assert.equal(runtime.getMetric("metric-1"), "3");
  runtime.rowAction("schedule", first, "toggleRow");
  assert.equal(runtime.getMetric("metric-2"), "1");
  assert.deepEqual(runtime.getChart("activity"), [{ label: "Active", value: 2 }, { label: "Completed", value: 1 }]);
  runtime.rowAction("schedule", first, "toggleRow");
  assert.equal(runtime.getMetric("metric-2"), "0");
  assert.deepEqual(ui, original);
});

test("filtering is case-insensitive, searches all cells, and does not alter counts", () => {
  const runtime = createRuntime(createDemo("test"));
  runtime.submit("filter-items", { query: "  FRIDAY " });
  assert.equal(runtime.getTable("schedule").visibleRows.length, 1);
  assert.equal(runtime.getMetric("metric-1"), "2");
  runtime.submit("new-item", { item: "Visible", when: "Friday" });
  assert.equal(runtime.getTable("schedule").visibleRows.length, 2);
  runtime.submit("new-item", { item: "Hidden", when: "Monday" });
  assert.equal(runtime.getTable("schedule").visibleRows.length, 2);
  assert.equal(runtime.getMetric("metric-1"), "4");
  runtime.submit("filter-items", { query: "no matches" });
  assert.equal(runtime.getTable("schedule").visibleRows.length, 0);
  runtime.submit("filter-items", { query: "" });
  assert.equal(runtime.getTable("schedule").visibleRows.length, 4);
});

test("deletion targets stable IDs after filtering, updates completion, and handles empty tables", () => {
  const runtime = createRuntime(createDemo("test"));
  const rows = runtime.getTable("schedule").rows;
  runtime.rowAction("schedule", rows[1].id, "toggleRow");
  runtime.submit("filter-items", { query: "Friday" });
  runtime.rowAction("schedule", rows[1].id, "deleteRow");
  assert.equal(runtime.getMetric("metric-2"), "0");
  assert.equal(runtime.getTable("schedule").visibleRows.length, 0);
  assert.equal(runtime.getTable("schedule").rows[0].id, rows[0].id);
  assert.throws(() => runtime.rowAction("schedule", rows[1].id, "deleteRow"), /no longer exists/);
  runtime.rowAction("schedule", rows[0].id, "deleteRow");
  assert.equal(runtime.getMetric("metric-1"), "0");
  assert.deepEqual(runtime.getChart("activity").map((i) => i.value), [0, 0]);
});

test("reset restores seed rows, clears completion/filter, and stale IDs cannot act on new rows", () => {
  const runtime = createRuntime(createDemo("test"));
  const first = runtime.getTable("schedule").rows[0].id;
  runtime.rowAction("schedule", first, "toggleRow");
  runtime.submit("new-item", { item: "Extra", when: "Later" });
  runtime.submit("filter-items", { query: "Extra" });
  const event = runtime.activate("next-action");
  assert.equal(event.handler, "runtime.activate");
  assert.deepEqual(event.after, { rows: 2, completed: 0, query: "" });
  assert.equal(runtime.getTable("schedule").visibleRows.length, 2);
  assert.throws(() => runtime.rowAction("schedule", first, "deleteRow"), /no longer exists/);
});

test("runtime enforces row permissions, component types, exact field keys, and value limits atomically", () => {
  const ui = createDemo("test");
  components(ui).get("schedule").rowActions = ["toggleRow"];
  const runtime = createRuntime(ui);
  const first = runtime.getTable("schedule").rows[0].id;
  const before = runtime.snapshot();
  for (const values of [{}, { item: "x" }, { item: "x", when: "y", extra: "z" }, { item: " ", when: "y" }, { item: 1, when: "y" }, { item: "x".repeat(3001), when: "y" }, null]) {
    assert.throws(() => runtime.submit("new-item", values));
  }
  assert.throws(() => runtime.rowAction("schedule", first, "deleteRow"), /not allowed/);
  assert.throws(() => runtime.rowAction("schedule", first, "eval"), /not allowed/);
  assert.throws(() => runtime.submit("next-action", {}), /Expected form/);
  assert.throws(() => runtime.activate("new-item"), /Expected button/);
  assert.throws(() => runtime.getTable("missing"), /Unknown table/);
  assert.deepEqual(runtime.snapshot(), before);
});

test("number/email/date values are checked by JavaScript as well as HTML inputs", () => {
  for (const [type, invalid, valid] of [
    ["number", "Infinity", "3.5"],
    ["email", "not-an-email", "a@example.com"],
    ["date", "2026-02-30", "2026-02-28"],
  ]) {
    const ui = createDemo("test");
    components(ui).get("new-item").fields[0].inputType = type;
    const runtime = createRuntime(ui);
    assert.throws(() => runtime.submit("new-item", { item: invalid, when: "Later" }));
    assert.equal(runtime.getMetric("metric-1"), "2");
    runtime.submit("new-item", { item: valid, when: "Later" });
    assert.equal(runtime.getMetric("metric-1"), "3");
  }
});

test("declared field order controls column mapping, not input object order", () => {
  const ui = createDemo("test");
  components(ui).get("new-item").action.fieldKeys = ["when", "item"];
  const runtime = createRuntime(ui);
  runtime.submit("new-item", { item: "Task", when: "Monday" });
  assert.deepEqual(runtime.getTable("schedule").rows[2].cells, ["Monday", "Task"]);
});

test("state snapshots are isolated, history is bounded, row limits are explicit, and reset recovers", () => {
  const runtime = createRuntime(createDemo("test"));
  const snapshot = runtime.snapshot();
  snapshot.tables.schedule.rows.length = 0;
  assert.equal(runtime.getMetric("metric-1"), "2");
  for (let i = 2; i < MAX_ROWS; i++) runtime.submit("new-item", { item: `Task ${i}`, when: "Later" });
  assert.equal(runtime.getMetric("metric-1"), String(MAX_ROWS));
  assert.equal(runtime.snapshot().history.length, 30);
  const before = runtime.snapshot();
  assert.throws(() => runtime.submit("new-item", { item: "Overflow", when: "Later" }), /Table limit/);
  assert.deepEqual(runtime.snapshot(), before);
  runtime.activate("next-action");
  assert.equal(runtime.getMetric("metric-1"), "2");
  runtime.submit("new-item", { item: "<script>alert('text')</script>", when: "Later" });
  assert.equal(runtime.getTable("schedule").rows[2].cells[0], "<script>alert('text')</script>");
});

test("multiple tables stay independent and unbound components remain static", () => {
  const ui = createDemo("test");
  const c = components(ui);
  const other = structuredClone(c.get("schedule")); other.id = "other";
  ui.sections[1].components.push(other);
  c.get("metric-1").binding = { type: "none", targetId: "" }; c.get("metric-1").value = "Static";
  c.get("activity").binding = { type: "none", targetId: "" };
  const runtime = createRuntime(ui);
  runtime.submit("new-item", { item: "Task", when: "Later" });
  assert.equal(runtime.getTable("other").rows.length, 2);
  assert.equal(runtime.getMetric("metric-1"), "Static");
  assert.deepEqual(runtime.getChart("activity"), c.get("activity").items);
});
