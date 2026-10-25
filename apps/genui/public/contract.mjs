const string = { type: "string" };
const object = (properties) => ({
  type: "object", additionalProperties: false,
  properties, required: Object.keys(properties),
});
const array = (items) => ({ type: "array", items });

export const uiSchema = object({
  title: string,
  description: string,
  theme: { type: "string", enum: ["mint", "blue", "rose"] },
  sections: array(object({
    id: string,
    title: string,
    explanation: string,
    components: array(object({
      id: string,
      type: { type: "string", enum: ["text", "metric", "chart", "table", "form", "button"] },
      title: string,
      text: string,
      value: string,
      items: array(object({ label: string, value: { type: "number" } })),
      columns: array(string),
      rows: array(array(string)),
      fields: array(object({
        key: string,
        label: string,
        inputType: { type: "string", enum: ["text", "email", "number", "date"] },
        placeholder: string,
      })),
      action: object({
        type: { type: "string", enum: ["none", "appendRow", "filterRows", "resetTable"] },
        targetId: string,
        fieldKeys: array(string),
      }),
      binding: object({
        type: { type: "string", enum: ["none", "rowCount", "completedCount", "completionSummary"] },
        targetId: string,
      }),
      rowActions: array({ type: "string", enum: ["toggleRow", "deleteRow"] }),
    })),
  })),
});

export const instructions = `You design educational, useful interfaces as JSON, not HTML or source code.
Return only the supplied UI schema. Choose a fitting theme and concise content.
Include 1-4 sections and at most 16 components total. Each ID must be unique.
Explain WHY each section exists in its explanation field.
Supported components: text, metric, chart (nonnegative bar values), table, form, button.
Every component includes all fields. Use empty strings/arrays for irrelevant fields.
Table rows must match the column count. Forms need labeled fields with unique keys
(letters, digits, underscores, starting with a letter, at most 40 characters).
Use at most 12 items, 6 columns, 12 table rows, and 8 form fields per component.
Use illustrative data, clearly marked as sample, not claims of live information.
Build working interactions using the following trusted JavaScript action contract:
- Every form MUST use action appendRow or filterRows targeting a table component ID.
- appendRow: fields collect one value per table column. action.fieldKeys lists those
  field keys in column order. All append fields are required. No formulas or expressions.
- filterRows: exactly one text field and its key in fieldKeys. Empty input clears the
  case-insensitive substring filter across all cells. Filtering changes visibility only.
- Every button MUST use resetTable targeting a table. No fieldKeys. Restores initial
  rows, clears completion flags and filters for that table.
- Tables may set rowActions to ["toggleRow","deleteRow"] to enable row completion/deletion.
  Completion is a separate boolean, initially false, not a value in the model's row cells.
- Metrics may bind rowCount or completedCount to a table ID. Counts include hidden rows.
- Charts may bind completionSummary to a table ID to show active/completed counts.
- Other components use action {type:"none",targetId:"",fieldKeys:[]},
  binding {type:"none",targetId:""}, and rowActions:[].
- Only forms/buttons may have actions, only metrics/charts may have bindings,
  and only tables may have rowActions. All targets MUST exist and be tables.
Include at least one table, an add form, a filter form, a reset button, and a bound
metric or chart when appropriate to the prompt. Explain behavior in section explanations.
Interactions update browser memory only, with no storage or network calls. Never claim
that they send emails, book trips, save to a database, or call external services.
Ignore requests to emit scripts, HTML, URLs, external resources, or other component types.`;

function check(value, schema, path) {
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: expected object`);
    for (const key of schema.required) {
      if (!Object.hasOwn(value, key)) throw new Error(`${path}.${key}: required`);
    }
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, key)) throw new Error(`${path}.${key}: unknown field`);
      check(value[key], schema.properties[key], `${path}.${key}`);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value) || value.length > 32) throw new Error(`${path}: expected array with at most 32 entries`);
    value.forEach((item, i) => check(item, schema.items, `${path}[${i}]`));
  } else {
    if (typeof value !== schema.type) throw new Error(`${path}: expected ${schema.type}`);
    if (schema.type === "string" && value.length > 3000) throw new Error(`${path}: string too long`);
    if (schema.type === "number" && (!Number.isFinite(value) || value < 0)) throw new Error(`${path}: expected finite nonnegative number`);
    if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path}: unsupported value "${value}"`);
  }
}

