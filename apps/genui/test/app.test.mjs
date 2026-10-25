import test from "node:test";
import assert from "node:assert/strict";
import { createApp, azureURL } from "../server.mjs";
import { createDemo, validateUI, uiSchema } from "../public/contract.mjs";
import { createCodeDemo, validateCode, codeSchema } from "../public/code-contract.mjs";

const env = {
  AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
  AZURE_OPENAI_API_KEY: "secret-test-key",
  AZURE_OPENAI_DEPLOYMENT: "my-gpt-deployment",
};
const envelope = (ui) => ({
  status: "completed", model: "actual-model-version",
  output: [{ type: "reasoning", summary: [] }, { type: "message", content: [{ type: "output_text", text: JSON.stringify(ui) }] }],
  usage: { input_tokens: 100, output_tokens: 200 },
});
async function withServer(options, callback) {
  const server = createApp(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {}) => fetch(`${base}/api/generate`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  try { await callback({ base, post }); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("all demo variants satisfy the shared contract and include six component types", () => {
  for (const prompt of ["project", "travel", "fitness"]) {
    const ui = validateUI(createDemo(prompt));
    assert.equal(new Set(ui.sections.flatMap((s) => s.components.map((c) => c.type))).size, 6);
  }
});

test("code demo returns inspectable HTML/CSS/JavaScript without executing it on the server", async () => {
  await withServer({ env: {}, fetchImpl: () => { throw new Error("Must not call Azure"); } }, async ({ post }) => {
    const response = await post({ prompt: "a counter with a step size", mode: "demo", approach: "code" });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.metadata.approach, "code");
    assert.equal(data.ui, undefined);
    validateCode(data.code);
    assert.match(data.code.javascript, /addEventListener/);
    assert.deepEqual(data.request.text.format.schema, codeSchema);
    assert.equal(data.request.text.format.name, "browser_application");
    assert.deepEqual(JSON.parse(data.outputText), data.code);
    assert.equal(data.rawResponse.model, "deterministic-demo-not-a-model");
  });
});

test("both live approaches send the same prompt using distinct contracts and keep independent artifacts", async () => {
  const seen = [];
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    seen.push(request);
    return Response.json(envelope(request.text.format.name === "browser_application" ? createCodeDemo(request.input) : createDemo(request.input)));
  };
  await withServer({ env, fetchImpl }, async ({ post }) => {
    const results = await Promise.all(["structured", "code"].map(async (approach) => {
      const response = await post({ prompt: "Build a travel planner", mode: "azure", approach });
      assert.equal(response.status, 200);
      return response.json();
    }));
    assert.deepEqual(seen.map((r) => r.input), ["Build a travel planner", "Build a travel planner"]);
    assert.notEqual(seen[0].instructions, seen[1].instructions);
    assert.deepEqual(results.map((r) => r.metadata.approach), ["structured", "code"]);
    assert.ok(results[0].ui); assert.ok(results[1].code);
    assert.equal(seen[0].model, seen[1].model);
  });
});

test("invalid code output fails independently while structured output still works", async () => {
  await withServer({ env, fetchImpl: async (_url, options) => {
    const request = JSON.parse(options.body);
    return Response.json(envelope(request.text.format.name === "browser_application" ? { javascript: "alert('incomplete')" } : createDemo("test")));
  } }, async ({ post }) => {
    const code = await post({ prompt: "test", mode: "azure", approach: "code" });
    assert.equal(code.status, 422);
    const error = await code.json();
    assert.ok(error.rawResponse);
    assert.equal(error.code, undefined);
    const structured = await post({ prompt: "test", mode: "azure", approach: "structured" });
    assert.equal(structured.status, 200);
  });
});

test("code source is returned as data, even if it would throw or reference Node if executed", async () => {
  const source = createCodeDemo("test");
  source.javascript = "throw new Error('This must never run on the server'); process.exit(1);";
  await withServer({ env, fetchImpl: async () => Response.json(envelope(source)) }, async ({ post }) => {
    const response = await post({ prompt: "test", mode: "azure", approach: "code" });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).code.javascript, source.javascript);
  });
});

test("validator rejects malformed, oversized, duplicate, and unsupported data", () => {
  const cases = [
    (ui) => { ui.extra = true; },
    (ui) => { delete ui.title; },
    (ui) => { ui.theme = "script"; },
    (ui) => { ui.sections[0].components[0].type = "html"; },
    (ui) => { ui.sections[0].components[0].id = "overview"; },
    (ui) => { ui.sections[1].components[0].rows[0] = ["mismatch"]; },
    (ui) => { ui.sections[0].components[3].items[0].value = -1; },
    (ui) => { ui.sections[0].components[3].items = []; ui.sections[0].components[3].binding = { type: "none", targetId: "" }; },
    (ui) => { ui.sections[1].components[1].fields = []; },
    (ui) => { ui.sections[0].components[0].text = "a".repeat(3001); },
    (ui) => { ui.sections = []; },
    (ui) => { ui.sections[0].components = Array.from({ length: 17 }, (_, i) => ({ ...ui.sections[0].components[0], id: `unique-${i}` })); },
  ];
  for (const mutate of cases) {
    const ui = createDemo("test"); mutate(ui);
    assert.throws(() => validateUI(ui));
  }
  assert.throws(() => validateUI(null));
});

