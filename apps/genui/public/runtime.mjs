import { validateUI } from "./contract.mjs";

const copy = (value) => structuredClone(value);
export const MAX_ROWS = 200;

export function createRuntime(specification) {
  const spec = copy(validateUI(specification));
  const components = new Map(spec.sections.flatMap((s) => s.components.map((c) => [c.id, c])));
  const tables = new Map();
  const history = [];
  let sequence = 0;
  const initialRows = (component) => component.rows.map((cells) => ({ id: `row-${++sequence}`, cells: [...cells], completed: false }));
  for (const component of components.values()) {
    if (component.type === "table") tables.set(component.id, { rows: initialRows(component), query: "" });
  }
  const table = (id) => {
    if (!tables.has(id)) throw new Error(`Unknown table: ${id}`);
    return tables.get(id);
  };
  const component = (id, type) => {
    const c = components.get(id);
    if (!c || c.type !== type) throw new Error(`Expected ${type} component: ${id}`);
    return c;
  };
  const summary = (state) => ({ rows: state.rows.length, completed: state.rows.filter((r) => r.completed).length, query: state.query });
  const record = (sourceId, action, targetId, before, details = {}) => {
    const handler = ["appendRow", "filterRows"].includes(action) ? "runtime.submit" : action === "resetTable" ? "runtime.activate" : "runtime.rowAction";
    const entry = { sourceId, handler, action, targetId, before, after: summary(table(targetId)), ...details };
    history.push(entry);
    if (history.length > 30) history.shift();
    return copy(entry);
  };
  const fieldValues = (c, values) => {
    if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("Expected form values");
    if (Object.keys(values).length !== c.fields.length || c.fields.some((f) => !Object.hasOwn(values, f.key))) throw new Error("Form values must match declared field keys");
    const entries = c.fields.map((f) => {
      if (typeof values[f.key] !== "string") throw new Error(`${f.label}: expected text`);
      const value = values[f.key].trim();
      if (value.length > 3000) throw new Error(`${f.label}: maximum 3000 characters`);
      if (c.action.type === "appendRow") {
        if (!value) throw new Error(`${f.label}: a value is required`);
        if (f.inputType === "number" && !Number.isFinite(Number(value))) throw new Error(`${f.label}: enter a finite number`);
        if (f.inputType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(`${f.label}: enter a valid email`);
        if (f.inputType === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error(`${f.label}: enter a valid date`);
      }
      return [f.key, value];
    });
    return Object.fromEntries(entries);
  };

  return {
    getTable(id) {
      const state = table(id);
      const query = state.query.toLowerCase();
      return copy({ ...state, visibleRows: state.rows.filter((r) => r.cells.some((cell) => cell.toLowerCase().includes(query))) });
    },
    getMetric(id) {
      const c = component(id, "metric");
      if (c.binding.type === "none") return c.value;
      const state = table(c.binding.targetId);
      return String(c.binding.type === "rowCount" ? state.rows.length : state.rows.filter((r) => r.completed).length);
    },
    getChart(id) {
      const c = component(id, "chart");
      if (c.binding.type === "none") return copy(c.items);
      const state = table(c.binding.targetId);
      const completed = state.rows.filter((r) => r.completed).length;
      return [{ label: "Active", value: state.rows.length - completed }, { label: "Completed", value: completed }];
    },
    submit(id, values) {
      const c = component(id, "form");
      const validated = fieldValues(c, values);
      const state = table(c.action.targetId);
      const before = summary(state);
      if (c.action.type === "appendRow") {
        if (state.rows.length >= MAX_ROWS) throw new Error(`Table limit reached (${MAX_ROWS} rows). Delete rows or reset before adding.`);
        state.rows.push({ id: `row-${++sequence}`, cells: c.action.fieldKeys.map((key) => validated[key]), completed: false });
      } else {
        state.query = validated[c.action.fieldKeys[0]];
      }
      return record(id, c.action.type, c.action.targetId, before, { values: validated });
    },
    activate(id) {
      const c = component(id, "button");
      const state = table(c.action.targetId);
      const before = summary(state);
      state.rows = initialRows(component(c.action.targetId, "table"));
      state.query = "";
      return record(id, c.action.type, c.action.targetId, before);
    },
    rowAction(id, rowId, action) {
      const c = component(id, "table");
      if (!c.rowActions.includes(action)) throw new Error(`Row action not allowed: ${action}`);
      const state = table(id);
      const row = state.rows.find((r) => r.id === rowId);
      if (!row) throw new Error(`Row no longer exists: ${rowId}`);
      const before = summary(state);
      if (action === "toggleRow") row.completed = !row.completed;
      else state.rows = state.rows.filter((r) => r.id !== rowId);
      return record(id, action, id, before, { rowId });
    },
    snapshot() {
      return { tables: Object.fromEntries([...tables].map(([id, state]) => [id, copy(state)])), history: copy(history) };
    },
  };
}
