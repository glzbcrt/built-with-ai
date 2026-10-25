import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { instructions, uiSchema, validateUI, createDemo } from "./public/contract.mjs";
import { codeInstructions, codeSchema, validateCode, createCodeDemo } from "./public/code-contract.mjs";
import { buildSandboxDocument } from "./sandbox-document.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const assets = new Map([
  ["/", ["index.html", "text/html"]],
  ["/app.mjs", ["app.mjs", "text/javascript"]],
  ["/contract.mjs", ["contract.mjs", "text/javascript"]],
  ["/runtime.mjs", ["runtime.mjs", "text/javascript"]],
  ["/code-contract.mjs", ["code-contract.mjs", "text/javascript"]],
  ["/structured-preview.mjs", ["structured-preview.mjs", "text/javascript"]],
  ["/code-preview.mjs", ["code-preview.mjs", "text/javascript"]],
  ["/style.css", ["style.css", "text/css"]],
]);

export function azureURL(endpoint) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Azure endpoint must be a plain HTTPS resource URL");
  if (!["", "/", "/openai/v1", "/openai/v1/"].includes(url.pathname)) throw new Error("Use the Azure resource root or /openai/v1/ endpoint");
  url.pathname = "/openai/v1/responses";
  return url.toString();
}

export function createApp({ env = process.env, fetchImpl = fetch } = {}) {
  const configured = Boolean(env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_API_KEY && env.AZURE_OPENAI_DEPLOYMENT);
  return http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const json = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    try {
      if (req.method === "GET" && req.url === "/sandbox") {
        const { html, csp } = buildSandboxDocument();
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp });
        return res.end(html);
      }
      if (req.method === "GET" && assets.has(req.url)) {
        const [file, type] = assets.get(req.url);
        const body = await readFile(resolve(root, "public", file));
        res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
        return res.end(body);
      }
      if (req.method === "GET" && req.url === "/api/config") return json(200, { configured, deployment: env.AZURE_OPENAI_DEPLOYMENT || null });
      if (req.method !== "POST" || req.url !== "/api/generate") return json(404, { error: "Not found" });
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(403, { error: "Cross-origin requests are not allowed" });
      if (!req.headers["content-type"]?.startsWith("application/json")) return json(415, { error: "Expected application/json" });
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 16000) return json(413, { error: "Request too large" });
      }
      let input;
      try { input = JSON.parse(body); } catch { return json(400, { error: "Invalid JSON" }); }
      if (!input || typeof input.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 6000 || !["demo", "azure"].includes(input.mode)) {
        return json(400, { error: "Provide a prompt (1-6000 characters) and mode demo or azure" });
      }
      const approach = input.approach === undefined ? "structured" : input.approach;
      if (!["structured", "code"].includes(approach)) return json(400, { error: "Approach must be structured or code" });
      const code = approach === "code";
      const request = {
        model: env.AZURE_OPENAI_DEPLOYMENT || "YOUR_AZURE_DEPLOYMENT",
        instructions: code ? codeInstructions : instructions, input: input.prompt.trim(),
        text: { format: { type: "json_schema", name: code ? "browser_application" : "learning_interface", strict: true, schema: code ? codeSchema : uiSchema } },
        max_output_tokens: code ? 12000 : 8000,
        store: false,
      };
      const start = performance.now();
      let rawResponse;
      if (input.mode === "demo") {
        const ui = code ? createCodeDemo(input.prompt.trim()) : createDemo(input.prompt.trim());
        rawResponse = { id: "demo-local", object: "response", status: "completed", model: "deterministic-demo-not-a-model", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(ui) }] }], usage: null };
      } else {
        if (!configured) return json(400, { error: "Azure is not configured. Set the three AZURE_OPENAI_* variables in .env and restart, or choose Demo." });
        let endpoint;
        try { endpoint = azureURL(env.AZURE_OPENAI_ENDPOINT); } catch (error) { return json(400, { error: error.message }); }
        let upstream;
        try {
          upstream = await fetchImpl(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", "api-key": env.AZURE_OPENAI_API_KEY },
            body: JSON.stringify(request), signal: AbortSignal.timeout(120000),
          });
          const text = await upstream.text();
          try { rawResponse = JSON.parse(text); } catch {
            return json(502, { error: "Azure returned a non-JSON response", upstreamStatus: upstream.status, rawResponse: text, request });
          }
        } catch (error) {
          console.error("Azure request failed:", error.message);
          return json(502, { error: `Azure request failed: ${error.name === "TimeoutError" ? "120 second timeout" : error.message}`, request });
        }
        if (!upstream.ok) return json(502, { error: rawResponse.error?.message || `Azure returned HTTP ${upstream.status}`, upstreamStatus: upstream.status, rawResponse, request });
      }
      const metadata = { mode: input.mode, approach, durationMs: Math.round(performance.now() - start), model: rawResponse.model, usage: rawResponse.usage ?? null };
      try {
        if (rawResponse.status !== "completed") throw new Error(`Response not completed: ${rawResponse.status || "missing status"}. ${JSON.stringify(rawResponse.incomplete_details || rawResponse.error || {})}`);
        const content = (rawResponse.output || []).filter((item) => item.type === "message").flatMap((item) => item.content || []);
        const refusal = content.find((item) => item.type === "refusal");
        if (refusal) throw new Error(`Model refused: ${refusal.refusal}`);
        const text = content.filter((item) => item.type === "output_text").map((item) => item.text).join("");
        if (!text) throw new Error("Response contains no output_text");
        const output = (code ? validateCode : validateUI)(JSON.parse(text));
        return json(200, { request, rawResponse, outputText: text, ...(code ? { code: output } : { ui: output }), metadata });
      } catch (error) {
        return json(422, { error: `Response cannot be rendered: ${error.message}`, request, rawResponse, metadata });
      }
    } catch (error) {
      console.error("Request failed:", error);
      if (!res.headersSent) json(500, { error: "Internal server error; see server console" });
      else res.end();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const app = createApp();
  app.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
  app.listen(port, "127.0.0.1", () => console.log(`GenUI Lab: http://127.0.0.1:${port}`));
}
