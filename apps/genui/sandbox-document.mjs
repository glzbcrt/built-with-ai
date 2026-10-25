import { randomBytes } from "node:crypto";

// Only this trusted bootstrap is placed in the document. Generated source arrives later over a MessagePort.
function bootstrap(nonce) {
  "use strict";
  const parentOrigin = new URL(location.href).origin;
  function initialize(event) {
    if (event.source !== parent || event.origin !== parentOrigin || event.data?.type !== "genui:init" || !event.ports[0]) return;
    removeEventListener("message", initialize);
    const port = event.ports[0];
    const send = (kind, level, message) => port.postMessage({ kind, level, message: String(message).slice(0, 4000) });
    let errors = 0;
    const printable = (value) => {
      if (typeof value === "string") return value;
      if (value instanceof Error) return `${value.name}: ${value.message}`;
      try { return JSON.stringify(value) ?? String(value); }
      catch (error) { return `[Serialization failed: ${error.message}]`; }
    };
    for (const level of ["log", "info", "warn", "error"]) {
      const original = console[level].bind(console);
      console[level] = (...args) => {
        original(...args);
        send("console", level, args.map(printable).join(" "));
      };
    }
    addEventListener("error", (error) => {
      errors++;
      send("error", "error", `${error.message} (${error.filename || "generated source"}:${error.lineno || 0}:${error.colno || 0})`);
    });
    addEventListener("unhandledrejection", (event) => {
      errors++;
      send("error", "error", `Unhandled rejection: ${printable(event.reason)}`);
    });
    addEventListener("securitypolicyviolation", (event) => {
      send("policy", "warn", `Blocked by CSP: ${event.violatedDirective} (${event.blockedURI || "inline content"})`);
    });
    const source = event.data.source;
    const limits = { html: 20000, css: 16000, javascript: 32000 };
    if (!source || Object.entries(limits).some(([key, limit]) => typeof source[key] !== "string" || source[key].length > limit)) {
      send("error", "error", "Invalid or oversized source payload.");
      return;
    }
    send("lifecycle", "info", "Sandbox initialized. Mounting HTML and CSS, then executing JavaScript.");
    setInterval(() => port.postMessage({ kind: "heartbeat" }), 1000);
    document.addEventListener("click", (event) => {
      if (event.target.closest?.("a")) {
        event.preventDefault();
        send("policy", "warn", "Link navigation is disabled in this local preview.");
      }
    }, true);
    const style = document.createElement("style");
    style.textContent = source.css;
    document.head.append(style);
    document.getElementById("app").innerHTML = source.html;
    const script = document.createElement("script");
    script.nonce = nonce;
    script.textContent = `"use strict";\n${source.javascript}\n//# sourceURL=genui-generated.js`;
    document.body.append(script);
    send("execution", errors ? "error" : "info", errors ? "Source loaded with errors; inspect diagnostics." : "Top-level JavaScript completed. Event handlers are now active.");
  }
  addEventListener("message", initialize);
}

export function buildSandboxDocument() {
  const nonce = randomBytes(18).toString("base64");
  const csp = [
    "sandbox allow-scripts allow-forms",
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "script-src-attr 'none'",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "media-src data: blob:",
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
  ].join("; ");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated generated UI</title></head><body><div id="app"></div><script nonce="${nonce}">(${bootstrap.toString()})(${JSON.stringify(nonce)});</script></body></html>`;
  return { html, csp };
}
