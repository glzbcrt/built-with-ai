import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { codeSchema, createCodeDemo, validateCode } from "../public/code-contract.mjs";
import { buildSandboxDocument } from "../sandbox-document.mjs";

test("all code demos validate and contain syntactically valid, genuinely interactive JavaScript", () => {
  for (const prompt of ["project", "travel planner", "fitness tracker", "a counter"]) {
    const code = validateCode(createCodeDemo(prompt));
    assert.doesNotThrow(() => new Script(code.javascript));
    assert.match(code.javascript, /addEventListener/);
    assert.match(code.html, /button/);
    assert.equal(Object.keys(code).length, codeSchema.required.length);
  }
  assert.notEqual(createCodeDemo("counter").javascript, createCodeDemo("travel").javascript);
});

test("code envelope rejects missing/unknown fields, nonstrings, empty source, and oversized source", () => {
  for (const mutate of [
    (code) => { delete code.javascript; },
    (code) => { code.unknown = "x"; },
    (code) => { code.html = {}; },
    (code) => { code.javascript = " "; },
    (code) => { code.title = "x".repeat(201); },
    (code) => { code.html = "x".repeat(20001); },
    (code) => { code.css = "x".repeat(16001); },
    (code) => { code.javascript = "x".repeat(32001); },
    (code) => { code.explanation = "x".repeat(6001); },
  ]) {
    const code = createCodeDemo("test"); mutate(code);
    assert.throws(() => validateCode(code));
  }
  for (const value of [null, [], "javascript"]) assert.throws(() => validateCode(value));
});

test("code validation deliberately does not pretend to sanitize or prove arbitrary code safe", () => {
  const code = createCodeDemo("test");
  code.javascript = "while (false) { /* arbitrary source remains data until explicit Run */ }";
  assert.equal(validateCode(code), code);
});

test("demo prompt text is escaped as HTML, not converted into markup", () => {
  const code = createCodeDemo('travel </p><img src=x onerror="alert(1)">');
  assert.doesNotMatch(code.html, /<img/);
  assert.match(code.html, /&lt;img/);
});

test("sandbox has a fresh nonce and only trusted bootstrap source, with no code interpolation", () => {
  const first = buildSandboxDocument();
  const second = buildSandboxDocument();
  assert.notEqual(first.csp, second.csp);
  const nonce = first.csp.match(/script-src 'nonce-([^']+)'/)[1];
  assert.ok(first.html.includes(`nonce="${nonce}"`));
  assert.match(first.csp, /sandbox allow-scripts allow-forms/);
  for (const directive of ["default-src 'none'", "connect-src 'none'", "frame-src 'none'", "worker-src 'none'", "object-src 'none'", "form-action 'none'", "base-uri 'none'"]) assert.ok(first.csp.includes(directive));
  assert.doesNotMatch(first.csp, /allow-same-origin|unsafe-eval/);
  assert.match(first.html, /event\.source !== parent/);
  assert.match(first.html, /event\.origin !== parentOrigin/);
  assert.match(first.html, /event\.ports\[0\]/);
  assert.match(first.html, /unhandledrejection/);
  assert.match(first.html, /securitypolicyviolation/);
  const script = first.html.match(/<script nonce="[^"]+">([\s\S]*)<\/script>/)[1];
  assert.doesNotThrow(() => new Script(script));
});
