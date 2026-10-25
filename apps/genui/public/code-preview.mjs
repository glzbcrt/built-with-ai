import { validateCode } from "./code-contract.mjs";

export function createCodePreview(container, onEvent) {
  let frame = null;
  let port = null;
  let watchdog = null;
  let lastHeartbeat = 0;
  let stopped = true;
  let batchStart = 0;
  let batchCount = 0;
  let throttled = false;
  const emit = (kind, level, message) => onEvent({ kind, level, message, time: new Date().toISOString() });

  function stop(message = "Preview stopped. Its document, handlers, timers, and state have been discarded.") {
    stopped = true;
    clearInterval(watchdog); watchdog = null;
    if (port) { port.close(); port = null; }
    if (frame) { frame.remove(); frame = null; }
    container.replaceChildren();
    const placeholder = document.createElement("p");
    placeholder.className = "helper"; placeholder.textContent = message;
    container.append(placeholder);
  }

  function run(value) {
    const source = validateCode(value);
    stop("Starting isolated preview...");
    stopped = false;
    lastHeartbeat = Date.now();
    batchStart = Date.now(); batchCount = 0; throttled = false;
    const iframe = document.createElement("iframe");
    frame = iframe;
    iframe.title = "Generated JavaScript preview";
    iframe.setAttribute("sandbox", "allow-scripts allow-forms");
    iframe.setAttribute("referrerpolicy", "no-referrer");
    iframe.setAttribute("credentialless", "");
    iframe.setAttribute("allow", "camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'; clipboard-read 'none'; clipboard-write 'none'");
    let loads = 0;
    iframe.addEventListener("load", () => {
      if (stopped || frame !== iframe) return;
      if (++loads > 1) {
        stop("Preview stopped after an unexpected document navigation.");
        emit("policy", "error", "Unexpected iframe navigation. The preview was removed; a navigation request may already have occurred.");
        return;
      }
      const channel = new MessageChannel();
      port = channel.port1;
      port.onmessage = (event) => {
        if (stopped || frame !== iframe) return;
        const data = event.data;
        if (!data || typeof data !== "object") return;
        if (data.kind === "heartbeat") { lastHeartbeat = Date.now(); return; }
        if (!["console", "error", "policy", "lifecycle", "execution"].includes(data.kind) || !["log", "info", "warn", "error"].includes(data.level) || typeof data.message !== "string") return;
        lastHeartbeat = Date.now();
        if (Date.now() - batchStart > 1000) { batchStart = Date.now(); batchCount = 0; throttled = false; }
        if (++batchCount > 40) {
          if (!throttled) { emit("policy", "warn", "Diagnostics rate limit reached; additional messages this second are omitted."); throttled = true; }
          return;
        }
        emit(data.kind, data.level, data.message.slice(0, 4000));
      };
      iframe.contentWindow.postMessage({ type: "genui:init", source: { html: source.html, css: source.css, javascript: source.javascript } }, "*", [channel.port2]);
    });
    iframe.src = "/sandbox";
    container.replaceChildren(iframe);
    emit("lifecycle", "info", "Run requested explicitly. Loading an opaque-origin sandbox with no privileged host bridge.");
    watchdog = setInterval(() => {
      if (!stopped && Date.now() - lastHeartbeat > 8000) {
        stop("Sandbox is unresponsive or failed to initialize. Preview removed.");
        emit("error", "error", "No sandbox heartbeat for 8 seconds. This watchdog is best effort, not a CPU or memory security boundary.");
      }
    }, 1000);
  }
  return {
    run,
    stop(message) { stop(message); emit("lifecycle", "info", message || "Preview stopped by the user."); },
    dispose() { stop("Preview cleared."); },
  };
}