test("Azure endpoint supports root/v1 forms and rejects invalid transport or paths", () => {
  for (const value of ["https://example.openai.azure.com", "https://example.openai.azure.com/openai/v1/"]) {
    assert.equal(azureURL(value), "https://example.openai.azure.com/openai/v1/responses");
  }
  for (const value of ["http://example.com", "https://key@example.com", "https://example.com/wrong", "https://example.com?key=x"]) {
    assert.throws(() => azureURL(value));
  }
});

test("demo works without credentials and never calls Azure", async () => {
  await withServer({ env: {}, fetchImpl: () => { throw new Error("Must not call Azure"); } }, async ({ post, base }) => {
    const response = await post({ prompt: "travel planner", mode: "demo" });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.metadata.mode, "demo");
    assert.equal(data.ui.title, "Trip planner");
    assert.equal(data.rawResponse.model, "deterministic-demo-not-a-model");
    assert.equal(data.request.text.format.strict, true);
    assert.deepEqual(data.request.text.format.schema, uiSchema);
    assert.deepEqual(JSON.parse(data.outputText), data.ui);
    const config = await (await fetch(`${base}/api/config`)).json();
    assert.deepEqual(config, { configured: false, deployment: null });
  });
});

test("live Azure sends strict schema server-side and exposes exact raw response, not credentials", async () => {
  const raw = envelope(createDemo("test"));
  const fetchImpl = async (url, options) => {
    assert.equal(url, "https://example.openai.azure.com/openai/v1/responses");
    assert.equal(options.headers["api-key"], env.AZURE_OPENAI_API_KEY);
    const request = JSON.parse(options.body);
    assert.equal(request.model, "my-gpt-deployment");
    assert.equal(request.store, false);
    assert.equal(request.text.format.type, "json_schema");
    return Response.json(raw);
  };
  await withServer({ env, fetchImpl }, async ({ post }) => {
    const response = await post({ prompt: "Build a dashboard", mode: "azure" });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes(env.AZURE_OPENAI_API_KEY));
    const data = JSON.parse(text);
    assert.deepEqual(data.rawResponse, raw);
    assert.equal(data.metadata.model, raw.model);
    assert.deepEqual(data.metadata.usage, raw.usage);
  });
});

test("invalid requests and missing Azure configuration fail explicitly", async () => {
  await withServer({ env: {} }, async ({ post }) => {
    for (const body of [null, {}, { prompt: "", mode: "demo" }, { prompt: "x", mode: "other" }, { prompt: "x".repeat(6001), mode: "demo" }, { prompt: "x", mode: "demo", approach: "eval" }, { prompt: "x", mode: "demo", approach: null }, "{broken"]) {
      assert.equal((await post(body)).status, 400);
    }
    const missing = await post({ prompt: "test", mode: "azure" });
    assert.equal(missing.status, 400);
    assert.match((await missing.json()).error, /not configured/);
    assert.equal((await post({ prompt: "x", mode: "demo" }, { Origin: "https://evil.example" })).status, 403);
    assert.equal((await post("a".repeat(16001))).status, 413);
    assert.equal((await post("{}", { "Content-Type": "text/plain" })).status, 415);
  });
});

test("Azure refusal, incomplete output, invalid JSON, and schema violations are not rendered", async () => {
  const invalid = createDemo("test"); invalid.sections[0].components[0].type = "script";
  const cases = [
    { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "Cannot help" }] }] },
    { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } },
    { status: "completed", output: [] },
    { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }] },
    envelope(invalid),
  ];
  for (const raw of cases) {
    await withServer({ env, fetchImpl: async () => Response.json(raw) }, async ({ post }) => {
      const response = await post({ prompt: "test", mode: "azure" });
      assert.equal(response.status, 422);
      const data = await response.json();
      assert.deepEqual(data.rawResponse, raw);
      assert.equal(data.ui, undefined);
      assert.match(data.error, /cannot be rendered/);
    });
  }
});

test("Azure provider errors and non-JSON errors preserve upstream diagnostics", async () => {
  for (const response of [Response.json({ error: { message: "Quota exceeded" } }, { status: 429 }), new Response("Gateway unavailable", { status: 503 })]) {
    await withServer({ env, fetchImpl: async () => response }, async ({ post }) => {
      const actual = await post({ prompt: "test", mode: "azure" });
      assert.equal(actual.status, 502);
      const data = await actual.json();
      assert.ok(data.rawResponse);
      assert.equal(data.ui, undefined);
    });
  }
});

test("static allowlist, content types, and CSP are applied", async () => {
  await withServer({ env: {} }, async ({ base }) => {
    for (const path of ["/", "/app.mjs", "/contract.mjs", "/runtime.mjs", "/code-contract.mjs", "/structured-preview.mjs", "/code-preview.mjs", "/style.css"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-security-policy"), /script-src 'self'/);
      assert.ok((await response.text()).length > 0);
    }
    for (const path of ["/.env", "/server.mjs", "/sandbox-document.mjs", "/package.json", "/missing"]) {
      assert.equal((await fetch(base + path)).status, 404);
    }
    const sandbox = await fetch(base + "/sandbox");
    assert.equal(sandbox.status, 200);
    const csp = sandbox.headers.get("content-security-policy");
    assert.match(csp, /sandbox allow-scripts allow-forms/);
    assert.doesNotMatch(csp, /allow-same-origin|unsafe-eval|script-src 'unsafe-inline'/);
    assert.match(csp, /connect-src 'none'/);
    assert.match(csp, /form-action 'none'/);
    const html = await sandbox.text();
    assert.match(html, /genui:init/);
    assert.doesNotMatch(html, /AZURE_OPENAI|secret-test-key/);
    assert.equal(sandbox.headers.get("referrer-policy"), "no-referrer");
  });
});