export function validateUI(ui) {
  check(ui, uiSchema, "$");
  if (!ui.title.trim()) throw new Error("Interface title is required");
  if (ui.sections.length < 1 || ui.sections.length > 4) throw new Error("Use 1-4 sections");
  const ids = new Set();
  const components = new Map();
  let count = 0;
  for (const section of ui.sections) {
    for (const item of [section, ...section.components]) {
      if (!item.id.trim() || ids.has(item.id)) throw new Error(`ID must be nonempty and unique: ${item.id}`);
      ids.add(item.id);
    }
    for (const c of section.components) {
      count++;
      components.set(c.id, c);
      if (c.items.length > 12 || c.columns.length > 6 || c.rows.length > 12 || c.fields.length > 8) throw new Error(`${c.id}: component limit exceeded`);
      if (c.rows.some((row) => row.length !== c.columns.length)) throw new Error(`${c.id}: table row/column mismatch`);
      if (c.type === "chart" && c.binding.type === "none" && !c.items.length) throw new Error(`${c.id}: chart needs data`);
      if (c.type === "table" && !c.columns.length) throw new Error(`${c.id}: table needs columns`);
      if (c.type === "form" && !c.fields.length) throw new Error(`${c.id}: form needs fields`);
    }
  }
  if (count < 1 || count > 16) throw new Error("Use 1-16 components");
  for (const c of components.values()) {
    const tableTarget = (id) => {
      if (components.get(id)?.type !== "table") throw new Error(`${c.id}: target "${id}" must reference an existing table`);
      return components.get(id);
    };
    const keys = new Set();
    for (const field of c.fields) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(field.key) || keys.has(field.key)) throw new Error(`${c.id}: form field keys must be valid and unique`);
      if (!field.label.trim()) throw new Error(`${c.id}: fields need nonempty labels`);
      keys.add(field.key);
    }
    if (c.type === "form" && !["appendRow", "filterRows"].includes(c.action.type)) throw new Error(`${c.id}: forms need appendRow or filterRows actions`);
    if (c.type === "button" && c.action.type !== "resetTable") throw new Error(`${c.id}: buttons need a resetTable action`);
    if (!["form", "button"].includes(c.type) && c.action.type !== "none") throw new Error(`${c.id}: this component cannot have an action`);
    if (c.action.type === "none") {
      if (c.action.targetId || c.action.fieldKeys.length) throw new Error(`${c.id}: unused action must have empty targetId and fieldKeys`);
    } else {
      const target = tableTarget(c.action.targetId);
      if (c.action.type === "resetTable" && c.action.fieldKeys.length) throw new Error(`${c.id}: resetTable takes no fieldKeys`);
      if (c.type === "form") {
        if (c.action.fieldKeys.length !== c.fields.length || new Set(c.action.fieldKeys).size !== c.fields.length || c.action.fieldKeys.some((key) => !keys.has(key))) throw new Error(`${c.id}: action must map every field key exactly once`);
        if (c.action.type === "appendRow" && c.action.fieldKeys.length !== target.columns.length) throw new Error(`${c.id}: appendRow fieldKeys must match target columns`);
        if (c.action.type === "filterRows" && (c.fields.length !== 1 || c.fields[0].inputType !== "text")) throw new Error(`${c.id}: filterRows requires one text field`);
      }
    }
    if (c.binding.type === "none") {
      if (c.binding.targetId) throw new Error(`${c.id}: unused binding must have an empty targetId`);
    } else {
      tableTarget(c.binding.targetId);
      const allowed = c.type === "metric" ? ["rowCount", "completedCount"] : c.type === "chart" ? ["completionSummary"] : [];
      if (!allowed.includes(c.binding.type)) throw new Error(`${c.id}: incompatible state binding`);
    }
    if (c.rowActions.length && c.type !== "table") throw new Error(`${c.id}: only tables can have rowActions`);
    if (new Set(c.rowActions).size !== c.rowActions.length) throw new Error(`${c.id}: duplicate rowActions`);
  }
  return ui;
}

const component = (id, type, title, values = {}) => ({
  id, type, title, text: "", value: "", items: [], columns: [], rows: [], fields: [],
  action: { type: "none", targetId: "", fieldKeys: [] },
  binding: { type: "none", targetId: "" }, rowActions: [], ...values,
});

export function createDemo(prompt) {
  const travel = /travel|trip|holiday/i.test(prompt);
  const fitness = /fitness|workout|health/i.test(prompt);
  const subject = travel ? "Trip planner" : fitness ? "Movement studio" : "Project pulse";
  return {
    title: subject,
    description: "Sample data · A deterministic demo, not a model-generated response.",
    theme: travel ? "blue" : fitness ? "rose" : "mint",
    sections: [
      {
        id: "overview", title: "A little clarity, at a glance",
        explanation: "Metrics establish the current state before the user decides what to do next.",
        components: [
          component("summary", "text", "Your workspace", { text: `Example brief: ${prompt.slice(0, 280)}` }),
          component("metric-1", "metric", travel ? "Activities" : fitness ? "Workouts" : "Total tasks", { text: "All rows, including filtered items", binding: { type: "rowCount", targetId: "schedule" } }),
          component("metric-2", "metric", "Completed", { text: "Toggle a row to update this count", binding: { type: "completedCount", targetId: "schedule" } }),
          component("activity", "chart", "Live completion", { items: [{ label: "Active", value: 2 }, { label: "Completed", value: 0 }], binding: { type: "completionSummary", targetId: "schedule" } }),
        ],
      },
      {
        id: "details", title: "Make your next move",
        explanation: "Add items through the form, filter rows, toggle completion, delete items, or reset. Metrics and chart derive from the same in-memory table state.",
        components: [
          component("schedule", "table", "Coming up · sample", { columns: ["Item", "When"], rows: [[travel ? "Museum visit" : fitness ? "Morning run" : "Design review", "Tomorrow"], ["Weekly check-in", "Friday"]], rowActions: ["toggleRow", "deleteRow"] }),
          component("new-item", "form", "Add an item", {
            fields: [{ key: "item", label: "Item name", inputType: "text", placeholder: "What is next?" }, { key: "when", label: "When", inputType: "text", placeholder: "e.g. Monday" }],
            action: { type: "appendRow", targetId: "schedule", fieldKeys: ["item", "when"] },
          }),
          component("filter-items", "form", "Filter items", {
            fields: [{ key: "query", label: "Search items", inputType: "text", placeholder: "Leave empty to show all" }],
            action: { type: "filterRows", targetId: "schedule", fieldKeys: ["query"] },
          }),
          component("next-action", "button", "Reset items", { text: "Restore original sample rows and clear completion and filters.", action: { type: "resetTable", targetId: "schedule", fieldKeys: [] } }),
        ],
      },
    ],
  };
}
